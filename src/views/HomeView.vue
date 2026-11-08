<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import DhikrCard from '@/components/dhikr/DhikrCard.vue'
import { useDhikrStore } from '@/stores/dhikrStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useI18n } from '@/i18n'
import { db } from '@/database/indexedDb'
import type { SessionRecord } from '@/types'
import { dayKey, formatDateTime, formatDuration } from '@/utils/format'

const store = useDhikrStore()
const settings = useSettingsStore()
const { t } = useI18n()
const sessions = ref<SessionRecord[]>([])
const popular = computed(() => store.all.slice(0, 4))
const last = computed(() => [...sessions.value].sort((a, b) => b.endedAt - a.endedAt)[0])
const today = computed(() =>
  sessions.value.filter((s) => dayKey(s.startedAt) === dayKey(Date.now())).reduce((n, s) => n + s.total, 0),
)

onMounted(async () => {
  try { sessions.value = await db.getAll<SessionRecord>('sessions') } catch { /* storage unavailable */ }
})
</script>

<template>
  <section class="space-y-6">
    <header>
      <p class="text-sm muted">السلام عليكم</p>
      <h1 class="text-2xl font-semibold">{{ t('app.title') }}</h1>
      <p class="muted">{{ t('app.tagline') }}</p>
    </header>

    <div class="card">
      <p class="text-sm muted">{{ t('home.today') }}</p>
      <p class="text-4xl font-light tabular-nums">{{ today }}</p>
      <template v-if="last">
        <p class="mt-3 text-sm muted">{{ t('home.lastSession') }}</p>
        <p class="font-medium">{{ last.dhikrName }} · {{ last.total }}/{{ last.target }} · {{ formatDuration(last.durationMs) }}</p>
        <p class="text-xs muted">{{ formatDateTime(last.endedAt, settings.language) }}</p>
      </template>
      <p v-else class="mt-2 text-sm muted">{{ t('home.noSessions') }}</p>
    </div>

    <div class="space-y-3">
      <h2 class="font-semibold">{{ t('home.quickStart') }}</h2>
      <RouterLink v-for="d in popular" :key="d.id" :to="`/counter/${d.id}`" class="block">
        <DhikrCard :dhikr="d" />
      </RouterLink>
      <RouterLink to="/library" class="btn-primary w-full">{{ t('home.startNew') }}</RouterLink>
    </div>

    <p class="text-xs muted">{{ t('home.privacy') }}</p>
  </section>
</template>
