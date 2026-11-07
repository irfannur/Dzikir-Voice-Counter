// Uploads the model files downloaded by scripts/download-model.mjs to a Cloudflare R2
// bucket, rewriting each local path into the layout Transformers.js expects on the
// server: "<model_id>/resolve/main/<file>" (the local download omits "resolve/main").
//
// Usage:
//   npx wrangler login                       (once, opens a browser to authorize)
//   node scripts/upload-to-r2.mjs <bucket-name>
//
// Requires Wrangler (comes with this project's devDependencies; `npx` will fetch it
// if not yet installed) and a Cloudflare account logged in via `wrangler login`.
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { spawnSync } from 'node:child_process'

const MODEL_ID = 'onnx-community/whisper-tiny'
const SOURCE_DIR = join('public', 'models', MODEL_ID)
const KEY_PREFIX = `${MODEL_ID}/resolve/main`

const bucket = process.argv[2]
if (!bucket) {
  console.error('Usage: node scripts/upload-to-r2.mjs <bucket-name>')
  console.error(`Example: node scripts/upload-to-r2.mjs voice-dzikir-models`)
  process.exit(1)
}

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

let files
try {
  files = walk(SOURCE_DIR)
} catch {
  console.error(`Folder tidak ditemukan: ${SOURCE_DIR}`)
  console.error('Jalankan dulu: npm run download:model')
  process.exit(1)
}
if (files.length === 0) {
  console.error(`Tidak ada file di ${SOURCE_DIR}. Jalankan dulu: npm run download:model`)
  process.exit(1)
}

console.log(`Mengunggah ${files.length} file ke bucket R2 "${bucket}"...\n`)

// shell: true is required on Windows: recent Node versions refuse to spawn .cmd/.bat
// files (like npx.cmd) directly for security reasons and fail silently (no stderr,
// just a spawn error) unless run through a shell. Safe here: every argument below is
// built by this script, not taken from user/network input.
let ok = 0
for (const file of files) {
  const rel = relative(SOURCE_DIR, file).split(sep).join('/') // normalize Windows backslashes
  const key = `${KEY_PREFIX}/${rel}`
  process.stdout.write(`[upload] ${key} ... `)
  const res = spawnSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', file], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })
  if (res.error) {
    console.log('GAGAL')
    console.error(`  -> tidak bisa menjalankan perintah: ${res.error.message}`)
    continue
  }
  if (res.status === 0) {
    console.log('OK')
    ok++
  } else {
    console.log(`GAGAL (exit code ${res.status})`)
    const out = (res.stderr?.toString() || res.stdout?.toString() || '').trim()
    if (out) console.error(out.split('\n').map((l) => `  ${l}`).join('\n'))
    else console.error('  (Wrangler tidak menampilkan pesan error apa pun.)')
  }
}

console.log(`\nSelesai: ${ok}/${files.length} file berhasil diunggah.`)
if (ok < files.length) {
  console.error(
    'Beberapa file gagal. Baca pesan di atas masing-masing file untuk alasannya.\n' +
      'Penyebab umum: nama bucket salah/belum dibuat, atau sesi login kedaluwarsa (jalankan "npx wrangler login" lagi).',
  )
  process.exit(1)
}
console.log(`\nCek hasilnya di: <URL-publik-bucket>/${KEY_PREFIX}/config.json (harus tampil JSON).`)
