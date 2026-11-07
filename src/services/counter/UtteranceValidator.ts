import { normalizeText } from './TextNormalizer'
import type { RejectReason } from '@/types'

export interface ValidatorConfig {
  /** Minimum similarity (0..1) between transcript and best reference. */
  minScore: number
  /** Max extra text (relative to reference length) before treating it as other speech. */
  maxExtraRatio: number
}

export const DEFAULT_VALIDATOR_CONFIG: ValidatorConfig = {
  minScore: 0.78,
  maxExtraRatio: 0.6,
}

export interface ValidationResult {
  valid: boolean
  score: number
  extraRatio: number
  reason?: Extract<RejectReason, 'empty' | 'low-similarity' | 'extra-speech'>
}

/**
 * Minimum edit distance between `pattern` and ANY substring of `text`
 * (Sellers' approximate substring matching).
 */
export function bestSubstringDistance(pattern: string, text: string): number {
  const m = pattern.length
  const n = text.length
  if (m === 0) return 0
  if (n === 0) return m
  let prev = new Array<number>(m + 1)
  let cur = new Array<number>(m + 1)
  for (let i = 0; i <= m; i++) prev[i] = i
  let best = prev[m]
  for (let j = 1; j <= n; j++) {
    cur[0] = 0
    for (let i = 1; i <= m; i++) {
      const cost = pattern[i - 1] === text[j - 1] ? 0 : 1
      cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + cost)
    }
    if (cur[m] < best) best = cur[m]
    ;[prev, cur] = [cur, prev]
  }
  return best
}

/** Builds normalized reference forms from the dhikr's text and keywords. */
export function buildReferences(texts: string[]): string[] {
  const set = new Set<string>()
  for (const t of texts) {
    const n = normalizeText(t)
    if (n.length > 0) set.add(n)
  }
  return [...set]
}

/**
 * Text-level validation of one transcribed utterance against reference forms.
 * Requires a close match AND a limited amount of surrounding speech.
 */
export function validateUtterance(
  transcript: string,
  references: string[],
  config: ValidatorConfig = DEFAULT_VALIDATOR_CONFIG,
): ValidationResult {
  const text = normalizeText(transcript)
  if (!text || references.length === 0) return { valid: false, score: 0, extraRatio: 0, reason: 'empty' }

  let bestScore = -1
  let bestExtra = 0
  for (const ref of references) {
    const dist = bestSubstringDistance(ref, text)
    const score = Math.max(0, 1 - dist / ref.length)
    const extra = Math.max(0, text.length - ref.length) / ref.length
    if (score > bestScore || (score === bestScore && extra < bestExtra)) {
      bestScore = score
      bestExtra = extra
    }
  }

  if (bestScore < config.minScore) return { valid: false, score: bestScore, extraRatio: bestExtra, reason: 'low-similarity' }
  if (bestExtra > config.maxExtraRatio) return { valid: false, score: bestScore, extraRatio: bestExtra, reason: 'extra-speech' }
  return { valid: true, score: bestScore, extraRatio: bestExtra }
}
