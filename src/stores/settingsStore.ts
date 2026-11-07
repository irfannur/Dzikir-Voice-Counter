import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getModelOption } from '@/services/recognition/models'

export type ThemeSetting = 'light' | 'dark' | 'system'
const KEY = 'voice-dzikir:settings'

interface Persisted {
  theme: ThemeSetting
  defaultTarget: number
  deviceId: string
  soundFeedback: boolean
  vibration: boolean
  stopMicAtTarget: boolean
  modelId: string
}

const DEFAULTS: Persisted = {
  theme: 'system',
  defaultTarget: 33,
  deviceId: '',
  soundFeedback: false,
  vibration: true,
  stopMicAtTarget: false,
  modelId: 'whisper-tiny',
}

function load(): Persisted {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const s = load()
  const theme = ref<ThemeSetting>(s.theme)
  const defaultTarget = ref(s.defaultTarget)
  const deviceId = ref(s.deviceId)
  const soundFeedback = ref(s.soundFeedback)
  const vibration = ref(s.vibration)
  const stopMicAtTarget = ref(s.stopMicAtTarget)
  // Older saved values (e.g. the Phase 1 placeholder) fall back to the default model.
  const modelId = ref(getModelOption(s.modelId).id)

  function applyTheme() {
    const dark =
      theme.value === 'dark' || (theme.value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }

  watch(
    [theme, defaultTarget, deviceId, soundFeedback, vibration, stopMicAtTarget, modelId],
    () => {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({
            theme: theme.value,
            defaultTarget: defaultTarget.value,
            deviceId: deviceId.value,
            soundFeedback: soundFeedback.value,
            vibration: vibration.value,
            stopMicAtTarget: stopMicAtTarget.value,
            modelId: modelId.value,
          }),
        )
      } catch {
        /* storage full or blocked: settings simply won't persist */
      }
      applyTheme()
    },
    { flush: 'sync' },
  )

  return { theme, defaultTarget, deviceId, soundFeedback, vibration, stopMicAtTarget, modelId, applyTheme }
})
