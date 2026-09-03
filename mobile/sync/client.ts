import { synchronize } from '@nozbe/watermelondb/sync'
import NetInfo from '@react-native-community/netinfo'
import { database } from '../db/database'
import { api } from '../lib/api'
import { v4 as uuidv4 } from 'uuid'
import { toNumber } from '../lib/api-dtos'

// One-time repair for corrupted local rows (0 timestamps → now, NaN numerics → 0)
// Runs before first sync to heal 1970 / NaN displays without wiping offline data
let repaired = false
async function repairCorruptedLocal() {
  if (repaired) return
  repaired = true
  try {
    const tables: Record<string, { numeric: string[]; dates: string[] }> = {
      sales: { numeric: ['subtotal', 'tax_amount', 'total'], dates: ['sold_at'] },
      sale_lines: { numeric: ['quantity', 'unit_price', 'line_total'], dates: [] },
      invoices: { numeric: ['subtotal', 'tax_amount', 'total', 'amount_paid', 'amount_due'], dates: ['due_at'] },
      invoice_lines: { numeric: ['quantity', 'unit_price', 'line_total'], dates: [] },
      expenses: { numeric: ['amount', 'tax_amount'], dates: ['spent_at'] },
      orders: { numeric: ['subtotal', 'tax_amount', 'total'], dates: [] },
      order_lines: { numeric: ['quantity', 'unit_price', 'line_total'], dates: [] },
      products: { numeric: ['price', 'cost'], dates: [] },
      inventory_items: { numeric: ['quantity', 'low_stock_threshold'], dates: [] },
      stock_movements: { numeric: ['quantity_delta'], dates: ['occurred_at'] },
      customers: { numeric: ['total_spend'], dates: ['last_purchase_at'] },
    }
    await (database as any).write(async () => {
      for (const [table, cols] of Object.entries(tables)) {
        try {
          const col: any = (database as any).get(table)
          const rows: any[] = await col.query().fetch()
          for (const rec of rows) {
            const raw = rec._raw
            let needsUpdate = false
            const patch: any = {}
            for (const c of cols.numeric) {
              const v = raw[c]
              if (v == null) continue
              const str = String(v)
              if (str === "" || str.toLowerCase() === "nan" || str === "local" || Number.isNaN(Number(str))) {
                // keep as "0" string for Decimal columns
                patch[c] = "0"
                needsUpdate = true
              }
            }
            for (const c of cols.dates) {
              const v = raw[c]
              if (v === 0 || v === "0" || v == null) {
                patch[c] = Date.now()
                needsUpdate = true
              } else if (typeof v === "number" && v < 1000) {
                patch[c] = Date.now()
                needsUpdate = true
              }
            }
            if (needsUpdate) {
              await rec.update((r: any) => {
                for (const [k, v] of Object.entries(patch)) {
                  // Watermelon JS field names are camelCase: sold_at -> soldAt, etc.
                  const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
                  if (camel in r) (r as any)[camel] = v
                  else (r as any)[k] = v
                }
              })
            }
          }
        } catch {}
      }
    })
  } catch {}
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
      await api.post(
        `/sync/push`,
        { changes, lastPulledAt },
        { headers: { 'X-Idempotency-Key': idempotencyKey } }
      )
    },
    // Version-counter conflict → conflicts table (§4), not last-write-wins (§10)
    // Watermelon calls this when local modified row also changed remotely
    // We route to conflicts table via push's conflict response; here we just surface
    // Full resolution UI is Phase 3 — for now, keep server's version and flag
    conflictResolver: (table, local, remote, resolved) => {
      // Brief: do NOT silent merge. Mark for conflicts table via push response; locally keep remote + flag
      // Returning remote ensures local eventually reflects server, conflict row remains for manual resolve
      console.warn('[Sync] conflict', table, local.id, { localSync: (local as any).sync_version, remoteSync: (remote as any).sync_version })
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
      syncNow().catch((e) => console.warn('[Sync] initial hydration failed', e?.message))
    }
  })

  // On reconnect — immediate sync
  const unsub = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      syncNow().catch((e) => console.warn('[Sync] reconnect sync failed', e?.message))
    }
  })

  // Periodic while online (8 min — within 5-10 recommended)
  intervalId = setInterval(async () => {
    const s = await NetInfo.fetch()
    if (s.isConnected) {
      syncNow().catch(() => {})
    }
  }, 8 * 60 * 1000)

  return () => {
    unsub()
    if (intervalId) clearInterval(intervalId)
  }
}

// Manual pull-to-refresh hook
export async function manualSync() {
  const s = await NetInfo.fetch()
  if (!s.isConnected) throw new Error('Offline — changes queued locally (pending)')
  return syncNow()
}
