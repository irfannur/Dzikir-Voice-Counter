<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMicrophone } from '@/composables/useMicrophone'
import { activeBackend, loadState } from '@/composables/useDhikrRecognition'
import { useSettingsStore } from '@/stores/settingsStore'
import { db } from '@/database/indexedDb'
import { detectWebGpu } from '@/services/recognition/SpeechRecognitionProvider'
import { MODEL_OPTIONS, getModelOption } from '@/services/recognition/models'
import { useI18n, type MessageKey } from '@/i18n'
import { formatBytes, getStorageUsage, removeAllModels, type StorageUsage } from '@/services/recognition/ModelManager'

const settings = useSettingsStore()
const { t } = useI18n()
const mic = useMicrophone()
const usage = ref<StorageUsage | null>(null)
const webGpu = detectWebGpu()

async function refreshUsage() {
  try { usage.value = await getStorageUsage() } catch { usage.value = null }
}
onMounted(() => { void mic.refreshDevices(); void refreshUsage() })

async function removeModels() {
  if (!window.confirm(t('ai.confirmRemove'))) return
  await removeAllModels()
  await refreshUsage()
}

async function clearHistory() {
  if (window.confirm(t('privacy.confirmDelete'))) await db.clear('sessions')
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ t('set.title') }}</h1>

    <div class="card space-y-3">
      <label class="block text-sm">{{ t('lang.label') }}
        <select v-model="settings.language" class="input mt-1">
          <option value="id">Bahasa Indonesia</option><option value="en">English</option>
        </select>
      </label>
      <label class="block text-sm">{{ t('set.theme') }}
        <select v-model="settings.theme" class="input mt-1">
          <option value="system">{{ t('set.theme.system') }}</option><option value="light">{{ t('set.theme.light') }}</option><option value="dark">{{ t('set.theme.dark') }}</option>
        </select>
      </label>
      <label class="block text-sm">{{ t('set.defaultTarget') }}
        <input v-model.number="settings.defaultTarget" type="number" min="1" class="input mt-1" />
      </label>
      <label class="block text-sm">{{ t('set.microphone') }}
        <select v-model="settings.deviceId" class="input mt-1">
          <option value="">{{ t('cal.default') }}</option>
          <option v-for="d in mic.devices.value" :key="d.deviceId" :value="d.deviceId">{{ d.label || t('set.micNoLabel') }}</option>
        </select>
      </label>
    </div>

    <div class="card space-y-2 text-sm">
      <label class="flex items-center justify-between">{{ t('set.vibration') }} <input v-model="settings.vibration" type="checkbox" /></label>
      <label class="flex items-center justify-between">{{ t('set.sound') }} <input v-model="settings.soundFeedback" type="checkbox" /></label>
      <label class="flex items-center justify-between">{{ t('set.stopMic') }} <input v-model="settings.stopMicAtTarget" type="checkbox" /></label>
      <label class="block">{{ t('set.sensitivity') }}
        <select v-model="settings.sensitivity" class="input mt-1">
          <option value="strict">{{ t('set.sensitivity.strict') }}</option>
          <option value="normal">{{ t('set.sensitivity.normal') }}</option>
          <option value="lenient">{{ t('set.sensitivity.lenient') }}</option>
        </select>
      </label>
      <p class="muted">{{ t('set.sensitivityHint') }}</p>
    </div>

    <div class="card space-y-2 text-sm">
      <h2 class="font-semibold">{{ t('ai.title') }}</h2>
      <label class="block">{{ t('ai.model') }}
        <select v-model="settings.modelId" class="input mt-1">
          <option v-for="m in MODEL_OPTIONS" :key="m.id" :value="m.id">{{ m.label }} · ≈{{ m.approxMb }} MB · {{ t(`model.note.${m.id}` as MessageKey) }}</option>
        </select>
      </label>
      <p class="muted">
        {{ t('ai.selected', { label: getModelOption(settings.modelId).label }) }}
      </p>
      <p class="muted">{{ webGpu ? t('ai.accel.webgpu') : t('ai.accel.wasm') }}</p>
      <p class="muted">
        {{ t('ai.inMemory', { state: loadState === 'ready' ? t('ai.loaded', { backend: activeBackend === 'webgpu' ? 'WebGPU' : 'WASM' }) : t(`ai.state.${loadState}` as MessageKey) }) }}
      </p>
      <p>{{ t('ai.storage', { v: usage ? formatBytes(usage.modelBytes) : '...' }) }}</p>
      <p class="muted">{{ t('ai.browserStorage', { used: usage ? formatBytes(usage.usageBytes) : '...', quota: usage ? formatBytes(usage.quotaBytes) : '...' }) }}</p>
      <button class="btn-ghost" :disabled="!usage || usage.modelBytes === 0" @click="removeModels">{{ t('ai.remove') }}</button>
    </div>

    <div class="card space-y-2 text-sm">
      <h2 class="font-semibold">{{ t('privacy.title') }}</h2>
      <p class="muted">
        {{ t('privacy.text') }}
      </p>
      <button class="btn-ghost" @click="clearHistory">{{ t('privacy.deleteHistory') }}</button>
    </div>
  </section>
</template>
