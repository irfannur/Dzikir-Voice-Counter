import { describe, expect, it } from 'vitest'
import { VoiceActivityDetector, type SpeechSegment } from './VoiceActivityDetector'
import { resampleTo } from './AudioProcessor'

const SR = 16000
const FRAME = 512 // 32 ms

let seed = 1
function noise(amp: number): number {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return ((seed / 0xffffffff) * 2 - 1) * amp
}

/** Generates `ms` of audio: low noise, plus a 220 Hz tone when `tone` > 0. */
function signal(ms: number, tone: number): Float32Array {
  const n = Math.round((ms / 1000) * SR)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = noise(0.001) + (tone ? tone * Math.sin((2 * Math.PI * 220 * i) / SR) : 0)
  return out
}

function run(parts: Float32Array[]): SpeechSegment[] {
  const vad = new VoiceActivityDetector({ sampleRate: SR })
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { all.set(p, o); o += p.length }
  const segs: SpeechSegment[] = []
  for (let i = 0; i + FRAME <= all.length; i += FRAME) {
    const s = vad.push(all.subarray(i, i + FRAME))
    if (s) segs.push(s)
  }
  const tail = vad.flush()
  if (tail) segs.push(tail)
  return segs
}

describe('VoiceActivityDetector', () => {
  it('emits one segment with voiced-only timestamps', () => {
    const segs = run([signal(1500, 0), signal(1000, 0.2), signal(1500, 0)])
    expect(segs.length).toBe(1)
    const s = segs[0]
    expect(Math.abs(s.speechStartMs - 1500) < 80).toBe(true)
    expect(Math.abs(s.speechEndMs - 2500) < 80).toBe(true)
    expect(s.startMs <= s.speechStartMs).toBe(true) // pre-roll included in audio
    expect(s.endMs >= s.speechEndMs).toBe(true) // hangover included in audio
  })

  it('keeps a short pause inside one utterance', () => {
    const segs = run([signal(1500, 0), signal(600, 0.2), signal(300, 0), signal(600, 0.2), signal(1500, 0)])
    expect(segs.length).toBe(1)
  })

  it('splits two utterances separated by a long pause', () => {
    const segs = run([signal(1500, 0), signal(800, 0.2), signal(1200, 0), signal(800, 0.2), signal(1500, 0)])
    expect(segs.length).toBe(2)
    expect(segs[1].speechStartMs - segs[0].speechEndMs >= 1000).toBe(true)
  })

  it('ignores silence and very short clicks', () => {
    expect(run([signal(3000, 0)]).length).toBe(0)
    expect(run([signal(1500, 0), signal(60, 0.3), signal(1500, 0)]).length).toBe(0)
  })
})

describe('resampleTo', () => {
  it('downsamples 48 kHz to 16 kHz with the right length and preserves DC level', () => {
    const input = new Float32Array(4800).fill(0.5)
    const out = resampleTo(input, 48000, 16000)
    expect(out.length).toBe(1600)
    expect(Math.abs(out[100] - 0.5) < 1e-6).toBe(true)
  })
  it('returns an independent copy when rates match', () => {
    const input = new Float32Array([1, 2, 3])
    const out = resampleTo(input, 16000, 16000)
    expect(out === input).toBe(false)
    expect(Array.from(out)).toEqual([1, 2, 3])
  })
})
