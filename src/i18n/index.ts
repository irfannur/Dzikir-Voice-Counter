import { en, type MessageKey } from './en'
import { id } from './id'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Lang } from './detect'

export type { MessageKey }
export type { Lang } from './detect'
export { detectLanguage } from './detect'

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, id }

/** Reactive translation helper. `t` re-evaluates when the language setting changes. */
export function useI18n() {
  const settings = useSettingsStore()
  function t(key: MessageKey, params?: Record<string, string | number>): string {
    let text = dictionaries[settings.language][key] ?? en[key]
    if (params) for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v))
    return text
  }
  return { t, lang: () => settings.language }
}
