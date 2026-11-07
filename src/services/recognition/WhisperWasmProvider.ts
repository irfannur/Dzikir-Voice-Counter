import {
  ProviderNotImplementedError,
  type ModelProgress,
  type SpeechRecognitionProvider,
  type TranscriptionResult,
} from './SpeechRecognitionProvider'

/**
 * STUB: whisper.cpp compiled to WASM. Not implemented because it requires a
 * self-built Emscripten binary that could not be produced or tested here.
 * TransformersJsProvider is the working path; this class keeps the slot open
 * behind the same SpeechRecognitionProvider interface.
 */
export class WhisperWasmProvider implements SpeechRecognitionProvider {
  readonly id = 'whisper-wasm'
  readonly label = 'Whisper.cpp (WASM)'
  ready = false

  async load(_onProgress?: (p: ModelProgress) => void): Promise<void> {
    throw new ProviderNotImplementedError(this.label)
  }
  async transcribe(_audio: Float32Array, _language?: string): Promise<TranscriptionResult> {
    throw new ProviderNotImplementedError(this.label)
  }
  dispose(): void {
    this.ready = false
  }
}
