import type { Dhikr } from '@/types'
import type { Lang } from '@/i18n/detect'

/** Translation in the UI language when available (built-in dhikr), else the stored one. */
export function dhikrTranslation(d: Dhikr, lang: Lang): string {
  return lang === 'en' && d.translationEn ? d.translationEn : d.translation
}
