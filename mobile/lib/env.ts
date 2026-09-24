import Constants from 'expo-constants'

// Single source for env + API url. NetInfo remains independent — it only checks connectivity, not which env is loaded.
export const ENV = (process.env.EXPO_PUBLIC_ENV as string) || (__DEV__ ? 'development' : 'production')
export const IS_DEV = ENV === 'development'
export const API_URL_RAW = (process.env.EXPO_PUBLIC_API_URL as string) || ''

// For debugging: show which .env was loaded and which host will be used (see lib/api.ts getApiUrl)
export function getEnvInfo() {
  return {
    env: ENV,
    apiUrlRaw: API_URL_RAW || '(auto-detect)',
    expoHostUri: (Constants.expoConfig as any)?.hostUri || null,
    isDev: __DEV__,
  }
}
