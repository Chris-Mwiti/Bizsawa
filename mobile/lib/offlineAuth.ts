import * as Crypto from 'expo-crypto'
import { secureStorage } from './secureStorage'
import AsyncStorage from '@react-native-async-storage/async-storage'

const OFFLINE_GRACE_DAYS = 7

interface OfflineCredential {
  email: string
  hash: string
  userId: string
  businessId?: string | null
  offlineGraceUntil: number
  createdAt: number
}

async function hashPassword(password: string, email: string): Promise<string> {
  // SHA256(email+":"+password) — deterministic, no salt needed for offline compare
  // We use expo-crypto which is available offline
  const input = `${email.toLowerCase().trim()}:${password}`
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input)
}

export async function cacheOfflineCredential(
  email: string,
  password: string,
  userId: string,
  businessId?: string | null,
) {
  const hash = await hashPassword(password, email)
  const now = Date.now()
  const cred: OfflineCredential = {
    email: email.toLowerCase().trim(),
    hash,
    userId,
    businessId: businessId || null,
    offlineGraceUntil: now + OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000,
    createdAt: now,
  }
  await secureStorage.setSecure(
    secureStorage.SECURE_KEYS.offlineCred(email),
    JSON.stringify(cred),
  )
  await AsyncStorage.setItem(
    secureStorage.SECURE_KEYS.offlineGrace,
    String(cred.offlineGraceUntil),
  )
  return cred
}

export async function verifyOfflineCredential(
  email: string,
  password: string,
): Promise<OfflineCredential | null> {
  const raw = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.offlineCred(email),
  )
  if (!raw) return null
  try {
    const cred: OfflineCredential = JSON.parse(raw)
    if (Date.now() > cred.offlineGraceUntil) return null
    const hash = await hashPassword(password, email)
    if (hash !== cred.hash) return null
    return cred
  } catch {
    return null
  }
}

export async function getOfflineCredential(
  email: string,
): Promise<OfflineCredential | null> {
  const raw = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.offlineCred(email),
  )
  if (!raw) return null
  try {
    const cred: OfflineCredential = JSON.parse(raw)
    if (Date.now() > cred.offlineGraceUntil) return null
    return cred
  } catch {
    return null
  }
}

export async function hasOfflineCredential(email: string): Promise<boolean> {
  return (await getOfflineCredential(email)) !== null
}

export async function getOfflineGraceDaysLeft(email: string): Promise<number> {
  const raw = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.offlineCred(email),
  )
  if (!raw) return 0
  try {
    const cred: OfflineCredential = JSON.parse(raw)
    const diff = cred.offlineGraceUntil - Date.now()
    return diff > 0 ? Math.ceil(diff / (24 * 60 * 60 * 1000)) : 0
  } catch {
    return 0
  }
}

// PIN + Biometric helpers
export async function setOfflinePin(pin: string) {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin,
  )
  await secureStorage.setSecure(secureStorage.SECURE_KEYS.pinHash, hash)
}

export async function verifyOfflinePin(pin: string): Promise<boolean> {
  const stored = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.pinHash,
  )
  if (!stored) return false
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin,
  )
  return hash === stored
}

export async function setBiometricEnabled(enabled: boolean) {
  await secureStorage.setSecure(
    secureStorage.SECURE_KEYS.biometricEnabled,
    enabled ? '1' : '0',
  )
}

export async function isBiometricEnabled(): Promise<boolean> {
  const v = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.biometricEnabled,
  )
  return v === '1'
}

export function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = global.atob
      ? global.atob(padded)
      : Buffer.from(padded, 'base64').toString()
    const data = JSON.parse(json)
    if (data.exp) return data.exp * 1000
    return null
  } catch {
    return null
  }
}

export function isJwtExpiredOffline(token: string): boolean {
  const exp = decodeJwtExp(token)
  if (!exp) return false
  // Allow 7-day grace even if JWT expired, if offline credential exists
  return Date.now() > exp
}
