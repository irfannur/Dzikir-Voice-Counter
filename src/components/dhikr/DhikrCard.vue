<script setup lang="ts">
import type { Dhikr } from '@/types'
defineProps<{ dhikr: Dhikr }>()
</script>

<template>
  <div class="card flex items-center justify-between gap-4 text-left">
    <div class="min-w-0">
      <p class="truncate font-semibold">{{ dhikr.name }}</p>
      <p class="truncate text-sm muted">{{ dhikr.translation }}</p>
    </div>
    <p class="shrink-0 font-arabic text-2xl" dir="rtl" lang="ar">{{ dhikr.arabic }}</p>
  </div>
</template>
