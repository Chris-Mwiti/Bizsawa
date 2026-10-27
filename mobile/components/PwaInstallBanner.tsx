import { Platform, Pressable, Text, View } from 'react-native'
import { useState } from 'react'
import { usePwaInstall } from '../lib/pwa/usePwaInstall'

/**
 * Install prompt for the web/PWA build.
 *
 * Shows only in a browser that can install the app (Chrome/Android) and only
 * while the app is not already installed. iOS Safari has no programmatic
 * prompt, so it gets the manual "Share → Add to Home Screen" hint instead of
 * a button that cannot work.
 */
export function PwaInstallBanner() {
  const { state, install, needsManualSteps } = usePwaInstall()
  const [dismissed, setDismissed] = useState(false)

  if (Platform.OS !== 'web') return null
  if (dismissed) return null
  if (state === 'installed' || state === 'unsupported') return null

  if (needsManualSteps) {
    return (
      <View className='bg-ink px-4 py-3 flex-row items-center justify-between gap-3'>
        <Text className='font-sans text-xs text-white/80 flex-1'>
          Add BizSawa to your home screen: Share → Add to Home Screen.
        </Text>
        <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
          <Text className='font-geist-bold text-xs text-white/70'>Dismiss</Text>
        </Pressable>
      </View>
    )
  }

  // `available` means the browser supports install but hasn't handed us the
  // prompt yet — a button here would do nothing when tapped.
  if (state !== 'ready') return null

  return (
    <View className='bg-ink px-4 py-3 flex-row items-center justify-between gap-3'>
      <Text className='font-sans text-xs text-white/80 flex-1'>
        Install BizSawa for faster access and offline use.
      </Text>
      <Pressable
        onPress={() => {
          void install()
        }}
        className='rounded-full bg-white px-4 py-1.5'
      >
        <Text className='font-geist-bold text-xs font-bold text-ink'>Install</Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
        <Text className='font-geist-bold text-xs text-white/60'>Dismiss</Text>
      </Pressable>
    </View>
  )
}
