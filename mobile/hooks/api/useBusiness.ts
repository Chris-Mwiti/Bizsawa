import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Business as BackendBusiness, UUID } from '../../lib/api-dtos'
import { useBusinessContext } from '../../contexts/BusinessContext'

export interface Business extends BackendBusiness {
  // Back-compat aliases — backend no longer returns these synthetic fields,
  // but profile previously read them. Keep optional so old UI doesn't crash.
  ownerName?: string
  ownerEmail?: string
  whatsappNumber?: string | null
  ownerPhone?: string | null
  businessType?: string | null
  yearsInBusiness?: string | null
  metadata?: Record<string, unknown> | null
}

function mapBusiness(business: BackendBusiness): Business {
  return {
    ...business,
    // Keep aliases for older profile code (phone/email) — ensures phone/email always surface
    ownerEmail: business.email,
    whatsappNumber: business.phone,
    ownerPhone: business.phone,
    // Preserve metadata.address for legacy location helper
    metadata: business.address ? { address: business.address } : null,
  }
}

export function useBusiness(id?: UUID | null) {
  const { activeBusiness } = useBusinessContext()
  return useQuery({
    queryKey: ['business', id || activeBusiness?.id],
    queryFn: async () => {
      const businessId = id || activeBusiness?.id
      if (!businessId)
        return activeBusiness ? mapBusiness(activeBusiness) : null
      const response = await api.get<BackendBusiness>(
        `/businesses/${businessId}`,
      )
      return mapBusiness(response.data)
    },
    enabled: !!(id || activeBusiness?.id),
  })
}
