import { describe, expect, it } from 'vitest'
import { DhikrCounterEngine } from './DhikrCounterEngine'
import { normalizeText } from './TextNormalizer'
import { BUILTIN_DHIKR } from '@/data/dhikrLibrary'
import type { RecognizedSegment } from '@/types'

const subhanallah = BUILTIN_DHIKR.find((d) => d.id === 'subhanallah')!
const hawla = BUILTIN_DHIKR.find((d) => d.id === 'la-hawla')!

let t = 0
/** Builds a segment starting `gap` ms after the previous one ended, lasting `dur` ms. */
function seg(text: string, gap = 1000, dur = 1200, confidence?: number): RecognizedSegment {
  const startMs = t + gap
  t = startMs + dur
  return { text, startMs, endMs: t, confidence }
}

function fresh(d = subhanallah, target = 33) {
  t = 0
  return new DhikrCounterEngine(d, target)
}

describe('TextNormalizer', () => {
  it('strips Arabic diacritics and unifies letters', () => {
    expect(normalizeText('سُبْحَانَ اللَّهِ')).toBe(normalizeText('سبحان الله'))
    expect(normalizeText('أَسْتَغْفِرُ')).toBe(normalizeText('استغفر'))
  })
  it('folds Latin case, punctuation and doubled letters', () => {
    expect(normalizeText('Subhaanallaah!')).toBe(normalizeText('subhanallah'))
    expect(normalizeText("Subhan' Allah.")).toBe('subhanalah')
  })
})

describe('DhikrCounterEngine', () => {
  it('counts one valid utterance exactly once', () => {
    const e = fresh()
    expect(e.handleSegment(seg('سبحان الله')).accepted).toBe(true)
    expect(e.count).toBe(1)
  })

  it('accepts Latin and Arabic transcripts and minor variations', () => {
    const e = fresh()
    for (const text of ['Subhanallah', 'subhan allah', 'سُبْحَانَ اللَّهِ', 'subhanalloh']) {
      expect(e.handleSegment(seg(text)).accepted).toBe(true)
    }
    expect(e.count).toBe(4)
  })

  it('rejects empty, unrelated and conversational speech', () => {
    const e = fresh()
    expect(e.handleSegment(seg('')).accepted).toBe(false)
    expect(e.handleSegment(seg('thank you for watching')).accepted).toBe(false)
    expect(e.handleSegment(seg('hey are you coming to lunch today after subhanallah the meeting')).reason).toBe('extra-speech')
    expect(e.count).toBe(0)
  })

  it('rejects incomplete dhikr', () => {
    const e = fresh(hawla)
    expect(e.handleSegment(seg('la hawla')).accepted).toBe(false)
    expect(e.handleSegment(seg('la hawla wa la quwwata illa billah')).accepted).toBe(true)
  })

  it('does not double count the same segment or segments inside cooldown', () => {
    const e = fresh()
    const s = seg('subhanallah')
    expect(e.handleSegment(s).accepted).toBe(true)
    expect(e.handleSegment(s).accepted).toBe(false) // same timestamps
    const quick = seg('subhanallah', 100) // starts 100ms after previous end
    expect(e.handleSegment(quick).reason).toBe('cooldown')
    expect(e.count).toBe(1)
  })

  it('rejects too-short and too-long utterances', () => {
    const e = fresh()
    expect(e.handleSegment(seg('subhanallah', 1000, 100)).reason).toBe('too-short')
    expect(e.handleSegment(seg('subhanallah', 1000, 20000)).reason).toBe('too-long')
  })

  it('does not trust provider confidence alone, but honors low confidence', () => {
    const e = fresh()
    expect(e.handleSegment(seg('random words here', 1000, 1200, 0.99)).accepted).toBe(false)
    expect(e.handleSegment(seg('subhanallah', 1000, 1200, 0.1)).reason).toBe('low-confidence')
    expect(e.handleSegment(seg('subhanallah', 1000, 1200, 0.9)).accepted).toBe(true)
  })

  it('ignores segments while paused and counts after resume', () => {
    const e = fresh()
    e.pause()
    expect(e.handleSegment(seg('subhanallah')).reason).toBe('paused')
    e.resume()
    expect(e.handleSegment(seg('subhanallah')).accepted).toBe(true)
    expect(e.count).toBe(1)
  })

  it('supports manual correction and tracks it', () => {
    const e = fresh()
    e.manualIncrement()
    e.manualIncrement()
    e.manualDecrement()
    e.manualDecrement()
    e.manualDecrement() // floor at 0
    expect(e.count).toBe(0)
    expect(e.manualCorrections).toBe(4)
  })

  it('tracks stats and progress, and resets', () => {
    const e = fresh(subhanallah, 4)
    e.handleSegment(seg('subhanallah'))
    e.handleSegment(seg('nonsense'))
    e.handleSegment(seg('subhanallah'))
    expect(e.stats).toEqual({ accepted: 2, rejected: 1 })
    expect(e.progress).toBe(50)
    e.reset()
    expect(e.count).toBe(0)
    expect(e.stats).toEqual({ accepted: 0, rejected: 0 })
  })
})
