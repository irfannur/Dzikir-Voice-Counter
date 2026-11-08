<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppNav from '@/components/common/AppNav.vue'
import { useSettingsStore } from '@/stores/settingsStore'

const settings = useSettingsStore()
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-24 pt-6">
    <div class="mb-2 flex justify-end gap-1 text-xs" role="group" aria-label="Language">
      <button
        v-for="l in (['id', 'en'] as const)" :key="l"
        class="rounded-lg px-2 py-1 font-medium uppercase transition"
        :class="settings.language === l ? 'bg-forest-700 text-white dark:bg-emerald2' : 'muted hover:bg-beige-100 dark:hover:bg-forest-800'"
        @click="settings.language = l"
      >{{ l }}</button>
    </div>
    <main class="flex-1"><RouterView /></main>
    <AppNav />
  </div>
</template>
