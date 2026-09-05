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

  const refreshCounts = useCallback(async () => {
    try {
      const [pending, conflicts] = await Promise.all([
        getPendingChangesCount(),
        getConflictsCount(),
      ])
      setPendingCount(pending)
      setConflictCount(conflicts)
      if (conflicts > 0) setState((s) => (s === 'syncing' ? 'conflict' : 'conflict'))
    } catch {}
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

  useEffect(() => {
    const stop = startSyncEngine()
    const unsub = NetInfo.addEventListener((s) =>
      setState(s.isConnected ? 'online' : 'offline'),
    )
    // initial counts + poll every 15s while mounted
    refreshCounts()
    const id = setInterval(refreshCounts, 15000)
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
