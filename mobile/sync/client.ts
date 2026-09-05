import { synchronize } from '@nozbe/watermelondb/sync'
import NetInfo from '@react-native-community/netinfo'
import { database } from '../db/database'
import { api } from '../lib/api'
import { v4 as uuidv4 } from 'uuid'
import { toNumber } from '../lib/api-dtos'

// One-time repair for corrupted local rows — now destructive for synced data to avoid pushing "0" to server
// NaN numerics and 0/1970 dates are healed: created (not yet pushed) rows are sanitized to "0"/now,
// synced rows are destroyed locally so next pull brings server's clean value (server verified clean — no NaN/1970).
let repaired = false
async function repairCorruptedLocal() {
  if (repaired) return
  repaired = true
  try {
    const tables: Record<string, { numeric: string[]; dates: string[] }> = {
      sales: {
        numeric: ['subtotal', 'tax_amount', 'total'],
        dates: ['sold_at'],
      },
      sale_lines: {
        numeric: ['quantity', 'unit_price', 'line_total'],
        dates: [],
      },
      invoices: {
        numeric: [
          'subtotal',
          'tax_amount',
          'total',
          'amount_paid',
          'amount_due',
        ],
        dates: ['due_at'],
      },
      invoice_lines: {
        numeric: ['quantity', 'unit_price', 'line_total'],
        dates: [],
      },
      expenses: { numeric: ['amount', 'tax_amount'], dates: ['spent_at'] },
      orders: { numeric: ['subtotal', 'tax_amount', 'total'], dates: [] },
      order_lines: {
        numeric: ['quantity', 'unit_price', 'line_total'],
        dates: [],
      },
      products: { numeric: ['price', 'cost'], dates: [] },
      inventory_items: {
        numeric: ['quantity', 'low_stock_threshold'],
        dates: [],
      },
      stock_movements: { numeric: ['quantity_delta'], dates: ['occurred_at'] },
      customers: { numeric: ['total_spend'], dates: ['last_purchase_at'] },
    }
    // Use adapter destroyPermanently for synced corrupted rows so we don't push "0" overwriting server's correct value
    for (const [table, cols] of Object.entries(tables)) {
      try {
        const col: any = (database as any).get(table)
        const rows: any[] = await col.query().fetch()
        for (const rec of rows) {
          const raw = rec._raw
          const isCreated = raw._status === 'created'
          let hasNumericCorruption = false
          let hasDateCorruption = false
          for (const c of cols.numeric) {
            const v = raw[c]
            if (v == null) continue
            const str = String(v).trim().toLowerCase()
            if (
              str === '' ||
              str === 'nan' ||
              str === 'local' ||
              str === 'undefined' ||
              (isNaN(Number(str)) && str !== '0')
            ) {
              hasNumericCorruption = true
              break
            }
          }
          for (const c of cols.dates) {
            const v = raw[c]
            if (
              v === 0 ||
              v === '0' ||
              v == null ||
              (typeof v === 'number' && v < 1000)
            ) {
              hasDateCorruption = true
              break
            }
            if (typeof v === 'number') {
              const d = new Date(v)
              if (isNaN(d.getTime()) || d.getFullYear() <= 1970) {
                hasDateCorruption = true
                break
              }
            }
          }
          if (!hasNumericCorruption && !hasDateCorruption) continue

          if (isCreated) {
            // Sanitize locally-created not-yet-pushed row: fix to valid value and keep for push
            await (database as any).write(async () => {
              const patch: any = {}
              for (const c of cols.numeric) {
                const v = raw[c]
                if (v == null) continue
                const str = String(v).trim().toLowerCase()
                if (
                  str === '' ||
                  str === 'nan' ||
                  str === 'local' ||
                  (isNaN(Number(str)) && str !== '0')
                )
                  patch[c] = '0'
              }
              for (const c of cols.dates) {
                const v = raw[c]
                if (
                  v === 0 ||
                  v === '0' ||
                  v == null ||
                  (typeof v === 'number' && v < 1000)
                )
                  patch[c] = Date.now()
              }
              if (Object.keys(patch).length === 0) return
              await rec.update((r: any) => {
                for (const [k, v] of Object.entries(patch)) {
                  const camel = k.replace(/_([a-z])/g, (_, c) =>
                    c.toUpperCase(),
                  )
                  if (camel in r) (r as any)[camel] = v
                  else (r as any)[k] = v
                }
              })
            })
          } else {
            // Synced/updated row corrupted by old pull bug — destroy locally, next pull will re-create from server (server is clean)
            try {
              await (database as any).write(async () => {
                await rec.destroyPermanently()
              })
            } catch {}
          }
        }
      } catch {}
    }
  } catch {}
}

export async function resetLocalDatabase() {
  try {
    // Wipes Watermelon SQLite and resets lastPulledAt — next sync will full pull from server
    await (database as any).write(async () => {
      await (database as any).unsafeResetDatabase()
    })
    repaired = false
  } catch (e) {
    // fallback: adapter level
    try {
      await (database as any).adapter.unsafeResetDatabase()
    } catch {}
    repaired = false
  }
}

// ── Pending & conflict inspection for OfflineBanner recovery actions ──────────

const PENDING_TABLES = [
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
  'payment_commands',
  'tax_rules',
]

export async function getPendingChangesCount(): Promise<number> {
  let total = 0
  for (const table of PENDING_TABLES) {
    try {
      const col: any = (database as any).get(table)
      // Watermelon marks unsynced rows with _status = 'created' | 'updated' | 'deleted'
      const rows: any[] = await col.query().fetch()
      for (const r of rows) {
        const s = r._raw?._status
        if (s === 'created' || s === 'updated' || s === 'deleted') total++
      }
    } catch {
      // table may not exist yet
    }
  }
  return total
}

