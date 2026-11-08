/**
 * Worker entry (Cloudflare Workers with static assets).
 *  /models/*  -> model files from the R2 bucket (binding MODELS), same-origin, Range-capable.
 *  /hf/*      -> streaming proxy to huggingface.co (fallback when HF is blocked/CORS-less).
 *  otherwise  -> static assets (the built app, SPA fallback).
 * R2 objects and proxied responses are not subject to the 25 MiB static-asset file limit.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  MODELS: any // R2Bucket
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
}

const TYPES: Record<string, string> = {
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  onnx: 'application/octet-stream',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function serveModel(request: Request, env: Env, pathname: string): Promise<Response> {
  if (!env.MODELS) return json({ error: 'R2 binding "MODELS" is not configured (see wrangler.jsonc).' }, 500)

  let key: string
  try {
    key = decodeURIComponent(pathname.replace(/^\/models\//, ''))
  } catch {
    return json({ error: 'Bad path' }, 400)
  }
  if (!key || key.includes('..')) return json({ error: 'Not found' }, 404)

  const ext = key.split('.').pop() ?? ''

  if (request.method === 'HEAD') {
    const head = await env.MODELS.head(key)
    if (!head) return json({ error: `Not found: ${key}` }, 404)
    const h = new Headers(CORS)
    head.writeHttpMetadata(h)
    h.set('etag', head.httpEtag)
    h.set('accept-ranges', 'bytes')
    h.set('content-length', String(head.size))
    if (!h.get('content-type')) h.set('content-type', TYPES[ext] ?? 'application/octet-stream')
    return new Response(null, { status: 200, headers: h })
  }

  const hasRange = request.headers.has('range')
  const obj = await env.MODELS.get(key, hasRange ? { range: request.headers } : undefined)
  if (!obj) return json({ error: `Not found: ${key}` }, 404)

  const h = new Headers(CORS)
  obj.writeHttpMetadata(h)
  h.set('etag', obj.httpEtag)
  h.set('accept-ranges', 'bytes')
  h.set('cache-control', 'public, max-age=31536000, immutable')
  if (!h.get('content-type')) h.set('content-type', TYPES[ext] ?? 'application/octet-stream')

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

async function proxyHf(request: Request, url: URL): Promise<Response> {
  const target = `https://huggingface.co${url.pathname.replace(/^\/hf/, '')}${url.search}`
  const headers = new Headers()
  const range = request.headers.get('range')
  if (range) headers.set('range', range)
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
  try {
    const res = await fetch(target, { method: request.method, headers, redirect: 'follow' })
    const out = new Headers(res.headers)
    for (const [k, v] of Object.entries(CORS)) out.set(k, v)
    out.set('Cache-Control', 'public, max-age=31536000, immutable')
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out })
  } catch (e) {
    return json({ error: `Proxy fetch failed: ${(e as Error).message}` }, 502)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const isModels = url.pathname.startsWith('/models/')
    const isHf = url.pathname.startsWith('/hf/')

    if ((isModels || isHf) && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } })
    }
    if ((isModels || isHf) && request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Method not allowed' }, 405)
    }
    if (isModels) return serveModel(request, env, url.pathname)
    if (isHf) return proxyHf(request, url)
    return env.ASSETS.fetch(request)
  },
}
