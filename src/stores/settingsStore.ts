import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getModelOption } from '@/services/recognition/models'
import { detectLanguage, type Lang } from '@/i18n/detect'

export type ThemeSetting = 'light' | 'dark' | 'system'
export type Sensitivity = 'strict' | 'normal' | 'lenient'
const KEY = 'voice-dzikir:settings'

interface Persisted {
  theme: ThemeSetting
  defaultTarget: number
  deviceId: string
  soundFeedback: boolean
  vibration: boolean
  stopMicAtTarget: boolean
  modelId: string
  language: Lang
  sensitivity: Sensitivity
}

const DEFAULTS: Persisted = {
  theme: 'system',
  defaultTarget: 33,
  deviceId: '',
  soundFeedback: false,
  vibration: true,
  stopMicAtTarget: false,
  modelId: 'whisper-base',
  language: detectLanguage(),
  sensitivity: 'normal',
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
  const language = ref<Lang>(s.language === 'en' || s.language === 'id' ? s.language : detectLanguage())
  const sensitivity = ref<Sensitivity>(s.sensitivity ?? 'normal')

  function applyTheme() {
    const dark =
      theme.value === 'dark' || (theme.value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }

  watch(
    [theme, defaultTarget, deviceId, soundFeedback, vibration, stopMicAtTarget, modelId, language, sensitivity],
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
            language: language.value,
            sensitivity: sensitivity.value,
          }),
        )
      } catch {
        /* storage full or blocked: settings simply won't persist */
      }
      applyTheme()
      document.documentElement.lang = language.value
    },
    { flush: 'sync' },
  )

  return { theme, defaultTarget, deviceId, soundFeedback, vibration, stopMicAtTarget, modelId, language, sensitivity, applyTheme }
})
