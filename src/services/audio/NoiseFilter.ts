/**
 * Basic noise handling using built-in Web Audio nodes: a high-pass filter to
 * remove low-frequency rumble. Browser-level noiseSuppression / echoCancellation
 * are requested in getUserMedia constraints (see useMicrophone).
 */
export function createHighPass(ctx: AudioContext, frequency = 100): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = frequency
  return f
}
