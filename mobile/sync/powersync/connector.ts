import type {
  CommonPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/common'
import { api } from '../../lib/api'
import {
  getPowerSyncUrlOverride,
  normalizePowerSyncUrlForWeb,
} from './config'

interface PowerSyncTokenResponse {
  token: string
  expires_at?: string
  powersync_url: string
}

interface TableChanges {
  created: any[]
  updated: any[]
  deleted: string[]
}

interface PushRequest {
  changes: Record<string, TableChanges>
  device_id: string
}

interface PushResponse {
  applied?: Record<string, string[]>
  conflicts?: any[]
  errors?: Record<string, string[]>
  rejected?: Record<string, string[]>
  lww_applied?: Record<string, string[]>
}

let uploading = false

export class ApiPowerSyncConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const response = await api.post<PowerSyncTokenResponse>('/powersync/token')
    const endpoint =
      getPowerSyncUrlOverride() ||
      normalizePowerSyncUrlForWeb(response.data.powersync_url?.replace(/\/$/, ''))

    if (!endpoint || !response.data.token) {
      throw new Error('PowerSync credentials unavailable')
    }

    return {
      endpoint,
      token: response.data.token,
      expiresAt: response.data.expires_at
        ? new Date(response.data.expires_at)
        : undefined,
    }
  }

  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    if (uploading) return
    uploading = true
    try {
      const deviceId = await database.getClientId()
      while (true) {
        const tx = await database.getNextCrudTransaction()
        if (!tx) break
        const push = buildPushRequest(tx.crud, deviceId)
        const response = await api.post<PushResponse>('/sync/push', push)
        const body = response.data ?? {}
        if (body.conflicts?.length) {
          console.warn('[PowerSync] upload conflicts', body.conflicts)
        }
        if (body.rejected) {
          console.warn('[PowerSync] upload rejected', body.rejected)
        }
        if (body.errors) {
          console.warn('[PowerSync] upload errors', body.errors)
        }
        await tx.complete()
      }
    } finally {
      uploading = false
    }
  }
}

function buildPushRequest(
  crud: CrudEntry[],
  deviceId: string
): PushRequest {
  const changes: Record<string, TableChanges> = {}
  for (const entry of crud) {
    let bucket = changes[entry.table]
    if (!bucket) {
      bucket = { created: [], updated: [], deleted: [] }
      changes[entry.table] = bucket
    }
    if (entry.op === 'PUT') {
      bucket.created.push(entry.opData ?? { id: entry.id })
    } else if (entry.op === 'PATCH') {
      bucket.updated.push({ id: entry.id, ...(entry.opData ?? {}) })
    } else if (entry.op === 'DELETE') {
      bucket.deleted.push(entry.id)
    }
  }
  return { changes, device_id: deviceId }
}
