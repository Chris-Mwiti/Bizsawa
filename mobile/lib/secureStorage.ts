import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SECURE_KEYS = {
  accessToken: 'bizsawa_secure_access_token',
  refreshToken: 'bizsawa_secure_refresh_token',
  userId: 'bizsawa_secure_user_id',
  businessId: 'bizsawa_secure_business_id',
  offlineCred: (email: string) =>
    `bizsawa_offline_cred_${email.toLowerCase().trim()}`,
  offlineGrace: 'bizsawa_offline_grace_until',
  pinHash: 'bizsawa_offline_pin_hash',
  biometricEnabled: 'bizsawa_biometric_enabled',
}

async function setSecure(key: string, value: string) {
  try {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  } catch {
    // Fallback to AsyncStorage if SecureStore unavailable (e.g. web)
    await AsyncStorage.setItem(key, value)
  }
}

async function getSecure(key: string): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(key)
    if (v !== null) return v
  } catch {}
  return AsyncStorage.getItem(key)
}

async function removeSecure(key: string) {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch {}
  await AsyncStorage.removeItem(key)
}

export const secureStorage = {
  setSecure,
  getSecure,
  removeSecure,
  SECURE_KEYS,
}

export async function persistSecureAuth(data: {
  accessToken: string
  refreshToken: string
  userId: string
}) {
  await Promise.all([
    setSecure(SECURE_KEYS.accessToken, data.accessToken),
    setSecure(SECURE_KEYS.refreshToken, data.refreshToken),
    setSecure(SECURE_KEYS.userId, data.userId),
  ])
  // Also keep AsyncStorage for compat (migrated readers)
  await AsyncStorage.multiSet([
    ['bizsawa_access_token', data.accessToken],
    ['bizsawa_refresh_token', data.refreshToken],
    ['bizsawa_user_id', data.userId],
  ])
}

export async function getSecureAuth() {
  const [access, refresh, userId] = await Promise.all([
    getSecure(SECURE_KEYS.accessToken),
    getSecure(SECURE_KEYS.refreshToken),
    getSecure(SECURE_KEYS.userId),
  ])
  if (access && refresh && userId) return { access, refresh, userId }
  // Fallback to legacy AsyncStorage
  const [a2, r2, u2] = await Promise.all([
    AsyncStorage.getItem('bizsawa_access_token'),
    AsyncStorage.getItem('bizsawa_refresh_token'),
    AsyncStorage.getItem('bizsawa_user_id'),
  ])
  if (a2 && r2 && u2) return { access: a2, refresh: r2, userId: u2 }
  return null
}

export async function clearSecureAuth() {
  await Promise.all([
    removeSecure(SECURE_KEYS.accessToken),
    removeSecure(SECURE_KEYS.refreshToken),
    removeSecure(SECURE_KEYS.userId),
    removeSecure(SECURE_KEYS.businessId),
  ])
}
