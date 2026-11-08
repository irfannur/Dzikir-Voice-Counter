/**
 * Serves model files from a Cloudflare R2 bucket through an R2 *binding*, same-origin
 * with the app (https://<site>.pages.dev/models/...). This avoids the r2.dev public URL
 * (rate-limited, development only) and any CORS setup, and R2 objects are not subject to
 * the 25 MiB per-file limit of Pages static assets.
 *
 * Setup: Pages project -> Settings -> Bindings -> Add -> R2 bucket,
 *        Variable name: MODELS, Bucket: voice-dzikir-models. Then redeploy.
 *
 * URL /models/onnx-community/whisper-tiny/resolve/main/config.json
 *  -> R2 key onnx-community/whisper-tiny/resolve/main/config.json
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Env {
  MODELS: any // R2Bucket
}

const TYPES: Record<string, string> = {
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  onnx: 'application/octet-stream',
}

export const onRequest = async (context: { request: Request; env: Env; params: { path?: string | string[] } }) => {
  const { request, env, params } = context
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Max-Age': '86400' } })
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: cors })
  if (!env.MODELS) {
    return new Response(JSON.stringify({ error: 'R2 binding "MODELS" is not configured for this Pages project.' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : []
  const key = parts.join('/')
  if (!key || key.includes('..')) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  const notFound = () => new Response(JSON.stringify({ error: `Not found: ${key}` }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (request.method === 'HEAD') {
    const head = await env.MODELS.head(key)
    if (!head) return notFound()
    const h = new Headers(cors)
    head.writeHttpMetadata(h)
    h.set('etag', head.httpEtag)
    h.set('accept-ranges', 'bytes')
    h.set('content-length', String(head.size))
    if (!h.get('content-type')) h.set('content-type', TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream')
    return new Response(null, { status: 200, headers: h })
  }

  const hasRange = request.headers.has('range')
  const obj = await env.MODELS.get(key, hasRange ? { range: request.headers } : undefined)
  if (!obj) return notFound()

  const h = new Headers(cors)
  obj.writeHttpMetadata(h)
  h.set('etag', obj.httpEtag)
  h.set('accept-ranges', 'bytes')
  h.set('cache-control', 'public, max-age=31536000, immutable')
  if (!h.get('content-type')) h.set('content-type', TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream')

  let status = 200
  if (hasRange && obj.range) {
    const r = obj.range as { offset?: number; length?: number; suffix?: number }
    const size: number = obj.size
    const offset = r.suffix !== undefined ? Math.max(0, size - r.suffix) : (r.offset ?? 0)
    const length = r.suffix !== undefined ? Math.min(r.suffix, size) : (r.length ?? size - offset)
    h.set('content-range', `bytes ${offset}-${offset + length - 1}/${size}`)
    h.set('content-length', String(length))
    status = 206
  } else {
    h.set('content-length', String(obj.size))
  }

  return new Response(obj.body, { status, headers: h })
}
