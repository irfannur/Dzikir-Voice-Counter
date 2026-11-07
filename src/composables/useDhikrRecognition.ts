import { ref } from 'vue'
import type { useMicrophone } from '@/composables/useMicrophone'
import { RecognitionPipeline } from '@/services/audio/RecognitionPipeline'
import { TransformersJsProvider } from '@/services/recognition/TransformersJsProvider'
import { getModelOption } from '@/services/recognition/models'
import { requestPersistentStorage } from '@/services/recognition/ModelManager'
import { useCounterStore } from '@/stores/counterStore'
import { useSettingsStore } from '@/stores/settingsStore'

type Mic = ReturnType<typeof useMicrophone>
export type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error'

// Model state is module-level so a loaded model survives navigation between pages.
let sharedProvider: TransformersJsProvider | null = null
let sharedModelId = ''
export const loadState = ref<ModelLoadState>('idle')
export const loadProgress = ref(0)
export const loadError = ref<string | null>(null)
export const activeBackend = ref('')

/**
 * Glue between the microphone, the recognition pipeline and the counter store:
 * mic graph -> VAD -> Whisper (worker) -> counterStore.submitSegment -> DhikrCounterEngine.
 */
export function useDhikrRecognition(mic: Mic) {
  const settings = useSettingsStore()
  const counter = useCounterStore()
  const auto = ref(false)
  const autoError = ref<string | null>(null)
  const droppedCount = ref(0)

  let pipeline: RecognitionPipeline | null = null
  let settleTimer: number | undefined

  async function loadModel() {
    const opt = getModelOption(settings.modelId)
    if (sharedProvider && sharedModelId !== opt.id) {
      sharedProvider.dispose()
      sharedProvider = null
      loadState.value = 'idle'
    }
    if (loadState.value === 'ready' || loadState.value === 'loading') return

    sharedProvider = new TransformersJsProvider(opt.hfId)
    sharedModelId = opt.id
    loadState.value = 'loading'
    loadProgress.value = 0
    loadError.value = null
    void requestPersistentStorage()
    try {
      await sharedProvider.load((p) => {
        loadProgress.value = p.totalBytes > 0 ? Math.min(1, p.loadedBytes / p.totalBytes) : 0
      })
      activeBackend.value = sharedProvider.backend ?? ''
      loadProgress.value = 1
      loadState.value = 'ready'
    } catch (e) {
      loadError.value = (e as Error).message
      loadState.value = 'error'
      sharedProvider.dispose()
      sharedProvider = null
    }
  }

  function scheduleListening() {
    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      if (auto.value) counter.setStatus('listening')
    }, 1200)
  }

  /** Starts automatic counting. The microphone must already be active and the model loaded. */
  async function startAuto(): Promise<boolean> {
    autoError.value = null
    const graph = mic.getGraph()
    if (!graph || !sharedProvider || loadState.value !== 'ready') {
      autoError.value = 'The speech model is not loaded or the microphone is off.'
      return false
    }
    pipeline = new RecognitionPipeline(graph.ctx, graph.node, sharedProvider, {
      onProcessing: (busy) => {
        window.clearTimeout(settleTimer)
        if (busy) counter.setStatus('processing')
        else scheduleListening()
      },
      onSegment: (seg) => {
        counter.submitSegment(seg)
        scheduleListening()
      },
      onError: (m) => { autoError.value = m },
      onDropped: () => { droppedCount.value++ },
    })
    try {
      await pipeline.start()
    } catch (e) {
      autoError.value = (e as Error).message
      pipeline = null
      return false
    }
    auto.value = true
    counter.setStatus('listening')
    return true
  }

  function stopAuto() {
    pipeline?.stop()
    pipeline = null
    auto.value = false
    window.clearTimeout(settleTimer)
    counter.setStatus('idle')
  }

  return { auto, autoError, droppedCount, loadState, loadProgress, loadError, activeBackend, loadModel, startAuto, stopAuto }
}
