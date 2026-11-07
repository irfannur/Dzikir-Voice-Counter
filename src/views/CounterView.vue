<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Download, Mic, MicOff, Minus, Pause, Play, Plus, RotateCcw, Square } from 'lucide-vue-next'
import WaveformCanvas from '@/components/audio/WaveformCanvas.vue'
import { useMicrophone } from '@/composables/useMicrophone'
import { useDhikrRecognition } from '@/composables/useDhikrRecognition'
import { useCounterStore } from '@/stores/counterStore'
import { useDhikrStore } from '@/stores/dhikrStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { getModelOption } from '@/services/recognition/models'
import { TARGET_PRESETS } from '@/data/dhikrLibrary'
import { formatDuration } from '@/utils/format'

const props = defineProps<{ id: string }>()
const router = useRouter()
const counter = useCounterStore()
const dhikrStore = useDhikrStore()
const settings = useSettingsStore()
const mic = useMicrophone()
const rec = useDhikrRecognition(mic)

const customTarget = ref<number | null>(null)
const bumping = ref(false)
const wasListening = ref(false)

const dhikr = computed(() => dhikrStore.byId(props.id))
const paused = computed(() => counter.state === 'paused')
const model = computed(() => getModelOption(settings.modelId))

const statusText = computed(() => {
  if (mic.error.value) return mic.error.value.message
  if (paused.value) return 'Paused'
  if (rec.auto.value) {
    switch (counter.status) {
      case 'processing': return 'Processing locally…'
      case 'recognized': return 'Recognized'
      case 'unrecognized': return 'Not recognized, not counted'
      default: return 'Listening…'
    }
  }
  if (mic.active.value) return 'Microphone on. Load the speech model for automatic counting, or tap + to count.'
  return 'Microphone off'
})

onMounted(async () => {
  await dhikrStore.init()
  const d = dhikr.value
  if (!d) return router.replace('/library')
  if (counter.state === 'idle' || counter.dhikr?.id !== d.id) {
    counter.begin(d, d.defaultTarget ?? settings.defaultTarget)
  }
})

watch(() => counter.count, async () => {
  bumping.value = false
  await nextTick()
  bumping.value = true
  if (settings.vibration && 'vibrate' in navigator) navigator.vibrate(15)
})

watch(() => counter.targetReached, (reached) => {
  if (reached && settings.stopMicAtTarget) { rec.stopAuto(); mic.stop() }
})

// Microphone lost (unplugged, revoked): tear down recognition too.
watch(() => mic.active.value, (active) => { if (!active) rec.stopAuto() })

async function startListening() {
  const ok = await mic.start(settings.deviceId || undefined)
  if (ok && rec.loadState.value === 'ready') await rec.startAuto()
}

async function toggleMic() {
  if (mic.active.value) {
    rec.stopAuto()
    mic.stop()
  } else {
    await startListening()
  }
}

async function togglePause() {
  if (paused.value) {
    counter.resume()
    if (wasListening.value) await startListening()
  } else {
    wasListening.value = mic.active.value
    counter.pause()
    rec.stopAuto()
    mic.stop()
  }
}

async function stopSession() {
  rec.stopAuto()
  mic.stop()
  await counter.finish()
  router.push('/history')
}

async function loadModelAndStart() {
  await rec.loadModel()
  if (rec.loadState.value === 'ready' && mic.active.value && !rec.auto.value) await rec.startAuto()
}

function applyCustomTarget() {
  if (customTarget.value && customTarget.value > 0) counter.setTarget(Math.floor(customTarget.value))
}

function confirmReset() {
  if (window.confirm('Reset the counter to 0?')) counter.reset()
}

onBeforeUnmount(() => {
  rec.stopAuto()
  mic.stop()
})
</script>

