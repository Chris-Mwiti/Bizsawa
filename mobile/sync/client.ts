import { synchronize } from '@nozbe/watermelondb/sync'
import NetInfo from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { InteractionManager } from 'react-native'
import { database } from '../db/database'
import { api, AUTH_STORAGE_KEYS } from '../lib/api'
import { extractRejectedIds } from './pushResult'
import { randomUUID } from 'expo-crypto'
import { Q } from '@nozbe/watermelondb'
import * as RawRecord from '@nozbe/watermelondb/RawRecord'

/**
 * The sync engine does full-table JSI scans that run synchronously on the JS
 * thread: while a scan runs, input, timers and buttons are all frozen. Before
 * this gate, those scans ran even on the auth screens (OTP, login) where there
 * is no usable session — the sync 401s but only AFTER the expensive local
 * scans already blocked the UI. That is the recurring "app freezes while I
 * type the code" hang: the user is unauthenticated, the sync does zero useful
 * work, and the thread is wedged by scans + NetInfo reconnect storms.
 */
let cachedHasSession: boolean | null = null
export async function hasStoredSession(): Promise<boolean> {
  // Deliberately uncached: AsyncStorage.multiGet costs ~1ms while a stale
  // `false` cached on the OTP screen would skip sync forever after login.
  try {
    const [access, legacy, refresh] = await AsyncStorage.multiGet([
      AUTH_STORAGE_KEYS.accessToken,
      AUTH_STORAGE_KEYS.legacyToken,
      AUTH_STORAGE_KEYS.refreshToken,
    ])
    const ok = Boolean(access?.[1] || legacy?.[1] || refresh?.[1])
    cachedHasSession = ok
    return ok
  } catch {
    return cachedHasSession ?? false
  }
}

// Defensive patch: Watermelon's _setRaw throws "Cannot read property 'type' of undefined"
// when a column not in schema is set (e.g. stale _changed="customers" or server sends unknown column).
// Patch setRawSanitized to skip unknown columns instead of crashing sync.
try {
  const origSetRawSanitized: any = (RawRecord as any).setRawSanitized
  if (origSetRawSanitized && !(origSetRawSanitized as any).__patched) {
    const patched = (raw: any, columnName: string, value: any, columnSchema: any) => {
      if (!columnSchema) {
        console.warn(`[Sync] setRawSanitized skipping unknown column ${columnName} value=${JSON.stringify(value)?.slice(0,120)}`)
        return
      }
      return origSetRawSanitized(raw, columnName, value, columnSchema)
    }
    ;(patched as any).__patched = true
    ;(RawRecord as any).setRawSanitized = patched
  }
} catch {}
// Also patch Model._setRaw to be defensive (covers r.field = value paths)
try {
  const { Model } = require('@nozbe/watermelondb')
  const proto: any = (Model as any).prototype
  if (proto && proto._setRaw && !(proto._setRaw as any).__patched) {
    const orig = proto._setRaw
    const patched = function (this: any, rawFieldName: string, rawValue: any) {
      const col = this.collection?.schema?.columns?.[rawFieldName]
      if (!col) {
        console.warn(`[Sync] Model._setRaw skipping unknown column ${this.table}.${rawFieldName}`)
        // Still mark _changed for known columns only; for unknown, just set raw directly without type check
        // to avoid crash and allow sync to continue
        this._raw[rawFieldName] = rawValue
        return
      }
      return orig.call(this, rawFieldName, rawValue)
    }
    ;(patched as any).__patched = true
    proto._setRaw = patched
  }
} catch {}

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
  const d = await getPendingChangesDebug()
  return d.total
}

