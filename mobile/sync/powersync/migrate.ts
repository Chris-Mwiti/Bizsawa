import AsyncStorage from '@react-native-async-storage/async-storage'
import { database } from '../../db/database'
import { api } from '../../lib/api'
import { getDeviceId } from '../../lib/deviceId'

const MIGRATION_FLAG = 'bizsawa_powersync_migrated_v1'

// Canonical FK-safe push order (matches backend syncableTables). payment_commands
// is excluded: it is server-owned and rejected on upload.
const SYNCABLE_TABLES = [
  'products',
  'product_variants',
  'customers',
  'inventory_items',
  'stock_movements',
  'orders',
  'order_lines',
  'sales',
  'sale_lines',
  'expenses',
  'invoices',
  'invoice_lines',
  'tax_rules',
] as const

type TableChanges = {
  created: Record<string, any>[]
  updated: Record<string, any>[]
  deleted: string[]
}

interface PushRequest {
  changes: Record<string, TableChanges>
  device_id: string
}

/**
 * One-time migration: push any unsynced WatermelonDB rows to the backend via
 * POST /api/v1/sync/push, then remember the migration so PowerSync becomes the
 * sole read/write path on PWA/web.
 *
 * Safe to re-run; a second run is a no-op once the flag is set. Does NOT delete
 * the WatermelonDB LokiJS/IndexedDB database here — that happens in the cleanup
 * phase once every web read path has moved to PowerSync.
 */
export async function migrateWatermelonToPowerSync(): Promise<boolean> {
  try {
    const already = await AsyncStorage.getItem(MIGRATION_FLAG)
    if (already === '1') return false

    const deviceId = await getDeviceId()
    const changes: Record<string, TableChanges> = {}

    for (const table of SYNCABLE_TABLES) {
      const col: any = (database as any).get(table)
      const rows: any[] = await col.query().fetch()
      const created: Record<string, any>[] = []
      const updated: Record<string, any>[] = []
      const deleted: string[] = []

      for (const rec of rows) {
        const raw: any = { ...rec._raw }
        const status = raw._status
        // Strip WatermelonDB internals; the backend ignores leading '_' keys.
        delete raw._status
        delete raw._changed

        if (status === 'deleted') {
          deleted.push(String(raw.id))
        } else if (status === 'created') {
          created.push(raw)
        } else {
          // 'synced' or anything else → treat as an update to be safe.
          updated.push(raw)
        }
      }

      if (created.length || updated.length || deleted.length) {
        changes[table] = { created, updated, deleted }
      }
    }

    if (Object.keys(changes).length === 0) {
      await AsyncStorage.setItem(MIGRATION_FLAG, '1')
      return false
    }

    const response = await api.post<{ applied?: Record<string, string[]>; conflicts?: any[]; rejected?: Record<string, string[]>; errors?: Record<string, string[]> }>('/sync/push', {
      changes,
      device_id: deviceId,
    } as PushRequest)

    const body = response.data ?? {}
    if (body.conflicts?.length) {
      console.warn('[PowerSync] migration conflicts recorded', body.conflicts)
    }
    if (body.rejected) {
      console.warn('[PowerSync] migration rejected rows', body.rejected)
    }
    if (body.errors) {
      console.warn('[PowerSync] migration errors', body.errors)
    }

    await AsyncStorage.setItem(MIGRATION_FLAG, '1')
    return true
  } catch (error) {
    console.warn('[PowerSync] migration failed; will retry on next start', error)
    return false
  }
}
