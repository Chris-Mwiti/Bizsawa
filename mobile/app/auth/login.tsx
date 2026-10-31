import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useRouter } from 'expo-router'
import { useSSO } from '@clerk/clerk-expo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../../contexts/AuthContext'
import { api, AUTH_STORAGE_KEYS } from '../../lib/api'
import {
  AuthShell,
  SocialRow,
} from '../../components/auth/AuthShell'

/** Google brand colors for recognition on the sign-in button. */
const GOOGLE_BLUE = '#4285F4'
const GOOGLE_RED = '#DB4437'
const GOOGLE_YELLOW = '#F4B400'
const GOOGLE_GREEN = '#0F9D58'

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  const { syncClerkSession } = useAuth()
  const { startSSOFlow } = useSSO()
  const router = useRouter()

  /**
   * Resolve the business for the signed-in Clerk account, reliably across
   * sign-in methods (Google, email code, password).
   *
   * 1. syncClerkSession() verifies the Clerk JWT server-side and scopes the
   *    session to the user's default business (owner membership first).
   * 2. We then probe /businesses to confirm an existing business exists —
   *    this covers the case where the Clerk response businessId is nil but
   *    the user still has a membership, and it's the same check the email
   *    password path uses, so every sign-in method lands on the same
   *    business context.
   */
  const resolveBusinessAndRoute = async (): Promise<boolean> => {
    try {
      const res = await api.get<{ businesses: any[] }>('/businesses')
      const businesses = Array.isArray(res.data.businesses) ? res.data.businesses : []
      if (businesses.length > 0) {
        // Persist the resolved business so subsequent requests carry it.
        const businessId = businesses[0].id
        await AsyncStorage.setItem(AUTH_STORAGE_KEYS.businessId, businessId)
        router.replace('/(tabs)')
        return true
      }
    } catch {
      // Fall through to business-setup if we can't probe.
    }
    return false
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      // If a Clerk session already exists (e.g. previous sign-in), don't
      // start a new SSO flow — Clerk rejects it with session_exists.
      const { getClerkInstance } = await import('@clerk/clerk-expo')
      const existingClerk = getClerkInstance()
      if (existingClerk?.session) {
        await syncClerkSession()
        const hadBusiness = await resolveBusinessAndRoute()
        if (!hadBusiness) router.replace('/auth/business-setup')
        return
      }

      const result = await startSSOFlow({ strategy: 'oauth_google' })
      if (result.createdSessionId) {
        await syncClerkSession()
        // The backend resolves the business for the signed-in account and
        // returns it, so Google sign-in lands on exactly the same business
        // as an email-code sign-in for the same email.
        const hadBusiness = await resolveBusinessAndRoute()
        if (!hadBusiness) router.replace('/auth/business-setup')
      }
    } catch (error: any) {
      if (error?.code !== 'ERR_CANCELED') {
        Alert.alert('Google Sign-in Failed', error.message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOffline(!s.isConnected))
    NetInfo.fetch().then((s) => setIsOffline(!s.isConnected))
    return () => unsub()
  }, [])

  return (
    <AuthShell
      title='Welcome Back!'
      subtitle='Sign in to manage your business'
    >
      <View className='gap-4 mb-4'>
        <View className='px-3 py-1.5 rounded-full bg-warn-soft border border-hairline flex-row items-center gap-1.5'>
          <Text className='font-geist-bold text-xs font-bold text-warn'>
            {isOffline ? 'Offline mode — sign-in may be cached' : 'Online'}
          </Text>
        </View>
      </View>

      <SocialRow onGoogle={handleGoogleSignIn} />

      {isLoading ? (
        <View className='flex-row justify-center mt-4'>
          <ActivityIndicator size='small' color='#006B5F' />
        </View>
      ) : null}
    </AuthShell>
  )
}