export async function getPendingChangesDebug(): Promise<{ total: number; perTable: Record<string, { created: number; updated: number; deleted: number }> }> {
  const started = Date.now()
  const perTable: Record<string, { created: number; updated: number; deleted: number }> = {}
  let total = 0
  for (const table of PENDING_TABLES) {
    try {
      const col: any = (database as any).get(table)
      let createdCount = 0, updatedCount = 0, deletedCount = 0
      try {
        // Count-based: Q.where on _status + fetchCount() never materializes
        // rows. The old code fetched EVERY row of all 14 tables and looped in
        // JS — on a large local DB that blocks input/timers for seconds.
        const [created, updated] = await Promise.all([
          col.query(Q.where('_status', 'created')).fetchCount().catch(() => -1),
          col.query(Q.where('_status', 'updated')).fetchCount().catch(() => -1),
        ])
        if (created >= 0 && updated >= 0) {
          createdCount = created
          updatedCount = updated
        } else {
          throw new Error('count query unsupported')
        }
        // also count adapter deleted records (Watermelon deleted queue) — matches fetchLocalChanges
        try {
          const deletedIds: string[] = await (database as any).adapter.getDeletedRecords(table)
          deletedCount = Math.max(deletedCount, deletedIds.length)
        } catch {}
      } catch (e) {
        // Fallback: full fetch (small tables only in practice — try/catch keeps it bounded)
        try {
          const rows: any[] = await col.query().fetch()
          for (const r of rows) {
            const s = r._raw?._status
            if (s === 'created') createdCount++
            else if (s === 'updated') updatedCount++
            else if (s === 'deleted') deletedCount++
          }
          try {
            const deletedIds: string[] = await (database as any).adapter.getDeletedRecords(table)
            deletedCount = Math.max(deletedCount, deletedIds.length)
          } catch {}
        } catch {}
      }
      perTable[table] = { created: createdCount, updated: updatedCount, deleted: deletedCount }
      total += createdCount + updatedCount + deletedCount
      if (createdCount + updatedCount + deletedCount > 0) {
        console.log(`[Sync] pending ${table}:`, perTable[table])
      }
    } catch (e) {
      perTable[table] = { created: 0, updated: 0, deleted: 0 }
    }
  }
  const elapsed = Date.now() - started
  if (elapsed > 1500) {
    console.warn(`[Sync] getPendingChangesDebug took ${elapsed}ms — JS thread was frozen this long (tables=${PENDING_TABLES.length})`)
  }
  return { total, perTable }
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

export async function debugSyncState(): Promise<any> {
  const net = await NetInfo.fetch().catch(() => ({ isConnected: null, type: 'unknown' } as any))
  let lastPulledAt: any = null
  try { lastPulledAt = await (database as any).adapter.getLocal('__watermelon_last_pulled_at') } catch {}
  let apiUrl = ''
  try { const { getApiUrl } = require('../lib/api'); apiUrl = getApiUrl() } catch {}
  const pending = await getPendingChangesDebug().catch(() => ({ total: -1, perTable: {} } as any))
  const info = { net: { isConnected: (net as any).isConnected, type: (net as any).type }, lastPulledAt, apiUrl, pending, lastSyncDebug: _lastSyncDebug, isSyncing: _isSyncing }
  console.log('[Sync] debugSyncState', JSON.stringify(info, null, 2))
  return info
}

export async function pushPendingOnly(): Promise<any> {
  // Bypass pull — directly push fetchLocalChanges (for when pull is blocked by 401/403 but push would succeed)
  const { default: fetchLocal } = await import('@nozbe/watermelondb/sync/impl/fetchLocal' as any).catch(() => ({ default: null } as any))
  let changes: any = null
  let affected: any[] = []
  if (fetchLocal) {
    try {
      const res: any = await (fetchLocal as any)(database as any)
      changes = res.changes
      affected = res.affectedRecords || []
    } catch (e) { console.warn('[Sync] pushPendingOnly fetchLocal failed', e) }
  }
  if (!changes) {
    // fallback: build from pending debug (created only)
    changes = {}
    for (const t of Object.keys((await getPendingChangesDebug()).perTable)) {
      try {
        const col: any = (database as any).get(t)
        const rows: any[] = await col.query().fetch()
        const created = rows.filter((r:any)=>r._raw?._status==='created').map((r:any)=>({...r._raw}))
        const updated = rows.filter((r:any)=>r._raw?._status==='updated').map((r:any)=>({...r._raw}))
        if (created.length || updated.length) changes[t] = { created, updated, deleted: [] }
      } catch {}
    }
  }
  const total = countChanges(changes)
  console.log('[Sync] pushPendingOnly firing total=', total, summarizeChanges(changes))
  if (total===0) return { applied: {}, errors: {}, note: 'no local changes' }
  const idempotencyKey = randomUUID()
  // Need lastPulledAt for backend shape (use current lastPulledAt)
  let lastPulledAt: any = null
  try { const v = await (database as any).adapter.getLocal('__watermelon_last_pulled_at'); lastPulledAt = v? parseInt(v,10): null } catch {}
  const res: any = await api.post(`/sync/push`, { changes, lastPulledAt }, { headers: { 'X-Idempotency-Key': idempotencyKey } })
  console.log('[Sync] pushPendingOnly result', res.status, res.data)
  const rejectedIds = extractRejectedIds(res)
  // mark as synced via Watermelon helper if push succeeded
  try {
    const { markLocalChangesAsSynced } = await import('@nozbe/watermelondb/sync/impl' as any)
    if (markLocalChangesAsSynced && affected.length) {
      await (markLocalChangesAsSynced as any)(database as any, { changes, affectedRecords: affected }, rejectedIds)
      console.log('[Sync] pushPendingOnly marked synced', rejectedIds ? `keeping rejected pending: ${JSON.stringify(rejectedIds)}` : '')
    }
  } catch (e) { console.warn('[Sync] markLocalChangesAsSynced failed — pending may remain until next full sync', e) }
  return res.data
}

export async function refreshFromRemote(): Promise<void> {
  // Pull-only refresh: fetch server state without pushing pending (useful when conflicts need discarding)
  // We achieve this by doing a normal sync but we clear pending _status via reset if user confirms
  // For now, just run full sync — Watermelon's pull will bring server changes and surface conflicts
  await syncNow()
}

// Mutex to avoid concurrent synchronize() which Watermelon aborts with "Concurrent synchronization" invariant
let _isSyncing = false
let _lastSyncDebug: any = null
export function getLastSyncDebug() { return _lastSyncDebug }

function countChanges(ch: any): number {
  if (!ch) return 0
  let n = 0
  for (const t of Object.keys(ch)) {
    const tc = ch[t] || {}
    n += (tc.created?.length || 0) + (tc.updated?.length || 0) + (tc.deleted?.length || 0)
  }
  return n
}
function summarizeChanges(ch: any): Record<string, { created: number; updated: number; deleted: number }> {
  const out: Record<string, any> = {}
  for (const t of Object.keys(ch || {})) {
    const tc = ch[t] || {}
    out[t] = { created: tc.created?.length || 0, updated: tc.updated?.length || 0, deleted: tc.deleted?.length || 0 }
  }
  return out
}

// WatermelonDB synchronize() wired to Brief §5 endpoints — single source of truth while offline is local SQLite
export async function syncNow(options?: { force?: boolean }) {
  if (_isSyncing) {
    console.log('[Sync] syncNow skipped — already syncing')
    return
  }
  // No session (auth screens, logged out) → skip before any local scan.
  // The pre-pull scans below run on the JS thread; without a session the
  // server round-trip 401s anyway, so this is pure UI freeze for zero benefit.
  if (!options?.force && !(await hasStoredSession())) {
    console.log('[Sync] syncNow skipped — no stored session (auth screen?)')
    return
  }
  _isSyncing = true
  const syncStart = Date.now()
  try {
  await repairCorruptedLocal()
  // Global _changed clean for ALL pending rows (prevents `schema.columns[col].type` crash on push/fetchLocalChanges)
  // Previous clean only touched IDs in pull — pending creates that never pulled (e.g. offline product deletes) stayed polluted.
  try {
    for (const tbl of PENDING_TABLES) {
      // Yield between tables so input/timers/buttons get a slice even on big DBs.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      try {
        const col: any = (database as any).collections?.get?.(tbl) || (database as any).get?.(tbl)
        if (!col) continue
        const tableSchema: any = (col as any).schema || (database as any).schema?.tables?.[tbl]
        if (!tableSchema) continue
        const knownCols = new Set<string>(['id'])
        try {
          const cols: any[] = tableSchema.columnArray || Object.values(tableSchema.columns || {})
          for (const c of cols) if (c?.name) knownCols.add(c.name)
        } catch {}
        try { for (const k of Object.keys(tableSchema.columns || {})) knownCols.add(k) } catch {}
        const all: any[] = await col.query().fetch().catch(() => [] as any[])
        for (const rec of all) {
          const raw = rec._raw
          if (!raw?._changed) continue
          const parts = String(raw._changed).split(',').map((s:string)=>s.trim()).filter(Boolean)
          if (!parts.length) continue
          const cleaned = parts.filter((p:string) => knownCols.has(p) && p !== 'undefined' && p !== 'null' && p !== '')
          if (cleaned.length !== parts.length) {
            console.warn(`[Sync] global clean _changed ${tbl}#${raw.id} ${JSON.stringify(parts)}→${JSON.stringify(cleaned)}`)
            try {
              await (database as any).write(async () => {
                await rec.update((r:any)=> { r._raw._changed = cleaned.join(',') })
              })
            } catch (e:any){ console.warn(`[Sync] global clean failed ${tbl}#${raw.id}`, e?.message) }
          }
        }
      } catch {}
    }
  } catch (e){ console.warn('[Sync] global _changed clean failed', (e as any)?.message) }
  // Pre-pull pending diagnostic
  try {
    const pre = await getPendingChangesDebug()
    if (pre.total > 0) console.log('[Sync] pre-pull pending', pre.perTable)
  } catch {}
  await synchronize({
    database: database as any,
    pullChanges: async ({ lastPulledAt, schemaVersion }) => {
      const since = lastPulledAt ? String(lastPulledAt) : '0'
      console.log('[Sync] pull start since=', since, 'schemaVersion=', schemaVersion)
      try {
        const res = await api.get(`/sync/pull`, { params: { since } })
        const data = res.data as any
        const changes = data.changes ?? data
        const remoteCount = countChanges(changes)
        console.log('[Sync] pull response timestamp=', data.timestamp, 'remoteCount=', remoteCount, 'tables=', Object.keys(changes ?? {}))
        // Fix for "Server wants client to create but already exists" — last sync partially executed.
        // If remote sends `created` for an id we already have as pending (_status='created'), Watermelon
        // will log diagnostic and try to update, but can hit `type` crash if schema mismatch. Pre-filter:
        // move overlapping ids from `created` → `updated` so applyRemote treats as update.
        try {
          for (const tbl of Object.keys(changes)) {
            const tc: any = (changes as any)[tbl]
            if (!tc?.created?.length) continue
            const col: any = (database as any).collections?.get?.(tbl) || (database as any).get?.(tbl)
            if (!col) continue
            const createdIds: string[] = tc.created.map((r: any) => r.id).filter(Boolean)
            if (!createdIds.length) continue
            // Fetch local raws for these ids
            try {
              const locals: any[] = await col.query(Q.where('id', Q.oneOf(createdIds))).fetch().catch(async () => {
                const all: any[] = await col.query().fetch()
                return all.filter((r: any) => createdIds.includes(r.id))
              })
              const existingIds = new Set(locals.map((r: any) => r.id))
              if (existingIds.size) {
                const keepCreated: any[] = []
                const moveToUpdated: any[] = []
                for (const r of tc.created) {
                  if (existingIds.has(r.id)) moveToUpdated.push(r)
                  else keepCreated.push(r)
                }
                if (moveToUpdated.length) {
                  console.log(`[Sync] pull dedup ${tbl}: moving ${moveToUpdated.length} ids from created→updated (already exists locally)`, moveToUpdated.map((r:any)=>r.id).slice(0,3))
                  tc.created = keepCreated
                  tc.updated = [...(tc.updated||[]), ...moveToUpdated]
                }
              }
            } catch {}
          }
        } catch (e) { console.warn('[Sync] pull dedup check failed', (e as any)?.message) }
        // Strip unknown columns + clean _changed to prevent `column.type` crash (§ Root cause: server sends tenant_id/payload/type etc not in local schema, or local _changed contains stale/undefined column names)
        try {
          const { sanitizedRaw } = await import('@nozbe/watermelondb/RawRecord')
          for (const tbl of Object.keys(changes)) {
            const col: any = (database as any).collections?.get?.(tbl) || (database as any).get?.(tbl)
            if (!col) {
              console.warn(`[Sync] pull contains unknown table ${tbl} — dropping (local schema missing). Keys:`, Object.keys((changes as any)[tbl]||{}))
              delete (changes as any)[tbl]
              continue
            }
            const tableSchema: any = (col as any).schema || (database as any).schema?.tables?.[tbl]
            if (!tableSchema) continue
            // Build set of known column names (snake_case) plus id
            const knownCols = new Set<string>(['id'])
            try {
              const cols: any[] = tableSchema.columnArray || Object.values(tableSchema.columns || {})
              for (const c of cols) if (c?.name) knownCols.add(c.name)
            } catch {}
            // Also include columns map keys fallback
            try {
              for (const k of Object.keys(tableSchema.columns || {})) knownCols.add(k)
            } catch {}
            for (const bucket of ['created', 'updated'] as const) {
              const arr: any[] = (changes as any)[tbl][bucket] || []
              if (!arr.length) continue
              const keep: any[] = []
              for (const raw of arr) {
                // Strip unknown keys before sanitizedRaw test — prevents `payload`, `tenant_id`, `provider_request_id` etc from polluting
                const stripped: any = { id: raw.id }
                for (const k of Object.keys(raw)) {
                  if (knownCols.has(k)) stripped[k] = raw[k]
                  else if (k === 'created_at' || k === 'updated_at') {
                    // ignore system fields — Watermelon generates them
                  } else {
                    // drop unknown column (e.g. tenant_id, payload, failure_code)
                  }
                }
                try {
                  sanitizedRaw(stripped, tableSchema)
                  keep.push(stripped)
                } catch (e: any) {
                  console.warn(`[Sync] dropping invalid raw ${tbl}#${raw.id} bucket=${bucket} keys=${Object.keys(raw).join(',')} strippedKeys=${Object.keys(stripped).join(',')} error=${e?.message} stack=${e?.stack}`)
                }
              }
              if (keep.length !== arr.length) {
                console.warn(`[Sync] filtered ${tbl}.${bucket} ${arr.length}→${keep.length} invalid records`)
                ;(changes as any)[tbl][bucket] = keep
              } else {
                // replace with stripped versions even when all pass, to ensure no unknown keys leak to applyRemote
                ;(changes as any)[tbl][bucket] = keep
              }
            }
          }
        } catch (e) { console.warn('[Sync] sanitize check failed', (e as any)?.message, (e as any)?.stack) }
        // Clean local _changed that may contain stale column names (e.g. `type`, `undefined`, `tenant_id`) which cause `schema.columns[col].type` crash in resolveConflict
        try {
          for (const tbl of Object.keys(changes)) {
            const col: any = (database as any).collections?.get?.(tbl) || (database as any).get?.(tbl)
            if (!col) continue
            const tableSchema: any = (col as any).schema || (database as any).schema?.tables?.[tbl]
            if (!tableSchema) continue
            const knownCols = new Set<string>()
            try {
              const cols: any[] = tableSchema.columnArray || Object.values(tableSchema.columns || {})
              for (const c of cols) if (c?.name) knownCols.add(c.name)
            } catch {}
            try {
              for (const k of Object.keys(tableSchema.columns || {})) knownCols.add(k)
            } catch {}
            // Fetch local raws for ids in this table's changes to clean their _changed before applyRemote runs
            const ids: string[] = [...((changes as any)[tbl].created||[]), ...((changes as any)[tbl].updated||[])].map((r:any)=>r.id).filter(Boolean)
            if (!ids.length) continue
            try {
              const locals: any[] = await col.query(Q.where('id', Q.oneOf(ids))).fetch().catch(async () => {
                const all: any[] = await col.query().fetch()
                return all.filter((r: any) => ids.includes(r.id))
              })
              for (const rec of locals) {
                const raw = rec._raw
                if (!raw?._changed) continue
                const parts = String(raw._changed).split(',').map((s:string)=>s.trim()).filter(Boolean)
                const cleaned = parts.filter((p:string) => knownCols.has(p))
                // also filter literal "undefined"/"null"/"" and "type" if not in schema
                const finalChanged = cleaned.filter((p:string) => p !== 'undefined' && p !== 'null' && p !== '')
                if (finalChanged.length !== parts.length) {
                  console.warn(`[Sync] cleaning _changed for ${tbl}#${raw.id} ${JSON.stringify(parts)}→${JSON.stringify(finalChanged)}`)
                  try {
                    await (database as any).write(async () => {
                      await rec.update((r: any) => {
                        // Watermelon stores _changed in _raw; we can mutate via update + direct _raw patch
                        // Use adapter-level raw update to avoid decorator type check
                        r._raw._changed = finalChanged.join(',')
                        if (!finalChanged.length && r._raw._status === 'updated') {
                          // if no valid changes remain, mark as synced to avoid loop
                          // keep status as updated so push still attempts? No, clear to prevent crash
                        }
                      })
                    })
                  } catch (e:any) { console.warn(`[Sync] failed to clean _changed for ${tbl}#${raw.id}`, e?.message) }
                }
              }
            } catch {}
          }
        } catch (e) { console.warn('[Sync] _changed cleaning failed', (e as any)?.message) }
        return {
          changes,
          timestamp: data.timestamp ?? Date.now(),
        }
      } catch (e: any) {
        console.warn('[Sync] pull failed', e?.message, e?.stack || String(e), 'status=', e?.response?.status, 'data=', e?.response?.data)
        throw e
      }
    },
    pushChanges: async ({ changes, lastPulledAt }) => {
      const summary = summarizeChanges(changes)
      const totalLocal = countChanges(changes)
      console.log('[Sync] push firing lastPulledAt=', lastPulledAt, 'localCount=', totalLocal, 'summary=', summary)
      // Extra verification: ensure _status==='created' sales actually present
      if (totalLocal === 0) {
        console.warn('[Sync] push called with 0 local changes — fetchLocal found nothing (check _status column). Pending debug follows')
        try {
          const dbg = await getPendingChangesDebug()
          console.warn('[Sync] pending debug at push time', dbg)
        } catch {}
      } else {
        // Log sample ids to correlate with backend errors
        for (const t of Object.keys(changes || {})) {
          const tc: any = (changes as any)[t]
          if (tc.created?.length) console.log(`[Sync] push ${t}.created ids=`, tc.created.slice(0,3).map((r:any)=>r.id))
          if (tc.updated?.length) console.log(`[Sync] push ${t}.updated ids=`, tc.updated.slice(0,3).map((r:any)=>r.id))
          if (tc.deleted?.length) console.log(`[Sync] push ${t}.deleted ids=`, tc.deleted.slice(0,3))
        }
      }
      // Per-batch idempotency key §2 (Do Not Substitute)
      const idempotencyKey = randomUUID()
      const res: any = await api.post(
        `/sync/push`,
        { changes, lastPulledAt },
        { headers: { 'X-Idempotency-Key': idempotencyKey } },
      )
      // Log push result applied/errors/conflicts for verification
      const pushData = (res?.data || res) as any
      const applied = pushData?.applied || pushData?.data?.applied
      const errors = pushData?.errors || pushData?.data?.errors
      const rejectedIds = extractRejectedIds(res)
      console.log('[Sync] push result status=', res.status, 'applied=', applied, 'errors=', errors, 'rejected=', rejectedIds, 'idempotencyKey=', idempotencyKey)
      if (errors && Object.keys(errors).length) {
        console.warn('[Sync] push errors — rejected records stay pending for retry', errors)
      }
      _lastSyncDebug = { pushApplied: applied, pushErrors: errors, pushTimestamp: Date.now() }
      // Persist server-reported conflicts to local `conflicts` table for badge + /sync-conflicts UI (§4)
      const conflicts = res?.data?.conflicts || res?.data?.data?.conflicts || []
      if (Array.isArray(conflicts) && conflicts.length) {
        console.log('[Sync] push conflicts=', conflicts)
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
                try { rec._raw.id = c.id || randomUUID() } catch {}
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
      }
      // Returning the rejected ids keeps those records pending for retry. Omitting this
      // makes WatermelonDB mark every pushed record as synced, including the ones the
      // server refused — which loses the change with no way to recover it.
      return { experimentalRejectedIds: rejectedIds }
    },
    // Version-counter conflict → conflicts table (§4), not last-write-wins (§10)
    // Watermelon calls this when local _changed row also changed remotely (incremental sync)
    // We must return a sanitized raw; returning `remote` directly causes `sanitizedRaw` to set _status='created'
    // and can trigger `type` crash. Return `resolved` (Watermelon's per-column merge) and persist push conflict separately.
    conflictResolver: (table, local, remote, resolved) => {
      console.warn('[Sync] conflict', table, local.id, {
        localSync: (local as any).sync_version ?? (local as any).syncVersion,
        remoteSync: (remote as any).sync_version ?? (remote as any).syncVersion,
        resolvedKeys: Object.keys(resolved || {}).slice(0,8),
        localChanged: (local as any)._changed,
      })
      // Defensive: strip resolved keys that don't exist in local schema to avoid `schema.columns[col].type` crash
      try {
        const col: any = (database as any).collections?.get?.(table) || (database as any).get?.(table)
        const tableSchema: any = (col as any)?.schema || (database as any).schema?.tables?.[table]
        if (tableSchema) {
          const known = new Set<string>(['id', '_status', '_changed'])
          try {
            const cols: any[] = tableSchema.columnArray || Object.values(tableSchema.columns || {})
            for (const c of cols) if (c?.name) known.add(c.name)
          } catch {}
          try { for (const k of Object.keys(tableSchema.columns || {})) known.add(k) } catch {}
          for (const k of Object.keys(resolved || {})) {
            if (!known.has(k)) {
              console.warn(`[Sync] conflictResolver stripping unknown key ${table}.${k}`)
              delete (resolved as any)[k]
            }
          }
          // also clean local _changed reference inside resolved if it contains unknown columns
          if ((resolved as any)._changed) {
            const parts = String((resolved as any)._changed).split(',').map((s:string)=>s.trim()).filter(Boolean)
            const cleaned = parts.filter((p:string) => known.has(p) && p !== 'undefined' && p !== 'null')
            if (cleaned.length !== parts.length) {
              console.warn(`[Sync] conflictResolver cleaning _changed ${JSON.stringify(parts)}→${JSON.stringify(cleaned)}`)
              ;(resolved as any)._changed = cleaned.join(',')
            }
          }
        }
      } catch {}
      // Keep Watermelon's resolved (local _changed wins) but ensure _status stays valid for apply
      return resolved
    },
    unsafeTurbo: false, // enable only for first login on empty DB per sketch §11
  })
  // Invalidate analytics so insights re-fetches fresh snapshot after sync applied sales/expenses
  try {
    // need global client — stored on window or import from lib; fallback to fetch trigger
    const { api: api2 } = await import('../lib/api').catch(()=>({api:null} as any))
    if (api2) {
      // best-effort refresh enqueue for week (server will delete stale snapshot and next GET recomputes)
      api2.post('/analytics/refresh', {}, { params: { timeframe: 'week' } }).catch(()=>{})
    }
  } catch {}
  // Post-sync pending verification
  try {
    const post = await getPendingChangesDebug()
    console.log(`[Sync] done in ${Date.now()-syncStart}ms post-pending total=`, post.total, post.perTable)
    _lastSyncDebug = { ...(_lastSyncDebug||{}), durationMs: Date.now()-syncStart, postPending: post }
  } catch {}
  } catch (e: any) {
    console.warn('[Sync] syncNow failed', e?.message, e?.stack || String(e), 'response=', e?.response?.data || e)
    _lastSyncDebug = { error: e?.message, stack: e?.stack, response: e?.response?.data, at: Date.now() }
    throw e
  } finally {
    _isSyncing = false
  }
}

