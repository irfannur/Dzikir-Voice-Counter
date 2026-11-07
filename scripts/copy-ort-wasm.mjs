// Copies the ONNX Runtime Web wasm/mjs files (a dependency of @huggingface/transformers)
// into public/ort so inference can load them from this origin instead of a CDN.
// Runs on postinstall. Failure is non-fatal: the worker falls back to the library default.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const candidates = [
  join('node_modules', 'onnxruntime-web', 'dist'),
  join('node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-web', 'dist'),
]

try {
  const dist = candidates.find((p) => existsSync(p))
  if (!dist) throw new Error('onnxruntime-web not found in node_modules')
  const out = join('public', 'ort')
  mkdirSync(out, { recursive: true })
  const files = readdirSync(dist).filter((f) => /^ort-.*\.(wasm|mjs)$/.test(f))
  if (files.length === 0) throw new Error(`no ort-*.wasm/mjs files in ${dist}`)
  for (const f of files) cpSync(join(dist, f), join(out, f))
  writeFileSync(join(out, 'manifest.json'), JSON.stringify({ files }, null, 2))
  console.log(`[copy-ort-wasm] copied ${files.length} files to ${out}`)
} catch (e) {
  console.warn(`[copy-ort-wasm] skipped: ${e.message}`)
}
