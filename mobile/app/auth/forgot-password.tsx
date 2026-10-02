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
import { Mail, ArrowLeft, Lock, Eye, EyeOff, RefreshCw } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()
  const { requestPasswordResetOtp, resetPasswordWithOtp } = useAuth()

  const [email, setEmail] = useState(String(params.email ?? '').trim())
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

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
      await requestPasswordResetOtp(email.trim().toLowerCase())
      setSent(true)
      setCooldown(60)
      Alert.alert('Code sent', 'If the email exists, a 6-digit code was sent. It expires in 5 minutes.')
      setTimeout(() => otpRef.current?.focus(), 300)
    } catch (e: any) {
      setError(e.message || 'Failed to send code')
      Alert.alert('Failed', e.message || 'Try again')
    } finally {
      setIsSending(false)
    }
  }

  const handleReset = async () => {
    if (!validateEmail(email.trim())) {
      setError('Enter a valid email')
      return
    }
    const code = otp.trim()
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code')
      return
    }
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setError('')
    setIsResetting(true)
    try {
      await resetPasswordWithOtp(email.trim().toLowerCase(), code, password)
      Alert.alert('Success', 'Password reset. Please sign in with your new password.', [
        { text: 'Sign in', onPress: () => router.replace('/auth/login') },
      ])
    } catch (e: any) {
      const msg = e.message || 'Invalid or expired code'
      setError(msg)
      Alert.alert('Reset failed', msg)
    } finally {
      setIsResetting(false)
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
            <View className="w-16 h-16 bg-accent rounded-full items-center justify-center mb-3">
              <Lock size={24} color="white" />
            </View>
            <Text className="font-geist-bold text-2xl font-bold text-gray-900">Reset password</Text>
            <Text className="font-sans text-gray-500 text-center mt-2 px-4">
              Enter your email to receive a 6-digit code, then set a new password.
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
                {cooldown > 0 ? `Resend in ${cooldown}s` : sent ? 'Resend code' : 'Send code'}
              </Text>
            </TouchableOpacity>

            {sent && (
              <>
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
                </View>

                <View>
                  <Text className="font-geist-medium text-gray-700 font-medium mb-2">New password</Text>
                  <View className="relative">
                    <Lock size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 pr-11 py-3.5 text-gray-900 ${error ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="At least 8 characters"
                      value={password}
                      onChangeText={(t) => { setPassword(t); if (error) setError('') }}
                      secureTextEntry={!showPw}
                    />
                    <TouchableOpacity onPress={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: 14 }}>
                      {showPw ? <EyeOff size={18} color="#6b7280" /> : <Eye size={18} color="#6b7280" />}
                    </TouchableOpacity>
                  </View>
                </View>

                <View>
                  <Text className="font-geist-medium text-gray-700 font-medium mb-2">Confirm password</Text>
                  <View className="relative">
                    <Lock size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 pr-11 py-3.5 text-gray-900 ${error ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Repeat password"
                      value={confirm}
                      onChangeText={(t) => { setConfirm(t); if (error) setError('') }}
                      secureTextEntry={!showConfirm}
                    />
                    <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: 12, top: 14 }}>
                      {showConfirm ? <EyeOff size={18} color="#6b7280" /> : <Eye size={18} color="#6b7280" />}
                    </TouchableOpacity>
                  </View>
                </View>

                {error ? <Text className="font-sans text-red-500 text-sm text-center">{error}</Text> : null}

                <TouchableOpacity
                  onPress={handleReset}
                  disabled={isResetting || otp.length !== 6 || password.length < 8}
                  className={`rounded-2xl py-4 items-center ${otp.length === 6 && password.length >= 8 ? 'bg-emerald-600' : 'bg-gray-200'}`}
                  style={{ opacity: isResetting ? 0.7 : 1 }}
                >
                  {isResetting ? <ActivityIndicator color="white" /> : <Text className={`font-geist-bold font-bold text-lg ${otp.length === 6 && password.length >= 8 ? 'text-white' : 'text-gray-500'}`}>Reset password</Text>}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => router.replace('/auth/login')} className="items-center mt-2">
              <Text className="font-sans text-gray-500">Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
