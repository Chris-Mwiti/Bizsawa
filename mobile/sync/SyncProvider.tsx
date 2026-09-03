import React, { createContext, useContext, useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { syncNow, startSyncEngine } from './client'
import { useBusinessContext } from '../contexts/BusinessContext'

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
  let activeBusinessId: string | null = null
  try { activeBusinessId = (useBusinessContext() as any)?.activeBusinessId ?? null } catch { activeBusinessId = null }

  useEffect(() => {
    const stop = startSyncEngine()
    const unsub = NetInfo.addEventListener((s) => {
      setState(s.isConnected ? 'online' : 'offline')
      if (s.isConnected) {
        syncNow()
          .then(() => setLastSyncAt(Date.now()))
          .catch(() => {})
      }
    })
    NetInfo.fetch().then((s) => {
      setState(s.isConnected ? 'online' : 'offline')
      if (s.isConnected) {
        syncNow()
          .then(() => setLastSyncAt(Date.now()))
          .catch(() => {})
      }
    })
    return () => {
      stop()
      unsub()
    }
  }, [])

  // Also hydrate when business changes while already online (e.g. after login/selectBusiness)
  useEffect(() => {
    if (!activeBusinessId) return
    NetInfo.fetch().then((s) => {
      if (s.isConnected) {
        syncNow()
          .then(() => setLastSyncAt(Date.now()))
          .catch(() => {})
      }
    })
  }, [activeBusinessId])

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
