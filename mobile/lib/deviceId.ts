// Stable per-install device identity for sync conflict attribution.
// Generated once (UUID), persisted in secure storage, and sent on every
// /sync/push so the server can tell "same device edited again"
// (last-write-wins, no conflict) from "another device edited"
// (version conflict → user chooses). Survives app updates; resets on
// reinstall or data wipe — which correctly looks like a new device.

import { randomUUID } from 'expo-crypto'
import { secureStorage } from './secureStorage'

const DEVICE_ID_KEY = 'bizsawa_device_id'

let cached: string | null = null

export async function getDeviceId(): Promise<string> {
  if (cached) return cached
  try {
    const existing = await secureStorage.getSecure(DEVICE_ID_KEY)
    if (existing) {
      cached = existing
      return existing
    }
  } catch {}
  const fresh = randomUUID()
  try {
    await secureStorage.setSecure(DEVICE_ID_KEY, fresh)
  } catch {}
  cached = fresh
  return fresh
}

/** Test seam: reset the in-memory cache (storage itself is untouched). */
export function __resetDeviceIdCache(): void {
  cached = null
}
