const ARABIC_RE = /[؀-ۿ]/

/** Diacritics (harakat), Quranic marks, superscript alef, tatweel. */
const ARABIC_MARKS_RE = /[ـً-ٰٟۖ-ۭ]/g

export function hasArabic(s: string): boolean {
  return ARABIC_RE.test(s)
}

function normalizeArabic(s: string): string {
  return s
    .replace(ARABIC_MARKS_RE, '')
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/[^ء-ي]/g, '') // keep letters only (also drops spaces)
}

function normalizeLatin(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/['’`ʿʾ‘]/g, '')
    .replace(/[^a-z]/g, '') // letters only, removes spaces/punctuation
    .replace(/(.)\1+/g, '$1') // collapse doubled letters: allaah -> alah
}

/**
 * Normalizes Arabic or Latin text into a compact comparison form
 * (no spaces, diacritics, punctuation; case-folded).
 */
export function normalizeText(input: string): string {
  if (!input) return ''
  return hasArabic(input) ? normalizeArabic(input) : normalizeLatin(input)
}
