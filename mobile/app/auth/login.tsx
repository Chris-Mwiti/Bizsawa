import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
} from 'react-native'
import {
  Eye,
  EyeOff,
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
import {
  AuthShell,
  FieldLabel,
  AuthInput,
  FieldError,
  PrimaryCta,
  OrDivider,
  SocialRow,
  SwitchLink,
} from '../../components/auth/AuthShell'

export default function LoginScreen() {
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

  const { login, loginWithBiometrics } = useAuth()
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
    <AuthShell
      title='Welcome Back!'
      subtitle='Sign in to manage your business'
      footer={
        <View className='gap-3 items-center'>
          <View className='flex-row justify-center'>
            <Text className='font-sans text-sm text-ink-muted'>Have an invite code? </Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/auth/accept-invite', params: formData.email ? { email: formData.email } : undefined } as any)}>
              <Text className='font-geist-bold text-sm font-bold text-accent'>
                Accept invite
              </Text>
            </TouchableOpacity>
          </View>
          <SwitchLink
            prompt="Don't have an account?"
            action='Sign Up'
            onPress={() => router.push('/auth/register')}
          />
        </View>
      }
    >
      {(isOffline || offlineAvailable) && (
        <View className='flex-row justify-center gap-2 mb-4 flex-wrap'>
          {isOffline && (
            <View className='px-3 py-1.5 rounded-full bg-warn-soft border border-hairline flex-row items-center gap-1.5'>
              <WifiOff size={12} color='#8A5A0B' />
              <Text className='font-geist-bold text-xs font-bold text-warn'>
                Offline mode
              </Text>
            </View>
          )}
          {offlineAvailable && (
            <View className='px-3 py-1.5 rounded-full bg-pos-soft border border-hairline flex-row items-center gap-1.5'>
              <Shield size={12} color='#1F6F4A' />
              <Text className='font-sans text-xs text-pos'>
                Offline login • {graceDays}d left
              </Text>
            </View>
          )}
        </View>
      )}

      <View className='gap-4'>
        <View>
          <FieldLabel>Email</FieldLabel>
          <AuthInput
            placeholder='Enter your email'
            value={formData.email}
            onChangeText={(text) =>
              setFormData({ ...formData, email: text })
            }
            keyboardType='email-address'
            autoCapitalize='none'
            style={errors.email ? { borderColor: '#A32C21' } : undefined}
          />
          <FieldError message={errors.email} />
        </View>

        <View>
          <FieldLabel>Password</FieldLabel>
          <View className='relative'>
            <AuthInput
              placeholder='Enter your password'
              value={formData.password}
              onChangeText={(text) =>
                setFormData({ ...formData, password: text })
              }
              secureTextEntry={!showPassword}
              className='pr-12'
              style={errors.password ? { borderColor: '#A32C21' } : undefined}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              accessibilityRole='button'
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 8, top: 8 }}
              className='w-11 h-11 items-center justify-center'
            >
              {showPassword ? (
                <EyeOff size={20} color='#64746F' />
              ) : (
                <Eye size={20} color='#64746F' />
              )}
            </TouchableOpacity>
          </View>
          <FieldError message={errors.password} />
        </View>

        <View className='flex-row items-center justify-between'>
          {biometricAvailable && offlineAvailable ? (
            <TouchableOpacity
              onPress={handleBiometricLogin}
              className='flex-row items-center gap-1.5'
            >
              <Fingerprint size={16} color='#006B5F' />
              <Text className='font-geist-semibold text-accent font-semibold text-sm'>
                Biometrics
              </Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/auth/forgot-password',
                params: formData.email ? { email: formData.email } : undefined,
              } as any)
            }
          >
            <Text className='font-geist-semibold text-accent font-semibold text-sm'>Forgot password?</Text>
          </TouchableOpacity>
        </View>

        <PrimaryCta
          label='Login'
          loading={isLoading}
          onPress={handleSubmit}
        />

        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: '/auth/verify-otp',
              params: formData.email ? { email: formData.email } : undefined,
            } as any)
          }
          className='border border-hairline rounded-full py-3.5 items-center bg-surface flex-row justify-center gap-2'
        >
          <Mail size={16} color='#0E1F1C' />
          <Text className='font-geist-semibold text-ink font-semibold text-sm'>Sign in with email code</Text>
        </TouchableOpacity>

        {isOffline && !offlineAvailable && formData.email ? (
          <View className='bg-warn-soft border border-hairline rounded-2xl px-3 py-3'>
            <Text className='font-sans text-xs text-warn text-center'>
              Offline login not yet enabled for this email. Connect once
              online to cache credentials (7-day grace).
            </Text>
          </View>
        ) : null}

        <OrDivider />

        <SocialRow
          onGoogle={() => Alert.alert('Temporarily disabled', 'Google sign-in is paused while we fix the OAuth callback. Please use email/password or email code.')}
          onApple={() => Alert.alert('Coming soon', 'Apple sign-in is not available yet. Please use email/password or email code.')}
          onFacebook={() => Alert.alert('Coming soon', 'Facebook sign-in is not available yet. Please use email/password or email code.')}
        />
      </View>
    </AuthShell>
  )
}
