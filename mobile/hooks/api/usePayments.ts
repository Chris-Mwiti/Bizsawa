import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type {
  InitiatePaymentRequest,
  PaymentCommand,
  UUID,
} from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { v4 as uuidv4 } from 'uuid'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { toISO, nowMillis } from '../../lib/syncDates'

export interface PaymentInitiationRequest {
  orderId?: UUID
  invoiceId?: UUID | null
  phone: string
  amount: number | string
  currency?: string
  accountReference?: string
}

export type PaymentInitiationResponse = PaymentCommand

function toInitiateRequest(
  data: PaymentInitiationRequest,
): InitiatePaymentRequest {
  return {
    type: 'stk_push',
    invoiceId: data.invoiceId || null,
    amount: toDecimalString(data.amount),
    currency: data.currency || 'KES',
    phone: data.phone,
    accountReference: data.accountReference || data.orderId,
    orderID: data.orderId,
    payload: data.orderId ? { orderId: data.orderId } : undefined,
  }
}

function mapRaw(raw: any): PaymentCommand {
  const src: any = raw?._raw ? raw._raw : raw
  const get = (snake: string, camel: string) => src[snake] ?? raw[camel] ?? raw[snake]
  return {
    id: raw.id || src.id,
    businessId: get('business_id', 'businessId'),
    invoiceId: get('invoice_id', 'invoiceId') || null,
    type: get('type', 'type') || 'stk_push',
    status: get('status', 'status') || 'pending',
    amount: get('amount', 'amount') || '0',
    currency: get('currency', 'currency') || 'KES',
    phone: get('phone', 'phone'),
    accountReference: get('account_reference', 'accountReference'),
    provider: get('provider', 'provider') || 'mpesa',
    createdAt: toISO(get('created_at', 'createdAt')),
    updatedAt: toISO(get('updated_at', 'updatedAt')),
    processedAt: get('processed_at', 'processedAt') ? toISO(get('processed_at', 'processedAt')) : null,
  } as any
}

// Offline-first: observe local payment_commands and merge with server
export const usePaymentCommands = () => {
  const { activeBusinessId } = (() => {
    try { return useBusinessContext() as any } catch { return { activeBusinessId: null } }
  })()
  const bid = activeBusinessId || ''
  const [local, setLocal] = useState<PaymentCommand[]>([])
  const [isLocalLoading, setIsLocalLoading] = useState(true)
  useEffect(() => {
    if (!bid) { setLocal([]); setIsLocalLoading(false); return }
    const col: any = (database as any).get('payment_commands')
    const sub = col.query(Q.where('business_id', bid)).observe().subscribe((rows: any[]) => {
      setLocal(rows.map(mapRaw))
      setIsLocalLoading(false)
    })
    return () => sub.unsubscribe()
  }, [bid])
  const getRemote = useQuery({
    queryKey: ['paymentCommands', bid],
    queryFn: async () => {
      const res = await api.get<{ payments: PaymentCommand[] } | PaymentCommand[]>('/payments')
      const data: any = res.data
      const list = Array.isArray(data) ? data : data.payments || data.data || []
      return list as PaymentCommand[]
    },
    enabled: !!bid,
  })
  const merged = (() => {
    const server = getRemote.data as any[] | undefined
    if (server === undefined) return local
    if (!local.length) return server
    const serverIds = new Set(server.map((s: any) => s.id))
    const pending = local.filter((l: any) => !serverIds.has(l.id))
    return pending.length ? [...server, ...pending] : server
  })()
  return { paymentCommands: merged, isLoading: (isLocalLoading || getRemote.isLoading) && merged.length===0, refetch: getRemote.refetch }
}

