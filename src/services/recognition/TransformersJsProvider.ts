import {
  detectWebGpu,
  type ModelProgress,
  type ProviderBackend,
  type SpeechRecognitionProvider,
  type TranscriptionResult,
} from './SpeechRecognitionProvider'

type Pending = {
  resolve: (v: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
  reject: (e: Error) => void
  onProgress?: (p: ModelProgress) => void
}

/** Whisper via Transformers.js, running inside whisper.worker.ts. */
export class TransformersJsProvider implements SpeechRecognitionProvider {
  readonly id = 'transformers-js'
  readonly label = 'Transformers.js (Whisper)'
  ready = false
  backend?: ProviderBackend

  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()

  constructor(
    private readonly modelId: string,
    private readonly preferWebGpu: boolean = detectWebGpu(),
  ) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const w = new Worker(new URL('../../workers/whisper.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent) => {
      const m = e.data
      const p = this.pending.get(m.id)
      if (!p) return
      if (m.type === 'progress') {
        p.onProgress?.({ loadedBytes: m.loaded, totalBytes: m.total })
        return
      }
      this.pending.delete(m.id)
      if (m.type === 'error') p.reject(new Error(m.message))
      else p.resolve(m)
    }
    w.onerror = (e) => this.failAll(new Error(e.message || 'Recognition worker crashed.'))
    this.worker = w
    return w
  }

  private failAll(err: Error) {
    this.ready = false
    this.pending.forEach((p) => p.reject(err))
    this.pending.clear()
  }

  private call<T>(msg: Record<string, unknown>, onProgress?: (p: ModelProgress) => void, transfer: Transferable[] = []): Promise<T> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress })
      worker.postMessage({ id, ...msg }, transfer)
    })
  }

  async load(onProgress?: (p: ModelProgress) => void): Promise<void> {
    const res = await this.call<{ backend: ProviderBackend }>(
      { type: 'load', model: this.modelId, device: this.preferWebGpu ? 'webgpu' : 'wasm' },
      onProgress,
    )
    this.backend = res.backend
    this.ready = true
  }

  /** `audio` must be 16 kHz mono Float32. Its buffer is transferred to the worker. */
  async transcribe(audio: Float32Array, language = 'arabic'): Promise<TranscriptionResult> {
    if (!this.ready) throw new Error('Speech model is not loaded.')
    const res = await this.call<{ text: string; latencyMs: number }>(
      { type: 'transcribe', audio, language },
      undefined,
      [audio.buffer],
    )
    return { text: res.text, latencyMs: res.latencyMs }
  }

  dispose(): void {
    this.failAll(new Error('Provider disposed.'))
    this.worker?.terminate()
    this.worker = null
  }
}
