<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMicrophone } from '@/composables/useMicrophone'
import { activeBackend, loadState } from '@/composables/useDhikrRecognition'
import { useSettingsStore } from '@/stores/settingsStore'
import { db } from '@/database/indexedDb'
import { detectWebGpu } from '@/services/recognition/SpeechRecognitionProvider'
import { MODEL_OPTIONS, getModelOption } from '@/services/recognition/models'
import { formatBytes, getStorageUsage, removeAllModels, type StorageUsage } from '@/services/recognition/ModelManager'

const settings = useSettingsStore()
const mic = useMicrophone()
const usage = ref<StorageUsage | null>(null)
const webGpu = detectWebGpu()

async function refreshUsage() {
  try { usage.value = await getStorageUsage() } catch { usage.value = null }
}
onMounted(() => { void mic.refreshDevices(); void refreshUsage() })

async function removeModels() {
  if (!window.confirm('Remove downloaded speech models? They can be downloaded again later.')) return
  await removeAllModels()
  await refreshUsage()
}

async function clearHistory() {
  if (window.confirm('Delete all saved sessions? This cannot be undone.')) await db.clear('sessions')
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">Settings</h1>

    <div class="card space-y-3">
      <label class="block text-sm">Theme
        <select v-model="settings.theme" class="input mt-1">
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
        </select>
      </label>
      <label class="block text-sm">Default target
        <input v-model.number="settings.defaultTarget" type="number" min="1" class="input mt-1" />
      </label>
      <label class="block text-sm">Microphone
        <select v-model="settings.deviceId" class="input mt-1">
          <option value="">Default</option>
          <option v-for="d in mic.devices.value" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Microphone (grant access to see names)' }}</option>
        </select>
      </label>
    </div>

    <div class="card space-y-2 text-sm">
      <label class="flex items-center justify-between">Vibrate on count <input v-model="settings.vibration" type="checkbox" /></label>
      <label class="flex items-center justify-between">Sound feedback <input v-model="settings.soundFeedback" type="checkbox" /></label>
      <label class="flex items-center justify-between">Turn microphone off at target <input v-model="settings.stopMicAtTarget" type="checkbox" /></label>
    </div>

    <div class="card space-y-2 text-sm">
      <h2 class="font-semibold">AI model</h2>
      <label class="block">Speech model
        <select v-model="settings.modelId" class="input mt-1">
          <option v-for="m in MODEL_OPTIONS" :key="m.id" :value="m.id">{{ m.label }} · ≈{{ m.approxMb }} MB · {{ m.note }}</option>
        </select>
      </label>
      <p class="muted">
        Selected: {{ getModelOption(settings.modelId).label }}. The model is downloaded once, from the counter screen, then reused from this device's storage.
        Larger models may be more accurate but are slower and use more memory.
      </p>
      <p class="muted">Acceleration: {{ webGpu ? 'WebGPU detected (WASM fallback if it fails)' : 'WebGPU not detected, using WASM' }}</p>
      <p class="muted">
        In memory now: {{ loadState === 'ready' ? `loaded (${activeBackend === 'webgpu' ? 'WebGPU' : 'WASM'})` : loadState }}.
        Offline recognition is not verified; test it yourself with the network off after the model has downloaded.
      </p>
      <p>Downloaded model storage: {{ usage ? formatBytes(usage.modelBytes) : '...' }}</p>
      <p class="muted">Browser storage used: {{ usage ? formatBytes(usage.usageBytes) : '...' }} of {{ usage ? formatBytes(usage.quotaBytes) : '...' }}</p>
      <button class="btn-ghost" :disabled="!usage || usage.modelBytes === 0" @click="removeModels">Remove downloaded models</button>
    </div>

    <div class="card space-y-2 text-sm">
      <h2 class="font-semibold">Privacy</h2>
      <p class="muted">
        The microphone is used only while you listen and is released when you pause or stop. Raw audio is never stored or uploaded;
        recognition runs in your browser. The only download is the model file itself. Calibration playback stays in memory.
        Sessions and settings are stored on this device only.
      </p>
      <button class="btn-ghost" @click="clearHistory">Delete session history</button>
    </div>
  </section>
</template>
