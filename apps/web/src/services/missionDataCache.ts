import type { CachedMissionData } from '@/types/missionData'

const DATABASE = `frozen-rabbit-expert:mission-data:${import.meta.env.BASE_URL}`
let disabled = false
let connection: Promise<IDBDatabase | null> | undefined

async function open(): Promise<IDBDatabase | null> {
  if (disabled || typeof indexedDB === 'undefined') return null
  if (!connection) connection = new Promise((resolve) => {
    let finished = false
    const finish = (database: IDBDatabase | null) => {
      if (finished) { database?.close(); return }
      finished = true
      clearTimeout(timer)
      if (!database) disabled = true
      resolve(database)
    }
    const timer = window.setTimeout(() => finish(null), 2000)
    try {
      const request = indexedDB.open(DATABASE, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('versions')
      request.onerror = request.onblocked = () => finish(null)
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); connection = undefined }
        finish(request.result)
      }
    } catch { finish(null) }
  })
  return connection
}

async function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, set: (value: T) => void) => void,
): Promise<T | null> {
  const database = await open()
  if (!database) return null
  return new Promise((resolve) => {
    let result: T | null = null
    try {
      const transaction = database.transaction('versions', mode)
      const timer = window.setTimeout(() => { try { transaction.abort() } catch {}; resolve(null) }, 2000)
      transaction.oncomplete = () => { clearTimeout(timer); resolve(result) }
      transaction.onerror = transaction.onabort = () => { clearTimeout(timer); resolve(null) }
      run(transaction.objectStore('versions'), value => { result = value })
    } catch { resolve(null) }
  })
}

export async function readMissionDataCache(): Promise<{ active?: CachedMissionData; pending?: CachedMissionData } | null> {
  return transact('readonly', (store, set) => {
    const active = store.get('active')
    const pending = store.get('pending')
    pending.onsuccess = () => set({ active: active.result, pending: pending.result })
  })
}

export async function saveMissionDataCache(
  key: 'active' | 'pending',
  data: CachedMissionData,
  expectedActive?: string,
): Promise<boolean> {
  return (await transact<boolean>('readwrite', (store, set) => {
    const request = store.get('active')
    request.onsuccess = () => {
      const current = request.result as CachedMissionData | undefined
      const pending = store.get('pending')
      pending.onsuccess = () => {
        const promoting = key === 'active' && pending.result?.manifest.version === data.manifest.version
        if (!promoting && expectedActive && current
          && current.manifest.version !== expectedActive
          && current.manifest.version !== data.manifest.version) { set(false); return }
        store.put(data, key)
        if (promoting) store.delete('pending')
        set(true)
      }
    }
  })) === true
}

export async function clearMissionDataCache(): Promise<boolean> {
  return (await transact<boolean>('readwrite', (store, set) => { store.clear(); set(true) })) === true
}