// NetInfo + interval triggers per Brief §3.4 (reconnect + periodic 5-10min + manual pull-to-refresh)
// Plus initial hydration: if already online at startup, populate local DB immediately so offline works after
let intervalId: ReturnType<typeof setInterval> | null = null
// On flaky Wi-Fi NetInfo fires connect/disconnect flaps in bursts; each one
// used to launch a full syncNow (full-table JSI scans → frozen UI). Minimum
// gap between automatic reconnect syncs so a flap storm can't wedge the app.
const MIN_RECONNECT_SYNC_GAP_MS = 60 * 1000
let lastReconnectSyncAt = 0

export function startSyncEngine() {
  // Initial hydration on startup if already online — populates local storage for offline resume.
  // Skipped without a session (auth screens): syncNow self-skips, so check
  // first to avoid even the NetInfo round-trip cost on cold start.
  // Deferred past first paint: syncNow opens with full-table JSI scans on
  // the JS thread plus a WAN pull — running it during startup competes
  // directly with rendering the first screen. runAfterInteractions fires
  // once navigation transitions/animations settle (i.e. post-paint).
  const initialTask = InteractionManager.runAfterInteractions(() => {
    NetInfo.fetch().then((s) => {
      if (s.isConnected) {
        syncNow().catch((e: any) =>
          console.warn('[Sync] initial hydration failed', e?.message, e?.stack || String(e)),
        )
      }
    })
  })

  // On reconnect — immediate sync, debounced against flap storms.
  const unsub = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      const now = Date.now()
      if (now - lastReconnectSyncAt < MIN_RECONNECT_SYNC_GAP_MS) return
      lastReconnectSyncAt = now
      syncNow().catch((e: any) =>
        console.warn('[Sync] reconnect sync failed', e?.message, e?.stack || String(e)),
      )
    }
  })

  // Periodic while online (8 min — within 5-10 recommended)
  intervalId = setInterval(
    async () => {
      const s = await NetInfo.fetch()
      if (s.isConnected) {
        syncNow().catch((e: any) => console.warn('[Sync] interval sync failed', e?.message, e?.stack || String(e)))
      }
    },
    8 * 60 * 1000,
  )

  return () => {
    initialTask.cancel()
    unsub()
    if (intervalId) clearInterval(intervalId)
  }
}

