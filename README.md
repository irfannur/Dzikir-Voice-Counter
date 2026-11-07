# Voice Dzikir

Voice-based dhikr counter (Vue 3 + Vite + TypeScript + Tailwind v3 + Pinia, PWA). Everything runs in the browser; no backend, no API keys, no paid services.

## Status

**Phase 1 (frontend MVP): implemented.**
**Phase 2 (speech recognition): code written, NOT yet run against a real model.** No network was available where this was authored, so nothing has been built, opened in a browser, or tested with real speech. Treat automatic counting as unverified until you complete the checklist below.

| Area | State |
|---|---|
| Screens, mic capture, waveform, calibration, manual counting, IndexedDB | Written (Phase 1) |
| `DhikrCounterEngine`, `TextNormalizer`, `UtteranceValidator` | Written, 12 unit tests pass |
| `VoiceActivityDetector` (energy-based, voiced-only timestamps), `resampleTo` | Written, 6 unit tests pass (synthetic signals only) |
| `RecognitionPipeline` (AudioWorklet -> VAD -> 16 kHz resample -> bounded queue -> provider) | Written, type-checked, **not run** |
| `whisper.worker.ts` + `TransformersJsProvider` (Whisper via Transformers.js, WebGPU with WASM fallback, progress, serialized inference) | Written, type-checked against a stub, **not run** |
| `useDhikrRecognition`, Counter and Settings UI wiring | Written, **not type-checked or run** (Vue files need `vue-tsc`) |
| Model download + caching | Delegated to Transformers.js (Cache Storage `transformers-cache`); `ModelManager` reports and clears it |
| `WhisperWasmProvider` (whisper.cpp WASM) | **Stub.** Needs a self-built Emscripten binary; the working path is Transformers.js |
| Offline recognition, accuracy, latency, memory | **Not measured** |

## Run

```bash
npm install        # also runs scripts/copy-ort-wasm.mjs (copies ONNX runtime files to public/ort)
npm run dev        # http://localhost:5173 (mic requires localhost or HTTPS)
npm test           # engine, VAD and resample unit tests (vitest)
npm run build
```

## Troubleshooting: "Could not load: Unexpected token '<', \"<!doctype \"... is not valid JSON"

This means the model loader fetched a URL expecting JSON (e.g. `config.json`) and got an
HTML page back instead. It is **not** related to Cloudflare Pages' 25 MiB per-file limit —
that limit only applies to files *you deploy* as static assets; it does not apply to the
model files, which the browser fetches at runtime from Hugging Face (or a proxy/R2), never
from your own deployed `dist`. The symptom comes from one of two places:

1. **The old `public/models/` local-model check.** Earlier versions of `whisper.worker.ts`
   probed `/models/<id>/config.json` on your own site. `public/models/` is gitignored (its
   files are far too large to deploy as Pages assets anyway), so that path never exists in
   production, and Cloudflare Pages' automatic SPA fallback answers it with `index.html`
   (status 200, `text/html`) instead of a 404 — which is exactly the HTML this error is
   choking on. **Fixed:** the worker no longer checks a local path; it always resolves a
   remote host first (see below) and validates the response before using it.
2. **The `/hf/` proxy (`functions/hf/[[path]].ts`) not actually running.** This Cloudflare
   Pages Function exists to work around ISPs that block `huggingface.co` directly. If Pages
   Functions aren't active for your deployment, a request to `/hf/...` is just another
   unmatched route and gets the same `index.html` fallback. Test it directly:
   ```
   https://<your-site>.pages.dev/hf/onnx-community/whisper-tiny/resolve/main/config.json
   ```
   If that shows JSON, the proxy works. If it shows your app's HTML, Pages Functions are not
   being picked up — check that `functions/` sits at the repository root (same level as
   `src/`) and matches the project's configured root directory in the Cloudflare dashboard,
   and check the Functions tab/logs for that deployment.

With the fix in this repo, `whisper.worker.ts` now tries Hugging Face directly first, then
the `/hf/` proxy, and only uses whichever one answers with real JSON — each candidate is
validated before use, so a misconfigured proxy now produces a clear, actionable error
instead of the cryptic JSON-parse message.

### Large model files on a slow/blocked connection (recommended: Cloudflare R2)

