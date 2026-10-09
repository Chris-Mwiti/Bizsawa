import axios, { AxiosError } from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import type { AuthResponse } from './api-dtos'
import { perf } from './perf'

/** Config key carrying the in-flight perf span (never sent over the wire). */
const PERF_SPAN_KEY = '__perfSpan'

function spanNameFor(config: { method?: string; url?: string }): string {
  // Strip query params: /products?limit=5 and /products share one stat row.
  const path = (config.url || 'unknown').split('?')[0]
  return `http.${(config.method || 'GET').toUpperCase()} ${path}`
}

const DEFAULT_API_PORT = 5504

export const AUTH_STORAGE_KEYS = {
  accessToken: 'bizsawa_access_token',
  refreshToken: 'bizsawa_refresh_token',
  legacyToken: 'bizsawa_token',
  userId: 'bizsawa_user_id',
  userData: 'bizsawa_userdata',
  businessId: 'bizsawa_business_id',
  business: 'bizsawa_business',
  role: 'bizsawa_role',
}

function parseHostFromHostUri(hostUri: string | undefined): string | null {
  if (!hostUri?.trim()) return null
  const host = hostUri.split(':')[0]
  return host || null
}

function getExpoDevHost(): string | null {
  return parseHostFromHostUri(Constants.expoConfig?.hostUri)
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function isLoopbackHost(host: string | null): boolean {
  return !!host && LOOPBACK_HOSTS.has(host.trim().toLowerCase())
}

export function getApiUrl(): string {
  const envUrl = (process.env.EXPO_PUBLIC_API_URL as string)?.trim()
  if (envUrl) return envUrl.replace(/\/$/, '')

  if (Platform.OS === 'web') return `http://localhost:${DEFAULT_API_PORT}`

  const expoHost = getExpoDevHost()

  if (__DEV__ && isLoopbackHost(expoHost)) {
    console.warn(
      `[api] Expo dev host is "${expoHost}" (Metro reached over adb reverse), so the API would be ` +
        `resolved against this device's own loopback and every request will fail with "Network Error". ` +
        `Run "bun run android:lan" (resolves the host LAN IP + sets adb reverse automatically), ` +
        `or set EXPO_PUBLIC_API_URL to the host's LAN IP (./scripts/resolve-lan-ip.sh) in .env.development, ` +
        `or run: adb reverse tcp:${DEFAULT_API_PORT} tcp:${DEFAULT_API_PORT}`,
    )
  }

  if (Platform.OS === 'android') {
    if (!Device.isDevice) return `http://10.0.2.2:${DEFAULT_API_PORT}`
    if (expoHost) return `http://${expoHost}:${DEFAULT_API_PORT}`
  }
  if (Platform.OS === 'ios') {
    if (!Device.isDevice) return `http://localhost:${DEFAULT_API_PORT}`
    if (expoHost) return `http://${expoHost}:${DEFAULT_API_PORT}`
  }
  if (expoHost) return `http://${expoHost}:${DEFAULT_API_PORT}`

  if (__DEV__) {
    console.warn(
      `[api] EXPO_PUBLIC_API_URL unset and Expo hostUri missing; API calls may fail. ENV=${(process.env.EXPO_PUBLIC_ENV as string) || (__DEV__?'development':'production')}`,
    )
  }
  return `http://localhost:${DEFAULT_API_PORT}`
}

function withApiPrefix(hostRoot: string): string {
  const trimmed = hostRoot.replace(/\/+$/, '')
  if (trimmed.endsWith('/api/v1')) return trimmed
  if (trimmed.endsWith('/api')) return `${trimmed}/v1`
  return `${trimmed}/api/v1`
}

const apiRoot = withApiPrefix(getApiUrl())

export const api = axios.create({
  baseURL: apiRoot,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

export async function persistAuthResponse(data: AuthResponse): Promise<void> {
  await AsyncStorage.multiSet([
    [AUTH_STORAGE_KEYS.accessToken, data.accessToken],
    [AUTH_STORAGE_KEYS.refreshToken, data.refreshToken],
    [AUTH_STORAGE_KEYS.userId, data.userId],
  ])
  await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.legacyToken)
  primeAuthCache({ token: data.accessToken })
  // Also mirror to SecureStore for offline
  try {
    const { persistSecureAuth } = await import('./secureStorage')
    await persistSecureAuth({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      userId: data.userId,
    })
  } catch {}
}

export async function clearAuthStorage(): Promise<void> {
  invalidateAuthCache()
  await AsyncStorage.multiRemove([
    AUTH_STORAGE_KEYS.accessToken,
    AUTH_STORAGE_KEYS.refreshToken,
    AUTH_STORAGE_KEYS.legacyToken,
    AUTH_STORAGE_KEYS.userId,
    AUTH_STORAGE_KEYS.userData,
    AUTH_STORAGE_KEYS.businessId,
    AUTH_STORAGE_KEYS.business,
    AUTH_STORAGE_KEYS.role,
  ])
  try {
    const { clearSecureAuth } = await import('./secureStorage')
    await clearSecureAuth()
  } catch {}
}


let refreshPromise: Promise<string | null> | null = null

// In-memory auth header cache. The request interceptor used to perform 3
// sequential AsyncStorage reads (3 bridge round-trips) on EVERY request —
// with 3-6 queries per tab that was 9-18 round-trips per navigation. Now the
// first request reads once via multiGet and every later request is free.
// Any storage write in this module keeps the cache coherent; business
// switches call primeAuthCache (see AuthContext.setSelectedBusinessAuth).
interface CachedAuth {
  token: string | null
  businessId: string | null
}
let cachedAuth: CachedAuth | null = null

export function primeAuthCache(patch: Partial<CachedAuth>): void {
  cachedAuth = { token: null, businessId: null, ...cachedAuth, ...patch }
}

export function invalidateAuthCache(): void {
  cachedAuth = null
}

async function readStoredAuth(): Promise<CachedAuth> {
  if (cachedAuth) return cachedAuth
  // One bridge round-trip for all three keys (was: 3 sequential getItem).
  const rows = await AsyncStorage.multiGet([
    AUTH_STORAGE_KEYS.accessToken,
    AUTH_STORAGE_KEYS.legacyToken,
    AUTH_STORAGE_KEYS.businessId,
  ])
  const byKey = new Map(rows.map(([k, v]) => [k, v]))
  const token =
    byKey.get(AUTH_STORAGE_KEYS.accessToken) ||
    byKey.get(AUTH_STORAGE_KEYS.legacyToken) ||
    null
  const rawBiz = byKey.get(AUTH_STORAGE_KEYS.businessId)
  cachedAuth = {
    token,
    businessId: rawBiz?.trim() ? (rawBiz as string).trim() : null,
  }
  return cachedAuth
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await AsyncStorage.getItem(
        AUTH_STORAGE_KEYS.refreshToken,
      )
      if (!refreshToken) return null
      const response = await axios.post<AuthResponse>(
        `${apiRoot}/auth/refresh`,
        { refreshToken },
      )
      await persistAuthResponse(response.data)
      return response.data.accessToken
    })().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

api.interceptors.request.use(
  async (config) => {
    const { token, businessId } = await readStoredAuth()

    // Tracing: one span per request (method + path, no query) — ends in the
    // response/error interceptor below with the status attached.
    ;(config as any)[PERF_SPAN_KEY] = perf.start(spanNameFor(config), {
      phase: 'http',
    })

    config.headers = config.headers || {}
    if (token) config.headers.Authorization = `Bearer ${token}`
    if (businessId) {
      config.headers['X-Business-ID'] = businessId
      // lower-case mirror for proxies that normalize
      ;(config.headers as any)['x-business-id'] = businessId
      // Fallback: also send as query ?businessId= so TenantResolution can read it even if header stripped by CORS/proxy
      // TenantResolution checks URLParam + header; we extend to query param below
      // attach as param only for analytics/sales/expenses where business context is required
      // keep existing params intact
      ;(config.params as any) = { ...(config.params as any) }
      // do not overwrite explicit businessId param
      if (
        !(config.params as any).businessId &&
        !(config.params as any).business_id
      ) {
        ;(config.params as any).businessId = businessId
      }
    } else {
      // Only warn for tenant-scoped routes; auth/OTP & public routes don't need business context
      const url = config.url || ''
      const isAuthOrPublic = url.includes('/auth/') || url.includes('/public') || url.includes('/health') || url.includes('/status')
      if (!isAuthOrPublic) {
        console.warn(
          '[api] X-Business-ID missing — BusinessContext not hydrated, analytics will 403 if queried',
        )
      }
    }

    // Verbose per-request logging crosses the native bridge on every call —
    // dev only. (The missing-business warning below stays: it fires rarely
    // and signals a real tenant-scoping bug.)
    if (__DEV__) {
      console.debug(
        'API Request:',
        config.method?.toUpperCase(),
        config.url,
        config.baseURL,
        'biz:',
        businessId ? `${businessId.slice(0, 8)}…` : 'none',
        'headers:',
        businessId ? { 'X-Business-ID': `${businessId.slice(0, 8)}…` } : {},
        'params:',
        config.params,
      )
    }
    return config
  },
  (error) => Promise.reject(error),
)

export interface ApiError extends AxiosError {
  friendlyMessage?: string
}

export function standardizeApiError(error: any): string {
  if (error.response) {
    const status = error.response.status
    const data = error.response.data
    if (status === 401) return 'Session expired. Please log in again.'
    if (status === 403) return "You don't have permission to do this."
    if (status === 404) return 'The requested information was not found.'
    if (status >= 500)
      return 'Something went wrong on our end. Please try again in a moment.'

    const message = data?.message || data?.error?.message || data?.error
    if (message && typeof message === 'string') {
      if (
        message.includes('Prisma') ||
        message.includes('database') ||
        message.includes('invocation')
      ) {
        return 'A database error occurred. Please try again.'
      }
      return message
    }
  } else if (error.request) {
    return 'Connection failed. Please check your internet and try again.'
  }
  return 'An unexpected error occurred. Please try again.'
}

api.interceptors.response.use(
  (response) => {
    if (__DEV__) console.log('API Response:', response.status, response.config.url)
    ;(response.config as any)?.[PERF_SPAN_KEY]?.end?.({
      status: response.status,
    })
    return response
  },
  async (error: ApiError & { config?: any }) => {
    error.friendlyMessage = standardizeApiError(error)
    if (__DEV__) {
      console.error(`[API ERROR] ${error.config?.url}:`, {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data,
      })
    }

    const originalRequest = error.config
    // Close this attempt's span here: a 401 refresh replays the request,
    // which opens a fresh span via the request interceptor above.
    ;(originalRequest as any)?.[PERF_SPAN_KEY]?.end?.({
      status: error.response?.status ?? 0,
      retried401: error.response?.status === 401 && !originalRequest?._retry,
    })
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true
      try {
        const accessToken = await refreshAccessToken()
        if (accessToken) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return api(originalRequest)
        }
      } catch {
        await clearAuthStorage()
      }
    } else if (error.response?.status === 401) {
      await clearAuthStorage()
    }

    return Promise.reject(error)
  },
)
