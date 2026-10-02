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

export default function Index() {
  const [isAppReady, setIsAppReady] = useState(false)
  const [showSplash, setShowSplash] = useState(true)

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current
  const progressAnim = useRef(new Animated.Value(0)).current

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

    // 2. Animate the progress bar from 0% to 100%
    Animated.timing(progressAnim, {
      toValue: 100,
      duration: 4500, // Increased duration to ensure it doesn't flash by
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
      const startTime = Date.now()
      try {
        // Pre-fetch fonts, icons, or silent auth here if needed
      } catch (e) {
        console.warn(e)
      } finally {
        const elapsedTime = Date.now() - startTime
        // Wait at least 4500ms before hiding the splash screen
        const remainingTime = Math.max(0, 4500 - elapsedTime)

        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            setShowSplash(false)
            setIsAppReady(true)
          })
        }, remainingTime)
      }
    }

    prepareApp()

    return () => clearInterval(typingInterval)
  }, [])

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
        let isOnline = true
        try {
          const net = await NetInfo.fetch()
          isOnline = net.isConnected ?? true
        } catch {}

        if (isAuthenticated && isOnline) {
          // Optional business check — new users without business go to setup, others to tabs
          try {
            const res = await api.get<{ businesses: any[] }>('/businesses')
            const hasBusiness =
              Array.isArray(res.data.businesses) && res.data.businesses.length > 0
            router.replace(hasBusiness ? '/(tabs)' : '/auth/business-setup')
          } catch {
            router.replace('/(tabs)')
          }
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
      <View
        className='flex-1 items-center justify-center'
        style={{ backgroundColor: '#F4F9F7' }}
      >
        <Animated.View
          style={{ opacity: fadeAnim, alignItems: 'center', width: '100%' }}
        >
          {/* Central Splash Icon matches native splash perfectly */}
          <Image
            source={require('../assets/splash-icon.png')}
            style={{ width: 250, height: 250 }}
            resizeMode='contain'
          />

          {/* Container with generous margin to avoid cluttering */}
          <View className='mt-24 items-center w-full px-12'>
            {/* Loading Bar */}
            <View className='w-full max-w-[200px] h-1 bg-[#d3e5f1] rounded-full overflow-hidden mb-6'>
              <Animated.View
                style={{ width: progressWidth }}
                className='h-full bg-accent'
              />
            </View>

            {/* Typewriter Text */}
            <Text className='font-geist-bold text-xs text-[#43474b]/80 font-bold tracking-widest uppercase h-6'>
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
