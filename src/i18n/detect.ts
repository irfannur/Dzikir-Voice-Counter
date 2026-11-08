export type Lang = 'id' | 'en'

/** Default UI language: Indonesian for Indonesian browsers, English otherwise. */
export function detectLanguage(): Lang {
  try {
    return (navigator.language || 'en').toLowerCase().startsWith('id') ? 'id' : 'en'
  } catch {
    return 'en'
  }
}
