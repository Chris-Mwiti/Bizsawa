// JS bridge for the bizsawa-sms-capture Expo module (Android-only).
// iOS has no such module: every function degrades to a no-op so iOS users
// keep the manual-paste flow and iOS builds are unaffected (the module ships
// android/ sources only).
import { Platform } from 'react-native'

export interface SmsReceivedEvent {
  message: string
}

export type AutoCaptureAvailability =
  | { available: true; reason: 'ok' }
  | { available: false; reason: 'non_android' | 'expo_go' | 'not_linked' }

/**
 * Why auto-capture is (un)available. The three failure modes need three
 * different fixes, so the UI reports the reason instead of a blanket no:
 * - non_android: iOS — no SMS API exists, manual paste only.
 * - expo_go: Expo Go cannot load custom native code — install the dev-client build.
 * - not_linked: dev client built before the module was added — rebuild native.
 */
export function getAutoCaptureAvailability(): AutoCaptureAvailability {
  if (Platform.OS !== 'android') return { available: false, reason: 'non_android' }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default ?? require('expo-constants')
    if (Constants?.appOwnership === 'expo') return { available: false, reason: 'expo_go' }
  } catch {
    // expo-constants unavailable — fall through to the module check.
  }
  return getNativeModule() !== null
    ? { available: true, reason: 'ok' }
    : { available: false, reason: 'not_linked' }
}

type SmsListener = (event: SmsReceivedEvent) => void
type TimeoutListener = () => void

function getNativeModule(): any | null {
  if (Platform.OS !== 'android') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require('expo-modules-core')
    return requireNativeModule('SmsCapture')
  } catch {
    return null
  }
}

let emitter: any = null
function getEmitter(): any | null {
  const mod = getNativeModule()
  if (!mod) return null
  if (!emitter) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EventEmitter } = require('expo-modules-core')
      emitter = new EventEmitter(mod)
    } catch {
      return null
    }
  }
  return emitter
}

/** True only on Android dev-client builds with the module linked. */
export function isAutoCaptureSupported(): boolean {
  return getAutoCaptureAvailability().available
}

/**
 * Native build marker for field diagnostics. Returns null when the module
 * is missing, 'v1 (pre-version API)' for builds predating the version
 * function, else the NATIVE_VERSION string. The test screen renders this
 * so a stale native install on-device is immediately visible.
 */
export function getSmsCaptureNativeVersion(): string | null {
  try {
    const mod = getNativeModule()
    if (!mod) return null
    return typeof mod.getNativeVersion === 'function' ? String(mod.getNativeVersion()) : 'v1 (pre-version API)'
  } catch {
    return null
  }
}

/** Arms the system one-tap consent for the next message. Null senderAddress
 * matches any sender (see autoCapture.ts: filter stays off so a sender-ID
 * variant can never silently swallow a payment SMS). */
export async function startSmsUserConsent(senderAddress: string | null = null): Promise<void> {
  const mod = getNativeModule()
  if (!mod) throw new Error('SMS auto-capture is not available on this device')
  await mod.startUserConsent(senderAddress)
}

export async function stopSmsUserConsent(): Promise<void> {
  await getNativeModule()?.stopUserConsent().catch(() => {})
}

export function addSmsReceivedListener(cb: SmsListener): { remove: () => void } {
  const em = getEmitter()
  // Never degrade to a no-op: a silent listener means status 'listening'
  // with zero events ever arriving — the exact undiagnosable failure seen
  // in the field. Throw so armAutoCapture rejects and the UI shows error.
  if (!em) throw new Error('SMS event emitter unavailable on this device')
  const sub = em.addListener('onSmsReceived', cb)
  return { remove: () => sub?.remove() }
}

export function addSmsTimeoutListener(cb: TimeoutListener): { remove: () => void } {
  const em = getEmitter()
  if (!em) throw new Error('SMS event emitter unavailable on this device')
  const sub = em.addListener('onSmsTimeout', cb)
  return { remove: () => sub?.remove() }
}
