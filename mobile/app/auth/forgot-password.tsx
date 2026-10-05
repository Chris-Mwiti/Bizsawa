import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Mail, Lock, Eye, EyeOff, RefreshCw } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'
import { AuthShell, SwitchLink } from '../../components/auth/AuthShell'

export default function ForgotPasswordScreen() {
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
  // Same single-use-code double-tap guard as the other OTP screens.
  const resettingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

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
    if (resettingRef.current) return
    resettingRef.current = true
    setError('')
    setIsResetting(true)
    try {
      await resetPasswordWithOtp(email.trim().toLowerCase(), code, password)
      Alert.alert('Success', 'Password reset. Please sign in with your new password.', [
        { text: 'Sign in', onPress: () => router.replace('/auth/login') },
      ])
    } catch (e: any) {
      const msg = e.message || 'Invalid or expired code'
      if (mountedRef.current) setError(msg)
      Alert.alert('Reset failed', msg)
    } finally {
      resettingRef.current = false
      if (mountedRef.current) setIsResetting(false)
    }
  }

  return (
    <AuthShell
      title='Enter Your Email to Proceed'
      subtitle='Please enter your registered email to continue.'
      onBack={() => router.back()}
      footer={
        <SwitchLink
          prompt='Remembered it?'
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
            {cooldown > 0 ? `Resend in ${cooldown}s` : sent ? 'Resend code' : 'Send OTP'}
          </Text>
        </TouchableOpacity>

        {sent && (
          <>
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
                // No native maxLength/autofill — see verify-otp note (freeze bisect).
              />
            </View>

            <View>
              <Text className="font-geist-medium text-ink-strong font-medium mb-2">New password</Text>
              <View className="relative">
                <Lock size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
                <TextInput
                  className={`border rounded-2xl px-11 pr-11 py-3.5 text-ink ${error ? 'border-neg' : 'border-hairline'}`}
                  placeholder="At least 8 characters"
                  placeholderTextColor="#64746F"
                  value={password}
                  onChangeText={(t) => { setPassword(t); if (error) setError('') }}
                  secureTextEntry={!showPw}
                />
                <TouchableOpacity onPress={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: 14 }}>
                  {showPw ? <EyeOff size={18} color="#64746F" /> : <Eye size={18} color="#64746F" />}
                </TouchableOpacity>
              </View>
            </View>

            <View>
              <Text className="font-geist-medium text-ink-strong font-medium mb-2">Confirm password</Text>
              <View className="relative">
                <Lock size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
                <TextInput
                  className={`border rounded-2xl px-11 pr-11 py-3.5 text-ink ${error ? 'border-neg' : 'border-hairline'}`}
                  placeholder="Repeat password"
                  placeholderTextColor="#64746F"
                  value={confirm}
                  onChangeText={(t) => { setConfirm(t); if (error) setError('') }}
                  secureTextEntry={!showConfirm}
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: 12, top: 14 }}>
                  {showConfirm ? <EyeOff size={18} color="#64746F" /> : <Eye size={18} color="#64746F" />}
                </TouchableOpacity>
              </View>
            </View>

            {error ? <Text className="font-sans text-neg text-sm text-center">{error}</Text> : null}

            <TouchableOpacity
              onPress={handleReset}
              disabled={isResetting || otp.length !== 6 || password.length < 8}
              className={`rounded-full py-4 items-center ${otp.length === 6 && password.length >= 8 ? 'bg-accent shadow-clinical-sm' : 'bg-paper border border-hairline'}`}
              style={{ opacity: isResetting ? 0.7 : 1 }}
            >
              {isResetting ? <ActivityIndicator color="white" /> : <Text className={`font-geist-bold font-bold ${otp.length === 6 && password.length >= 8 ? 'text-white' : 'text-ink-subtle'}`}>Reset password</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </AuthShell>
  )
}
