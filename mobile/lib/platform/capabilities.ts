import { Platform } from 'react-native';

/**
 * What the running build can actually do.
 *
 * The app ships as three surfaces from one codebase:
 *   - Android APK  — everything (biometrics, native SMS capture, secure store)
 *   - iOS           — everything except the Android SMS capture module
 *   - Web / PWA    — no biometrics, no SMS capture, no hardware keystore
 *
 * Rather than let those differences surface as mysterious no-ops, screens ask
 * this module and tell the user the truth ("SMS capture needs the Android
 * app") instead of showing a button that silently does nothing.
 */

export type Surface = 'android' | 'ios' | 'web';

export const surface: Surface =
  Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';

export const isWeb = surface === 'web';
export const isAndroid = surface === 'android';
export const isIOS = surface === 'ios';

/** Biometric unlock (Face ID / fingerprint) — native only. */
export const supportsBiometrics = !isWeb;

/** Automatic M-Pesa SMS capture — Android only (native module). */
export const supportsSmsCapture = isAndroid;

/** Hardware-backed secure storage (Keychain / Keystore). */
export const supportsSecureStorage = !isWeb;

/**
 * Background/periodic sync while the app is closed. The browser can only
 * sync while a tab is open, so the web build must not promise the same
 * behaviour as the native one.
 */
export const supportsBackgroundSync = !isWeb;

/**
 * Human-readable reason a capability is unavailable, or null when it is
 * available. Used to render honest empty states instead of dead buttons.
 */
export function unavailableReason(capability: 'biometrics' | 'sms' | 'secureStorage' | 'backgroundSync'): string | null {
  switch (capability) {
    case 'biometrics':
      return isWeb
        ? 'Biometric unlock is available in the Android and iOS apps. In the browser, use your email code.'
        : null;
    case 'sms':
      return isAndroid
        ? null
        : 'Automatic M-Pesa SMS capture needs the Android app. Add the code manually here.';
    case 'secureStorage':
      return isWeb
        ? 'The browser stores your session in local storage, not a hardware keystore.'
        : null;
    case 'backgroundSync':
      return isWeb
        ? 'Sync runs while this tab is open. Open the Android app for background sync.'
        : null;
    default:
      return null;
  }
}
