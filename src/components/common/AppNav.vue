<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { BookOpen, History, Home, Mic, Settings } from 'lucide-vue-next'

const items = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/calibration', label: 'Mic', icon: Mic },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
]
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-10 border-t border-beige-200 bg-beige-50/95 backdrop-blur dark:border-forest-700 dark:bg-forest-900/95"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <ul class="mx-auto flex max-w-2xl justify-around py-2">
      <li v-for="i in items" :key="i.to">
        <RouterLink
          :to="i.to"
          class="flex flex-col items-center gap-0.5 px-3 py-1 text-xs muted"
          active-class="!text-forest-700 dark:!text-emerald2 font-semibold"
        >
          <component :is="i.icon" :size="20" />
          {{ i.label }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
