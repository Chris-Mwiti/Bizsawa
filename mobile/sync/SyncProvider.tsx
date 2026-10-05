import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react'
import NetInfo from '@react-native-community/netinfo'
import { useRouter, usePathname } from 'expo-router'
import {
  syncNow,
  startSyncEngine,
  getPendingChangesCount,
  getConflictsCount,
  debugSyncState,
  pushPendingOnly,
} from './client'

type SyncState = 'online' | 'offline' | 'syncing' | 'conflict'

const Ctx = createContext<{
  state: SyncState
  lastSyncAt: number | null
  pendingCount: number
  conflictCount: number
  refreshCounts: () => Promise<void>
  trigger: () => Promise<void>
}>({
  state: 'offline',
  lastSyncAt: null,
  pendingCount: 0,
  conflictCount: 0,
  refreshCounts: async () => {},
  trigger: async () => {},
})

export const useSync = () => useContext(Ctx)

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SyncState>('offline')
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [conflictCount, setConflictCount] = useState(0)
  const router = (() => {
    try { return useRouter() } catch { return null as any }
  })()
  const pathname = (() => {
    try { return usePathname() } catch { return '' }
  })()
  const hasRedirectedRef = useRef(false)

  const refreshBusyRef = useRef(false)

  const refreshCounts = useCallback(async () => {
    // JSI SQLite calls run synchronously on the JS thread: a full 14-table
    // scan blocks input, timers and buttons for its whole duration. Never let
    // polls pile up — if one is in flight (slow device / big local DB), skip.
    if (refreshBusyRef.current) {
      console.log('[SyncProvider] refreshCounts skipped — previous still running')
      return
    }
    refreshBusyRef.current = true
    try {
      const [pending, conflicts] = await Promise.all([
        getPendingChangesCount(),
        getConflictsCount(),
      ])
      setPendingCount(pending)
      setConflictCount(conflicts)
      if (pending > 0) console.log('[SyncProvider] pending=', pending, 'conflicts=', conflicts)
      if (conflicts > 0) setState((s) => (s === 'syncing' ? 'conflict' : 'conflict'))
    } catch (e) { console.warn('[SyncProvider] refreshCounts failed', (e as any)?.message) }
    finally {
      refreshBusyRef.current = false
    }
  }, [])

  // Auto-redirect to /sync-conflicts when conflicts appear (existing screen was never reached)
  useEffect(() => {
    if (conflictCount > 0 && router && pathname !== '/sync-conflicts') {
      // avoid spamming: only once per conflict batch
      if (!hasRedirectedRef.current) {
        hasRedirectedRef.current = true
        // slight delay to avoid navigation during render
        setTimeout(() => {
          try { router.push('/sync-conflicts' as any) } catch {}
        }, 600)
      }
    }
    if (conflictCount === 0) hasRedirectedRef.current = false
  }, [conflictCount, router, pathname])

  // Auto-push when pending appears while online (covers interval gap + import().then syncNow race)
  const autoPushRef = useRef<number>(0)
  useEffect(() => {
    if (pendingCount > 0 && state === 'online') {
      const now = Date.now()
      if (now - autoPushRef.current < 10000) return // debounce 10s
      autoPushRef.current = now
      console.log('[SyncProvider] autoPush pending=', pendingCount)
      syncNow().then(() => refreshCounts()).catch(async (e) => {
        console.warn('[SyncProvider] autoPush syncNow failed', (e as any)?.message, '— trying pushPendingOnly fallback')
        try {
          const net = await (await import('@react-native-community/netinfo')).default.fetch()
          if ((net as any).isConnected) {
            await debugSyncState()
            await pushPendingOnly()
            await refreshCounts()
          }
        } catch (e2) { console.warn('[SyncProvider] pushPendingOnly failed', (e2 as any)?.message) }
      })
    }
  }, [pendingCount, state, refreshCounts])

  useEffect(() => {
    const stop = startSyncEngine()
    const unsub = NetInfo.addEventListener((s) =>
      setState(s.isConnected ? 'online' : 'offline'),
    )
    // initial counts + poll while mounted. 60s: counts drive a badge, and each
    // poll is JSI SQLite work on the JS thread — 15s polling kept the thread
    // busy enough to freeze typing on slower devices.
    refreshCounts()
    const id = setInterval(refreshCounts, 60000)
    // expose manual debug trigger globally for console: globalThis.__bizSyncDebug = ...
    try { (globalThis as any).__bizSyncDebug = debugSyncState; (globalThis as any).__bizPushPending = pushPendingOnly } catch {}
    return () => {
      stop()
      unsub()
      clearInterval(id)
    }
  }, [refreshCounts])

  const trigger = async () => {
    setState('syncing')
    try {
      await syncNow()
      setLastSyncAt(Date.now())
      setState('online')
      await refreshCounts()
    } catch (e) {
      setState('offline')
      throw e
    }
  }

  return (
    <Ctx.Provider
      value={{
        state,
        lastSyncAt,
        pendingCount,
        conflictCount,
        refreshCounts,
        trigger,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
