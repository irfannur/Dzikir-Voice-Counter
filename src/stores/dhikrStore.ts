import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Dhikr } from '@/types'
import { BUILTIN_DHIKR } from '@/data/dhikrLibrary'
import { db } from '@/database/indexedDb'

export const useDhikrStore = defineStore('dhikr', () => {
  const custom = ref<Dhikr[]>([])
  const loaded = ref(false)
  const storageError = ref<string | null>(null)

  const all = computed(() => [...BUILTIN_DHIKR, ...custom.value])

  async function init() {
    if (loaded.value) return
    try {
      custom.value = await db.getAll<Dhikr>('customDhikr')
    } catch (e) {
      storageError.value = (e as Error).message
    }
    loaded.value = true
  }

  function byId(id: string): Dhikr | undefined {
    return all.value.find((d) => d.id === id)
  }

  async function addCustom(input: { name: string; arabic: string; latin: string; translation: string; target: number }) {
    const d: Dhikr = {
      id: `custom-${Date.now()}`,
      name: input.name.trim(),
      arabic: input.arabic.trim(),
      latin: input.latin.trim() || input.name.trim(),
      translation: input.translation.trim(),
      keywords: [input.latin, input.name, input.arabic].map((s) => s.trim()).filter(Boolean),
      defaultTarget: input.target,
      custom: true,
    }
    custom.value.push(d)
    try {
      await db.put('customDhikr', d)
    } catch (e) {
      storageError.value = (e as Error).message
    }
    return d
  }

  async function removeCustom(id: string) {
    custom.value = custom.value.filter((d) => d.id !== id)
    try {
      await db.delete('customDhikr', id)
    } catch (e) {
      storageError.value = (e as Error).message
    }
  }

  return { custom, all, loaded, storageError, init, byId, addCustom, removeCustom }
})
