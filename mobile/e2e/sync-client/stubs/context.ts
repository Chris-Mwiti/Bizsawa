// The "current device" the real sync/client.ts and db/stockOps.ts act on.
// Their module-level imports (database, api, deviceId) are stubbed to read
// from here, so several AppDevices can share one module instance as long as
// they take turns (AppDevice.run serialises access).
import type { Database } from '@nozbe/watermelondb'

export interface DeviceContext {
  db: Database
  apiUrl: string
  token: string
  businessId: string
  deviceId: string
  storage: Map<string, string>
  online: boolean
  /** Simulate a response lost after the server committed (dropped connection). */
  dropNextPushResponse: boolean
}

let current: DeviceContext | null = null

export function setContext(ctx: DeviceContext | null) {
  current = ctx
}

export function ctx(): DeviceContext {
  if (!current) throw new Error('no device context — use AppDevice.run()')
  return current
}
