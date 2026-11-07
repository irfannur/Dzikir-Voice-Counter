import { existsSync, mkdirSync, createWriteStream, statSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const MODEL_ID = 'onnx-community/whisper-tiny'
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main/`
const TARGET_DIR = join('public', 'models', MODEL_ID)

const FILES = [
  // Configuration & Tokenizer files
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'special_tokens_map.json',
  'normalizer.json',
  'added_tokens.json',
  'merges.txt',

  // WASM inference models (q8)
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',

  // WebGPU inference models (fp32 encoder + q4 decoder)
  'onnx/encoder_model.onnx',
  'onnx/decoder_model_merged_q4.onnx',
]

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function downloadFile(relPath) {
  const destPath = join(TARGET_DIR, relPath)
  mkdirSync(dirname(destPath), { recursive: true })

  const url = `${BASE_URL}${relPath}`

  // Check if file already exists with non-zero size
  if (existsSync(destPath)) {
    const size = statSync(destPath).size
    if (size > 0) {
      console.log(`[skip] ${relPath} (${formatBytes(size)}) already exists.`)
      return
    }
  }

  process.stdout.write(`[downloading] ${relPath} ... `)

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Node.js Whisper Downloader)' },
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`)
  }

  const tempPath = `${destPath}.tmp`
  const fileStream = createWriteStream(tempPath)
  // res.body is a web ReadableStream
  await pipeline(Readable.fromWeb(res.body), fileStream)

  // Rename tmp to final
  const { renameSync } = await import('node:fs')
  renameSync(tempPath, destPath)

  const finalSize = statSync(destPath).size
  console.log(`done (${formatBytes(finalSize)})`)
}

async function main() {
  console.log(`=== Downloading ${MODEL_ID} to ${TARGET_DIR} ===\n`)
  mkdirSync(TARGET_DIR, { recursive: true })

  let count = 0
  for (const file of FILES) {
    try {
      await downloadFile(file)
      count++
    } catch (err) {
      console.error(`\n[ERROR] Failed to download ${file}: ${err.message}`)
      console.error(`If network fails, you can download manually from:`)
      console.error(`${BASE_URL}${file}`)
      process.exit(1)
    }
  }

  console.log(`\n=== Successfully downloaded ${count} files! ===`)
  console.log(`Local model is ready in: ${TARGET_DIR}`)
}

main().catch((err) => {
  console.error('[FATAL]', err)
  process.exit(1)
})