// ── Conflict resolution workflow (fixes banner persisting after "Keep mine") ──────────
// Server's /sync/conflicts/:id/resolve with kept_client does ForceApplyClientPayload
// but local Watermelon still has _status='updated' + _changed and local `conflicts` row.
// Without clearing, getConflictsCount() keeps returning >0 and banner never disappears
// until resetLocalDatabase(). These helpers make the UX workflow seamless.

export async function getLocalConflicts(): Promise<any[]> {
  try {
    const col: any = (database as any).get('conflicts')
    const rows: any[] = await col.query().fetch()
    return rows.map((r: any) => ({
      id: r.id,
      table_name: r.tableName,
      record_id: r.recordId,
      client_payload: (() => { try { return JSON.parse(r.clientPayload) } catch { return r.clientPayload } })(),
      server_payload: (() => { try { return JSON.parse(r.serverPayload) } catch { return r.serverPayload } })(),
      client_version: r.clientVersion,
      server_version: r.serverVersion,
      _raw: r._raw,
    }))
  } catch { return [] }
  }

export async function deleteLocalConflict(conflictId: string): Promise<void> {
  try {
    const col: any = (database as any).get('conflicts')
    const rec: any = await col.find(conflictId)
    await (database as any).write(async () => { await rec.destroyPermanently() })
  } catch (e) { console.warn('[Sync] deleteLocalConflict failed', conflictId, (e as any)?.message) }
}

