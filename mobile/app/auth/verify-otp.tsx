import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native'
import { Mail, RefreshCw } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'
import { withTimeout } from '../../lib/async'
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
  // Inline confirmation for the auto-send (no modal Alert — see handleSend).
  const [otpSent, setOtpSent] = useState(false)

  const otpRef = useRef<TextInput>(null)
  const hasAutoSentRef = useRef(false)
  // Refs (not state) so rapid double-taps can't start a second request before
  // the re-render disables the button. A second sign-in with a single-use OTP
  // fails with "expired" and its error Alert used to land on top of the home
  // screen after the first request had already navigated away.
  const sendingRef = useRef(false)
  const verifyingRef = useRef(false)
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

  // Auto-send OTP if navigated with email (login screen's "Sign in with email code")
  useEffect(() => {
    if (hasAutoSentRef.current) return
    const e = String(params.email ?? '').trim()
    if (e && /\S+@\S+\.\S+/.test(e) && !isSending && cooldown === 0) {
      hasAutoSentRef.current = true
      // Defer to next tick to allow UI to mount
      setTimeout(() => {
        handleSend(true)
      }, 400)
    }
  }, [params.email])

  const validateEmail = (v: string) => /\S+@\S+\.\S+/.test(v)

  const handleSend = async (isAuto = false) => {
    if (!email.trim() || !validateEmail(email.trim())) {
      setError('Enter a valid email address')
      return
    }
    // Guard: the screen auto-sends on mount, so a manual tap during that
    // flight would issue a SECOND code and invalidate the first email.
    if (sendingRef.current) return
    sendingRef.current = true
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
      // Auto-send confirms inline: a modal Alert arriving seconds later (slow
      // Resend/cold backend) while the user is typing steals all touch and
      // reads exactly like a freeze. Manual sends keep the modal (expected).
      if (isAuto) {
        setOtpSent(true)
      } else {
        Alert.alert('Code sent', `We sent a 6-digit code to ${email.trim()}. It expires in 5 minutes.`)
      }
      setTimeout(() => otpRef.current?.focus(), 300)
    } catch (e: any) {
      setError(e.message || 'Failed to send code')
      Alert.alert('Failed to send', e.message || 'Try again')
    } finally {
      sendingRef.current = false
      if (mountedRef.current) setIsSending(false)
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
    // Double-tap guard — see sendingRef comment above.
    if (verifyingRef.current) return
    verifyingRef.current = true
    // Dismiss the keyboard + blur BEFORE the request: on Android a focused
    // input keeps the window in adjustResize mode and the spinner frame can
    // stall behind the keyboard, which reads as a freeze.
    Keyboard.dismiss()
    otpRef.current?.blur()
    setError('')
    setIsVerifying(true)
    try {
      // Bound the sign-in leg: axios alone allows 30s of silent spinner.
      await withTimeout(
        signInWithOtp(email.trim().toLowerCase(), code),
        25000,
        'Sign-in',
      )
      // Business-aware redirect, but NEVER hang the spinner on it: the probe
      // is best-effort (8s) and defaults to business-setup, which itself
      // handles users that turn out to already have a business.
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
      if (!hasBusiness) {
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
          const existing = await AsyncStorage.getItem('bizsawa_pending_business_prefill')
          if (!existing) {
            await AsyncStorage.setItem(
              'bizsawa_pending_business_prefill',
              JSON.stringify({ name: '', phone: '', email: email.trim().toLowerCase() }),
            )
          }
        } catch {
          // Prefill is cosmetic — never block navigation on storage.
        }
      }
      // Object-form href: NavigationGate passes auth flows straight through
      // instead of holding them on the tabs prefetch (which fires
      // analytics/products queries that 403/retry for business-less users).
      router.replace({ pathname: hasBusiness ? '/(tabs)' : '/auth/business-setup' } as any)
    } catch (e: any) {
      const msg = e.message || 'Invalid or expired code'
      if (mountedRef.current) setError(msg)
      // Inline error only — no Alert: with the double-tap race closed the
      // request that fails is always the visible one, and a modal Alert
      // shown after a successful navigation used to strand users.
    } finally {
      verifyingRef.current = false
      if (mountedRef.current) setIsVerifying(false)
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
          onPress={() => handleSend(false)}
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
            {cooldown > 0 ? `Resend in ${cooldown}s` : otpSent ? 'Resend code' : 'Send OTP'}
          </Text>
        </TouchableOpacity>
        {otpSent && cooldown === 0 ? (
          <Text className="font-sans text-xs text-pos text-center">
            Code sent — check spam if missing. Expires in 5 minutes.
          </Text>
        ) : null}

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
            // NOTE: no `maxLength` / `autoComplete="one-time-code"` /
            // `textContentType` here on purpose. Length is enforced in JS
            // (slice(0, 6) in onChangeText). The native LengthFilter engages
            // for the first time exactly at the 6th character and the Android
            // autofill/SMS-retriever hooks arm on the same boundary — both are
            // suspects in the recurring freeze-after-final-digit hang, and the
            // JS slice already gives identical UX without them.
            returnKeyType="done"
            onSubmitEditing={handleVerify}
          />
          <Text className="font-sans text-xs text-ink-muted mt-2 text-center">
            Check spam folder if you don&apos;t see it. Code expires in 5 minutes.
          </Text>
          {error ? <Text className="font-sans text-neg text-sm mt-2 text-center">{error}</Text> : null}
        </View>

        {/* Deliberately NOT length-gated: the button stays pressable and shape-
            stable at every code length, and handleVerify's regex guard rejects
            short codes with an inline error. A previous build toggled
            `disabled` + styles on otp.length and wedged the JS thread on this
            device the moment the 6th digit committed (Fabric pressability /
            LengthFilter / autofill boundary) — do not reintroduce
            length-driven native-state toggles here without re-testing that
            device path. */}
        <TouchableOpacity
          onPress={handleVerify}
          disabled={isVerifying}
          className="rounded-full py-4 items-center mt-2 bg-accent shadow-clinical-sm"
          style={{ opacity: isVerifying ? 0.7 : 1 }}
        >
          {isVerifying ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="font-geist-bold font-bold text-white">Verify & Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </AuthShell>
  )
}
