import { beforeEach, describe, expect, it, vi } from 'vitest'

// `__DEV__` is a global Expo/React Native defines; provide it for the unit run.
;(globalThis as any).__DEV__ = true

// The web build must never bake a stale host-local IP into the bundle: the
// browser knows which host served the app, so the API host is derived from
// window.location instead of EXPO_PUBLIC_API_URL (a DHCP-bound LAN address).
const { platform } = vi.hoisted(() => ({
  platform: { OS: 'web' as 'web' | 'ios' | 'android' },
}))

vi.mock('react-native', () => ({
  Platform: platform,
}))

vi.mock('expo-constants', () => ({
  default: { expoConfig: { hostUri: '192.168.100.35:8081' } },
}))

vi.mock('expo-device', () => ({ isDevice: true }))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { multiSet: vi.fn(async () => {}), getItem: vi.fn(async () => null) },
}))

import { getApiUrl } from '../api'

function setLocation(hostname: string | null) {
  if (hostname === null) {
    // @ts-expect-error — simulate a non-browser environment
    delete globalThis.window
    return
  }
  // @ts-expect-error — minimal window stand-in
  globalThis.window = { location: { hostname } }
}

describe('getApiUrl on web', () => {
  beforeEach(() => {
    platform.OS = 'web'
    setLocation('localhost')
    delete process.env.EXPO_PUBLIC_WEB_API_URL
    delete process.env.EXPO_PUBLIC_API_URL
  })

  it('derives the API host from the browser location when no env is set', () => {
    setLocation('localhost')
    expect(getApiUrl()).toBe('http://localhost:5504')
  })

  it('uses the LAN host when the page was opened over the LAN', () => {
    setLocation('192.168.100.35')
    expect(getApiUrl()).toBe('http://192.168.100.35:5504')
  })

  it('ignores a stale host-local EXPO_PUBLIC_API_URL and uses the browser host', () => {
    // The DHCP lease moved: the env still points at the old address.
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.100.7:5504/api/v1'
    setLocation('localhost')
    expect(getApiUrl()).toBe('http://localhost:5504')
  })

  it('ignores a stale loopback EXPO_PUBLIC_API_URL on web', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:5504/api/v1'
    setLocation('192.168.100.35')
    expect(getApiUrl()).toBe('http://192.168.100.35:5504')
  })

  it('keeps a public deployment URL from EXPO_PUBLIC_API_URL', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.bizsawa.chrismwiti.me/api/v1'
    setLocation('localhost')
    expect(getApiUrl()).toBe('https://api.bizsawa.chrismwiti.me/api/v1')
  })

  it('lets EXPO_PUBLIC_WEB_API_URL override everything', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.bizsawa.chrismwiti.me/api/v1'
    process.env.EXPO_PUBLIC_WEB_API_URL = 'https://staging.example.com/api/v1'
    setLocation('localhost')
    expect(getApiUrl()).toBe('https://staging.example.com/api/v1')
  })

  it('falls back to localhost when there is no browser location', () => {
    setLocation(null)
    expect(getApiUrl()).toBe('http://localhost:5504')
  })
})

describe('getApiUrl on native', () => {
  beforeEach(() => {
    platform.OS = 'android'
    setLocation('localhost')
    delete process.env.EXPO_PUBLIC_WEB_API_URL
    delete process.env.EXPO_PUBLIC_API_URL
  })

  it('still honours EXPO_PUBLIC_API_URL (the LAN IP for physical devices)', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.100.35:5504/api/v1'
    expect(getApiUrl()).toBe('http://192.168.100.35:5504/api/v1')
  })

  it('ignores EXPO_PUBLIC_WEB_API_URL on native', () => {
    process.env.EXPO_PUBLIC_WEB_API_URL = 'https://staging.example.com/api/v1'
    expect(getApiUrl()).not.toContain('staging.example.com')
  })
})
