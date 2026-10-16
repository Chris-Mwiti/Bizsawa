// Per-device payer hashing. Raw phone numbers are never persisted.
// Native path (Android Keystore HMAC) lives in the Kotlin PayerHasher;
// this TS fallback uses expo-crypto SHA-256 over (deviceSecret || phone)
// and truncates to 32 hex chars to match HASH_HEX_LEN.
// Same-customer hashing is per device, never cross-device — documented
// limitation, matching the native module.

import { secureStorage } from '../secureStorage'
import { randomUUID } from 'expo-crypto'

export const PAYER_HASH_LEN = 32
const SECRET_KEY = 'bizsawa_payer_hmac_secret'

async function getOrCreateSecret(): Promise<string> {
  const existing = await secureStorage.getSecure(SECRET_KEY)
  if (existing) return existing
  const fresh = randomUUID() + randomUUID()
  await secureStorage.setSecure(SECRET_KEY, fresh)
  return fresh
}

export async function hashPayerPhone(phoneDigits: string): Promise<string> {
  const secret = await getOrCreateSecret()
  let Crypto: any = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Crypto = require('expo-crypto')
  } catch {
    Crypto = null
  }
  if (Crypto?.digestStringAsync) {
    const full = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm?.SHA256 ?? 'SHA-256',
      `${secret}:${phoneDigits}`,
    )
    return String(full).toLowerCase().slice(0, PAYER_HASH_LEN)
  }
  // Deterministic non-crypto fallback (dev/test only — never persisted alone).
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  const s = `${secret}:${phoneDigits}`
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619)
    h2 = Math.imul(h2 ^ s.charCodeAt(s.length - 1 - i), 16777619)
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`.repeat(2).slice(0, PAYER_HASH_LEN)
}
