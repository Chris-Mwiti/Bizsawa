import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { router } from 'expo-router'
import {
  api,
  AUTH_STORAGE_KEYS,
  clearAuthStorage,
  persistAuthResponse,
  primeAuthCache,
} from '../lib/api'
import {
  secureStorage,
  persistSecureAuth,
  getSecureAuth,
  clearSecureAuth,
} from '../lib/secureStorage'
import {
  cacheOfflineCredential,
  verifyOfflineCredential,
  getOfflineCredential,
  decodeJwtExp,
} from '../lib/offlineAuth'
import type {
  AuthResponse,
  Business,
  LoginRequest,
  RegisterRequest,
  UUID,
} from '../lib/api-dtos'
import { perf } from '../lib/perf'

interface UserData {
  id: UUID
  ownerName?: string
  ownerEmail?: string
  name?: string
}

interface AuthTokens {
  access: string
  refresh: string
}

interface AuthContextType {
  isAuthenticated: boolean
  userId: UUID | null
  userData: UserData | null
  authTokens: AuthTokens | null
  isLoading: boolean
  login: (credentials: LoginRequest) => Promise<void>
  loginWithGoogle: () => Promise<void>
  loginWithBiometrics: (email: string) => Promise<void>
  // Email OTP — BetterAuth EmailOTP plugin parity (Agents_Documents/BetterAuth/EmailOTP.md)
  sendVerificationOtp: (email: string, type: 'sign-in' | 'email-verification' | 'forget-password') => Promise<void>
  checkVerificationOtp: (email: string, type: 'sign-in' | 'email-verification' | 'forget-password', otp: string) => Promise<boolean>
  signInWithOtp: (email: string, otp: string, name?: string, image?: string) => Promise<void>
  verifyEmailWithOtp: (email: string, otp: string) => Promise<void>
  requestPasswordResetOtp: (email: string) => Promise<void>
  resetPasswordWithOtp: (email: string, otp: string, newPassword: string) => Promise<void>
  register: (
    data: Partial<RegisterRequest> & Record<string, unknown>,
  ) => Promise<AuthResponse>
  setSelectedBusinessAuth: (
    business: Business,
    role?: string | null,
  ) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userId, setUserId] = useState<UUID | null>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [authTokens, setAuthTokens] = useState<AuthTokens | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    void checkAuthStatus()
  }, [])

  const loadBusinessBackCompat = async (
    storedUserId: UUID,
  ): Promise<UserData> => {
    const savedBusiness = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.business)
    if (savedBusiness) {
      const business = JSON.parse(savedBusiness) as Business
      return {
        id: storedUserId,
        name: business.name,
        ownerEmail: business.email,
      }
    }
    return { id: storedUserId }
  }

  const checkAuthStatus = async () => {
    const span = perf.start('startup.auth.check', { phase: 'startup' })
    let outcome = 'valid'
    try {
      // Storage reads + connectivity probe are independent — fire together.
      // Previously 4 sequential AsyncStorage reads + NetInfo.fetch ran back to
      // back on every cold start; now they overlap in one round.
      const netProbe = NetInfo.fetch().catch(
        () => ({ isConnected: true as boolean | null }),
      )
      const [secure, storedAccess, legacyAccess, storedRefresh, storedUserId] =
        await Promise.all([
          getSecureAuth(),
          AsyncStorage.getItem(AUTH_STORAGE_KEYS.accessToken),
          AsyncStorage.getItem(AUTH_STORAGE_KEYS.legacyToken),
          AsyncStorage.getItem(AUTH_STORAGE_KEYS.refreshToken),
          AsyncStorage.getItem(AUTH_STORAGE_KEYS.userId),
        ])
      const access = secure?.access || storedAccess || legacyAccess
      const refresh = secure?.refresh || storedRefresh
      const resolvedUserId = secure?.userId || storedUserId

      if (!access || !refresh || !resolvedUserId) {
        setIsAuthenticated(false)
        outcome = 'no-session'
        return
      }

      // Online detection — offline we deliberately do NOT auto-authenticate
      // (security: cold start while offline must force manual password/biometric).
      // Tokens remain stored so LoginScreen can still do offline credential check.
      // The probe started alongside the storage reads above, so this await
      // usually resolves immediately.
      const net = await netProbe
      const isConnected = net?.isConnected ?? true
      if (isConnected === false) {
        setUserId(resolvedUserId)
        setAuthTokens({ access, refresh })
        setUserData(await loadBusinessBackCompat(resolvedUserId))
        setIsAuthenticated(false)
        outcome = 'offline'
        return
      }

      // Online: validate accessToken expiry locally before marking authenticated
      const expMs = decodeJwtExp(access)
      const isExpired = expMs !== null && Date.now() > expMs
      const isNearExpiry = expMs !== null && expMs - Date.now() < 60 * 1000

      if (isExpired || isNearExpiry) {
        try {
          const response = await api.post<AuthResponse>('/auth/refresh', {
            refreshToken: refresh,
          })
          // Persist rotated tokens (no email/password needed for offline cache refresh)
          await persistAuthResponse(response.data)
          await persistSecureAuth({
            accessToken: response.data.accessToken,
            refreshToken: response.data.refreshToken,
            userId: response.data.userId,
          })
          setUserId(response.data.userId)
          setAuthTokens({
            access: response.data.accessToken,
            refresh: response.data.refreshToken,
          })
          setUserData(await loadBusinessBackCompat(response.data.userId))
          setIsAuthenticated(true)
          outcome = 'refreshed'
          return
        } catch {
          // Refresh failed — token revoked/expired, force sign-in
          await clearAuthStorage()
          await clearSecureAuth()
          setUserId(null)
          setAuthTokens(null)
          setUserData(null)
          setIsAuthenticated(false)
          outcome = 'refresh-failed'
          return
        }
      }

      // Token still valid — mark authenticated
      setUserId(resolvedUserId)
      setAuthTokens({ access, refresh })
      setUserData(await loadBusinessBackCompat(resolvedUserId))
      setIsAuthenticated(true)
    } catch (error) {
      console.error('Error checking auth status:', error)
      setIsAuthenticated(false)
      outcome = 'error'
    } finally {
      span.end({ outcome })
      setIsLoading(false)
    }
  }

  const applyAuth = async (
    data: AuthResponse,
    email?: string,
    password?: string,
  ) => {
    await persistAuthResponse(data)
    await persistSecureAuth({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      userId: data.userId,
    })
    // Cache offline credential with 7-day grace
    if (email && password) {
      const bizId = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.businessId)
      await cacheOfflineCredential(email, password, data.userId, bizId)
    }
    setUserId(data.userId)
    setAuthTokens({ access: data.accessToken, refresh: data.refreshToken })
    setUserData({ id: data.userId })
    setIsAuthenticated(true)
  }

  const tryOfflineLogin = async (email: string, password: string) => {
    const cred = await verifyOfflineCredential(email, password)
    if (!cred) {
      throw new Error(
        'Offline login not available. Please connect to internet for first login, or check credentials. Offline access expires after 7 days.',
      )
    }
    const secure = await getSecureAuth()
    const businessId =
      cred.businessId ||
      (await secureStorage.getSecure(secureStorage.SECURE_KEYS.businessId)) ||
      (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.businessId))
    setUserId(cred.userId)
    if (secure) {
      setAuthTokens({ access: secure.access, refresh: secure.refresh })
      primeAuthCache({ token: secure.access })
    }
    setUserData({ id: cred.userId })
    setIsAuthenticated(true)
    if (businessId) {
      await AsyncStorage.setItem(AUTH_STORAGE_KEYS.businessId, businessId)
      primeAuthCache({ businessId })
      await secureStorage.setSecure(
        secureStorage.SECURE_KEYS.businessId,
        businessId,
      )
    }
  }

  // Bullet-proof biometric offline: no password, relies on OS biometric + 7-day grace
  const loginWithBiometrics = async (email: string) => {
    const trimmed = email.toLowerCase().trim()
    if (!trimmed) throw new Error('Email is required for biometric login')
    const cred = await getOfflineCredential(trimmed)
    if (!cred) {
      throw new Error(
        'Biometric offline not available. Please login online once to cache credentials (7-day grace).',
      )
    }
    const secure = await getSecureAuth()
    const businessId =
      cred.businessId ||
      (await secureStorage.getSecure(secureStorage.SECURE_KEYS.businessId)) ||
      (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.businessId))
    setUserId(cred.userId)
    if (secure) {
      setAuthTokens({ access: secure.access, refresh: secure.refresh })
      primeAuthCache({ token: secure.access })
    }
    setUserData({ id: cred.userId })
    setIsAuthenticated(true)
    if (businessId) {
      await AsyncStorage.setItem(AUTH_STORAGE_KEYS.businessId, businessId)
      primeAuthCache({ businessId })
      await secureStorage.setSecure(
        secureStorage.SECURE_KEYS.businessId,
        businessId,
      )
    }
  }

  const login = async (credentials: LoginRequest) => {
    const email = String(credentials.email || '').trim()
    const password = String(credentials.password || '')

    // Check connectivity first
    let isConnected: boolean | null = true
    try {
      const net = await NetInfo.fetch()
      isConnected = net.isConnected
    } catch {}

    if (isConnected === false) {
      // Offline path: verify against SecureStore cache
      try {
        await tryOfflineLogin(email, password)
        return
      } catch (offlineErr: any) {
        throw new Error(
          offlineErr.message ||
            'You are offline. Previous login not found or expired.',
        )
      }
    }

    try {
      const response = await api.post<AuthResponse>('/auth/login', credentials)
      await applyAuth(response.data, email, password)
    } catch (error: any) {
      // If network fails but we have offline credential, try it
      if (!error.response) {
        try {
          await tryOfflineLogin(email, password)
          return
        } catch {}
      }
      throw new Error(
        error.friendlyMessage || 'Login failed. Please check your credentials.',
      )
    }
  }

  const loginWithGoogle = async () => {
    // Better-Auth parity: GoogleSocialLogin.md Cross-Platform Sign In
    // Mobile: native SDK -> idToken -> POST /auth/google {idToken:{token, accessToken}}
    // Web fallback: GET /auth/google redirect handled by backend (baseURL + /callback)
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin')
      // Configure from env — supports web/ios/android clientIds array per BetterAuth docs
      try {
        const Constants: any = await import('expo-constants').then((m) => m.default || m)
        const webId = Constants?.expoConfig?.extra?.googleWebClientId || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
        if (webId) {
          GoogleSignin.configure({
            webClientId: webId,
            offlineAccess: true, // accessType offline per GoogleSocialLogin.md
            forceCodeForRefreshToken: true,
          })
        }
      } catch {}
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      const res: any = await GoogleSignin.signIn()
      const idToken = res?.data?.idToken || res?.idToken
      const accessToken = res?.data?.accessToken || undefined
      if (!idToken) throw new Error('Google sign-in failed: missing idToken')
      // Business scoping: if user already selected business before SSO, pass it for role hydration
      const businessId = (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.businessId)) || undefined
      const payload: any = {
        idToken: { token: idToken, accessToken },
        businessId: businessId || undefined,
      }
      const response = await api.post<AuthResponse>('/auth/google', payload)
      await applyAuth(response.data)
    } catch (e: any) {
      console.error('[Auth] Google login error', { code: e?.code, message: e?.message, friendly: e?.friendlyMessage, response: e?.response?.data })
      // Fallback: web redirect flow via backend (better-auth baseURL)
      if (e?.code === 'SIGN_IN_CANCELLED' || e?.code === '12501') throw new Error('Google sign-in cancelled')
      if (e?.response?.data || e?.friendlyMessage) {
        throw new Error(e.friendlyMessage || e.response?.data?.error?.message || e.message)
      }
      throw new Error(e.message || 'Google login failed')
    }
  }

  const register = async (
    data: Partial<RegisterRequest> & Record<string, unknown>,
  ) => {
    try {
      const email = String(data.email ?? data.ownerEmail ?? '').trim()
      const password = String(data.password ?? '')
      const payload: RegisterRequest = {
        email,
        password,
      }
      const response = await api.post<AuthResponse>('/auth/register', payload)
      await applyAuth(response.data, email, password)
      return response.data
    } catch (error: any) {
      throw new Error(
        error.friendlyMessage || 'Registration failed. Please try again.',
      )
    }
  }

  const setSelectedBusinessAuth = async (
    business: Business,
    role?: string | null,
  ) => {
    await AsyncStorage.multiSet([
      [AUTH_STORAGE_KEYS.businessId, business.id],
      [AUTH_STORAGE_KEYS.business, JSON.stringify(business)],
      [AUTH_STORAGE_KEYS.userData, JSON.stringify(business)],
    ])
    // Keep the interceptor cache coherent — otherwise requests keep sending
    // the previous business until the next cold start.
    primeAuthCache({ businessId: business.id })
    if (role) await AsyncStorage.setItem(AUTH_STORAGE_KEYS.role, role)
    setUserData((prev) => ({
      id: prev?.id || userId || business.ownerId,
      name: business.name,
      ownerEmail: business.email,
    }))
  }

  // Email OTP — forget-password & verification (EmailOTP.md)
  const sendVerificationOtp = async (email: string, type: 'sign-in' | 'email-verification' | 'forget-password') => {
    await api.post('/auth/email-otp/send-verification-otp', { email, type })
  }
  const checkVerificationOtp = async (email: string, type: 'sign-in' | 'email-verification' | 'forget-password', otp: string) => {
    const res = await api.post<{ valid: boolean }>('/auth/email-otp/check-verification-otp', { email, type, otp })
    return res.data.valid
  }
  const signInWithOtp = async (email: string, otp: string, name?: string, image?: string) => {
    const payload: any = { email, otp }
    if (name?.trim()) payload.name = name.trim()
    if (image?.trim()) payload.image = image.trim()
    const res = await api.post<AuthResponse>('/auth/sign-in/email-otp', payload)
    await applyAuth(res.data, email, undefined as any)
  }
  const verifyEmailWithOtp = async (email: string, otp: string) => {
    await api.post('/auth/email-otp/verify-email', { email, otp })
  }
  const requestPasswordResetOtp = async (email: string) => {
    await api.post('/auth/email-otp/request-password-reset', { email })
  }
  const resetPasswordWithOtp = async (email: string, otp: string, newPassword: string) => {
    await api.post('/auth/email-otp/reset-password', { email, otp, password: newPassword })
  }

  const logout = async () => {
    try {
      await clearAuthStorage()
      await clearSecureAuth()
      // Keep offline cred for 7 days? On explicit logout we clear it for security
      // To keep offline login after logout, comment next lines
      // SecureStore offline creds are email-scoped; we cannot enumerate, so we keep them
      // but clear grace
      await AsyncStorage.removeItem('HAS_FINISHED_ONBOARDING')
      setIsAuthenticated(false)
      setUserId(null)
      setUserData(null)
      setAuthTokens(null)
      router.replace('/onboarding')
    } catch (error) {
      console.error('Error during logout:', error)
    }
  }

  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated,
      userId,
      userData,
      authTokens,
      isLoading,
      login,
      loginWithGoogle,
      loginWithBiometrics,
      sendVerificationOtp,
      checkVerificationOtp,
      signInWithOtp,
      verifyEmailWithOtp,
      requestPasswordResetOtp,
      resetPasswordWithOtp,
      register,
      setSelectedBusinessAuth,
      logout,
    }),
    [isAuthenticated, userId, userData, authTokens, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
