import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'

;(globalThis as any).__DEV__ = false

const { storage, asyncStorage } = vi.hoisted(() => {
  ;(globalThis as any).__DEV__ = false
  const storage = new Map<string, string>()
  const asyncStorage = {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key)
    }),
    multiGet: vi.fn(async (keys: string[]) =>
      keys.map((key) => [key, storage.get(key) ?? null]),
    ),
    multiSet: vi.fn(async (entries: [string, string][]) => {
      for (const [key, value] of entries) storage.set(key, value)
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) storage.delete(key)
    }),
  }
  return { storage, asyncStorage }
})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: asyncStorage,
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: undefined } } }))
vi.mock('expo-device', () => ({ isDevice: true }))
vi.mock('../deviceId', () => ({ getDeviceId: vi.fn(async () => 'test-device') }))

import {
  AUTH_STORAGE_KEYS,
  api,
  onSessionExpired,
  resetSessionExpired,
} from '../api'

function storeSession() {
  storage.set(AUTH_STORAGE_KEYS.accessToken, 'expired-access-token')
  storage.set(AUTH_STORAGE_KEYS.businessId, 'business-id')
}

describe('expired sessions', () => {
  beforeEach(() => {
    storage.clear()
    resetSessionExpired()
    api.defaults.adapter = async (config) => {
      throw new AxiosError(
        'Request failed with status code 401',
        'ERR_BAD_REQUEST',
        config,
        undefined,
        {
          data: { message: 'unauthorized' },
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
        },
      )
    }
  })

  it('emits once when an authenticated request cannot be refreshed', async () => {
    storeSession()
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)

    await expect(api.get('/businesses')).rejects.toBeTruthy()
    expect(listener).toHaveBeenCalledTimes(1)

    storeSession()
    await expect(api.get('/businesses')).rejects.toBeTruthy()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('ignores 401s from unauthenticated auth endpoints', async () => {
    storeSession()
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)

    await expect(api.post('/auth/login', {})).rejects.toBeTruthy()
    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('can emit again after the next successful sign-in', async () => {
    storeSession()
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)

    await expect(api.get('/businesses')).rejects.toBeTruthy()
    resetSessionExpired()
    storeSession()
    await expect(api.get('/businesses')).rejects.toBeTruthy()

    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
})
