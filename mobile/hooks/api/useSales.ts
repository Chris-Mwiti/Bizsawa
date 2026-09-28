import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import type { CreateSaleRequest, Sale, UUID } from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { mergeLocalFirst } from '../../lib/mergeLocalFirst'
import { v4 as uuidv4 } from 'uuid'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { useAuth } from '../../contexts/AuthContext'
import { shortId } from '../../lib/ids'
import { toISO, nowMillis } from '../../lib/syncDates'

export interface CreateSaleInput {
  orderId?: UUID | null
  customerId?: UUID | null
  paymentMethod?: string
  productId?: UUID
  variantId?: UUID | null
  quantity?: number | string
  totalAmount?: number | string
  lines?: CreateSaleRequest['lines']
}
function toCreateSaleRequest(data: CreateSaleInput): CreateSaleRequest {
  return {
    orderId: data.orderId || null,
    customerId: data.customerId || null,
    paymentMethod: data.paymentMethod,
    lines:
      data.lines ||
      (data.productId
        ? [
            {
              productId: data.productId,
              variantId: data.variantId || null,
              quantity: toDecimalString(data.quantity ?? 1),
              unitPrice: toDecimalString(data.totalAmount ?? 0),
            },
          ]
        : []),
  }
}
function mapRaw(raw: any): Sale {
  // raw may be Watermelon Model instance (camelCase getters) or _raw snake_case object
  const src: any = raw?._raw ? raw._raw : raw
  const get = (snake: string, camel: string) =>
    src[snake] ?? raw[camel] ?? raw[snake]
  return {
    id: raw.id || src.id,
    businessId: get('business_id', 'businessId'),
    orderId: get('order_id', 'orderId'),
    customerId: get('customer_id', 'customerId'),
    receiptNumber:
      get('receipt_number', 'receiptNumber') ||
      (raw.id ? `RCPT-${shortId(raw.id || src.id, 6)}` : ''),
    staffId: get('staff_id', 'staffId') || null,
    paymentMethod: get('payment_method', 'paymentMethod') || 'cash',
    subtotal: get('subtotal', 'subtotal') || '0',
    taxAmount: get('tax_amount', 'taxAmount') || '0',
    total: get('total', 'total') || '0',
    status: get('status', 'status') || 'completed',
    soldAt: toISO(get('sold_at', 'soldAt')),
    createdAt: toISO(get('created_at', 'createdAt')),
    updatedAt: toISO(get('updated_at', 'updatedAt')),
    _status: src._status,
    _changed: src._changed,
  } as any
}

export const useSales = () => {
  const queryClient = useQueryClient()
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const { userId } = (() => {
    try {
      return useAuth() as any
    } catch {
      return { userId: null }
    }
  })()
  const bid = activeBusinessId || ''
  const [local, setLocal] = useState<Sale[]>([])
  const [isLocalLoading, setIsLocalLoading] = useState(true)
  useEffect(() => {
    if (!bid) {
      setLocal([])
      setIsLocalLoading(false)
      return
    }
    const col: any = (database as any).get('sales')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => {
        setLocal(rows.map(mapRaw))
        setIsLocalLoading(false)
      })
    return () => sub.unsubscribe()
  }, [bid])

  const getSales = useQuery({
    queryKey: ['sales', bid],
    queryFn: async ({ signal }) => {
      const res = await api.get<{ sales: Sale[] }>('/sales', { signal })
      return res.data.sales || []
    },
    enabled: !!bid,
  })

  const createSale = useMutation({
    mutationFn: async (data: CreateSaleInput) => {
      if (!bid) throw new Error('Select a business first')
      const req = toCreateSaleRequest(data)
      if (!req.lines?.length) throw new Error('Add at least one product')
      if (!userId) throw new Error('Not authenticated')
      const id = uuidv4()
      const receipt = `RCPT-${shortId(id, 6)}`
      const total = req.lines.reduce(
        (s, l) => s + toNumber(l.unitPrice) * toNumber(l.quantity),
        0,
      )
      const now = nowMillis()
      await (database as any).write(async () => {
        const col: any = (database as any).get('sales')
        await col.create((rec: any) => {
          rec._raw.id = id
          rec.businessId = bid
          rec.orderId = req.orderId || null
          rec.customerId = req.customerId || null
          rec.receiptNumber = receipt
          rec.staffId = userId
          rec.paymentMethod = req.paymentMethod || 'cash'
          rec.subtotal = toDecimalString(total)
          rec.taxAmount = toDecimalString(0)
          rec.total = toDecimalString(total)
          rec.status = 'completed'
          rec.soldAt = now
          rec.syncVersion = 1
        })
        const lineCol: any = (database as any).get('sale_lines')
        for (const line of req.lines) {
          await lineCol.create((rec: any) => {
            rec._raw.id = uuidv4()
            rec.businessId = bid
            rec.saleId = id
            rec.productId = line.productId
            // variant-aware: store variant if selected, else null
            rec.productVariantId = (line as any).variantId || null
            rec.quantity = toDecimalString(line.quantity)
            rec.unitPrice = toDecimalString(line.unitPrice)
            rec.lineTotal = toDecimalString(
              toNumber(line.quantity) * toNumber(line.unitPrice),
            )
            rec.syncVersion = 1
          })
        }
      })
      import('../../sync/client').then((m) => m.syncNow().catch((e) => console.warn('[Sales] auto-sync after create failed', e?.message)))
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      // poke backend to ensure snapshot reflects new sale within seconds (sync push also invalidates server-side)
      import('../../lib/api').then(({ api }) => api.post('/analytics/refresh', {}, { params: { timeframe: 'week' } }).catch(()=>{}))
      return {
        id,
        receiptNumber: receipt,
        total: toDecimalString(total),
      } as any
    },
  })

  const voidSale = useMutation({
    mutationFn: async (id: UUID) => {
      await (database as any).write(async () => {
        const rec: any = await (database as any).get('sales').find(id)
        await rec.update((r: any) => {
          r.deletedAt = nowMillis()
        })
        await rec.markAsDeleted()
      })
      import('../../sync/client').then((m) => m.syncNow().catch((e) => console.warn('[Sales] auto-sync after void failed', e?.message)))
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      import('../../lib/api').then(({ api }) => api.post('/analytics/refresh', {}, { params: { timeframe: 'week' } }).catch(()=>{}))
    },
  })

  // Offline-first merge: a locally-edited sale keeps its optimistic status until the
  // server confirms the push. Sales are normally minted server-side by ensureSaleForOrder,
  // so only the fields a client can legitimately change are overlaid.
  const sales = mergeLocalFirst<Sale>(getSales.data as Sale[] | undefined, local, {
    overlayFields: ['status', 'paymentMethod'] as (keyof Sale)[],
  })
  return {
    sales,
    isLoading:
      (getSales.isLoading && !local.length) ||
      (isLocalLoading && !getSales.data),
    error: (getSales.error as ApiError)?.friendlyMessage || null,
    refetch: getSales.refetch,
    createSale: createSale.mutateAsync,
    isCreating: createSale.isPending,
    updateSale: async () => {
      throw new Error('Updating sales is not supported. Void the sale instead.')
    },
    isUpdating: false,
    deleteSale: voidSale.mutateAsync,
    isDeleting: voidSale.isPending,
  }
}
