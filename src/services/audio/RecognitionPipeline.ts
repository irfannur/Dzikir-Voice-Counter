import type { RecognizedSegment } from '@/types'
import type { SpeechRecognitionProvider } from '@/services/recognition/SpeechRecognitionProvider'
import { resampleTo } from './AudioProcessor'
import { VoiceActivityDetector, type SpeechSegment } from './VoiceActivityDetector'

export interface PipelineEvents {
  /** True while at least one segment is queued or being transcribed. */
  onProcessing: (busy: boolean) => void
  onSegment: (seg: RecognizedSegment) => void
  onError: (message: string) => void
  /** Called when the backlog overflowed and the oldest segment was discarded. */
  onDropped?: () => void
}

const TARGET_RATE = 16000

/**
 * mic graph node -> AudioWorklet frames -> VAD -> queue -> provider.transcribe -> events.
 * Timestamps in RecognizedSegment are stream time of the voiced part only, which is
 * what DhikrCounterEngine's duration and cooldown rules expect.
 */
export class RecognitionPipeline {
  private node: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private vad: VoiceActivityDetector | null = null
  private queue: SpeechSegment[] = []
  private busy = false
  private running = false

  constructor(
    private readonly ctx: AudioContext,
    private readonly input: AudioNode,
    private readonly provider: SpeechRecognitionProvider,
    private readonly events: PipelineEvents,
    private readonly language = 'arabic',
    private readonly maxQueue = 3,
  ) {}

  async start(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    await this.ctx.audioWorklet.addModule('/worklets/capture-processor.js')
    this.vad = new VoiceActivityDetector({ sampleRate: this.ctx.sampleRate })
    this.node = new AudioWorkletNode(this.ctx, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    // Muted sink keeps the worklet being pulled by the audio graph without playing anything.
    this.sink = this.ctx.createGain()
    this.sink.gain.value = 0
    this.input.connect(this.node)
    this.node.connect(this.sink)
    this.sink.connect(this.ctx.destination)
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data)
    this.running = true
  }

  stop(): void {
    this.running = false
    this.queue = []
    try { if (this.node) this.input.disconnect(this.node) } catch { /* already disconnected */ }
    try { this.node?.disconnect() } catch { /* ignore */ }
    try { this.sink?.disconnect() } catch { /* ignore */ }
    if (this.node) this.node.port.onmessage = null
    this.node = null
    this.sink = null
    this.vad = null
  }

  private onFrame(frame: Float32Array) {
    if (!this.running || !this.vad) return
    const seg = this.vad.push(frame)
    if (seg) this.enqueue(seg)
  }

  private enqueue(seg: SpeechSegment) {
    if (this.queue.length >= this.maxQueue) {
      this.queue.shift()
      this.events.onDropped?.()
    }
    this.queue.push(seg)
    void this.drain()
  }

  private async drain() {
    if (this.busy) return
    this.busy = true
    this.events.onProcessing(true)
    try {
      while (this.running && this.queue.length) {
        const seg = this.queue.shift()!
        const audio = resampleTo(seg.samples, this.ctx.sampleRate, TARGET_RATE)
        try {
          const res = await this.provider.transcribe(audio, this.language)
          if (!this.running) break
          this.events.onSegment({
            text: res.text,
            startMs: seg.speechStartMs,
            endMs: seg.speechEndMs,
            confidence: res.confidence,
          })
        } catch (e) {
          this.events.onError((e as Error).message)
        }
      }
    } finally {
      this.busy = false
      this.events.onProcessing(false)
    }
  }
}
