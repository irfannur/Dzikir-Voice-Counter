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
