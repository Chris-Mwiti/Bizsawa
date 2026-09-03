import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Business as BackendBusiness, UUID } from '../../lib/api-dtos'
import { useBusinessContext } from '../../contexts/BusinessContext'

export interface Business extends BackendBusiness {
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
    ownerEmail: business.email,
    whatsappNumber: business.phone,
    ownerPhone: business.phone,
    metadata: { address: business.address },
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
