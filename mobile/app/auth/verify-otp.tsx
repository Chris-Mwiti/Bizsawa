import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Mail, RefreshCw } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'
import { AuthShell, SwitchLink } from '../../components/auth/AuthShell'

export default function VerifyOtpScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()
  const { sendVerificationOtp, signInWithOtp } = useAuth()

  const [email, setEmail] = useState(String(params.email ?? '').trim())
  const [otp, setOtp] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')

  const otpRef = useRef<TextInput>(null)
  const hasAutoSentRef = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // Auto-send OTP if navigated with email (login screen's "Sign in with email code")
  useEffect(() => {
    if (hasAutoSentRef.current) return
    const e = String(params.email ?? '').trim()
    if (e && /\S+@\S+\.\S+/.test(e) && !isSending && cooldown === 0) {
      hasAutoSentRef.current = true
      // Defer to next tick to allow UI to mount
      setTimeout(() => {
        handleSend()
      }, 400)
    }
  }, [params.email])

  const validateEmail = (v: string) => /\S+@\S+\.\S+/.test(v)

  const handleSend = async () => {
    if (!email.trim() || !validateEmail(email.trim())) {
      setError('Enter a valid email address')
      return
    }
    setError('')
    setIsSending(true)
    try {
      // Login OTP: require existing account — don't send if email not registered
      try {
        const check = await api.get<{ exists: boolean }>(`/auth/check-email`, { params: { email: email.trim().toLowerCase() } })
        if (check.data && check.data.exists === false) {
          Alert.alert(
            'No account found',
            `No account exists for ${email.trim()}. Would you like to create one?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Up', onPress: () => router.replace('/auth/register' as any) },
            ],
          )
          setError('No account found — please sign up')
          return
        }
      } catch {
        // if check fails, fall through and try to send anyway (backend will handle)
      }
      await sendVerificationOtp(email.trim().toLowerCase(), 'sign-in')
      setCooldown(60)
      Alert.alert('Code sent', `We sent a 6-digit code to ${email.trim()}. It expires in 5 minutes.`)
      setTimeout(() => otpRef.current?.focus(), 300)
    } catch (e: any) {
      setError(e.message || 'Failed to send code')
      Alert.alert('Failed to send', e.message || 'Try again')
    } finally {
      setIsSending(false)
    }
  }

  const handleVerify = async () => {
    if (!email.trim() || !validateEmail(email.trim())) {
      setError('Enter a valid email address')
      return
    }
    const code = otp.trim()
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code')
      return
    }
    setError('')
    setIsVerifying(true)
    try {
      await signInWithOtp(email.trim().toLowerCase(), code)
      // Business-aware redirect: new OTP users have no business yet → business-setup
      try {
        const res = await api.get<{ businesses: any[] }>('/businesses')
        const hasBusiness = Array.isArray(res.data.businesses) && res.data.businesses.length > 0
        if (hasBusiness) {
          router.replace('/(tabs)')
        } else {
          // Ensure pending prefill for business-setup
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
          const existing = await AsyncStorage.getItem('bizsawa_pending_business_prefill')
          if (!existing) {
            await AsyncStorage.setItem(
              'bizsawa_pending_business_prefill',
              JSON.stringify({ name: '', phone: '', email: email.trim().toLowerCase() }),
            )
          }
          router.replace('/auth/business-setup')
        }
      } catch {
        router.replace('/auth/business-setup')
      }
    } catch (e: any) {
      const msg = e.message || 'Invalid or expired code'
      setError(msg)
      Alert.alert('Verification failed', msg)
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <AuthShell
      title='Enter OTP to Verify Your Identity'
      subtitle='A one-time password (OTP) has been sent to your registered email address.'
      onBack={() => router.back()}
      footer={
        <SwitchLink
          prompt='Prefer password?'
          action='Back to login'
          onPress={() => router.replace('/auth/login')}
        />
      }
    >
      <View className="gap-4">
        <View>
          <Text className="font-geist-medium text-ink-strong font-medium mb-2">Email</Text>
          <View className="relative">
            <Mail size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
            <TextInput
              className={`border rounded-2xl px-11 py-3.5 text-ink ${error && !validateEmail(email) ? 'border-neg' : 'border-hairline'}`}
              placeholder="you@example.com"
              placeholderTextColor="#64746F"
              value={email}
              onChangeText={(t) => { setEmail(t); if (error) setError('') }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSend}
          disabled={isSending || cooldown > 0}
          className={`rounded-full py-4 items-center flex-row justify-center gap-2 ${cooldown > 0 ? 'bg-paper border border-hairline' : 'bg-accent shadow-clinical-sm'}`}
          style={{ opacity: isSending ? 0.6 : 1 }}
        >
          {isSending ? (
            <ActivityIndicator color={cooldown > 0 ? '#0E1F1C' : 'white'} />
          ) : (
            <RefreshCw size={16} color={cooldown > 0 ? '#0E1F1C' : 'white'} />
          )}
          <Text className={`font-geist-bold font-bold ${cooldown > 0 ? 'text-ink' : 'text-white'}`}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send OTP'}
          </Text>
        </TouchableOpacity>

        <View className="h-[1px] bg-hairline my-2" />

        <View>
          <Text className="font-geist-medium text-ink-strong font-medium mb-2">6-digit code</Text>
          <TextInput
            ref={otpRef}
            className={`border rounded-2xl px-4 py-4 text-center text-2xl tracking-[10px] font-bold text-ink ${error ? 'border-neg' : 'border-hairline'}`}
            placeholder="------"
            placeholderTextColor="#64746F"
            value={otp}
            onChangeText={(t) => {
              const v = t.replace(/[^0-9]/g, '').slice(0, 6)
              setOtp(v)
              if (error) setError('')
            }}
            keyboardType="number-pad"
            autoCorrect={false}
          />
          <Text className="font-sans text-xs text-ink-muted mt-2 text-center">
            Check spam folder if you don&apos;t see it. Code expires in 5 minutes.
          </Text>
          {error ? <Text className="font-sans text-neg text-sm mt-2 text-center">{error}</Text> : null}
        </View>

        <TouchableOpacity
          onPress={handleVerify}
          disabled={isVerifying || otp.length !== 6}
          className={`rounded-full py-4 items-center mt-2 ${otp.length === 6 ? 'bg-accent shadow-clinical-sm' : 'bg-paper border border-hairline'}`}
          style={{ opacity: isVerifying ? 0.7 : 1 }}
        >
          {isVerifying ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className={`font-geist-bold font-bold ${otp.length === 6 ? 'text-white' : 'text-ink-subtle'}`}>Verify & Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </AuthShell>
  )
}
