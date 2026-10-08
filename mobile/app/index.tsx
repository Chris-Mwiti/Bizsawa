import { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  ActivityIndicator,
  Image,
  Animated,
  Easing,
} from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

// Splash visibility budget: brand readable, never hostage. Readiness
// (auth resolved below) releases the splash; this is only the floor.
const SPLASH_MIN_MS = 1200
const SPLASH_FADE_MS = 250

export default function Index() {
  const [isAppReady, setIsAppReady] = useState(false)
  const [showSplash, setShowSplash] = useState(true)

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current
  const progressAnim = useRef(new Animated.Value(0)).current
  // Boot clock: splash hides on actual readiness (auth resolved), with a short
  // minimum so the brand mark never flashes by. Previously a fixed 4500ms gate
  // held every cold start hostage regardless of how fast init finished.
  const bootStartRef = useRef(Date.now())
  const didHideRef = useRef(false)

  // Typewriter
  const fullText = 'powering your business...'
  const [typewriterText, setTypewriterText] = useState('')

  const router = useRouter()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()

  useEffect(() => {
    // 1. Fade in the UI seamlessly
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start()

    // 2. Animate the progress bar from 0% to 100% across the minimum
    // visible window (it completes early if readiness takes longer).
    Animated.timing(progressAnim, {
      toValue: 100,
      duration: SPLASH_MIN_MS,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start()

    // 3. Typewriter effect
    let i = 0
    const typingInterval = setInterval(() => {
      if (i <= fullText.length) {
        setTypewriterText(fullText.slice(0, i))
        i++
      } else {
        clearInterval(typingInterval)
      }
    }, 60)

    const prepareApp = async () => {
      try {
        // Pre-fetch fonts, icons, or silent auth here if needed
      } catch (e) {
        console.warn(e)
      }
      // Hiding is driven by the routing effect below once auth has resolved
      // (see didHideRef) — no blind timer here anymore.
    }

    prepareApp()

    return () => clearInterval(typingInterval)
  }, [])

  const hideSplash = () => {
    if (didHideRef.current) return
    didHideRef.current = true
    // Keep the brand visible just long enough to read, then get out of the way.
    const remainingTime = Math.max(0, SPLASH_MIN_MS - (Date.now() - bootStartRef.current))
    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: SPLASH_FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        setShowSplash(false)
        setIsAppReady(true)
      })
    }, remainingTime)
  }

  useEffect(() => {
    // Release the splash as soon as auth has resolved (or failed) — routing
    // below then proceeds immediately instead of waiting out a fixed timer.
    if (!isAuthLoading) hideSplash()
  }, [isAuthLoading])

  useEffect(() => {
    if (!isAppReady || isAuthLoading) return

    const route = async () => {
      try {
        const hasOnboarded = await AsyncStorage.getItem('HAS_FINISHED_ONBOARDING')

        // First launch: show marketing onboarding regardless of auth
        if (!hasOnboarded) {
          router.replace('/onboarding')
          return
        }

        // Online auto-redirect: if token still valid (AuthContext already validated + refreshed), go home
        // Offline: AuthContext deliberately leaves isAuthenticated=false to force manual login for security
        // NetInfo + businesses resolve concurrently — both are needed, neither depends on the other.
        const [net, bizRes] = await Promise.all([
          NetInfo.fetch().catch(() => ({ isConnected: true as boolean | null })),
          isAuthenticated
            ? api.get<{ businesses: any[] }>('/businesses').catch(() => null)
            : Promise.resolve(null),
        ])
        const isOnline = (net as any)?.isConnected ?? true

        if (isAuthenticated && isOnline) {
          // Optional business check — new users without business go to setup, others to tabs.
          // A failed fetch falls through to tabs (previous behaviour); only a
          // confirmed-empty list routes to business-setup.
          if (!bizRes) {
            router.replace('/(tabs)')
            return
          }
          const hasBusiness =
            Array.isArray(bizRes.data.businesses) &&
            bizRes.data.businesses.length > 0
          router.replace(hasBusiness ? '/(tabs)' : '/auth/business-setup')
          return
        }

        // Not authenticated, or offline cold start (security policy), or token expired/refresh failed
        router.replace('/auth/login')
      } catch {
        router.replace('/auth/login')
      }
    }

    void route()
  }, [isAppReady, isAuthLoading, isAuthenticated, router])

  if (showSplash) {
    const progressWidth = progressAnim.interpolate({
      inputRange: [0, 100],
      outputRange: ['0%', '100%'],
    })

    return (
      <View className='flex-1 items-center justify-center bg-accent'>
        <Animated.View
          style={{ opacity: fadeAnim, alignItems: 'center', width: '100%' }}
        >
          {/* Reference taste: full-bleed deep teal, white mark + wordmark */}
          <View className='items-center justify-center rounded-full bg-white/10 p-8'>
            <View className='items-center justify-center rounded-full bg-white shadow-clinical'
              style={{ width: 148, height: 148 }}
            >
              <Image
                source={require('../assets/adaptive-icon.png')}
                style={{ width: 104, height: 104 }}
                resizeMode='contain'
              />
            </View>
          </View>
          <Text
            className='font-geist-bold text-white font-bold mt-6'
            style={{ letterSpacing: 6, fontSize: 18 }}
          >
            BIZSAWA
          </Text>
          <Text className='font-sans text-white/70 text-xs mt-2 tracking-wide'>
            Your AI powered business companion
          </Text>

          {/* Container with generous margin to avoid cluttering */}
          <View className='mt-16 items-center w-full px-12'>
            {/* Loading Bar */}
            <View className='w-full max-w-[200px] h-1 bg-white/25 rounded-full overflow-hidden mb-6'>
              <Animated.View
                style={{ width: progressWidth }}
                className='h-full bg-white'
              />
            </View>

            {/* Typewriter Text */}
            <Text className='font-geist-bold text-xs text-white/70 font-bold tracking-widest uppercase h-6'>
              {typewriterText}
            </Text>
          </View>
        </Animated.View>
      </View>
    )
  }

  // Fallback while routing occurs
  return (
    <View
      className='flex-1 items-center justify-center'
      style={{ backgroundColor: '#F4F9F7' }}
    >
      <ActivityIndicator size='large' color='#006b5f' />
    </View>
  )
}
