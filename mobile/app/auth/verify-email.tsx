import React, { useEffect, useRef, useState } from 'react'
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
import { Mail, ArrowLeft, BadgeCheck, RefreshCw } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'

export default function VerifyEmailScreen() {
  const insets = useSafeAreaInsets()
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
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-2 w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
          >
            <ArrowLeft size={18} color="#111827" />
          </TouchableOpacity>

          <View className="items-center mt-6 mb-6">
            <View className="w-16 h-16 bg-blue-600 rounded-full items-center justify-center mb-3">
              <BadgeCheck size={26} color="white" />
            </View>
            <Text className="font-geist-bold text-2xl font-bold text-gray-900">Verify your email</Text>
            <Text className="font-sans text-gray-500 text-center mt-2 px-4">
              We sent a code to confirm you own this email. Enter it below.
            </Text>
          </View>

          <View className="gap-4">
            <View>
              <Text className="font-geist-medium text-gray-700 font-medium mb-2">Email</Text>
              <View className="relative">
                <Mail size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                <TextInput
                  className={`border rounded-2xl px-11 py-3.5 text-gray-900 ${error && !validateEmail(email) ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="you@example.com"
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
              className={`rounded-2xl py-3.5 items-center flex-row justify-center gap-2 ${cooldown > 0 ? 'bg-gray-100 border border-gray-200' : 'bg-accent'}`}
            >
              {isSending ? <ActivityIndicator color={cooldown > 0 ? '#111827' : 'white'} /> : <RefreshCw size={16} color={cooldown > 0 ? '#111827' : 'white'} />}
              <Text className={`font-geist-bold font-bold ${cooldown > 0 ? 'text-gray-700' : 'text-white'}`}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send verification code'}
              </Text>
            </TouchableOpacity>

            <View className="h-[1px] bg-gray-100 my-1" />

            <View>
              <Text className="font-geist-medium text-gray-700 font-medium mb-2">6-digit code</Text>
              <TextInput
                ref={otpRef}
                className={`border rounded-2xl px-4 py-4 text-center text-2xl tracking-[10px] font-bold text-gray-900 ${error ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="------"
                placeholderTextColor="#6b7280"
                value={otp}
                onChangeText={(t) => {
                  const v = t.replace(/[^0-9]/g, '').slice(0, 6)
                  setOtp(v)
                  if (error) setError('')
                }}
                keyboardType="number-pad"
                maxLength={6}
              />
              {error ? <Text className="font-sans text-red-500 text-sm mt-2 text-center">{error}</Text> : null}
            </View>

            <TouchableOpacity
              onPress={handleVerify}
              disabled={isVerifying || otp.length !== 6}
              className={`rounded-2xl py-4 items-center ${otp.length === 6 ? 'bg-blue-600' : 'bg-gray-200'}`}
              style={{ opacity: isVerifying ? 0.7 : 1 }}
            >
              {isVerifying ? <ActivityIndicator color="white" /> : <Text className={`font-geist-bold font-bold text-lg ${otp.length === 6 ? 'text-white' : 'text-gray-500'}`}>Verify email</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.replace('/auth/login')} className="items-center mt-2">
              <Text className="font-sans text-gray-500">Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
