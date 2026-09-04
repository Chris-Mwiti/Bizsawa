import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
    const response = await api.post<Business>('/businesses', data)
    const business = response.data
    setBusinesses((prev) => [
      business,
      ...prev.filter((item) => item.id !== business.id),
    ])
    await selectBusiness(business)
    return business
  }

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
