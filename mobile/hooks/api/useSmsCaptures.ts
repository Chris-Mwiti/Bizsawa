import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import {
  flushSmsQueue,
  getSmsQueueCount,
  handleIncomingSms,
} from '../../lib/mpesa-sms'
import {
  getSmsConsent,
  grantSmsConsent,
  hasSmsConsent,
  revokeSmsConsent,
} from '../../lib/mpesa-sms/consent'
import { SMS_CONSENT_VERSION } from '../../lib/mpesa-sms/types'

export interface CapturedPaymentDto {
  id: string
  mpesaReceipt?: string
  amountMinor: number
  currency: string
  occurredAt: string
  channelType: string
  source: string
  verificationStatus: string
}

export const useCapturedPayments = (filters?: { status?: string; channel?: string }) => {
  return useQuery({
    queryKey: ['capturedPayments', filters],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filters?.status) params.status = filters.status
      if (filters?.channel) params.channel = filters.channel
      const res = await api.get<{ payments: CapturedPaymentDto[] }>('/payments/captured', {
        params,
      })
      const data: any = res.data
      return (Array.isArray(data) ? data : data.payments || data.data || []) as CapturedPaymentDto[]
    },
  })
}

export const useSmsQueue = () => {
  const [pending, setPending] = useState(0)
  const refresh = async () => setPending(await getSmsQueueCount().catch(() => 0))
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [])
  const queryClient = useQueryClient()
  const flush = useMutation({
    mutationFn: () => flushSmsQueue(),
    onSuccess: () => {
      refresh()
      queryClient.invalidateQueries({ queryKey: ['capturedPayments'] })
    },
  })
  return { pending, refresh, flush }
}

export const useSmsConsentState = () => {
  const [consent, setConsent] = useState<string | null>(null)
  useEffect(() => {
    getSmsConsent().then(setConsent).catch(() => setConsent(null))
  }, [])
  return {
    consent,
    granted: consent === SMS_CONSENT_VERSION,
    grant: async () => {
      await grantSmsConsent()
      setConsent(await getSmsConsent())
    },
    revoke: async () => {
      await revokeSmsConsent()
      setConsent(null)
    },
    check: hasSmsConsent,
  }
}

export const useHandleSms = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { body: string; sender?: string | null }) => handleIncomingSms(args),
    onSuccess: (r) => {
      if (r.stored) queryClient.invalidateQueries({ queryKey: ['capturedPayments'] })
    },
  })
}
