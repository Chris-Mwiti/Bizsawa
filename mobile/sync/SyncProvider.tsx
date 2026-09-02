import React, { createContext, useContext, useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { syncNow, startSyncEngine } from './client'

type SyncState = 'online' | 'offline' | 'syncing' | 'conflict'

const Ctx = createContext<{ state: SyncState; lastSyncAt: number | null; trigger: () => Promise<void> }>({
  state: 'offline',
  lastSyncAt: null,
  trigger: async () => {},
})

export const useSync = () => useContext(Ctx)

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SyncState>('offline')
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)

  useEffect(() => {
    const stop = startSyncEngine()
    const unsub = NetInfo.addEventListener((s) => setState(s.isConnected ? 'online' : 'offline'))
    // wrap syncNow to track state
    const originalSync = syncNow
    // hook into sync lifecycle via monkey patch? keep simple: poll lastSyncAt on interval
    return () => {
      stop()
      unsub()
    }
  }, [])

  const trigger = async () => {
    setState('syncing')
    try {
      await syncNow()
      setLastSyncAt(Date.now())
      setState('online')
    } catch (e) {
      setState('offline')
      throw e
    }
  }

  return <Ctx.Provider value={{ state, lastSyncAt, trigger }}>{children}</Ctx.Provider>
}
