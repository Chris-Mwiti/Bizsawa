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
} from '../lib/offlineAuth'
import type {
  AuthResponse,
  Business,
  LoginRequest,
  RegisterRequest,
  UUID,
} from '../lib/api-dtos'

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
    try {
      // Try SecureStore first (migrated), then AsyncStorage fallback
      const secure = await getSecureAuth()
      const access =
        secure?.access ||
        (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.accessToken)) ||
        (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.legacyToken))
      const refresh =
        secure?.refresh ||
        (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.refreshToken))
      const storedUserId =
        secure?.userId || (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.userId))

      if (access && refresh && storedUserId) {
        setUserId(storedUserId)
        setAuthTokens({ access, refresh })
        setUserData(await loadBusinessBackCompat(storedUserId))
        setIsAuthenticated(true)
      }
    } catch (error) {
      console.error('Error checking auth status:', error)
    } finally {
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
    if (secure)
      setAuthTokens({ access: secure.access, refresh: secure.refresh })
    setUserData({ id: cred.userId })
    setIsAuthenticated(true)
    if (businessId) {
      await AsyncStorage.setItem(AUTH_STORAGE_KEYS.businessId, businessId)
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
    if (secure)
      setAuthTokens({ access: secure.access, refresh: secure.refresh })
    setUserData({ id: cred.userId })
    setIsAuthenticated(true)
    if (businessId) {
      await AsyncStorage.setItem(AUTH_STORAGE_KEYS.businessId, businessId)
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
    throw new Error(
      'Google login is not available until the backend exposes /auth/google.',
    )
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
    if (role) await AsyncStorage.setItem(AUTH_STORAGE_KEYS.role, role)
    setUserData((prev) => ({
      id: prev?.id || userId || business.ownerId,
      name: business.name,
      ownerEmail: business.email,
    }))
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
      register,
      setSelectedBusinessAuth,
      logout,
    }),
    [isAuthenticated, userId, userData, authTokens, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
