/// <reference lib="webworker" />
/**
 * Speech recognition worker (Transformers.js + Whisper). Keeps model loading and
 * inference off the UI thread. All audio stays in the browser; the only network
 * traffic is the one-time model download (and ONNX runtime files if not bundled).
 *
 * Model files are fetched over the network at runtime, never deployed as a Pages
 * static asset, so Cloudflare Pages' 25 MiB per-file limit does not apply to them.
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

/**
 * Probes `${host}${model}/resolve/main/config.json` and returns ok only if it looks
 * like real model JSON. Cloudflare Pages (and most static hosts) answer an unknown
 * path with their SPA fallback page: status 200, content-type text/html. Trusting
 * that response is exactly what produces "Unexpected token '<' ... is not valid JSON"
 * deep inside the model loader, so it is rejected here instead, with a clear reason.
 */
async function probeHost(host: string, model: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const url = `${host}${model}/resolve/main/config.json`
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (e) {
    return { ok: false, reason: `unreachable (${(e as Error).message})` }
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/html')) return { ok: false, reason: 'returned an HTML page instead of model files' }
  return { ok: true }
}

async function resolveRemoteHost(model: string): Promise<string> {
  // Candidate hosts in order: your own host (R2 via /models/), Hugging Face directly,
  // then the same-origin /hf/ proxy (helps when an ISP blocks huggingface.co).
  // A model that is not in your R2 bucket simply falls through to the next candidate.
  const attempts: { label: string; host: string }[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customHost = (import.meta as any).env?.VITE_MODEL_BASE_URL as string | undefined
  if (customHost) {
    // Accepts absolute URLs or same-origin paths such as "/models/".
    const resolved = new URL(customHost, self.location.origin).href
    attempts.push({ label: `own host (${resolved})`, host: resolved.endsWith('/') ? resolved : `${resolved}/` })
  }
  attempts.push({ label: 'Hugging Face (direct)', host: 'https://huggingface.co/' })
  attempts.push({ label: '/hf/ proxy', host: new URL('/hf/', self.location.origin).href })

  const failures: string[] = []
  for (const a of attempts) {
    const probe = await probeHost(a.host, model)
    if (probe.ok) return a.host
    failures.push(`${a.label}: ${probe.reason}`)
  }
  throw new Error(`Could not fetch model "${model}". ${failures.join('; ')}`)
}

async function load(req: LoadReq) {
  const { pipeline, env } = await import('@huggingface/transformers')

  env.remoteHost = await resolveRemoteHost(req.model)
  env.allowLocalModels = false // models are always fetched remotely (see env.remoteHost above)

  // Prefer locally served ONNX runtime files (copied by scripts/copy-ort-wasm.mjs)
  // so inference does not depend on a CDN once the PWA has cached them.
  // Guard against HTML SPA fallback on static hosts like Cloudflare Pages.
  try {
    const r = await fetch('/ort/manifest.json')
    const ct = r.headers.get('content-type') || ''
    if (r.ok && !ct.includes('text/html')) {
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
        message = 'Network request failed while downloading the model.'
      }
      post({ id: req.id, type: 'error', message })
    })
}
