import { useEffect } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'

/**
 * Redirect target for the SSO / OAuth flow.
 *
 * Native: the OS hands the deep link back to the app and Clerk resolves the
 * session; `startSSOFlow` picks it up in the original screen.
 *
 * Web: the flow runs in a popup window. This page must hand the result back
 * to the opener with `WebBrowser.maybeCompleteAuthSession()`, which posts the
 * URL to the parent window and closes the popup. Without that call the
 * promise in `openAuthSessionAsync` never settles and the sign-in hangs.
 */
export default function SSOCallbackScreen() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Web popup: complete the session and let the opener take over.
      const result = WebBrowser.maybeCompleteAuthSession()
      if (result?.type === 'success') {
        // The opener resolves the promise; close this popup.
        window.close()
        return
      }
    }

    // Native (or a failed web completion): fall back to the app.
    const t = setTimeout(() => {
      router.replace('/(tabs)')
    }, 2000)
    return () => clearTimeout(t)
  }, [router])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 12 }}>Completing sign in…</Text>
    </View>
  )
}
