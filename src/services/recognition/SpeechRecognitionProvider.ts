export interface TranscriptionResult {
  text: string
  /** Optional 0..1 confidence; may be unreliable and is never trusted alone. */
  confidence?: number
  latencyMs?: number
}

export interface ModelProgress {
  loadedBytes: number
  totalBytes: number
}

export type ProviderBackend = 'webgpu' | 'wasm'

/**
 * Interchangeable local speech recognizer. Implementations must run fully in the
 * browser (ideally inside a Web Worker) and must never send audio off-device.
 */
export interface SpeechRecognitionProvider {
  readonly id: string
  readonly label: string
  readonly ready: boolean
  backend?: ProviderBackend
  load(onProgress?: (p: ModelProgress) => void): Promise<void>
  /** 16 kHz mono Float32 PCM in [-1, 1]. */
  transcribe(audio: Float32Array, language?: string): Promise<TranscriptionResult>
  dispose(): void
}

export class ProviderNotImplementedError extends Error {
  constructor(provider: string) {
    super(`${provider} is not implemented yet (Phase 2).`)
    this.name = 'ProviderNotImplementedError'
  }
}

export function detectWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}
