<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Plus, Search, Trash2 } from 'lucide-vue-next'
import DhikrCard from '@/components/dhikr/DhikrCard.vue'
import { useDhikrStore } from '@/stores/dhikrStore'
import { useI18n } from '@/i18n'

const store = useDhikrStore()
const { t } = useI18n()
const query = ref('')
const showForm = ref(false)
const form = reactive({ name: '', arabic: '', latin: '', translation: '', target: 33 })

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return store.all
  return store.all.filter((d) => [d.name, d.latin, d.translation, d.arabic].some((s) => s.toLowerCase().includes(q)))
})

async function save() {
  if (!form.name.trim() || !form.arabic.trim()) return
  await store.addCustom({ ...form })
  Object.assign(form, { name: '', arabic: '', latin: '', translation: '', target: 33 })
  showForm.value = false
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ t('lib.title') }}</h1>
    <div class="relative">
      <Search :size="16" class="absolute left-3 top-3 muted" />
      <input v-model="query" class="input !pl-9" :placeholder="t('lib.search')" />
    </div>

    <p v-if="store.storageError" class="text-sm text-red-700 dark:text-red-300">{{ t('lib.storageProblem', { msg: store.storageError }) }}</p>

    <div v-for="d in filtered" :key="d.id" class="flex items-center gap-2">
      <RouterLink :to="`/counter/${d.id}`" class="block flex-1"><DhikrCard :dhikr="d" /></RouterLink>
      <button v-if="d.custom" class="btn-ghost !p-2" :aria-label="t('lib.deleteCustom')" @click="store.removeCustom(d.id)">
        <Trash2 :size="16" />
      </button>
    </div>
    <p v-if="!filtered.length" class="muted">{{ t('lib.noMatch') }}</p>

    <button class="btn-ghost w-full" @click="showForm = !showForm"><Plus :size="18" /> {{ t('lib.custom') }}</button>
    <form v-if="showForm" class="card space-y-3" @submit.prevent="save">
      <input v-model="form.name" class="input" :placeholder="t('lib.name')" required />
      <input v-model="form.arabic" class="input font-arabic text-lg" dir="rtl" :placeholder="t('lib.arabic')" required />
      <input v-model="form.latin" class="input" :placeholder="t('lib.latin')" />
      <input v-model="form.translation" class="input" :placeholder="t('lib.translation')" />
      <label class="flex items-center gap-2 text-sm">{{ t('lib.target') }}
        <input v-model.number="form.target" type="number" min="1" class="input !w-28" />
      </label>
      <button class="btn-primary w-full" type="submit">{{ t('lib.save') }}</button>
    </form>
  </section>
</template>
