/// <reference lib="webworker" />
/**
 * Speech recognition worker (Transformers.js + Whisper). Keeps model loading and
 * inference off the UI thread. All audio stays in the browser; the only network
 * traffic is the one-time model download (and ONNX runtime files if not bundled).
 */
type Device = 'webgpu' | 'wasm'
type LoadReq = { id: number; type: 'load'; model: string; device: Device }
type TranscribeReq = { id: number; type: 'transcribe'; audio: Float32Array; language: string }
type Req = LoadReq | TranscribeReq

// The pipeline type is a large union in Transformers.js; keep it loose here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null
let backend: Device = 'wasm'
let chain: Promise<void> = Promise.resolve()

const post = (m: unknown) => (self as unknown as Worker).postMessage(m)

async function load(req: LoadReq) {
  const { pipeline, env } = await import('@huggingface/transformers')

  // Check if local model files exist in /models/<model_id>/ (e.g. from public/models)
  try {
    const localCheck = await fetch(`/models/${req.model}/config.json`, { method: 'HEAD' })
    env.allowLocalModels = localCheck.ok
  } catch {
    env.allowLocalModels = false
  }

  // Prefer locally served ONNX runtime files (copied by scripts/copy-ort-wasm.mjs)
  // so inference does not depend on a CDN once the PWA has cached them.
  try {
    const r = await fetch('/ort/manifest.json')
    if (r.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wasm = (env.backends as any).onnx?.wasm
      if (wasm) wasm.wasmPaths = new URL('/ort/', self.location.origin).href
    }
  } catch {
    /* fall back to the library default */
  }

  const files = new Map<string, { loaded: number; total: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progress_callback = (p: any) => {
    if (p?.status === 'progress' && p.file) {
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
      let loaded = 0
      let total = 0
      files.forEach((v) => { loaded += v.loaded; total += v.total })
      post({ id: req.id, type: 'progress', loaded, total })
    }
  }

  const create = (device: Device) =>
    pipeline(
      'automatic-speech-recognition',
      req.model,
      device === 'webgpu'
        ? { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback }
        : { device: 'wasm', dtype: 'q8', progress_callback },
    )

  try {
    asr = await create(req.device)
    backend = req.device
  } catch (e) {
    if (req.device !== 'webgpu') throw e
    asr = await create('wasm') // WebGPU failed at runtime: fall back to WASM
    backend = 'wasm'
  }
  post({ id: req.id, type: 'loaded', backend })
}

async function transcribe(req: TranscribeReq) {
  if (!asr) throw new Error('Model is not loaded.')
  const t0 = performance.now()
  const out = await asr(req.audio, { language: req.language, task: 'transcribe', return_timestamps: false })
  const text = Array.isArray(out) ? out.map((o: { text: string }) => o.text).join(' ') : out.text
  post({ id: req.id, type: 'result', text: String(text ?? '').trim(), latencyMs: performance.now() - t0 })
}

self.onmessage = (e: MessageEvent<Req>) => {
  const req = e.data
  // Serialize requests so inference never overlaps.
  chain = chain
    .then(() => (req.type === 'load' ? load(req) : transcribe(req)))
    .catch((err: unknown) => {
      let message = err instanceof Error ? err.message : String(err)
      if (message.includes('Failed to fetch')) {
        message = 'Failed to fetch (Koneksi ke Hugging Face gagal/diblokir. Jalankan "npm run download:model" di terminal untuk menggunakan model offline, atau gunakan VPN/Secure DNS).'
      }
      post({ id: req.id, type: 'error', message })
    })
}
