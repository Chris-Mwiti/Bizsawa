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
import { AuthShell, SwitchLink } from '../../components/auth/AuthShell'

export default function VerifyEmailScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()
  const { sendVerificationOtp, verifyEmailWithOtp } = useAuth()

  const [email, setEmail] = useState(String(params.email ?? '').trim())
  const [otp, setOtp] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')

  const otpRef = useRef<TextInput>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const validateEmail = (v: string) => /\S+@\S+\.\S+/.test(v)

  const handleSend = async () => {
    if (!validateEmail(email.trim())) {
      setError('Enter a valid email')
      return
    }
    setError('')
    setIsSending(true)
    try {
      await sendVerificationOtp(email.trim().toLowerCase(), 'email-verification')
      setCooldown(60)
      Alert.alert('Code sent', `Verification code sent to ${email.trim()}.`)
      setTimeout(() => otpRef.current?.focus(), 300)
    } catch (e: any) {
      setError(e.message || 'Failed to send code')
      Alert.alert('Failed', e.message || 'Try again')
    } finally {
      setIsSending(false)
    }
  }

  const handleVerify = async () => {
    if (!validateEmail(email.trim())) {
      setError('Enter a valid email')
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
      await verifyEmailWithOtp(email.trim().toLowerCase(), code)
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
      const pending = await AsyncStorage.getItem('bizsawa_pending_business_prefill')
      Alert.alert('Verified', 'Email verified successfully.', [
        {
          text: 'Continue',
          onPress: () => router.replace(pending ? '/auth/business-setup' : '/(tabs)'),
        },
      ])
    } catch (e: any) {
      const msg = e.message || 'Invalid or expired code'
      setError(msg)
      Alert.alert('Failed', msg)
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <AuthShell
      title='Verify Your Email'
      subtitle='We sent a code to confirm you own this email. Enter it below.'
      onBack={() => router.back()}
      footer={
        <SwitchLink
          prompt='Wrong place?'
          action='Back to sign in'
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
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSend}
          disabled={isSending || cooldown > 0}
          className={`rounded-full py-4 items-center flex-row justify-center gap-2 ${cooldown > 0 ? 'bg-paper border border-hairline' : 'bg-accent shadow-clinical-sm'}`}
        >
          {isSending ? <ActivityIndicator color={cooldown > 0 ? '#0E1F1C' : 'white'} /> : <RefreshCw size={16} color={cooldown > 0 ? '#0E1F1C' : 'white'} />}
          <Text className={`font-geist-bold font-bold ${cooldown > 0 ? 'text-ink' : 'text-white'}`}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send verification code'}
          </Text>
        </TouchableOpacity>

        <View className="h-[1px] bg-hairline my-1" />

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
          />
          {error ? <Text className="font-sans text-neg text-sm mt-2 text-center">{error}</Text> : null}
        </View>

        <TouchableOpacity
          onPress={handleVerify}
          disabled={isVerifying || otp.length !== 6}
          className={`rounded-full py-4 items-center ${otp.length === 6 ? 'bg-accent shadow-clinical-sm' : 'bg-paper border border-hairline'}`}
          style={{ opacity: isVerifying ? 0.7 : 1 }}
        >
          {isVerifying ? <ActivityIndicator color="white" /> : <Text className={`font-geist-bold font-bold ${otp.length === 6 ? 'text-white' : 'text-ink-subtle'}`}>Verify email</Text>}
        </TouchableOpacity>
      </View>
    </AuthShell>
  )
}
