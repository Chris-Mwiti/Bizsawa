import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import NetInfo from '@react-native-community/netinfo'
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

  const refreshCounts = useCallback(async () => {
    try {
      const [pending, conflicts] = await Promise.all([
        getPendingChangesCount(),
        getConflictsCount(),
      ])
      setPendingCount(pending)
      setConflictCount(conflicts)
      if (conflicts > 0) setState((s) => (s === 'syncing' ? 'conflict' : s))
    } catch {}
  }, [])

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
