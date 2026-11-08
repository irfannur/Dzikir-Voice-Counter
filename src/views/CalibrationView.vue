<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Mic } from 'lucide-vue-next'
import WaveformCanvas from '@/components/audio/WaveformCanvas.vue'
import { useMicrophone } from '@/composables/useMicrophone'
import { useAudioRecorder } from '@/composables/useAudioRecorder'
import { useSettingsStore } from '@/stores/settingsStore'
import { percentile } from '@/services/audio/AudioProcessor'
import { db } from '@/database/indexedDb'
import { useI18n, type MessageKey } from '@/i18n'
import type { CalibrationResult, MicQuality } from '@/types'

const settings = useSettingsStore()
const { t } = useI18n()
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
    <h1 class="text-2xl font-semibold">{{ t('cal.title') }}</h1>
    <p class="text-sm muted">
      {{ t('cal.intro') }}
    </p>

    <div class="card space-y-3">
      <label class="block text-sm">{{ t('cal.microphone') }}
        <select v-model="deviceId" class="input mt-1">
          <option value="">{{ t('cal.default') }}</option>
          <option v-for="d in mic.devices.value" :key="d.deviceId" :value="d.deviceId">{{ d.label || t('cal.micFallback') }}</option>
        </select>
      </label>
      <WaveformCanvas :analyser="mic.analyser.value" :active="mic.active.value" />
      <p v-if="phase === 'noise'" class="text-sm">{{ t('cal.stayQuiet') }}</p>
      <p v-else-if="phase === 'speech'" class="text-sm">{{ t('cal.recite') }}</p>
      <button class="btn-primary w-full" :disabled="phase === 'noise' || phase === 'speech'" @click="run">
        <Mic :size="18" /> {{ phase === 'done' ? t('cal.again') : t('cal.start') }}
      </button>
      <div v-if="mic.error.value" class="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
        {{ t(`mic.err.${mic.error.value.kind}.msg` as MessageKey) }} {{ t(`mic.err.${mic.error.value.kind}.help` as MessageKey) }}
      </div>
    </div>

    <div v-if="recorder.sampleUrl.value" class="card space-y-2">
      <p class="text-sm font-medium">{{ t('cal.playback') }}</p>
      <audio :src="recorder.sampleUrl.value" controls class="w-full" />
      <p class="text-xs muted">{{ t('cal.playbackNote') }}</p>
    </div>

    <div v-if="result" class="card space-y-1">
      <p class="text-sm muted">{{ t('cal.result') }}</p>
      <p class="text-3xl font-semibold " :class="qualityStyle[result.quality]">{{ t(('quality.' + result.quality) as MessageKey) }}</p>
      <p class="text-sm">{{ t('cal.stats', { noise: result.noiseFloorDb.toFixed(0), peak: result.speechPeakDb.toFixed(0), snr: result.snrDb.toFixed(0) }) }}</p>
      <p v-if="result.quality === 'poor'" class="text-sm muted">{{ t('cal.tipPoor') }}</p>
      <p v-if="saveError" class="text-sm text-red-700">{{ t('cal.saveFail', { msg: saveError }) }}</p>
    </div>
  </section>
</template>