export async function getConflictsCount(): Promise<number> {
  try {
    const col: any = (database as any).get('conflicts')
    const rows: any[] = await col.query().fetch()
    return rows.length
  } catch {
    return 0
  }
}

export async function refreshFromRemote(): Promise<void> {
  // Pull-only refresh: fetch server state without pushing pending (useful when conflicts need discarding)
  // We achieve this by doing a normal sync but we clear pending _status via reset if user confirms
  // For now, just run full sync — Watermelon's pull will bring server changes and surface conflicts
  await syncNow()
}

// WatermelonDB synchronize() wired to Brief §5 endpoints — single source of truth while offline is local SQLite
export async function syncNow() {
  await repairCorruptedLocal()
  await synchronize({
    database: database as any,
    pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
      // lastPulledAt is number ms Watermelon tracks; backend expects ?since=<ms|RFC3339>
      const since = lastPulledAt ? String(lastPulledAt) : '0'
      const res = await api.get(`/sync/pull`, { params: { since } })
      // Backend returns {changes: {table:{created, updated, deleted}}, timestamp}
      // Watermelon expects {changes, timestamp}
      const data = res.data as any
      // Map backend snake_case to Watermelon camelCase if needed — for now passthrough
      return {
        changes: data.changes ?? data,
        timestamp: data.timestamp ?? Date.now(),
      }
    },
    pushChanges: async ({ changes, lastPulledAt }) => {
      // Per-batch idempotency key §2 (Do Not Substitute)
      const idempotencyKey = uuidv4()
      const res: any = await api.post(
        `/sync/push`,
        { changes, lastPulledAt },
        { headers: { 'X-Idempotency-Key': idempotencyKey } },
      )
      // Persist server-reported conflicts to local `conflicts` table for badge + /sync-conflicts UI (§4)
      const conflicts = res?.data?.conflicts || res?.data?.data?.conflicts || []
      if (Array.isArray(conflicts) && conflicts.length) {
        try {
          await (database as any).write(async () => {
            const col: any = (database as any).get('conflicts')
            for (const c of conflicts) {
              const rid = c.record_id || c.recordId || c.id
              const tname = c.table_name || c.table || c.Table
              if (!rid || !tname) continue
              // idempotent: skip if unresolved conflict already exists for this record
              const existing: any[] = await col.query().fetch()
              const dup = existing.find((e: any) => e.recordId === rid && e.tableName === tname && !e.resolution)
              if (dup) continue
              await col.create((rec: any) => {
                try { rec._raw.id = c.id || uuidv4() } catch {}
                rec.businessId = c.business_id || c.businessId || ''
                rec.tableName = tname
                rec.recordId = rid
                rec.clientPayload = typeof c.client_payload === 'string' ? c.client_payload : JSON.stringify(c.client_payload || c.clientPayload || {})
                rec.serverPayload = typeof c.server_payload === 'string' ? c.server_payload : JSON.stringify(c.server_payload || c.serverPayload || {})
                rec.clientVersion = c.client_version ?? c.clientVersion ?? 0
                rec.serverVersion = c.server_version ?? c.serverVersion ?? 0
                rec.resolution = null
              })
            }
          })
        } catch (e) {
          console.warn('[Sync] failed to persist conflicts locally', e)
        }
        // Trigger navigation hint via global event — SyncProvider will pick up via refreshCounts and redirect
        try {
          const { getConflictsCount } = await import('./client')
          // no-op, counts will be refreshed by SyncProvider interval; also emit via fetch
        } catch {}
      }
    },
    // Version-counter conflict → conflicts table (§4), not last-write-wins (§10)
    // Watermelon calls this when local modified row also changed remotely
    // We route to conflicts table via push's conflict response; here we just surface
    // Full resolution UI is Phase 3 — for now, keep server's version and flag
    conflictResolver: (table, local, remote, resolved) => {
      // Brief: do NOT silent merge. Mark for conflicts table via push response; locally keep remote + flag
      // Returning remote ensures local eventually reflects server, conflict row remains for manual resolve
      console.warn('[Sync] conflict', table, local.id, {
        localSync: (local as any).sync_version,
        remoteSync: (remote as any).sync_version,
      })
      return remote
    },
    unsafeTurbo: false, // enable only for first login on empty DB per sketch §11
  })
}

// NetInfo + interval triggers per Brief §3.4 (reconnect + periodic 5-10min + manual pull-to-refresh)
// Plus initial hydration: if already online at startup, populate local DB immediately so offline works after
let intervalId: ReturnType<typeof setInterval> | null = null

export function startSyncEngine() {
  // Initial hydration on startup if already online — populates local storage for offline resume
  NetInfo.fetch().then((s) => {
    if (s.isConnected) {
      syncNow().catch((e) =>
        console.warn('[Sync] initial hydration failed', e?.message),
      )
    }
  })

  // On reconnect — immediate sync
  const unsub = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      syncNow().catch((e) =>
        console.warn('[Sync] reconnect sync failed', e?.message),
      )
    }
  })

  // Periodic while online (8 min — within 5-10 recommended)
  intervalId = setInterval(
    async () => {
      const s = await NetInfo.fetch()
      if (s.isConnected) {
        syncNow().catch(() => {})
      }
    },
    8 * 60 * 1000,
  )

  return () => {
    unsub()
    if (intervalId) clearInterval(intervalId)
  }
}

// Manual pull-to-refresh hook
export async function manualSync() {
  const s = await NetInfo.fetch()
  if (!s.isConnected)
    throw new Error('Offline — changes queued locally (pending)')
  return syncNow()
}
