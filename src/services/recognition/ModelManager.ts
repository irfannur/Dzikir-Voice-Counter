/**
 * Storage helpers for downloaded models. Transformers.js downloads and caches model
 * files itself in the browser Cache Storage under "transformers-cache"; this module
 * reports and clears that cache so Settings can show real numbers.
 */
const MODEL_CACHE = 'transformers-cache'

export interface StorageUsage {
  usageBytes: number | null
  quotaBytes: number | null
  modelBytes: number
}

export async function getStorageUsage(): Promise<StorageUsage> {
  let usageBytes: number | null = null
  let quotaBytes: number | null = null
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate()
    usageBytes = est.usage ?? null
    quotaBytes = est.quota ?? null
  }
  let modelBytes = 0
  if ('caches' in globalThis && (await caches.has(MODEL_CACHE))) {
    const cache = await caches.open(MODEL_CACHE)
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      if (res) modelBytes += (await res.clone().blob()).size
    }
  }
  return { usageBytes, quotaBytes, modelBytes }
}

/** Asks the browser not to evict stored models under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export async function removeAllModels(): Promise<void> {
  if ('caches' in globalThis) await caches.delete(MODEL_CACHE)
}

export function formatBytes(n: number | null): string {
  if (n === null) return 'unknown'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
