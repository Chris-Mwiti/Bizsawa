import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { CommonPowerSyncDatabase } from '@powersync/common'
import { PowerSyncContext } from '@powersync/react'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { ApiPowerSyncConnector } from './connector'
import { isPowerSyncEnabledForPlatform } from './config'
import { getPowerSyncDatabase } from './database'
import { migrateWatermelonToPowerSync } from './migrate'

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const enabled = isPowerSyncEnabledForPlatform()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { activeBusinessId } = useBusinessContext()
  const [database, setDatabase] = useState<CommonPowerSyncDatabase | null>(null)
  const databaseRef = useRef<CommonPowerSyncDatabase | null>(null)
  const lastBusinessIdRef = useRef<string | null>(null)
  const [migrationReady, setMigrationReady] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setMigrationReady(false)
      return
    }
    if (authLoading) return
    if (!isAuthenticated) {
      setMigrationReady(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        await migrateWatermelonToPowerSync()
      } catch {}
      if (!cancelled) setMigrationReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, authLoading, isAuthenticated])

  useEffect(() => {
    if (!enabled) {
      setDatabase(null)
      return
    }

    if (authLoading) return

    if (!isAuthenticated) {
      setDatabase(null)
      lastBusinessIdRef.current = null
      void databaseRef.current?.disconnectAndClear().catch(() => {})
      return
    }

    if (!activeBusinessId) return

    // Migration (if any pending WatermelonDB rows) runs before connect so local
    // changes upload first; PowerSync then downloads canonical server state.
    if (!migrationReady) return

    const db = databaseRef.current ?? getPowerSyncDatabase()
    databaseRef.current = db
    setDatabase(db)

    let cancelled = false

    const connect = async () => {
      try {
        if (
          lastBusinessIdRef.current &&
          lastBusinessIdRef.current !== activeBusinessId
        ) {
          await db.disconnectAndClear()
        }
        if (cancelled) return
        lastBusinessIdRef.current = activeBusinessId
        await db.connect(new ApiPowerSyncConnector())
      } catch (error) {
        if (!cancelled) {
          console.warn('[PowerSync] connection failed', error)
        }
      }
    }

    void connect()

    return () => {
      cancelled = true
    }
  }, [enabled, authLoading, isAuthenticated, activeBusinessId, migrationReady])

  useEffect(() => {
    return () => {
      void databaseRef.current?.disconnect().catch(() => {})
    }
  }, [])

  return (
    <PowerSyncContext.Provider value={database}>
      {children}
    </PowerSyncContext.Provider>
  )
}
