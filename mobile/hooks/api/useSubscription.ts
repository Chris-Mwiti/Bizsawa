import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { UUID } from '../../lib/api-dtos'

export type PlanCode = 'free' | 'premium' | 'enterprise'

export interface Subscription {
  id: UUID
  userId: UUID
  planCode: PlanCode
  status: string
  startedAt: string
  endsAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface SubscriptionPayment {
  id: UUID
  userId: UUID
  planCode: PlanCode
  amount: string
  currency: string
  phone: string
  checkoutRequestId?: string
  providerReceipt?: string
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  failureCode?: string
  failureMessage?: string
  createdAt: string
  updatedAt: string
}

export function useSubscription() {
  const qc = useQueryClient()
  const subQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await api.get<Subscription>('/subscriptions/subscription')
      return res.data
    },
    staleTime: 60 * 1000,
  })

  const initiate = useMutation({
    mutationFn: async (vars: { planCode: PlanCode; phone: string }) => {
      const res = await api.post<SubscriptionPayment>('/subscriptions/upgrade/initiate', vars, {
        headers: { 'X-Idempotency-Key': `sub-${Date.now()}-${Math.random().toString(36).slice(2,6)}` },
      })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  })

  const getPayment = (id: UUID) =>
    useQuery({
      queryKey: ['subscription', 'payment', id],
      queryFn: async () => {
        const res = await api.get<SubscriptionPayment>(`/subscriptions/payments/${id}`)
        return res.data
      },
      enabled: !!id,
      refetchInterval: (q) => {
        const s = q.state.data?.status
        if (s === 'pending' || s === 'processing') return 3000
        return false
      },
    })

  const isPremium = subQuery.data?.planCode === 'premium' || subQuery.data?.planCode === 'enterprise'
  const isEnterprise = subQuery.data?.planCode === 'enterprise'

  return {
    subscription: subQuery.data,
    isLoading: subQuery.isLoading,
    isPremium,
    isEnterprise,
    refetch: subQuery.refetch,
    initiateUpgrade: initiate.mutateAsync,
    isInitiating: initiate.isPending,
    getPayment,
  }
}