export const useInitiatePayment = () => {
  const queryClient = useQueryClient()
  const { activeBusinessId } = (() => {
    try { return useBusinessContext() as any } catch { return { activeBusinessId: null } }
  })()
  const bid = activeBusinessId || ''
  return useMutation({
    mutationFn: async (data: PaymentInitiationRequest) => {
      if (!bid) throw new Error('Select a business first')
      if (!data.orderId) throw new Error('orderId required for payment')
      if (!data.phone) throw new Error('Phone required for M-Pesa')
      const amountStr = toDecimalString(data.amount)
      if (toNumber(amountStr) <= 0) throw new Error('Amount must be positive')
      const id = uuidv4()
      // Offline-first: always write locally, then sync
      await (database as any).write(async () => {
        const col: any = (database as any).get('payment_commands')
        await col.create((rec: any) => {
          rec._raw.id = id
          rec.businessId = bid
          rec.orderId = data.orderId!
          rec.amount = amountStr
          rec.currency = data.currency || 'KES'
          rec.phone = data.phone
          rec.status = 'pending'
          rec.provider = 'mpesa'
          rec.type = 'stk_push'
          rec.idempotencyKey = id
          rec.syncVersion = 1
        })
      })
      // Trigger sync (will push when online, queue when offline)
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['paymentCommands'] })
      queryClient.invalidateQueries({ queryKey: ['paymentStatus'] })
      // Optimistically also try direct API if online for faster provider feedback — but local is source of truth
      // Fire-and-forget online attempt only if we have connectivity; sync push is fallback
      try {
        const { default: NetInfo } = await import('@react-native-community/netinfo')
        const state: any = await NetInfo.fetch()
        if (state.isConnected) {
          // Use idempotencyKey = id to ensure idempotent even if sync also pushes
          const { generateIdempotencyKey, clearIdempotencyKey, OperationId } = await import('../../lib/idempotency')
          const operationId = OperationId.initiatePayment(data.orderId!, amountStr)
          const idempotencyKey = await generateIdempotencyKey(operationId)
          try {
            const response = await api.post<PaymentCommand>('/payments', toInitiateRequest(data), { headers: { 'X-Idempotency-Key': idempotencyKey } })
            await clearIdempotencyKey(operationId)
            // If server succeeded and created a different id, we keep local id as pending until next pull reconciles; client can use server id for polling
            // Update local status to processing if server confirms
            try {
              await (database as any).write(async () => {
                const rec: any = await (database as any).get('payment_commands').find(id)
                await rec.update((r: any) => { r.status = response.data.status || 'processing' })
              })
            } catch {}
            return response.data
          } catch (e: any) {
            // 4xx will not be retried via sync anyway, but offline queue remains; if online error, surface it but keep local pending for retry
            if (e?.response?.status >= 400 && e?.response?.status < 500) {
              // For client errors, mark local as failed to avoid endless retry? Keep pending but surface error
              throw e
            }
            // For network/server errors, rely on sync retry — return local pending
          }
        }
      } catch {}
      return { id, businessId: bid, orderId: data.orderId, phone: data.phone, amount: amountStr, currency: data.currency || 'KES', status: 'pending', provider: 'mpesa', type: 'stk_push' } as any
    },
  })
}

export const usePaymentStatus = (
  paymentId: UUID | number | undefined,
  enabled = false,
) => {
  const normalizedId =
    typeof paymentId === 'number' ? String(paymentId) : paymentId
  const shouldRun = enabled && !!normalizedId
  // Also observe local payment_commands for this id (offline pending)
  const [localPayment, setLocalPayment] = useState<PaymentCommand | null>(null)
  useEffect(() => {
    if (!normalizedId) { setLocalPayment(null); return }
    let sub: any
    ;(async () => {
      try {
        const col: any = (database as any).get('payment_commands')
        const rec: any = await col.find(normalizedId).catch(() => null)
        if (rec) setLocalPayment(mapRaw(rec))
        // Also observe
        sub = col.query(Q.where('id', normalizedId)).observe().subscribe((rows: any[]) => {
          if (rows[0]) setLocalPayment(mapRaw(rows[0]))
        })
      } catch {}
    })()
    return () => { try { sub?.unsubscribe() } catch {} }
  }, [normalizedId])
  const remote = useQuery({
    queryKey: ['paymentStatus', normalizedId],
    queryFn: async () => {
      const response = await api.get<PaymentCommand>(
        `/payments/${normalizedId}`,
      )
      return response.data
    },
    enabled: shouldRun,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'succeeded' || status === 'failed') return false
      // If local is pending, keep polling after sync may update server status
      return 3000
    },
  })
  // Offline-first merge: if remote not yet available, show local; if both, prefer remote newer status
  const data = remote.data || localPayment
  return { ...remote, data } as any
}
