import type { Dhikr, RecognizedSegment, RejectReason, SegmentResult, SessionStats } from '@/types'
import {
  DEFAULT_VALIDATOR_CONFIG,
  buildReferences,
  validateUtterance,
  type ValidatorConfig,
} from './UtteranceValidator'

export interface EngineConfig extends ValidatorConfig {
  /** Reject if the provider reports a confidence below this (only when provided). */
  minConfidence: number
  /** After an accepted count, ignore segments starting within this window. */
  cooldownMs: number
  /** Utterance duration bounds. */
  minUtteranceMs: number
  maxUtteranceMs: number
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  ...DEFAULT_VALIDATOR_CONFIG,
  minConfidence: 0.3,
  cooldownMs: 350,
  minUtteranceMs: 250,
  maxUtteranceMs: 12000,
}

/**
 * Provider-independent counting engine. It only sees RecognizedSegment objects
 * (text + timestamps), so any speech recognizer can feed it.
 * One accepted segment = exactly one count.
 */
export class DhikrCounterEngine {
  private config: EngineConfig
  private references: string[] = []
  private lastAcceptedEndMs = -Infinity
  private seen = new Set<string>()

  count = 0
  target = 0
  paused = false
  stats: SessionStats = { accepted: 0, rejected: 0 }
  manualCorrections = 0

  constructor(dhikr: Dhikr, target: number, config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config }
    this.target = target
    this.setDhikr(dhikr)
  }

  setDhikr(dhikr: Dhikr): void {
    this.references = buildReferences([dhikr.arabic, dhikr.latin, ...dhikr.keywords])
  }

  updateConfig(patch: Partial<EngineConfig>): void {
    this.config = { ...this.config, ...patch }
  }

  pause(): void { this.paused = true }
  resume(): void { this.paused = false }

  /** Process one recognized utterance. Never throws; always returns a result. */
  handleSegment(seg: RecognizedSegment): SegmentResult {
    const reject = (reason: RejectReason, score = 0): SegmentResult => {
      this.stats.rejected++
      return { accepted: false, reason, score, count: this.count }
    }

    if (this.paused) return { accepted: false, reason: 'paused', score: 0, count: this.count }

    const duration = seg.endMs - seg.startMs
    if (duration < this.config.minUtteranceMs) return reject('too-short')
    if (duration > this.config.maxUtteranceMs) return reject('too-long')

    const key = `${seg.startMs}-${seg.endMs}`
    if (this.seen.has(key)) return reject('duplicate')
    this.seen.add(key)

    if (seg.startMs - this.lastAcceptedEndMs < this.config.cooldownMs) return reject('cooldown')

    if (seg.confidence !== undefined && seg.confidence < this.config.minConfidence) {
      return reject('low-confidence')
    }

    const v = validateUtterance(seg.text, this.references, this.config)
    if (!v.valid) return reject(v.reason ?? 'low-similarity', v.score)

    this.count++
    this.stats.accepted++
    this.lastAcceptedEndMs = seg.endMs
    return { accepted: true, score: v.score, count: this.count }
  }

  manualIncrement(): void {
    this.count++
    this.manualCorrections++
  }

  manualDecrement(): void {
    if (this.count > 0) {
      this.count--
      this.manualCorrections++
    }
  }

  reset(): void {
    this.count = 0
    this.stats = { accepted: 0, rejected: 0 }
    this.manualCorrections = 0
    this.lastAcceptedEndMs = -Infinity
    this.seen.clear()
  }

  get progress(): number {
    return this.target > 0 ? Math.min(100, (this.count / this.target) * 100) : 0
  }
}
