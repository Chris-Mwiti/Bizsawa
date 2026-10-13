// Expo bridge for the native sms-capture module (Android Kotlin parser +
// Keystore hasher). Falls back to null so callers use the TS parser.
// The native side is wired via config plugin / READ_SMS permission; until
// the prebuild links it, every method resolves null/false.

import type { SmsParseOutcome } from '../../lib/mpesa-sms/types'

function getNativeModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExpoModules: any = require('expo-modules-core')
    const mod = ExpoModules?.NativeModulesProxy?.SmsCapture ?? ExpoModules?.requireNativeModule?.('SmsCapture')
    return mod ?? null
  } catch {
    return null
  }
}

export async function parseMpesaSms(body: string): Promise<SmsParseOutcome | null> {
  const mod = getNativeModule()
  if (!mod?.parse) return null
  try {
    return (await mod.parse(body)) as SmsParseOutcome
  } catch {
    return null
  }
}

export function isSmsCaptureAvailable(): boolean {
  return getNativeModule() !== null
}
