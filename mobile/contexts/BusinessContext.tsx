import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { api, AUTH_STORAGE_KEYS } from '../lib/api'
import type {
  Business,
  BusinessMember,
  CreateBusinessRequest,
  Role,
  UUID,
} from '../lib/api-dtos'
import { useAuth } from './AuthContext'
import { canRole } from '../lib/permissions'

interface BusinessContextType {
  businesses: Business[]
  activeBusiness: Business | null
  activeBusinessId: UUID | null
  activeRole: Role | null
  isLoading: boolean
  refreshBusinesses: () => Promise<void>
  createBusiness: (data: CreateBusinessRequest) => Promise<Business>
  updateBusiness: (
    businessId: UUID,
    data: Partial<CreateBusinessRequest>,
  ) => Promise<Business>
  selectBusiness: (business: Business) => Promise<void>
  can: (
    resource: string,
    action: 'read' | 'write' | 'delete' | 'configure' | 'generate',
  ) => boolean
}

const BusinessContext = createContext<BusinessContextType | undefined>(
  undefined,
)

export function useBusinessContext() {
  const context = useContext(BusinessContext)
  if (!context)
    throw new Error('useBusinessContext must be used within a BusinessProvider')
  return context
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, userId, setSelectedBusinessAuth } = useAuth()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null)
  const [activeRole, setActiveRole] = useState<Role | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const resolveRole = async (businessId: UUID): Promise<Role | null> => {
    if (!userId) return null
    try {
      const response = await api.get<{ members: BusinessMember[] }>(
        `/businesses/${businessId}/members`,
      )
      const current = response.data.members.find(
        (member) => member.userId === userId && member.isActive,
      )
      return current?.role ?? null
    } catch {
      return null
    }
  }

  const selectBusiness = async (business: Business) => {
    const role = await resolveRole(business.id)
    await setSelectedBusinessAuth(business, role)
    setActiveBusiness(business)
    setActiveRole(role)
  }

  const refreshBusinesses = async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    try {
      const response = await api.get<{ businesses: Business[] }>('/businesses')
      const items = response.data.businesses || []
      setBusinesses(items)

      const savedBusinessId = await AsyncStorage.getItem(
        AUTH_STORAGE_KEYS.businessId,
      )
      const selected =
        items.find((business) => business.id === savedBusinessId) ||
        items[0] ||
        null
      if (selected) await selectBusiness(selected)
    } finally {
      setIsLoading(false)
    }
  }

  const createBusiness = async (data: CreateBusinessRequest) => {
    // Offline queue: if offline, store pending and return optimistic
    const net = await NetInfo.fetch()
    if (!net.isConnected) {
      const pending = {
        ...data,
        _pendingId: `pending_${Date.now()}`,
        _offlinePending: true,
      }
      await AsyncStorage.setItem(
        'bizsawa_pending_business',
        JSON.stringify(pending),
      )
      // Create optimistic local business for UX
      const optimistic: Business = {
        id: pending._pendingId,
        tenantId: pending._pendingId,
        ownerId: userId || pending._pendingId,
        name: data.name,
        slug:
          (data.slug as string) || data.name.toLowerCase().replace(/\s+/g, '-'),
        currency: (data.currency as string) || 'KES',
        timezone: (data.timezone as string) || 'Africa/Nairobi',
        taxPin: (data as any).taxPin,
        phone: (data as any).phone,
        email: (data as any).email,
        address: (data as any).address,
        mpesaPaymentType: (data as any).mpesaPaymentType as any,
        mpesaShortcodeConfigured: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any
      setBusinesses((prev) => [optimistic, ...prev])
      await selectBusiness(optimistic)
      return optimistic
    }

    const response = await api.post<Business>('/businesses', data)
    const business = response.data
    setBusinesses((prev) => [
      business,
      ...prev.filter((item) => item.id !== business.id),
    ])
    await selectBusiness(business)
    await AsyncStorage.removeItem('bizsawa_pending_business')
    return business
  }

  const updateBusiness = async (
    businessId: UUID,
    data: Partial<CreateBusinessRequest>,
  ) => {
    const net = await NetInfo.fetch()
    if (!net.isConnected) {
      // Queue update offline
      const pendingUpdates = JSON.parse(
        (await AsyncStorage.getItem('bizsawa_pending_business_updates')) ||
          '[]',
      )
      pendingUpdates.push({ businessId, data, at: Date.now() })
      await AsyncStorage.setItem(
        'bizsawa_pending_business_updates',
        JSON.stringify(pendingUpdates),
      )
      // Optimistic update
      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === businessId ? ({ ...b, ...data } as Business) : b,
        ),
      )
      if (activeBusiness?.id === businessId) {
        const updated = { ...activeBusiness, ...data } as Business
        setActiveBusiness(updated)
        await AsyncStorage.setItem(
          AUTH_STORAGE_KEYS.business,
          JSON.stringify(updated),
        )
      }
      return activeBusiness as Business
    }

    const response = await api.put<Business>(`/businesses/${businessId}`, data)
    const business = response.data
    setBusinesses((prev) =>
      prev.map((b) => (b.id === businessId ? business : b)),
    )
    if (activeBusiness?.id === businessId) {
      setActiveBusiness(business)
      await AsyncStorage.setItem(
        AUTH_STORAGE_KEYS.business,
        JSON.stringify(business),
      )
    }
    return business
  }

  // Flush pending business creation when coming back online
  useEffect(() => {
    const unsub = NetInfo.addEventListener(async (s) => {
      if (s.isConnected) {
        const pendingRaw = await AsyncStorage.getItem(
          'bizsawa_pending_business',
        )
        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw)
            const { _pendingId, _offlinePending, ...data } = pending
            const res = await api.post<Business>('/businesses', data)
            await AsyncStorage.removeItem('bizsawa_pending_business')
            setBusinesses((prev) => [
              res.data,
              ...prev.filter((b) => b.id !== _pendingId),
            ])
            await selectBusiness(res.data)
          } catch {}
        }
        const updatesRaw = await AsyncStorage.getItem(
          'bizsawa_pending_business_updates',
        )
        if (updatesRaw) {
          try {
            const updates: any[] = JSON.parse(updatesRaw)
            for (const u of updates) {
              await api.put(`/businesses/${u.businessId}`, u.data)
            }
            await AsyncStorage.removeItem('bizsawa_pending_business_updates')
            void refreshBusinesses()
          } catch {}
        }
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      void refreshBusinesses()
    } else {
      setBusinesses([])
      setActiveBusiness(null)
      setActiveRole(null)
    }
  }, [isAuthenticated, userId])

  const value = useMemo<BusinessContextType>(
    () => ({
      businesses,
      activeBusiness,
      activeBusinessId: activeBusiness?.id ?? null,
      activeRole,
      isLoading,
      refreshBusinesses,
      createBusiness,
      updateBusiness,
      selectBusiness,
      can: (resource, action) => canRole(activeRole, resource, action),
    }),
    [businesses, activeBusiness, activeRole, isLoading],
  )

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  )
}
