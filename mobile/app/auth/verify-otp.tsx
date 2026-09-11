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
import { Mail, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets()
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

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const validateEmail = (v: string) => /\S+@\S+\.\S+/.test(v)

  const handleSend = async () => {
    if (!email.trim() || !validateEmail(email.trim())) {
      setError('Enter a valid email address')
      return
    }
    setError('')
    setIsSending(true)
    try {
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
      router.replace('/(tabs)')
    } catch (e: any) {
      const msg = e.message || 'Invalid or expired code'
      setError(msg)
      Alert.alert('Verification failed', msg)
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
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={18} color="#111827" />
          </TouchableOpacity>

          <View className="items-center mt-6 mb-8">
            <View className="w-16 h-16 bg-emerald-600 rounded-full items-center justify-center mb-4">
              <ShieldCheck size={28} color="white" />
            </View>
            <Text className="text-2xl font-bold text-gray-900">Enter verification code</Text>
            <Text className="text-gray-500 text-center mt-2 px-4">
              We&apos;ll send a 6-digit code to your email. It expires in 5 minutes.
            </Text>
          </View>

          <View className="gap-4">
            <View>
              <Text className="text-gray-700 font-medium mb-2">Email</Text>
              <View className="relative">
                <Mail size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                <TextInput
                  className={`border rounded-2xl px-11 py-3.5 text-gray-900 ${error && !validateEmail(email) ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="you@example.com"
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
              className={`rounded-2xl py-3.5 items-center flex-row justify-center gap-2 ${cooldown > 0 ? 'bg-gray-100 border border-gray-200' : 'bg-gray-900'}`}
              style={{ opacity: isSending ? 0.6 : 1 }}
            >
              {isSending ? (
                <ActivityIndicator color={cooldown > 0 ? '#111827' : 'white'} />
              ) : (
                <RefreshCw size={16} color={cooldown > 0 ? '#111827' : 'white'} />
              )}
              <Text className={`font-bold ${cooldown > 0 ? 'text-gray-700' : 'text-white'}`}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send code'}
              </Text>
            </TouchableOpacity>

            <View className="h-[1px] bg-gray-100 my-2" />

            <View>
              <Text className="text-gray-700 font-medium mb-2">6-digit code</Text>
              <TextInput
                ref={otpRef}
                className={`border rounded-2xl px-4 py-4 text-center text-2xl tracking-[10px] font-bold text-gray-900 ${error ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="------"
                placeholderTextColor="#9ca3af"
                value={otp}
                onChangeText={(t) => {
                  const v = t.replace(/[^0-9]/g, '').slice(0, 6)
                  setOtp(v)
                  if (error) setError('')
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoCorrect={false}
              />
              <Text className="text-xs text-gray-500 mt-2 text-center">
                Check spam folder if you don&apos;t see it. Sent via Resend.
              </Text>
              {error ? <Text className="text-red-500 text-sm mt-2 text-center">{error}</Text> : null}
            </View>

            <TouchableOpacity
              onPress={handleVerify}
              disabled={isVerifying || otp.length !== 6}
              className={`rounded-2xl py-4 items-center mt-2 ${otp.length === 6 ? 'bg-emerald-600' : 'bg-gray-200'}`}
              style={{ opacity: isVerifying ? 0.7 : 1 }}
            >
              {isVerifying ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className={`font-bold text-lg ${otp.length === 6 ? 'text-white' : 'text-gray-500'}`}>Verify & Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.replace('/auth/login')} className="items-center mt-2">
              <Text className="text-gray-500">Back to password login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
