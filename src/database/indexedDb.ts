const DB_NAME = 'voice-dzikir'
const DB_VERSION = 1
export type StoreName = 'customDhikr' | 'sessions' | 'calibration'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of ['customDhikr', 'sessions', 'calibration'] as StoreName[]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('Failed to open IndexedDB.'))
    }
  })
  return dbPromise
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted (storage quota?).'))
      }),
  )
}

export const db = {
  getAll: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  get: <T>(store: StoreName, id: string) => run<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>),
  put: <T>(store: StoreName, value: T) => run(store, 'readwrite', (s) => s.put(value)),
  delete: (store: StoreName, id: string) => run(store, 'readwrite', (s) => s.delete(id)),
  clear: (store: StoreName) => run(store, 'readwrite', (s) => s.clear()),
}
