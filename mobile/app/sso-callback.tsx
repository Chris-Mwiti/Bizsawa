import { useEffect } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'

export default function SSOCallbackScreen() {
  const router = useRouter()

  useEffect(() => {
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
