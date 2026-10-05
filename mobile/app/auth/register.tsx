import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native'
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
import { withTimeout } from '../../lib/async'
import { Tabs } from 'tamagui'
import {
  AuthShell,
  OrDivider,
  SocialRow,
  SwitchLink,
} from '../../components/auth/AuthShell'

type Mode = 'otp' | 'password'

export default function RegisterScreen() {
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
  // Same double-tap / unmounted guards as verify-otp (single-use OTP codes
  // make a concurrent second verify fail, and its Alert lands post-nav).
  const verifyingOtpRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

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
    if (verifyingOtpRef.current) return
    verifyingOtpRef.current = true
    Keyboard.dismiss()
    otpInputRef.current?.blur()
    setOtpError('')
    setIsVerifyingOtp(true)
    try {
      await withTimeout(
        signInWithOtp(otpEmail.trim().toLowerCase(), otpCode.trim(), otpName.trim()),
        25000,
        'Sign-in',
      )

      // Store pending prefill for business-setup
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
        const pending = {
          name: '',
          phone: '',
          email: otpEmail.trim().toLowerCase(),
        }
        await AsyncStorage.setItem('bizsawa_pending_business_prefill', JSON.stringify(pending))
      } catch {
        // Prefill is cosmetic — never block navigation on storage.
      }

      // After OTP sign-up, new user has no business -> go to business-setup
      // Check just in case user already has business (re-login via OTP).
      // Bounded probe: never hang the spinner; default to business-setup.
      // Object-form href bypasses the NavigationGate prefetch hold for tabs.
      let hasBusiness = false
      try {
        const res = await withTimeout(
          api.get<{ businesses: any[] }>('/businesses'),
          8000,
          'Loading businesses',
        )
        hasBusiness = Array.isArray(res.data.businesses) && res.data.businesses.length > 0
      } catch {
        hasBusiness = false
      }
      router.replace({ pathname: hasBusiness ? '/(tabs)' : '/auth/business-setup' } as any)
    } catch (e: any) {
      const msg = e.message || 'Invalid or expired code'
      if (mountedRef.current) setOtpError(msg)
    } finally {
      verifyingOtpRef.current = false
      if (mountedRef.current) setIsVerifyingOtp(false)
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
    <AuthShell
      title='Create Account'
      subtitle='Join BizSawa and grow your business'
      footer={
        <SwitchLink
          prompt='Already have an account?'
          action='Sign In'
          onPress={() => router.replace('/auth/login')}
        />
      }
    >
      {/* Social — Google temporarily disabled (silent OAuth callback), Apple/Facebook coming soon */}
      <SocialRow
        onGoogle={() => Alert.alert('Temporarily disabled', 'Google sign-up is paused while we fix the OAuth callback. Please use Email code or Password.')}
        onApple={() => Alert.alert('Coming soon', 'Apple sign-up is not available yet. Please use Email code or Password.')}
        onFacebook={() => Alert.alert('Coming soon', 'Facebook sign-up is not available yet. Please use Email code or Password.')}
      />
      <Text className="font-sans text-xs text-ink-subtle text-center mt-2">Google re-enabling soon — Email code works today.</Text>

      <OrDivider />

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
                backgroundColor="#E1EBE8"
                borderRadius={999}
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
                  borderRadius={999}
                  backgroundColor={mode === 'otp' ? 'white' : 'transparent'}
                  borderWidth={mode === 'otp' ? 1 : 0}
                  borderColor={mode === 'otp' ? '#DCE7E4' : 'transparent'}
                  pressStyle={{ backgroundColor: mode === 'otp' ? 'white' : '#DCE7E4' }}
                >
                  <ShieldCheck size={16} color={mode === 'otp' ? '#0E1F1C' : '#64746F'} />
                  <Text className="font-sans" style={{ fontWeight: '700', fontSize: 13, color: mode === 'otp' ? '#0E1F1C' : '#64746F' }}>Email code</Text>
                </Tabs.Tab>
                <Tabs.Tab
                  value="password"
                  flex={1}
                  justifyContent="center"
                  alignItems="center"
                  flexDirection="row"
                  gap={6}
                  paddingVertical={10}
                  borderRadius={999}
                  backgroundColor={mode === 'password' ? 'white' : 'transparent'}
                  borderWidth={mode === 'password' ? 1 : 0}
                  borderColor={mode === 'password' ? '#DCE7E4' : 'transparent'}
                  pressStyle={{ backgroundColor: mode === 'password' ? 'white' : '#DCE7E4' }}
                >
                  <Lock size={16} color={mode === 'password' ? '#0E1F1C' : '#64746F'} />
                  <Text className="font-sans" style={{ fontWeight: '700', fontSize: 13, color: mode === 'password' ? '#0E1F1C' : '#64746F' }}>Password</Text>
                </Tabs.Tab>
              </Tabs.List>
            </Tabs>

            {mode === 'otp' ? (
              <View className="gap-4">
                <Text className="font-sans text-xs text-ink-muted text-center -mt-2 mb-2">
                  We&apos;ll create your account and send a 6-digit code. No password needed. After verification you&apos;ll set up your business.
                </Text>

                <View>
                  <Text className="font-geist-medium text-ink-strong font-medium mb-2">Full Name *</Text>
                  <View className="relative">
                    <User size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-ink ${otpError && !otpName.trim() ? 'border-neg' : 'border-hairline'}`}
                      placeholder="Enter your full name"
                      value={otpName}
                      onChangeText={(t) => { setOtpName(t); if (otpError) setOtpError('') }}
                    />
                  </View>
                </View>

                <View>
                  <Text className="font-geist-medium text-ink-strong font-medium mb-2">Email *</Text>
                  <View className="relative">
                    <Mail size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-ink ${otpError && !validateEmail(otpEmail) ? 'border-neg' : 'border-hairline'}`}
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
                  className={`rounded-full py-4 items-center flex-row justify-center gap-2 ${otpCooldown > 0 ? 'bg-paper border border-hairline' : 'bg-accent shadow-clinical-sm'}`}
                  style={{ opacity: isSendingOtp ? 0.6 : 1 }}
                >
                  {isSendingOtp ? <ActivityIndicator color={otpCooldown > 0 ? '#0E1F1C' : 'white'} /> : <RefreshCw size={16} color={otpCooldown > 0 ? '#0E1F1C' : 'white'} />}
                  <Text className={`font-geist-bold font-bold ${otpCooldown > 0 ? 'text-ink-strong' : 'text-white'}`}>
                    {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : otpSent ? 'Resend code' : 'Send verification code'}
                  </Text>
                </TouchableOpacity>

                {otpSent && (
                  <>
                    <View className="h-[1px] bg-hairline my-1" />
                    <View>
                      <Text className="font-geist-medium text-ink-strong font-medium mb-2">6-digit code *</Text>
                      <TextInput
                        ref={otpInputRef}
                        className={`border rounded-2xl px-4 py-4 text-center text-2xl tracking-[10px] font-bold text-ink ${otpError ? 'border-neg' : 'border-hairline'}`}
                        placeholder="------"
                        placeholderTextColor="#64746F"
                        value={otpCode}
                        onChangeText={(t) => {
                          const v = t.replace(/[^0-9]/g, '').slice(0, 6)
                          setOtpCode(v)
                          if (otpError) setOtpError('')
                        }}
                        keyboardType="number-pad"
                        // No native maxLength/autofill — see verify-otp note.
                        // JS slice(0, 6) enforces length (freeze bisect).
                        returnKeyType="done"
                        onSubmitEditing={handleVerifyOtp}
                      />
                      <Text className="font-sans text-xs text-ink-muted mt-2 text-center">Code expires in 5 minutes. Check spam folder if missing.</Text>
                      {otpError ? <Text className="font-sans text-neg text-sm mt-2 text-center">{otpError}</Text> : null}
                    </View>

                    <TouchableOpacity
                      onPress={handleVerifyOtp}
                      disabled={isVerifyingOtp || otpCode.length !== 6}
                      className={`rounded-full py-4 items-center ${otpCode.length === 6 ? 'bg-accent shadow-clinical-sm' : 'bg-paper border border-hairline'}`}
                      style={{ opacity: isVerifyingOtp ? 0.7 : 1 }}
                    >
                      {isVerifyingOtp ? <ActivityIndicator color="white" /> : <Text className={`font-geist-bold font-bold text-lg ${otpCode.length === 6 ? 'text-white' : 'text-ink-muted'}`}>Verify & Continue</Text>}
                    </TouchableOpacity>
                  </>
                )}
                {!otpSent && otpError ? <Text className="font-sans text-neg text-sm text-center">{otpError}</Text> : null}
              </View>
            ) : (
              <View className="gap-4">
                <View>
                  <Text className="font-geist-medium text-ink-strong font-medium mb-2">Full Name *</Text>
                  <View className="relative">
                    <User size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-ink ${errors.ownerName ? 'border-neg' : 'border-hairline'}`}
                      placeholder="Enter your full name"
                      value={formData.ownerName}
                      onChangeText={(t) => setFormData({ ...formData, ownerName: t })}
                    />
                  </View>
                  {errors.ownerName && <Text className="font-sans text-neg text-sm mt-1">{errors.ownerName}</Text>}
                </View>

                <View>
                  <Text className="font-geist-medium text-ink-strong font-medium mb-2">Email *</Text>
                  <View className="relative">
                    <Mail size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-ink ${errors.ownerEmail ? 'border-neg' : 'border-hairline'}`}
                      placeholder="you@example.com"
                      value={formData.ownerEmail}
                      onChangeText={(t) => setFormData({ ...formData, ownerEmail: t })}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  {errors.ownerEmail && <Text className="font-sans text-neg text-sm mt-1">{errors.ownerEmail}</Text>}
                </View>

                <View>
                  <Text className="font-geist-medium text-ink-strong font-medium mb-2">WhatsApp Number *</Text>
                  <View className="relative">
                    <Smartphone size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 py-3.5 text-ink ${errors.whatsappNumber ? 'border-neg' : 'border-hairline'}`}
                      placeholder="+254 XXX XXX XXX"
                      value={formData.whatsappNumber}
                      onChangeText={(t) => setFormData({ ...formData, whatsappNumber: t })}
                      keyboardType="phone-pad"
                    />
                  </View>
                  {errors.whatsappNumber && <Text className="font-sans text-neg text-sm mt-1">{errors.whatsappNumber}</Text>}
                </View>

                <View>
                  <Text className="font-geist-medium text-ink-strong font-medium mb-2">Password *</Text>
                  <View className="relative">
                    <Lock size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 pr-11 py-3.5 text-ink ${errors.password ? 'border-neg' : 'border-hairline'}`}
                      placeholder="At least 6 characters"
                      value={formData.password}
                      onChangeText={(t) => setFormData({ ...formData, password: t })}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: 14 }}>
                      {showPassword ? <EyeOff size={18} color="#64746F" /> : <Eye size={18} color="#64746F" />}
                    </TouchableOpacity>
                  </View>
                  {errors.password && <Text className="font-sans text-neg text-sm mt-1">{errors.password}</Text>}
                </View>

                <View>
                  <Text className="font-geist-medium text-ink-strong font-medium mb-2">Confirm Password *</Text>
                  <View className="relative">
                    <Lock size={18} color="#64746F" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <TextInput
                      className={`border rounded-2xl px-11 pr-11 py-3.5 text-ink ${errors.confirmPassword ? 'border-neg' : 'border-hairline'}`}
                      placeholder="Repeat password"
                      value={formData.confirmPassword}
                      onChangeText={(t) => setFormData({ ...formData, confirmPassword: t })}
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: 12, top: 14 }}>
                      {showConfirmPassword ? <EyeOff size={18} color="#64746F" /> : <Eye size={18} color="#64746F" />}
                    </TouchableOpacity>
                  </View>
                  {errors.confirmPassword && <Text className="font-sans text-neg text-sm mt-1">{errors.confirmPassword}</Text>}
                </View>

                <TouchableOpacity
                  onPress={handlePasswordSubmit}
                  disabled={isLoadingPassword}
                  className={`bg-primary-600 rounded-full py-4 items-center shadow-clinical-sm ${isLoadingPassword ? 'opacity-50' : ''}`}
                >
                  {isLoadingPassword ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <View className="flex-row items-center">
                      <Text className="font-geist-semibold text-white font-semibold text-lg mr-2">Create Account</Text>
                      <ArrowRight size={20} color="white" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

    </AuthShell>
  )
}
