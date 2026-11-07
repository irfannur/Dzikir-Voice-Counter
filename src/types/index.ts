export interface Dhikr {
  id: string
  name: string
  arabic: string
  latin: string
  translation: string
  /** Extra reference spellings (Arabic or Latin) a recognizer might output. */
  keywords: string[]
  defaultTarget?: number
  custom?: boolean
}

export interface SessionStats {
  accepted: number
  rejected: number
}

export interface SessionRecord {
  id: string
  dhikrId: string
  dhikrName: string
  total: number
  target: number
  startedAt: number
  endedAt: number
  durationMs: number
  stats: SessionStats
  manualCorrections: number
}

export type MicQuality = 'excellent' | 'good' | 'poor'

export interface CalibrationResult {
  id: 'latest'
  deviceId: string
  noiseFloorDb: number
  speechPeakDb: number
  snrDb: number
  quality: MicQuality
  createdAt: number
}

export interface RecognizedSegment {
  text: string
  /** Segment start/end in ms on a monotonic clock shared by the pipeline. */
  startMs: number
  endMs: number
  /** Optional provider confidence 0..1. Never trusted on its own. */
  confidence?: number
}

export type RejectReason =
  | 'paused'
  | 'empty'
  | 'low-confidence'
  | 'low-similarity'
  | 'extra-speech'
  | 'too-short'
  | 'too-long'
  | 'cooldown'
  | 'duplicate'

export interface SegmentResult {
  accepted: boolean
  reason?: RejectReason
  score: number
  count: number
}
