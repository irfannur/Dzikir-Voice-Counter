/** Pure helpers for level measurement, resampling and normalization. */

export function rms(frame: Float32Array): number {
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  return Math.sqrt(sum / (frame.length || 1))
}

/** Converts linear amplitude (0..1) to dBFS, floored at -100. */
export function toDb(amplitude: number): number {
  return amplitude <= 1e-5 ? -100 : 20 * Math.log10(amplitude)
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return -100
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))))
  return sorted[idx]
}

/** Peak-normalizes audio to the target peak (default 0.9). Returns a new array. */
export function normalizePeak(samples: Float32Array, targetPeak = 0.9): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  if (peak < 1e-4) return samples.slice()
  const gain = targetPeak / peak
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain
  return out
}

/**
 * Resamples mono audio by averaging source samples inside each output sample's window
 * (a crude low-pass that limits aliasing when downsampling, e.g. 48 kHz -> 16 kHz).
 * Always returns a new array, so its buffer can be transferred to a worker.
 */
export function resampleTo(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples.slice()
  const ratio = fromRate / toRate
  const outLen = Math.floor(samples.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(samples.length, Math.max(start + 1, Math.ceil((i + 1) * ratio)))
    let sum = 0
    for (let j = start; j < end; j++) sum += samples[j]
    out[i] = sum / (end - start)
  }
  return out
}
