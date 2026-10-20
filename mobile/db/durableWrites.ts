// Web only (used by database.web.ts). LokiJS keeps the database in memory and
// autosaves to IndexedDB every 500ms, so a sale recorded just before the tab
// closes, the browser crashes or the OS kills a background PWA is lost — along
// with everything else written since the last save. Native SQLite has no such
// window. Make a write resolve only once it is in IndexedDB, and flush when the
// page is hidden or unloaded.
import type { Database } from '@nozbe/watermelondb'

function lokiOf(database: Database): any | null {
  // LokiJSAdapter (useWebWorker: false) → dispatcher → synchronous worker → driver.loki
  return (
    (database.adapter as any)?.underlyingAdapter?._driver?.loki ??
    (database.adapter as any)?._driver?.loki ??
    null
  )
}

export function flushToStorage(database: Database): Promise<void> {
  const loki = lokiOf(database)
  if (!loki?.saveDatabase) return Promise.resolve()
  return new Promise((resolve) => {
    loki.saveDatabase((err: unknown) => {
      if (err) console.warn('[WatermelonDB] IndexedDB flush failed', err)
      resolve()
    })
  })
}

export function makeWritesDurable(database: Database): Database {
  const write = database.write.bind(database)
  ;(database as any).write = async (work: any, description?: string) => {
    const result = await write(work, description)
    await flushToStorage(database)
    return result
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const flush = () => void flushToStorage(database)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }
  return database
}
