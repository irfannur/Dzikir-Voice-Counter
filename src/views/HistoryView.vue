<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { db } from '@/database/indexedDb'
import type { SessionRecord } from '@/types'
import { useI18n } from '@/i18n'
import { useSettingsStore } from '@/stores/settingsStore'
import { dayKey, formatDateTime, formatDuration } from '@/utils/format'

const { t } = useI18n()
const settings = useSettingsStore()
const sessions = ref<SessionRecord[]>([])
const error = ref<string | null>(null)
const open = ref<string | null>(null)

const sorted = computed(() => [...sessions.value].sort((a, b) => b.endedAt - a.endedAt))
const daily = computed(() => {
  const map = new Map<string, number>()
  for (const s of sessions.value) map.set(dayKey(s.startedAt), (map.get(dayKey(s.startedAt)) ?? 0) + s.total)
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7)
})

onMounted(async () => {
  try { sessions.value = await db.getAll<SessionRecord>('sessions') } catch (e) { error.value = (e as Error).message }
})

async function remove(id: string) {
  sessions.value = sessions.value.filter((s) => s.id !== id)
  await db.delete('sessions', id)
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ t('hist.title') }}</h1>
    <p v-if="error" class="text-sm text-red-700 dark:text-red-300">{{ t('hist.loadFail', { msg: error }) }}</p>

    <div v-if="daily.length" class="card">
      <p class="mb-2 text-sm muted">{{ t('hist.daily') }}</p>
      <ul class="space-y-1 text-sm">
        <li v-for="[day, total] in daily" :key="day" class="flex justify-between">
          <span>{{ day }}</span><span class="tabular-nums font-medium">{{ total }}</span>
        </li>
      </ul>
    </div>

    <p v-if="!sorted.length && !error" class="muted">{{ t('hist.none') }}</p>
    <div v-for="s in sorted" :key="s.id" class="card">
      <button class="flex w-full items-center justify-between text-left" @click="open = open === s.id ? null : s.id">
        <div>
          <p class="font-medium">{{ s.dhikrName }}</p>
          <p class="text-xs muted">{{ formatDateTime(s.endedAt, settings.language) }}</p>
        </div>
        <p class="tabular-nums">{{ s.total }}<span class="muted">/{{ s.target }}</span></p>
      </button>
      <div v-if="open === s.id" class="mt-3 space-y-1 border-t border-beige-200 pt-3 text-sm dark:border-forest-700">
        <p>{{ t('hist.duration', { v: formatDuration(s.durationMs) }) }}</p>
        <p>{{ t('hist.started', { v: formatDateTime(s.startedAt, settings.language) }) }}</p>
        <p>{{ t('hist.recognition', { a: s.stats.accepted, r: s.stats.rejected }) }}</p>
        <p>{{ t('hist.corrections', { v: s.manualCorrections }) }}</p>
        <button class="btn-ghost mt-2 !py-1.5" @click="remove(s.id)"><Trash2 :size="14" /> {{ t('hist.delete') }}</button>
      </div>
    </div>
  </section>
</template>