The actual ~100 MB file is a model weight file (e.g. `encoder_model.onnx`), fetched directly
by the browser, not deployed by you — so Cloudflare Pages' 25 MiB limit was never really the
obstacle. If you still want to avoid depending on `huggingface.co` reachability/speed for
your users (e.g. an ISP that blocks or throttles it), host the model yourself on **Cloudflare
R2**, which has no per-file size limit (unlike Pages static assets) and no egress fees:

1. Download the model files locally, in the exact layout Transformers.js expects:
   ```bash
   npm run download:model   # writes to public/models/onnx-community/whisper-tiny/
   ```
2. Create an R2 bucket (Cloudflare dashboard → R2) and enable public access, or attach a
   custom domain to it.
3. Upload the downloaded folder, keeping the `onnx-community/whisper-tiny/resolve/main/...`
   path structure, e.g. with Wrangler:
   ```bash
   npx wrangler r2 object put <bucket>/onnx-community/whisper-tiny --file public/models/onnx-community/whisper-tiny -r
   ```
   (or drag-and-drop the folder in the R2 dashboard, keeping the same relative paths).
4. In your R2 bucket's CORS settings, allow `GET` from your Pages domain (or `*`).
5. In the Cloudflare Pages project's build environment variables, set:
   ```
   VITE_MODEL_BASE_URL = https://<your-bucket-public-url>/
   ```
6. Redeploy. The worker will use this host directly (no Hugging Face, no `/hf/` proxy needed)
   and validates it the same way, so a misconfiguration still surfaces a clear error rather
   than this one.

Fonts: place `Amiri-Regular.woff2` and `Inter-Variable.woff2` (both OFL) in `public/fonts/`; otherwise installed fonts are used.

## Pipeline

mic -> high-pass -> AudioWorklet (`public/worklets/capture-processor.js`) -> `VoiceActivityDetector` -> resample to 16 kHz -> queue (max 3, oldest dropped) -> `whisper.worker.ts` -> `counterStore.submitSegment` -> `DhikrCounterEngine`.

The engine counts a segment only if it is not paused, has a sane duration, is not a duplicate, is outside the cooldown, passes the provider confidence check (if provided), and its normalized transcript closely matches a reference form with limited extra speech. One accepted segment = one count. Timestamps passed to the engine are the voiced part only, so cooldown/duration rules are not skewed by VAD padding.

Known limitation: one utterance containing several chained repetitions is rejected as `extra-speech`, not counted multiple times.

## Things to verify first (assumptions I could not check)

1. `@huggingface/transformers` version and API: the worker uses `pipeline('automatic-speech-recognition', model, { device, dtype, progress_callback })` as in the v3 docs. The dependency is `^3.0.0`; check the current release.
2. Model repos in `src/services/recognition/models.ts` (`onnx-community/whisper-tiny|base|small`) exist, have the quantized variants requested (`q8` for WASM, `fp32` encoder + `q4` decoder for WebGPU), and are licensed for your use. Download sizes there are rough estimates.
3. `scripts/copy-ort-wasm.mjs` finds `onnxruntime-web/dist/ort-*.wasm|mjs` after install. If not, the runtime falls back to the library default (a CDN), which breaks offline use.
4. `language: 'arabic'` is accepted by the Whisper pipeline you install.
5. Safari/Firefox behaviour of AudioWorklet and WebGPU.

## Acceptance checklist (do before trusting it)

- Load the model, recite a dhikr 10 times at normal speed: one count per repetition, none doubled.
- Stay silent, play background chatter/TV: no counts (Whisper can hallucinate text on noise; the validator should reject it).
- Pause and resume; unplug the microphone mid-session; confirm the mic indicator turns off on stop.
- After the model has downloaded, switch the network off, reload, and confirm recognition still works. Only then claim offline support.
- Record labelled samples (different speeds, pauses, accents, noise) and measure accuracy, false positives, misses, duplicates and latency; tune `DEFAULT_ENGINE_CONFIG` and `DEFAULT_VAD_CONFIG` from the numbers.

## Next steps

- Evaluation script that runs the provider over labelled WAV files and reports the metrics above.
- Tune VAD (or swap in a neural VAD) and engine thresholds with real Indonesian-accented Arabic recordings.
- Optional: cross-origin isolation headers (`_headers` on Cloudflare Pages) for multi-threaded WASM, if supported by the model host's CORS.
- Optional: whisper.cpp WASM provider behind the same interface.
- Deploy to Cloudflare Pages (build `npm run build`, output `dist`) and test install/offline.
