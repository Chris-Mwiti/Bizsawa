import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({
  randomUUID: () => '11111111-2222-4333-8444-555555555555',
}))

vi.mock('../secureStorage', () => {
  let store = ''
  return {
    secureStorage: {
      getSecure: vi.fn(async () => store || null),
      setSecure: vi.fn(async ( _k: string, v: string) => {
        store = v
      }),
    },
  }
})

import { __resetDeviceIdCache, getDeviceId } from '../deviceId'

beforeEach(() => {
  __resetDeviceIdCache()
})

describe('getDeviceId', () => {
  it('generates a stable UUID across calls', async () => {
    const a = await getDeviceId()
    const b = await getDeviceId()
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
