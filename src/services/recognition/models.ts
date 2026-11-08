export interface ModelOption {
  id: string
  label: string
  /** Hugging Face repo id used by Transformers.js. Verify availability and license before release. */
  hfId: string
  /** Rough download size in MB (quantized). Approximate, not measured. */
  approxMb: number
  note: string
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'whisper-tiny', label: 'Whisper Tiny (multilingual)', hfId: 'onnx-community/whisper-tiny', approxMb: 40, note: 'Fastest, least accurate' },
  { id: 'whisper-base', label: 'Whisper Base (multilingual)', hfId: 'onnx-community/whisper-base', approxMb: 80, note: 'Balanced' },
  { id: 'whisper-small', label: 'Whisper Small (multilingual)', hfId: 'onnx-community/whisper-small', approxMb: 250, note: 'Most accurate, heavy on phones' },
]

export const DEFAULT_MODEL_ID = 'whisper-base'

export function getModelOption(id: string): ModelOption {
  return MODEL_OPTIONS.find((m) => m.id === id) ?? MODEL_OPTIONS[0]
}
