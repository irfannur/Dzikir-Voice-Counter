<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppNav from '@/components/common/AppNav.vue'
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-24 pt-6">
    <main class="flex-1"><RouterView /></main>
    <AppNav />
  </div>
</template>