export async function resolveConflictLocally(
  conflict: { id: string; table_name: string; record_id: string; client_payload: any; server_payload: any; client_version: number; server_version: number },
  resolution: 'kept_client' | 'kept_server',
): Promise<void> {
  const table = conflict.table_name
  const recordId = conflict.record_id
  try {
    const col: any = (database as any).get(table)
    if (!col) {
      await deleteLocalConflict(conflict.id)
      return
    }
    const rec: any = await col.find(recordId).catch(() => null)
    if (!rec) {
      await deleteLocalConflict(conflict.id)
      return
    }
    if (resolution === 'kept_client') {
      // Client wins: server already ForceApplied, so mark local as synced with new version
      await (database as any).write(async () => {
        await rec.update((r: any) => {
          // Clear pending flag - technical bit in background
          r._raw._status = 'synced'
          r._raw._changed = ''
          // Bump sync_version to server's new version (server did +1)
          if (typeof r.syncVersion !== 'undefined') r.syncVersion = (conflict.server_version ?? 0) + 1
          else if (typeof r.sync_version !== 'undefined') r.sync_version = (conflict.server_version ?? 0) + 1
          else r._raw.sync_version = (conflict.server_version ?? 0) + 1
        })
      })
    } else {
      // Server wins: discard local changes, apply server payload
      const serverPayload: any = typeof conflict.server_payload === 'string' ? (()=>{try{return JSON.parse(conflict.server_payload as any)}catch{return {}}})() : (conflict.server_payload || {})
      await (database as any).write(async () => {
        await rec.update((r: any) => {
          // Apply server fields that exist in schema (snake_case raw keys)
          for (const [k, v] of Object.entries(serverPayload)) {
            if (k === 'id' || k === 'business_id' || k === 'tenant_id' || k === '_status' || k === '_changed') continue
            // Only set if column exists in schema to avoid type crash (defensive patch handles it anyway)
            const colSchema = (r.collection?.schema?.columns as any)?.[k]
            if (!colSchema && !(k in r._raw)) continue
            // Use _setRaw path for type safety, but fallback to direct _raw set
            try { r._raw[k] = v } catch { r._raw[k] = v }
          }
          r._raw._status = 'synced'
          r._raw._changed = ''
          if (typeof r.syncVersion !== 'undefined') r.syncVersion = serverPayload.sync_version ?? (conflict.server_version ?? 0) + 1
          else r._raw.sync_version = serverPayload.sync_version ?? (conflict.server_version ?? 0) + 1
        })
      })
    }
    await deleteLocalConflict(conflict.id)
  } catch (e) {
    console.warn('[Sync] resolveConflictLocally failed', table, recordId, (e as any)?.message)
    // Fallback: at least delete the conflict entry so banner clears
    await deleteLocalConflict(conflict.id).catch(()=>{})
  }
}

// Manual pull-to-refresh hook
export async function manualSync() {
  const s = await NetInfo.fetch()
  if (!s.isConnected)
    throw new Error('Offline — changes queued locally (pending)')
  return syncNow()
}
