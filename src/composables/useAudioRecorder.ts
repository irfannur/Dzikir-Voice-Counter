import { onBeforeUnmount, ref } from 'vue'

/**
 * Records a short in-memory sample for playback. Nothing is persisted or uploaded;
 * the object URL lives only until discard() or unmount.
 */
export function useAudioRecorder() {
  const recording = ref(false)
  const sampleUrl = ref<string | null>(null)
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []

  function start(stream: MediaStream): boolean {
    if (typeof MediaRecorder === 'undefined') return false
    discard()
    chunks = []
    recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      sampleUrl.value = URL.createObjectURL(blob)
      recording.value = false
    }
    recorder.start()
    recording.value = true
    return true
  }

  function stop() {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }

  function discard() {
    if (sampleUrl.value) URL.revokeObjectURL(sampleUrl.value)
    sampleUrl.value = null
    chunks = []
  }

  onBeforeUnmount(() => {
    stop()
    discard()
  })

  return { recording, sampleUrl, start, stop, discard }
}