<template>
  <section v-if="dhikr" class="flex flex-col items-center gap-6 text-center">
    <div>
      <p class="font-arabic text-5xl leading-relaxed" dir="rtl" lang="ar">{{ dhikr.arabic }}</p>
      <p class="mt-1 text-lg font-medium">{{ dhikr.latin }}</p>
      <p class="text-sm muted">{{ dhikr.translation }}</p>
    </div>

    <div class="flex flex-col items-center">
      <p
        :key="counter.count"
        class="text-8xl font-light tabular-nums text-forest-700 dark:text-gold-300"
        :class="{ bump: bumping }"
        aria-live="polite"
      >
        {{ counter.count }}
      </p>
      <p class="text-sm muted">of {{ counter.target }} · {{ counter.progress.toFixed(1) }}%</p>
      <div class="mt-3 h-2 w-64 overflow-hidden rounded-full bg-beige-200 dark:bg-forest-700">
        <div class="h-full bg-emerald2 transition-all" :style="{ width: counter.progress + '%' }" />
      </div>
    </div>

    <div class="card w-full space-y-2">
      <div class="flex items-center justify-between text-sm">
        <span class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full" :class="mic.active.value ? 'animate-pulse bg-red-500' : 'bg-beige-200 dark:bg-forest-700'" />
          {{ mic.active.value ? 'Microphone active' : 'Microphone off' }}
        </span>
        <span class="tabular-nums muted">{{ formatDuration(counter.elapsedMs) }}</span>
      </div>
      <WaveformCanvas :analyser="mic.analyser.value" :active="mic.active.value" />
      <p class="text-sm muted" role="status">{{ statusText }}</p>
      <p v-if="counter.lastUtterance" class="text-xs muted">Last heard: {{ counter.lastUtterance }}</p>
      <p v-if="rec.autoError.value" class="text-xs text-red-700 dark:text-red-300">{{ rec.autoError.value }}</p>
      <p v-if="rec.droppedCount.value" class="text-xs muted">{{ rec.droppedCount.value }} utterance(s) skipped because recognition fell behind.</p>
      <div v-if="mic.error.value" class="rounded-xl bg-red-50 p-3 text-left text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
        {{ mic.error.value.help }}
      </div>
    </div>

    <div class="card w-full space-y-2 text-left text-sm">
      <p class="font-medium">Automatic counting <span class="text-xs font-normal muted">(experimental, accuracy not yet measured)</span></p>
      <template v-if="rec.loadState.value === 'idle' || rec.loadState.value === 'error'">
        <p class="muted">
          Needs a one-time download of {{ model.label }} (about {{ model.approxMb }} MB). Recognition then runs on this device and
          audio is never uploaded. You can still count manually with + and −.
        </p>
        <p v-if="rec.loadError.value" class="text-red-700 dark:text-red-300">Could not load: {{ rec.loadError.value }}</p>
        <button class="btn-primary" @click="loadModelAndStart">
          <Download :size="16" /> {{ rec.loadState.value === 'error' ? 'Retry download' : 'Load speech model' }}
        </button>
      </template>
      <template v-else-if="rec.loadState.value === 'loading'">
        <p class="muted">Downloading model… {{ Math.round(rec.loadProgress.value * 100) }}%</p>
        <div class="h-2 overflow-hidden rounded-full bg-beige-200 dark:bg-forest-700">
          <div class="h-full bg-emerald2 transition-all" :style="{ width: rec.loadProgress.value * 100 + '%' }" />
        </div>
      </template>
      <template v-else>
        <p class="muted">
          Model ready ({{ rec.activeBackend.value === 'webgpu' ? 'WebGPU' : 'WASM' }}).
          {{ rec.auto.value ? 'Recite continuously; each recognized repetition counts once.' : 'Press Start Listening to count by voice.' }}
        </p>
      </template>
    </div>

    <div class="flex items-center gap-4">
      <button class="btn-ghost h-14 w-14 !rounded-full" aria-label="Decrement" @click="counter.decrement()"><Minus :size="22" /></button>
      <button class="btn-primary h-20 w-20 !rounded-full" aria-label="Increment" @click="counter.increment()"><Plus :size="32" /></button>
      <button class="btn-ghost h-14 w-14 !rounded-full" :aria-label="paused ? 'Resume' : 'Pause'" @click="togglePause">
        <Play v-if="paused" :size="22" /><Pause v-else :size="22" />
      </button>
    </div>

    <div class="flex flex-wrap justify-center gap-2">
      <button class="btn-ghost" :disabled="paused" @click="toggleMic">
        <MicOff v-if="mic.active.value" :size="18" /><Mic v-else :size="18" />
        {{ mic.active.value ? 'Stop Listening' : 'Start Listening' }}
      </button>
      <button class="btn-ghost" @click="confirmReset"><RotateCcw :size="18" /> Reset</button>
      <button class="btn-primary" @click="stopSession"><Square :size="18" /> Stop Session</button>
    </div>

    <div class="w-full space-y-2">
      <p class="text-xs uppercase tracking-wide muted">Target</p>
      <div class="flex flex-wrap justify-center gap-2">
        <button
          v-for="t in TARGET_PRESETS" :key="t" class="btn-ghost !px-3 !py-1.5"
          :class="{ '!border-emerald2': counter.target === t }" @click="counter.setTarget(t)"
        >{{ t }}</button>
        <input v-model.number="customTarget" type="number" min="1" placeholder="Custom" class="input !w-24 text-center" @keyup.enter="applyCustomTarget" @blur="applyCustomTarget" />
      </div>
    </div>

    <div v-if="counter.targetReached" class="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-6">
      <div class="card w-full max-w-sm space-y-3 bg-beige-50 text-center dark:bg-forest-800">
        <p class="text-4xl">✨</p>
        <h2 class="text-xl font-semibold">Target reached</h2>
        <p class="muted">{{ counter.count }} repetitions · {{ formatDuration(counter.elapsedMs) }}</p>
        <div class="flex justify-center gap-2">
          <button class="btn-ghost" @click="counter.continueAfterTarget()">Continue</button>
          <button class="btn-primary" @click="stopSession">Finish</button>
        </div>
      </div>
    </div>
  </section>
</template>
