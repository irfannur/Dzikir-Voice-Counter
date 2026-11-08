import type { RecognizedSegment } from '@/types'
import type { SpeechRecognitionProvider } from '@/services/recognition/SpeechRecognitionProvider'
import { normalizePeak, resampleTo } from './AudioProcessor'
import { VoiceActivityDetector, type SpeechSegment } from './VoiceActivityDetector'

export interface PipelineEvents {
  /** True while at least one segment is queued or being transcribed. */
  onProcessing: (busy: boolean) => void
  onSegment: (seg: RecognizedSegment) => void
  onError: (message: string) => void
  /** Called once per segment that was merged into another or discarded because recognition fell behind. */
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
    private readonly maxQueue = 6,
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

  /** Takes the oldest queued segment plus any that follow it, up to ~20 s of audio. */
  private takeBatch(): SpeechSegment[] {
    const batch = [this.queue.shift()!]
    let total = batch[0].samples.length
    const maxSamples = 20 * this.ctx.sampleRate
    while (this.queue.length && total + this.queue[0].samples.length <= maxSamples) {
      const next = this.queue.shift()!
      total += next.samples.length
      batch.push(next)
    }
    return batch
  }

  /** Concatenates segments with 300 ms of silence between them. */
  private mergeSamples(batch: SpeechSegment[]): Float32Array {
    if (batch.length === 1) return batch[0].samples
    const gap = Math.round(0.3 * this.ctx.sampleRate)
    const total = batch.reduce((n, b) => n + b.samples.length, 0) + gap * (batch.length - 1)
    const out = new Float32Array(total)
    let o = 0
    for (const b of batch) {
      out.set(b.samples, o)
      o += b.samples.length + gap
    }
    return out
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
        // Whisper's cost per call is mostly fixed, so when several utterances are waiting
        // they are transcribed together in one call instead of one by one.
        const batch = this.takeBatch()
        for (let i = 1; i < batch.length; i++) this.events.onDropped?.()
        const raw = this.mergeSamples(batch)
        const audio = normalizePeak(resampleTo(raw, this.ctx.sampleRate, TARGET_RATE))
        try {
          const res = await this.provider.transcribe(audio, this.language)
          if (!this.running) break
          this.events.onSegment({
            text: res.text,
            startMs: batch[0].speechStartMs,
            endMs: batch[batch.length - 1].speechEndMs,
            confidence: res.confidence,
            latencyMs: res.latencyMs,
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
