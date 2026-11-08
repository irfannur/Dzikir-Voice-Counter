import { rms, toDb } from './AudioProcessor'

export interface VadConfig {
  sampleRate: number
  /** Speech starts when frame level exceeds noiseFloor + onMarginDb. */
  onMarginDb: number
  /** A frame counts as voiced while level stays above noiseFloor + offMarginDb. */
  offMarginDb: number
  /** Silence required to close an utterance. Short pauses inside one dhikr stay merged. */
  hangoverMs: number
  /** Audio kept before detected onset so word starts are not clipped. */
  preRollMs: number
  minSpeechMs: number
  maxSpeechMs: number
  /** Floor used until enough noise has been observed. */
  initialNoiseDb: number
}

export const DEFAULT_VAD_CONFIG: Omit<VadConfig, 'sampleRate'> = {
  onMarginDb: 12,
  offMarginDb: 7,
  hangoverMs: 500,
  preRollMs: 200,
  minSpeechMs: 250,
  maxSpeechMs: 8000,
  initialNoiseDb: -55,
}

export interface SpeechSegment {
  /** Audio including pre-roll and trailing silence (what the recognizer should hear). */
  samples: Float32Array
  /** Stream-time bounds of the audio in `samples`. */
  startMs: number
  endMs: number
  /** Stream-time bounds of the voiced part only (no pre-roll, no hangover). Use these for counting logic. */
  speechStartMs: number
  speechEndMs: number
}

/**
 * Energy-based voice activity detector with adaptive noise floor.
 * Feed consecutive mono frames with push(); completed utterances are returned.
 * A lightweight stand-in that can be replaced by a neural VAD without changing
 * callers: they only consume SpeechSegment objects.
 */
export class VoiceActivityDetector {
  private cfg: VadConfig
  private noiseDb: number
  private speaking = false
  private elapsedMs = 0
  private silenceMs = 0
  private startMs = 0
  private onsetMs = 0
  private lastVoiceEndMs = 0
  private current: Float32Array[] = []
  private preRoll: Float32Array[] = []
  private preRollSamples = 0

  constructor(config: Partial<VadConfig> & { sampleRate: number }) {
    this.cfg = { ...DEFAULT_VAD_CONFIG, ...config }
    this.noiseDb = this.cfg.initialNoiseDb
  }

  get isSpeaking(): boolean { return this.speaking }
  get noiseFloorDb(): number { return this.noiseDb }

  push(frame: Float32Array): SpeechSegment | null {
    const frameMs = (frame.length / this.cfg.sampleRate) * 1000
    const db = toDb(rms(frame))
    const frameStartMs = this.elapsedMs
    this.elapsedMs += frameMs

    if (!this.speaking) {
      // Adapt noise floor only while not speaking (fast when falling, slow when rising).
      const k = db < this.noiseDb ? 0.2 : 0.02
      this.noiseDb += (db - this.noiseDb) * k

      if (db > this.noiseDb + this.cfg.onMarginDb) {
        this.speaking = true
        this.silenceMs = 0
        const preMs = (this.preRollSamples / this.cfg.sampleRate) * 1000
        this.startMs = Math.max(0, frameStartMs - preMs)
        this.onsetMs = frameStartMs
        this.lastVoiceEndMs = this.elapsedMs
        this.current = [...this.preRoll, frame]
        this.preRoll = []
        this.preRollSamples = 0
      } else {
        this.preRoll.push(frame)
        this.preRollSamples += frame.length
        const maxPre = (this.cfg.preRollMs / 1000) * this.cfg.sampleRate
        while (this.preRollSamples > maxPre && this.preRoll.length > 1) {
          this.preRollSamples -= this.preRoll.shift()!.length
        }
      }
      return null
    }

    this.current.push(frame)
    if (db >= this.noiseDb + this.cfg.offMarginDb) {
      this.silenceMs = 0
      this.lastVoiceEndMs = this.elapsedMs
    } else {
      this.silenceMs += frameMs
    }

    if (this.silenceMs >= this.cfg.hangoverMs || this.elapsedMs - this.startMs >= this.cfg.maxSpeechMs) {
      return this.finish()
    }
    return null
  }

  /** Force-closes any open utterance (e.g. when stopping). */
  flush(): SpeechSegment | null {
    return this.speaking ? this.finish() : null
  }

  private finish(): SpeechSegment | null {
    const total = this.current.reduce((n, f) => n + f.length, 0)
    const samples = new Float32Array(total)
    let o = 0
    for (const f of this.current) { samples.set(f, o); o += f.length }
    const seg: SpeechSegment = {
      samples,
      startMs: this.startMs,
      endMs: this.elapsedMs,
      speechStartMs: this.onsetMs,
      speechEndMs: this.lastVoiceEndMs,
    }
    this.speaking = false
    this.current = []
    this.silenceMs = 0
    if (seg.speechEndMs - seg.speechStartMs < this.cfg.minSpeechMs) return null
    return seg
  }
}
