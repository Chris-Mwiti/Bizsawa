import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Eye,
  EyeOff,
  Lock,
  ArrowRight,
  Mail,
  WifiOff,
  Shield,
  Fingerprint,
} from 'lucide-react-native'
import NetInfo from '@react-native-community/netinfo'
import { useRouter } from 'expo-router'

// Lazy-load so missing native module (dev-client without rebuild) doesn't crash bundle
let LocalAuthentication: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-local-authentication')
  LocalAuthentication = mod?.default ?? mod
} catch {
  LocalAuthentication = null
}
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'
import {
  hasOfflineCredential,
  getOfflineGraceDaysLeft,
} from '../../lib/offlineAuth'

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isOffline, setIsOffline] = useState(false)
  const [offlineAvailable, setOfflineAvailable] = useState(false)
  const [graceDays, setGraceDays] = useState(0)
  const [biometricAvailable, setBiometricAvailable] = useState(false)

  const { login, loginWithGoogle, loginWithBiometrics } = useAuth()
  const router = useRouter()

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOffline(!s.isConnected))
    NetInfo.fetch().then((s) => setIsOffline(!s.isConnected))
    if (LocalAuthentication?.hasHardwareAsync) {
      LocalAuthentication.hasHardwareAsync()
        .then((has: boolean) => {
          if (has) LocalAuthentication.isEnrolledAsync().then(setBiometricAvailable)
        })
        .catch(() => {})
    }
    return () => unsub()
  }, [])

  useEffect(() => {
    if (formData.email) {
      hasOfflineCredential(formData.email).then(setOfflineAvailable)
      getOfflineGraceDaysLeft(formData.email).then(setGraceDays)
    } else {
      setOfflineAvailable(false)
    }
  }, [formData.email])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setIsLoading(true)

    try {
      await login(formData)
      try {
        const res = await api.get<{ businesses: any[] }>('/businesses')
        const hasBusiness = Array.isArray(res.data.businesses) && res.data.businesses.length > 0
        router.replace(hasBusiness ? '/(tabs)' : '/auth/business-setup')
      } catch {
        router.replace('/(tabs)')
      }
    } catch (error: any) {
      Alert.alert('Login Failed', error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSubmit = async () => {
    setIsLoading(true)
    try {
      await loginWithGoogle()
      // Business-aware redirect: new Google users have no business yet
      try {
        const res = await api.get<{ businesses: any[] }>('/businesses')
        const hasBusiness = Array.isArray(res.data.businesses) && res.data.businesses.length > 0
        if (hasBusiness) {
          router.replace('/(tabs)')
        } else {
          router.replace('/auth/business-setup')
        }
      } catch {
        router.replace('/auth/business-setup')
      }
    } catch (error: any) {
      Alert.alert('Google Login Failed', error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBiometricLogin = async () => {
    if (!LocalAuthentication?.authenticateAsync) {
      Alert.alert('Not available', 'Biometrics not available in this build. Run a dev-client build to enable.')
      return
    }
    if (!formData.email) {
      Alert.alert('Email required', 'Enter your email first to use biometrics')
      return
    }
    const has = await hasOfflineCredential(formData.email)
    if (!has) {
      Alert.alert(
        'Not available',
        'Biometric offline login requires at least one online login first (7-day grace).',
      )
      return
    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock BizSawa offline',
      disableDeviceFallback: false,
    })
    if (!res.success) return
    try {
      await loginWithBiometrics(formData.email)
      router.replace('/(tabs)')
    } catch (e: any) {
      Alert.alert(
        'Biometric login failed',
        e.message || 'Could not unlock offline. Try password.',
      )
    }
  }

  return (
    <SafeAreaView className='flex-1 bg-white'>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        className='flex-1'
      >
        <ScrollView
          className='flex-1 px-6'
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='interactive'
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        >
          <View className='flex-1 justify-center py-12'>
            {/* Header */}
            <View className='items-center mb-8'>
              <View className='w-20 h-20 bg-primary-600 rounded-full items-center justify-center mb-4'>
                <Text className='text-white text-2xl font-bold'>BS</Text>
              </View>
              <Text className='text-3xl font-bold text-gray-900 mb-2'>
                BizSawa
              </Text>
              <Text className='text-gray-500 text-center'>
                {'Welcome back! \nSign in to manage your business'}
              </Text>
              {isOffline && (
                <View className='mt-3 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 flex-row items-center gap-2'>
                  <WifiOff size={12} color='#b45309' />
                  <Text className='text-xs font-bold text-amber-700'>
                    Offline mode
                  </Text>
                </View>
              )}
              {offlineAvailable && (
                <View className='mt-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 flex-row items-center gap-2'>
                  <Shield size={12} color='#047857' />
                  <Text className='text-xs text-emerald-700'>
                    Offline login available • {graceDays} days left
                  </Text>
                </View>
              )}
            </View>

            {/* Form */}
            <View className='space-y-4'>
              {/* Email Field */}
              <View>
                <Text className='text-gray-700 font-medium mb-2'>Email</Text>
                <View className='relative'>
                  <Mail
                    size={20}
                    color='#6b7280'
                    style={{ position: 'absolute', left: 12, top: 12 }}
                  />
                  <TextInput
                    className={`border rounded-2xl px-12 py-3 text-gray-900 ${
                      errors.email ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder='Enter your email'
                    value={formData.email}
                    onChangeText={(text) =>
                      setFormData({ ...formData, email: text })
                    }
                    keyboardType='email-address'
                    autoCapitalize='none'
                  />
                </View>
                {errors.email && (
                  <Text className='text-red-500 text-sm mt-1'>
                    {errors.email}
                  </Text>
                )}
              </View>

              {/* Password Field */}
              <View>
                <Text className='text-gray-700 font-medium mb-2'>Password</Text>
                <View className='relative'>
                  <Lock
                    size={20}
                    color='#6b7280'
                    style={{ position: 'absolute', left: 12, top: 12 }}
                  />
                  <TextInput
                    className={`border rounded-2xl px-12 pr-12 py-3 text-gray-900 ${
                      errors.password ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder='Enter your password'
                    value={formData.password}
                    onChangeText={(text) =>
                      setFormData({ ...formData, password: text })
                    }
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: 12, top: 12 }}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color='#6b7280' />
                    ) : (
                      <Eye size={20} color='#6b7280' />
                    )}
                  </TouchableOpacity>
                </View>
                {errors.password && (
                  <Text className='text-red-500 text-sm mt-1'>
                    {errors.password}
                  </Text>
                )}
              </View>

              {/* Forgot password */}
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/auth/forgot-password',
                    params: formData.email ? { email: formData.email } : undefined,
                  } as any)
                }
                className='self-end mt-3'
              >
                <Text className='text-primary-600 font-semibold text-sm'>Forgot password?</Text>
              </TouchableOpacity>

              {/* Login Button */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isLoading}
                className={`bg-primary-600 rounded-2xl mt-6 py-4 items-center ${
                  isLoading ? 'opacity-50' : ''
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color='white' size='small' />
                ) : (
                  <View className='flex-row items-center'>
                    <Text className='text-white font-semibold text-lg mr-2'>
                      Sign In
                    </Text>
                    <ArrowRight size={20} color='white' />
                  </View>
                )}
              </TouchableOpacity>

              {/* OTP sign-in */}
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/auth/verify-otp',
                    params: formData.email ? { email: formData.email } : undefined,
                  } as any)
                }
                className='border border-gray-900 rounded-2xl mt-3 py-4 items-center bg-white flex-row justify-center gap-2'
              >
                <Mail size={16} color='#111827' />
                <Text className='text-gray-900 font-semibold'>Sign in with email code</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View className='flex-row items-center my-6'>
                <View className='flex-1 h-[1px] bg-gray-200' />
                <Text className='mx-4 text-gray-500 font-medium'>OR</Text>
                <View className='flex-1 h-[1px] bg-gray-200' />
              </View>

              {/* Biometric / Offline hint */}
              {biometricAvailable && offlineAvailable && (
                <TouchableOpacity
                  onPress={handleBiometricLogin}
                  className='flex-row items-center justify-center border border-emerald-200 rounded-2xl py-3 bg-emerald-50 mt-2'
                >
                  <Fingerprint size={18} color='#047857' />
                  <Text className='text-emerald-700 font-semibold ml-2'>
                    Unlock with Biometrics
                  </Text>
                </TouchableOpacity>
              )}

              {/* Google Login Button */}
              <TouchableOpacity
                onPress={handleGoogleSubmit}
                disabled={isLoading}
                className='flex-row items-center justify-center border border-gray-300 rounded-2xl py-4 bg-white'
              >
                <Text className='text-gray-700 font-semibold text-lg'>
                  Continue with Google
                </Text>
              </TouchableOpacity>

              {isOffline && !offlineAvailable && formData.email ? (
                <View className='bg-amber-50 border border-amber-200 rounded-2xl px-3 py-3 mt-4'>
                  <Text className='text-xs text-amber-800 text-center'>
                    Offline login not yet enabled for this email. Connect once
                    online to cache credentials (7-day grace).
                  </Text>
                </View>
              ) : null}

              {/* Register Link */}
              <View className='flex-row justify-center mt-6'>
                <Text className='text-gray-600'>Don't have an account? </Text>
                <TouchableOpacity onPress={() => router.push('/auth/register')}>
                  <Text className='text-primary-600 font-semibold'>
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
