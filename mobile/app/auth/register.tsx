import React, { useEffect, useState, useRef } from 'react'
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
  User,
  Mail,
  Smartphone,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'
import { Tabs } from 'tamagui'

type Mode = 'otp' | 'password'

export default function RegisterScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const {
    register,
    loginWithGoogle,
    sendVerificationOtp,
    signInWithOtp,
  } = useAuth()

  const [mode, setMode] = useState<Mode>('otp')

  // OTP sign-up state
  const [otpName, setOtpName] = useState('')
  const [otpEmail, setOtpEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [otpError, setOtpError] = useState('')
  const otpInputRef = useRef<TextInput>(null)

  // Password sign-up state
  const [formData, setFormData] = useState({
    ownerName: '',
    ownerEmail: '',
    whatsappNumber: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoadingPassword, setIsLoadingPassword] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (otpCooldown <= 0) return
    const t = setTimeout(() => setOtpCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [otpCooldown])

  const validateEmail = (v: string) => /\S+@\S+\.\S+/.test(v)

  const handleGoogle = async () => {
    setIsGoogleLoading(true)
    try {
      await loginWithGoogle()
      // After Google auth, check if business exists
      try {
        const res = await api.get<{ businesses: any[] }>('/businesses')
        const hasBusiness = Array.isArray(res.data.businesses) && res.data.businesses.length > 0
        if (!hasBusiness) {
          router.replace('/auth/business-setup')
        } else {
          router.replace('/(tabs)')
        }
      } catch {
        router.replace('/auth/business-setup')
      }
    } catch (e: any) {
      Alert.alert('Google sign-up failed', e.message || 'Try again')
    } finally {
      setIsGoogleLoading(false)
    }
  }

  const handleSendOtp = async () => {
    if (!otpName.trim()) {
      setOtpError('Full name is required')
      return
    }
    if (!validateEmail(otpEmail.trim())) {
      setOtpError('Enter a valid email address')
      return
    }
    setOtpError('')
    setIsSendingOtp(true)
    try {
      await sendVerificationOtp(otpEmail.trim().toLowerCase(), 'sign-in')
      setOtpSent(true)
      setOtpCooldown(60)
      Alert.alert('Code sent', `We sent a 6-digit code to ${otpEmail.trim()}. It expires in 5 minutes.`)
      setTimeout(() => otpInputRef.current?.focus(), 300)
    } catch (e: any) {
      setOtpError(e.message || 'Failed to send code')
      Alert.alert('Failed to send', e.message || 'Try again')
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!otpName.trim()) {
      setOtpError('Full name is required')
      return
    }
    if (!validateEmail(otpEmail.trim())) {
      setOtpError('Enter a valid email address')
      return
    }
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setOtpError('Enter the 6-digit code')
      return
    }
    setOtpError('')
    setIsVerifyingOtp(true)
    try {
      await signInWithOtp(otpEmail.trim().toLowerCase(), otpCode.trim(), otpName.trim())

      // Store pending prefill for business-setup
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
      const pending = {
        name: '',
        phone: '',
        email: otpEmail.trim().toLowerCase(),
      }
      await AsyncStorage.setItem('bizsawa_pending_business_prefill', JSON.stringify(pending))

      // After OTP sign-up, new user has no business -> go to business-setup
      // Check just in case user already has business (re-login via OTP)
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
    } catch (e: any) {
      const msg = e.message || 'Invalid or expired code'
      setOtpError(msg)
      Alert.alert('Verification failed', msg)
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const validatePasswordForm = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.ownerName.trim()) newErrors.ownerName = 'Full name is required'
    if (!formData.ownerEmail) newErrors.ownerEmail = 'Email is required'
    else if (!validateEmail(formData.ownerEmail)) newErrors.ownerEmail = 'Please enter a valid email address'
    if (!formData.whatsappNumber) newErrors.whatsappNumber = 'WhatsApp number is required'
    else if (!/^\d{10,15}$/.test(formData.whatsappNumber.replace(/\D/g, '')))
      newErrors.whatsappNumber = 'Please enter a valid phone number'
    if (!formData.password) newErrors.password = 'Password is required'
    else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters'
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handlePasswordSubmit = async () => {
    if (!validatePasswordForm()) return
    setIsLoadingPassword(true)
    try {
      await register({
        ownerName: formData.ownerName,
        ownerEmail: formData.ownerEmail,
        whatsappNumber: formData.whatsappNumber,
        password: formData.password,
      })

      const pending = {
        name: '',
        phone: formData.whatsappNumber,
        email: formData.ownerEmail,
      }
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
      await AsyncStorage.setItem('bizsawa_pending_business_prefill', JSON.stringify(pending))

      // Auto-send verification code for password users
      try {
        await sendVerificationOtp(formData.ownerEmail.trim().toLowerCase(), 'email-verification')
      } catch {}

      Alert.alert('Account created', 'We sent a verification code to your email. Verify to secure your account, then set up your business.', [
        {
          text: 'Verify email',
          onPress: () => router.replace({ pathname: '/auth/verify-email', params: { email: formData.ownerEmail } } as any),
        },
        {
          text: 'Skip for now',
          style: 'cancel',
          onPress: () => router.replace('/auth/business-setup'),
        },
      ])
    } catch (error: any) {
      Alert.alert('Registration failed', error.message)
    } finally {
      setIsLoadingPassword(false)
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
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        >
          <View className="flex-1 justify-center py-6">
            {/* Header */}
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-primary-600 rounded-full items-center justify-center mb-3">
                <Text className="text-white text-2xl font-bold">BS</Text>
              </View>
              <Text className="text-3xl font-bold text-gray-900 mb-1">Create Account</Text>
              <Text className="text-gray-500 text-center">Join BizSawa and grow your business</Text>
            </View>

            {/* Google — temporarily disabled: silent callback failure after consent */}
            <TouchableOpacity
              onPress={() => Alert.alert('Temporarily disabled', 'Google sign-up is paused while we fix the OAuth callback. Please use Email code or Password.')}
              disabled={true}
              className="flex-row items-center justify-center border border-gray-200 rounded-2xl py-4 bg-gray-100 opacity-60 mb-4"
            >
              <Text className="text-gray-400 font-semibold text-[15px]">Continue with Google — disabled</Text>
            </TouchableOpacity>
            <Text className="text-xs text-gray-400 text-center mb-4 -mt-2">Re-enabling soon after mobile ↔ /api/v1/auth/google callback logging is fixed.</Text>

            <View className="flex-row items-center my-4">
              <View className="flex-1 h-[1px] bg-gray-200" />
              <Text className="mx-3 text-gray-400 text-xs font-bold tracking-widest">OR</Text>
              <View className="flex-1 h-[1px] bg-gray-200" />
            </View>

            {/* Mode switch — Tamagui Tabs (fixes hang from re-mounting large form on TouchableOpacity switch) */}
            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              orientation="horizontal"
              activationMode="manual"
              flexDirection="column"
              marginBottom={18}
            >
              <Tabs.List
                backgroundColor="#f3f4f6"
                borderRadius={16}
                padding={4}
                gap={4}
                flexDirection="row"
                width="100%"
              >
                <Tabs.Tab
                  value="otp"
                  flex={1}
                  justifyContent="center"
                  alignItems="center"
                  flexDirection="row"
                  gap={6}
                  paddingVertical={10}
                  borderRadius={12}
                  backgroundColor={mode === 'otp' ? 'white' : 'transparent'}
                  borderWidth={mode === 'otp' ? 1 : 0}
                  borderColor={mode === 'otp' ? '#e5e7eb' : 'transparent'}
                  pressStyle={{ backgroundColor: mode === 'otp' ? 'white' : '#e5e7eb' }}
                >
                  <ShieldCheck size={16} color={mode === 'otp' ? '#111827' : '#6b7280'} />
                  <Text style={{ fontWeight: '700', fontSize: 13, color: mode === 'otp' ? '#111827' : '#6b7280' }}>Email code</Text>
                </Tabs.Tab>
                <Tabs.Tab
                  value="password"
                  flex={1}
                  justifyContent="center"
                  alignItems="center"
                  flexDirection="row"
                  gap={6}
                  paddingVertical={10}
                  borderRadius={12}
                  backgroundColor={mode === 'password' ? 'white' : 'transparent'}
                  borderWidth={mode === 'password' ? 1 : 0}
                  borderColor={mode === 'password' ? '#e5e7eb' : 'transparent'}
                  pressStyle={{ backgroundColor: mode === 'password' ? 'white' : '#e5e7eb' }}
                >
                  <Lock size={16} color={mode === 'password' ? '#111827' : '#6b7280'} />
                  <Text style={{ fontWeight: '700', fontSize: 13, color: mode === 'password' ? '#111827' : '#6b7280' }}>Password</Text>
                </Tabs.Tab>
              </Tabs.List>
            </Tabs>

            {mode === 'otp' ? (
              <View className="gap-4">
                <Text className="text-xs text-gray-500 text-center -mt-2 mb-2">
                  We&apos;ll create your account and send a 6-digit code. No password needed. After verification you&apos;ll set up your business.
                </Text>

                <View>
                  <Text className="text-gray-700 font-medium mb-2">Full Name *</Text>
                  <View className="relative">
                    <User size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-gray-900 ${otpError && !otpName.trim() ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Enter your full name"
                      value={otpName}
                      onChangeText={(t) => { setOtpName(t); if (otpError) setOtpError('') }}
                    />
                  </View>
                </View>

                <View>
                  <Text className="text-gray-700 font-medium mb-2">Email *</Text>
                  <View className="relative">
                    <Mail size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-gray-900 ${otpError && !validateEmail(otpEmail) ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="you@example.com"
                      value={otpEmail}
                      onChangeText={(t) => { setOtpEmail(t); if (otpError) setOtpError('') }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleSendOtp}
                  disabled={isSendingOtp || otpCooldown > 0}
                  className={`rounded-2xl py-3.5 items-center flex-row justify-center gap-2 ${otpCooldown > 0 ? 'bg-gray-100 border border-gray-200' : 'bg-gray-900'}`}
                  style={{ opacity: isSendingOtp ? 0.6 : 1 }}
                >
                  {isSendingOtp ? <ActivityIndicator color={otpCooldown > 0 ? '#111827' : 'white'} /> : <RefreshCw size={16} color={otpCooldown > 0 ? '#111827' : 'white'} />}
                  <Text className={`font-bold ${otpCooldown > 0 ? 'text-gray-700' : 'text-white'}`}>
                    {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : otpSent ? 'Resend code' : 'Send verification code'}
                  </Text>
                </TouchableOpacity>

                {otpSent && (
                  <>
                    <View className="h-[1px] bg-gray-100 my-1" />
                    <View>
                      <Text className="text-gray-700 font-medium mb-2">6-digit code *</Text>
                      <TextInput
                        ref={otpInputRef}
                        className={`border rounded-2xl px-4 py-4 text-center text-2xl tracking-[10px] font-bold text-gray-900 ${otpError ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="------"
                        placeholderTextColor="#9ca3af"
                        value={otpCode}
                        onChangeText={(t) => {
                          const v = t.replace(/[^0-9]/g, '').slice(0, 6)
                          setOtpCode(v)
                          if (otpError) setOtpError('')
                        }}
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                      <Text className="text-xs text-gray-500 mt-2 text-center">Code expires in 5 minutes. Check spam folder if missing.</Text>
                      {otpError ? <Text className="text-red-500 text-sm mt-2 text-center">{otpError}</Text> : null}
                    </View>

                    <TouchableOpacity
                      onPress={handleVerifyOtp}
                      disabled={isVerifyingOtp || otpCode.length !== 6}
                      className={`rounded-2xl py-4 items-center ${otpCode.length === 6 ? 'bg-emerald-600' : 'bg-gray-200'}`}
                      style={{ opacity: isVerifyingOtp ? 0.7 : 1 }}
                    >
                      {isVerifyingOtp ? <ActivityIndicator color="white" /> : <Text className={`font-bold text-lg ${otpCode.length === 6 ? 'text-white' : 'text-gray-500'}`}>Verify & Continue</Text>}
                    </TouchableOpacity>
                  </>
                )}
                {!otpSent && otpError ? <Text className="text-red-500 text-sm text-center">{otpError}</Text> : null}
              </View>
            ) : (
              <View className="gap-4">
                <View>
                  <Text className="text-gray-700 font-medium mb-2">Full Name *</Text>
                  <View className="relative">
                    <User size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-gray-900 ${errors.ownerName ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Enter your full name"
                      value={formData.ownerName}
                      onChangeText={(t) => setFormData({ ...formData, ownerName: t })}
                    />
                  </View>
                  {errors.ownerName && <Text className="text-red-500 text-sm mt-1">{errors.ownerName}</Text>}
                </View>

                <View>
                  <Text className="text-gray-700 font-medium mb-2">Email *</Text>
                  <View className="relative">
                    <Mail size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-gray-900 ${errors.ownerEmail ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="you@example.com"
                      value={formData.ownerEmail}
                      onChangeText={(t) => setFormData({ ...formData, ownerEmail: t })}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  {errors.ownerEmail && <Text className="text-red-500 text-sm mt-1">{errors.ownerEmail}</Text>}
                </View>

                <View>
                  <Text className="text-gray-700 font-medium mb-2">WhatsApp Number *</Text>
                  <View className="relative">
                    <Smartphone size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-gray-900 ${errors.whatsappNumber ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="+254 XXX XXX XXX"
                      value={formData.whatsappNumber}
                      onChangeText={(t) => setFormData({ ...formData, whatsappNumber: t })}
                      keyboardType="phone-pad"
                    />
                  </View>
                  {errors.whatsappNumber && <Text className="text-red-500 text-sm mt-1">{errors.whatsappNumber}</Text>}
                </View>

                <View>
                  <Text className="text-gray-700 font-medium mb-2">Password *</Text>
                  <View className="relative">
                    <Lock size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 pr-11 py-3.5 text-gray-900 ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="At least 6 characters"
                      value={formData.password}
                      onChangeText={(t) => setFormData({ ...formData, password: t })}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: 14 }}>
                      {showPassword ? <EyeOff size={18} color="#6b7280" /> : <Eye size={18} color="#6b7280" />}
                    </TouchableOpacity>
                  </View>
                  {errors.password && <Text className="text-red-500 text-sm mt-1">{errors.password}</Text>}
                </View>

                <View>
                  <Text className="text-gray-700 font-medium mb-2">Confirm Password *</Text>
                  <View className="relative">
                    <Lock size={18} color="#6b7280" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 pr-11 py-3.5 text-gray-900 ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Repeat password"
                      value={formData.confirmPassword}
                      onChangeText={(t) => setFormData({ ...formData, confirmPassword: t })}
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: 12, top: 14 }}>
                      {showConfirmPassword ? <EyeOff size={18} color="#6b7280" /> : <Eye size={18} color="#6b7280" />}
                    </TouchableOpacity>
                  </View>
                  {errors.confirmPassword && <Text className="text-red-500 text-sm mt-1">{errors.confirmPassword}</Text>}
                </View>

                <TouchableOpacity
                  onPress={handlePasswordSubmit}
                  disabled={isLoadingPassword}
                  className={`bg-primary-600 rounded-2xl py-4 items-center ${isLoadingPassword ? 'opacity-50' : ''}`}
                >
                  {isLoadingPassword ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <View className="flex-row items-center">
                      <Text className="text-white font-semibold text-lg mr-2">Create Account</Text>
                      <ArrowRight size={20} color="white" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View className="flex-row justify-center mt-6">
              <Text className="text-gray-600">Already have an account? </Text>
              <TouchableOpacity onPress={() => router.replace('/auth/login')}>
                <Text className="text-primary-600 font-semibold">Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
