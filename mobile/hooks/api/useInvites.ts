import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { BusinessMember } from '../../lib/api-dtos'
import { useBusinessContext } from '../../contexts/BusinessContext'

export type InviteRole = 'MANAGER' | 'CASHIER' | 'VIEWER'

export interface BusinessInvite {
  id: string
  businessId: string
  email: string
  role: InviteRole
  expiresAt: string
  createdAt: string
}

export const useInvites = () => {
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const bid = activeBusinessId || ''
  const qc = useQueryClient()

  const membersQuery = useQuery({
    queryKey: ['members', bid],
    queryFn: async ({ signal }) => {
      const res = await api.get<{ members: BusinessMember[] }>(`/businesses/${bid}/members`, { signal } as any)
      return res.data.members || []
    },
    enabled: !!bid,
  })

  const invitesQuery = useQuery({
    queryKey: ['invites', bid],
    queryFn: async ({ signal }) => {
      const res = await api.get<{ invites: BusinessInvite[] }>(`/businesses/${bid}/members/invites`, { signal } as any)
      return res.data.invites || []
    },
    enabled: !!bid,
  })

  const inviteByEmail = useMutation({
    mutationFn: async (data: { email: string; role: InviteRole }) => {
      if (!bid) throw new Error('Select a business first')
      const res = await api.post(`/businesses/${bid}/members/invite-email`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites', bid] })
      qc.invalidateQueries({ queryKey: ['members', bid] })
    },
  })

  const acceptInvite = useMutation({
    mutationFn: async (data: { email: string; otp: string; name?: string }) => {
      if (!bid) throw new Error('Select a business first')
      const res = await api.post(`/businesses/${bid}/members/accept-invite`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['invites'] })
    },
  })

  // Public accept without prior auth — businessId optional, server looks up by email+otp
  const acceptInvitePublic = useMutation({
    mutationFn: async (data: { businessId?: string; email: string; otp: string; name?: string }) => {
      const res = await api.post(`/invites/accept`, data)
      return res.data
    },
  })

  return {
    members: membersQuery.data || [],
    membersLoading: membersQuery.isLoading,
    invites: invitesQuery.data || [],
    invitesLoading: invitesQuery.isLoading,
    inviteByEmail: inviteByEmail.mutateAsync,
    isInviting: inviteByEmail.isPending,
    acceptInvite: acceptInvite.mutateAsync,
    acceptInvitePublic: acceptInvitePublic.mutateAsync,
    refetch: () => {
      membersQuery.refetch()
      invitesQuery.refetch()
    },
  }
}
