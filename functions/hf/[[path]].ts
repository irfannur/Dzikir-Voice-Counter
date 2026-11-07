interface Env {}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const targetPath = url.pathname.replace(/^\/hf/, '')
  const targetUrl = `https://huggingface.co${targetPath}${url.search}`

  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const reqHeaders = new Headers()
  const range = context.request.headers.get('range')
  if (range) reqHeaders.set('range', range)
  reqHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

  try {
    const res = await fetch(targetUrl, {
      method: context.request.method,
      headers: reqHeaders,
      redirect: 'follow',
    })

    const resHeaders = new Headers(res.headers)
    resHeaders.set('Access-Control-Allow-Origin', '*')
    resHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    resHeaders.set('Access-Control-Expose-Headers', '*')
    resHeaders.set('Cache-Control', 'public, max-age=31536000, immutable')

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Proxy fetch failed: ${err.message}` }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}

