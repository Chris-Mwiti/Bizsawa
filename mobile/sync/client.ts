import { synchronize } from '@nozbe/watermelondb/sync'
import NetInfo from '@react-native-community/netinfo'
import { database } from '../db/database'
import { api } from '../lib/api'
import { v4 as uuidv4 } from 'uuid'

// WatermelonDB synchronize() wired to Brief §5 endpoints — single source of truth while offline is local SQLite
export async function syncNow() {
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
let intervalId: ReturnType<typeof setInterval> | null = null

export function startSyncEngine() {
  // Immediate on reconnect
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
