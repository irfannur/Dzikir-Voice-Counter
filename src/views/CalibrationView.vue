<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Mic } from 'lucide-vue-next'
import WaveformCanvas from '@/components/audio/WaveformCanvas.vue'
import { useMicrophone } from '@/composables/useMicrophone'
import { useAudioRecorder } from '@/composables/useAudioRecorder'
import { useSettingsStore } from '@/stores/settingsStore'
import { percentile } from '@/services/audio/AudioProcessor'
import { db } from '@/database/indexedDb'
import type { CalibrationResult, MicQuality } from '@/types'

const settings = useSettingsStore()
const mic = useMicrophone()
const recorder = useAudioRecorder()

type Phase = 'idle' | 'noise' | 'speech' | 'done'
const phase = ref<Phase>('idle')
const result = ref<CalibrationResult | null>(null)
const saveError = ref<string | null>(null)
const deviceId = ref(settings.deviceId)

const NOISE_MS = 2500
const SPEECH_MS = 10000

onMounted(async () => {
  try { result.value = (await db.get<CalibrationResult>('calibration', 'latest')) ?? null } catch { /* ignore */ }
  void mic.refreshDevices()
})

function sample(ms: number): Promise<number[]> {
  return new Promise((resolve) => {
    const values: number[] = []
    const iv = window.setInterval(() => values.push(mic.levelDb.value), 50)
    window.setTimeout(() => { window.clearInterval(iv); resolve(values) }, ms)
  })
}

function rate(snr: number, peak: number): MicQuality {
  if (peak < -40) return 'poor' // too quiet
  if (snr >= 30 && peak > -25) return 'excellent'
  if (snr >= 18) return 'good'
  return 'poor'
}

async function run() {
  result.value = null
  saveError.value = null
  const ok = await mic.start(deviceId.value || undefined)
  if (!ok) return
  settings.deviceId = deviceId.value
  phase.value = 'noise'
  const noise = await sample(NOISE_MS)
  phase.value = 'speech'
  const stream = mic.getStream()
  if (stream) recorder.start(stream)
  const speech = await sample(SPEECH_MS)
  recorder.stop()
  mic.stop()

  const noiseFloorDb = percentile(noise, 50)
  const speechPeakDb = percentile(speech, 95)
  const snrDb = speechPeakDb - noiseFloorDb
  const r: CalibrationResult = {
    id: 'latest', deviceId: deviceId.value, noiseFloorDb, speechPeakDb, snrDb,
    quality: rate(snrDb, speechPeakDb), createdAt: Date.now(),
  }
  result.value = r
  phase.value = 'done'
  try { await db.put('calibration', r) } catch (e) { saveError.value = (e as Error).message }
}

const qualityStyle: Record<MicQuality, string> = {
  excellent: 'text-emerald-600', good: 'text-gold-500', poor: 'text-red-600',
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">Voice Calibration</h1>
    <p class="text-sm muted">
      Checks your microphone volume, background noise and signal clarity. It does not train or fine-tune any speech model.
      A headset microphone is recommended but not required.
    </p>

    <div class="card space-y-3">
      <label class="block text-sm">Microphone
        <select v-model="deviceId" class="input mt-1">
          <option value="">Default</option>
          <option v-for="d in mic.devices.value" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Microphone' }}</option>
        </select>
      </label>
      <WaveformCanvas :analyser="mic.analyser.value" :active="mic.active.value" />
      <p v-if="phase === 'noise'" class="text-sm">Stay quiet for a moment…</p>
      <p v-else-if="phase === 'speech'" class="text-sm">Recite your dhikr 3 to 5 times at your normal pace…</p>
      <button class="btn-primary w-full" :disabled="phase === 'noise' || phase === 'speech'" @click="run">
        <Mic :size="18" /> {{ phase === 'done' ? 'Run again' : 'Start test' }}
      </button>
      <div v-if="mic.error.value" class="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
        {{ mic.error.value.message }} {{ mic.error.value.help }}
      </div>
    </div>

    <div v-if="recorder.sampleUrl.value" class="card space-y-2">
      <p class="text-sm font-medium">Sample playback</p>
      <audio :src="recorder.sampleUrl.value" controls class="w-full" />
      <p class="text-xs muted">Kept in memory only and discarded when you leave this page. Nothing is saved or uploaded.</p>
    </div>

    <div v-if="result" class="card space-y-1">
      <p class="text-sm muted">Result</p>
      <p class="text-3xl font-semibold capitalize" :class="qualityStyle[result.quality]">{{ result.quality }}</p>
      <p class="text-sm">Noise floor {{ result.noiseFloorDb.toFixed(0) }} dB · Speech peak {{ result.speechPeakDb.toFixed(0) }} dB · SNR {{ result.snrDb.toFixed(0) }} dB</p>
      <p v-if="result.quality === 'poor'" class="text-sm muted">Try a quieter room, move closer to the microphone, or use a headset.</p>
      <p v-if="saveError" class="text-sm text-red-700">Could not save: {{ saveError }}</p>
    </div>
  </section>
</template>
