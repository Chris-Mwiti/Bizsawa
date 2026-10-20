// Wires the stubs into the real app modules for every sync-client test.
import 'fake-indexeddb/auto'
import axios from 'axios'
import { vi } from 'vitest'
import { ctx } from './stubs/context'
import { AsyncStorage, ExpoCrypto, NetInfo, ReactNative } from './stubs/modules'

vi.mock('react-native', () => ReactNative)
vi.mock('@react-native-community/netinfo', () => ({ default: NetInfo }))
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: AsyncStorage,
}))
vi.mock('expo-crypto', () => ExpoCrypto)

// db/database.ts builds the native SQLite singleton; the client and stockOps
// must instead use whichever device database is current.
vi.mock('../../db/database', () => ({
  get database() {
    return ctx().db
  },
}))

vi.mock('../../lib/deviceId', () => ({
  getDeviceId: async () => ctx().deviceId,
}))

vi.mock('../../lib/perf', () => {
  const span = { end: () => {} }
  return {
    perf: { start: () => span, mark: () => {}, measure: () => {} },
    nowMs: () => Date.now(),
  }
})

vi.mock('../../lib/api', () => {
  const api = axios.create({ timeout: 15_000 })
  api.interceptors.request.use((config) => {
    const c = ctx()
    // Offline = the request never leaves the device, like a phone in airplane mode.
    if (!c.online)
      return Promise.reject(
        Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }),
      )
    config.baseURL = c.apiUrl
    config.headers.set('Authorization', `Bearer ${c.token}`)
    config.headers.set('X-Business-ID', c.businessId)
    config.headers.set('X-Device-Id', c.deviceId)
    return config
  })
  api.interceptors.response.use((res) => {
    const c = ctx()
    if (c.dropNextPushResponse && res.config.url?.includes('/sync/push')) {
      c.dropNextPushResponse = false
      // The server already committed; the phone only sees a dead socket.
      return Promise.reject(
        Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      )
    }
    return res
  })
  return {
    api,
    getApiUrl: () => ctx().apiUrl,
    AUTH_STORAGE_KEYS: {
      accessToken: 'bizsawa_access_token',
      refreshToken: 'bizsawa_refresh_token',
      legacyToken: 'bizsawa_token',
      userId: 'bizsawa_user_id',
      businessId: 'bizsawa_business_id',
    },
  }
})

// The app imports sync/client at startup (SyncProvider), which installs its
// defensive Model._setRaw patch before any write. Mirror that ordering.
await import('../../sync/client')
