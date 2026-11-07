import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { createHighPass } from '@/services/audio/NoiseFilter'
import { rms, toDb } from '@/services/audio/AudioProcessor'

export type MicErrorKind = 'denied' | 'not-found' | 'in-use' | 'unsupported' | 'disconnected' | 'unknown'

export interface MicError {
  kind: MicErrorKind
  message: string
  help: string
}

function mapError(e: unknown): MicError {
  const name = (e as DOMException)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      kind: 'denied',
      message: 'Microphone access was blocked.',
      help: 'Tap the lock/site-settings icon in the address bar, set Microphone to Allow, then reload and try again.',
    }
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { kind: 'not-found', message: 'No matching microphone was found.', help: 'Plug in a microphone or pick another device in Settings.' }
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return { kind: 'in-use', message: 'The microphone is busy or unavailable.', help: 'Close other apps or tabs using the microphone and try again.' }
  }
  return { kind: 'unknown', message: 'Could not start the microphone.', help: 'Reload the page and try again.' }
}

export function useMicrophone() {
  const devices = ref<MediaDeviceInfo[]>([])
  const active = ref(false)
  const error = ref<MicError | null>(null)
  const levelDb = ref(-100)
  const analyser = shallowRef<AnalyserNode | null>(null)
  const sampleRate = ref(0)

  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let filterNode: BiquadFilterNode | null = null
  let raf = 0
  let buf: Float32Array<ArrayBuffer> | null = null

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const all = await navigator.mediaDevices.enumerateDevices()
    devices.value = all.filter((d) => d.kind === 'audioinput')
  }

  function tick() {
    if (analyser.value && buf) {
      analyser.value.getFloatTimeDomainData(buf)
      levelDb.value = toDb(rms(buf))
    }
    raf = requestAnimationFrame(tick)
  }

  /** Requests permission and starts capture. Returns true on success. */
  async function start(deviceId?: string): Promise<boolean> {
    error.value = null
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = {
        kind: 'unsupported',
        message: 'This browser does not support microphone capture.',
        help: 'Use a recent Chrome, Edge, Firefox or Safari over HTTPS.',
      }
      return false
    }
    stop()
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (e) {
      error.value = mapError(e)
      return false
    }

    ctx = new AudioContext()
    sampleRate.value = ctx.sampleRate
    source = ctx.createMediaStreamSource(stream)
    const hp = createHighPass(ctx)
    filterNode = hp
    const an = ctx.createAnalyser()
    an.fftSize = 2048
    source.connect(hp)
    hp.connect(an)
    analyser.value = an
    buf = new Float32Array(an.fftSize)

    // Detect unplugged / revoked microphone.
    stream.getAudioTracks().forEach((t) =>
      t.addEventListener('ended', () => {
        error.value = {
          kind: 'disconnected',
          message: 'The microphone was disconnected.',
          help: 'Reconnect it or choose another microphone, then start listening again.',
        }
        stop()
      }),
    )

    active.value = true
    await refreshDevices() // labels are available only after permission is granted
    raf = requestAnimationFrame(tick)
    return true
  }

  /** Stops capture and releases the device (the browser's mic indicator turns off). */
  function stop() {
    cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
    source?.disconnect()
    void ctx?.close()
    stream = null
    source = null
    filterNode = null
    ctx = null
    analyser.value = null
    buf = null
    active.value = false
    levelDb.value = -100
  }

  function getStream(): MediaStream | null {
    return stream
  }

  /** Audio graph tap for the recognition pipeline: the filtered mic signal. */
  function getGraph(): { ctx: AudioContext; node: AudioNode } | null {
    return ctx && filterNode ? { ctx, node: filterNode } : null
  }

  onBeforeUnmount(stop)

  return { devices, active, error, levelDb, analyser, sampleRate, start, stop, refreshDevices, getStream, getGraph }
}
