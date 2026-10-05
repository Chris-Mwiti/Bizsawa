import { useEffect } from 'react'
import { Alert, AppState } from 'react-native'
import * as Updates from 'expo-updates'

/**
 * Over-the-air updates via EAS Update (`expo-updates` + channel `preview`).
 *
 * How it works: `eas update --branch preview` publishes the JS bundle to
 * Expo's CDN. Builds whose `runtimeVersion` matches (policy `appVersion`
 * in app.json) download it in the background. This module just notices the
 * download finished and asks the user to restart — it never forces one.
 *
 * Limits: JS + assets only. A native change (new/removed native module,
 * app.json plugin, SDK bump) still needs a fresh APK from `eas build`.
 */

let promptedThisSession = false

export type UpdateStatus = 'dev' | 'disabled' | 'current' | 'ready' | 'error'

export async function checkForAppUpdate(): Promise<UpdateStatus> {
  if (__DEV__) return 'dev'
  if (!Updates.isEnabled) return 'disabled'
  try {
    const res = await Updates.checkForUpdateAsync()
    if (!res.isAvailable) return 'current'
    await Updates.fetchUpdateAsync()
    if (!promptedThisSession) {
      promptedThisSession = true
      Alert.alert(
        'Update ready',
        'A new version of BizSawa has downloaded. Restart now to use it?',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Restart', onPress: () => void Updates.reloadAsync() },
        ],
      )
    }
    return 'ready'
  } catch {
    // Offline or CDN hiccup — stay silent, try again next foreground.
    return 'error'
  }
}

/** Check once on launch and again each time the app returns to foreground. */
export function useAppUpdates() {
  useEffect(() => {
    void checkForAppUpdate()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForAppUpdate()
    })
    return () => sub.remove()
  }, [])
}
