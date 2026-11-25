import { Platform } from 'react-native'

export const isPowerSyncEnabled = () =>
  process.env.EXPO_PUBLIC_POWERSYNC_ENABLED === 'true'

export const isNativePowerSyncEnabled = () =>
  Platform.OS !== 'web' &&
  process.env.EXPO_PUBLIC_POWERSYNC_NATIVE_ENABLED === 'true'

export const isPowerSyncEnabledForPlatform = () =>
  Platform.OS === 'web' ? isPowerSyncEnabled() : isNativePowerSyncEnabled()

export const getPowerSyncUrlOverride = () =>
  process.env.EXPO_PUBLIC_POWERSYNC_URL?.trim() || null

/** On web, if the token returns a localhost PowerSync URL but the browser
 *  is served from a LAN host, derive a reachable URL from the browser host.
 *  Static prod URLs are returned unchanged. */
export const normalizePowerSyncUrlForWeb = (url: string | null): string | null => {
  if (!url || Platform.OS !== 'web' || typeof window === 'undefined') return url
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      const browserHost = window.location.hostname
      if (browserHost) {
        parsed.hostname = browserHost
        return parsed.toString().replace(/\/$/, '')
      }
    }
  } catch {}
  return url
}
