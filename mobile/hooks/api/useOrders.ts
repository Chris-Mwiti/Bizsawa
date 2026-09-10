import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import type { CreateOrderRequest, Order, UUID } from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { v4 as uuidv4 } from 'uuid'
import { Q } from '@nozbe/watermelondb'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { useAuth } from '../../contexts/AuthContext'
import { toISO, nowMillis } from '../../lib/syncDates'
import { shortId } from '../../lib/ids'

export enum OrderStatus {
  draft = 'draft',
  confirmed = 'confirmed',
  fulfilled = 'fulfilled',
  cancelled = 'cancelled',
  refunded = 'refunded',
  drafted = 'draft',
  created = 'confirmed',
  pending = 'draft',
  paid = 'fulfilled',
  canceled = 'cancelled',
  failed = 'cancelled',
}

export interface CreateOrderInput {
  customerId?: UUID | null
  paymentMethod?: string
  orderItems?: {
    productId: UUID
    variantId?: UUID | null
    quantity: number | string
    unitPrice?: number | string
  }[]
  lines?: CreateOrderRequest['lines']
}
export interface UpdateOrderInput {
  status?: OrderStatus
  customerPhone?: string
}
export interface UseOrdersOptions {
  limit?: number
  status?: OrderStatus[]
}

function toCreateOrderRequest(data: CreateOrderInput): CreateOrderRequest {
  return {
    customerId: data.customerId || null,
    paymentMethod: data.paymentMethod,
    lines:
      data.lines ||
      (data.orderItems || []).map((item) => ({
        productId: item.productId,
        variantId: (item as any).variantId || null,
        quantity: toDecimalString(item.quantity),
        unitPrice: toDecimalString(item.unitPrice),
      })),
  }
}
function mapRaw(raw: any): Order {
  const src: any = raw?._raw ? raw._raw : raw
  const get = (snake: string, camel: string) =>
    src[snake] ?? raw[camel] ?? raw[snake]
  return {
    id: raw.id || src.id,
    businessId: get('business_id', 'businessId'),
    customerId: get('customer_id', 'customerId'),
    status: get('status', 'status') || 'draft',
    subtotal: get('subtotal', 'subtotal') || '0',
    taxAmount: get('tax_amount', 'taxAmount') || '0',
    total: get('total', 'total') || '0',
    paymentMethod: get('payment_method', 'paymentMethod') || 'cash',
    createdAt: toISO(get('created_at', 'createdAt')),
    updatedAt: toISO(get('updated_at', 'updatedAt')),
  } as any
}

export const useOrders = (options: UseOrdersOptions = {}) => {
  const queryClient = useQueryClient()
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const bid = activeBusinessId || ''
  const { userId } = (() => {
    try {
      return useAuth() as any
    } catch {
      return { userId: null }
    }
  })()
  const limit = options.limit ?? 25
  const [offset, setOffset] = useState(0)
  const [local, setLocal] = useState<Order[]>([])
  const [isLocalLoading, setIsLocalLoading] = useState(true)
  useEffect(() => {
    if (!bid) {
      setLocal([])
      setIsLocalLoading(false)
      return
    }
    const col: any = (database as any).get('orders')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => {
        setLocal(rows.map(mapRaw))
        setIsLocalLoading(false)
      })
    return () => sub.unsubscribe()
  }, [bid])

  const getOrders = useQuery({
    queryKey: ['orders', { limit, offset, status: options.status, bid }],
    queryFn: async () => {
      const res = await api.get<{ orders: Order[]; total?: number }>(
        '/orders',
        { params: { limit, offset } },
      )
      return res.data
    },
    enabled: !!bid,
    placeholderData: (prev: any) => prev,
  })

  // Offline-first merge: server clean heals 0/NaN, but pending local orders must appear immediately
  const allOrdersMerged = (() => {
    const server = getOrders.data?.orders as any[] | undefined
    if (server === undefined) return local
    if (!local.length) return server
    const serverIds = new Set(server.map((s: any) => s.id))
    const pending = local.filter((l: any) => !serverIds.has(l.id))
    return pending.length ? [...server, ...pending] : server
  })()
  const orders = allOrdersMerged.slice(offset, offset + limit)
  const total =
    getOrders.data?.total !== undefined
      ? (getOrders.data.total as any) +
        (allOrdersMerged.length - (getOrders.data?.orders?.length || 0))
      : allOrdersMerged.length
  const hasNextPage = offset + orders.length < total
  const hasPreviousPage = offset > 0
  const nextPage = () => {
    if (hasNextPage) setOffset((p) => p + limit)
  }
  const previousPage = () => setOffset((p) => Math.max(0, p - limit))
  const resetPagination = () => setOffset(0)

  const createOrder = useMutation({
    mutationFn: async (data: CreateOrderInput) => {
      const req = toCreateOrderRequest(data)
      const id = uuidv4()
      const total = req.lines.reduce(
        (s, l) => s + toNumber(l.unitPrice) * toNumber(l.quantity),
        0,
      )
      await (database as any).write(async () => {
        const col: any = (database as any).get('orders')
        await col.create((rec: any) => {
          rec._raw.id = id
          rec.businessId = bid
          rec.customerId = req.customerId || null
          rec.status = 'draft'
          rec.subtotal = toDecimalString(total)
          rec.taxAmount = toDecimalString(0)
          rec.total = toDecimalString(total)
          rec.paymentMethod = req.paymentMethod || 'cash'
          rec.syncVersion = 1
        })
        const lineCol: any = (database as any).get('order_lines')
        for (const line of req.lines) {
          await lineCol.create((rec: any) => {
            rec._raw.id = uuidv4()
            rec.businessId = bid
            rec.orderId = id
            rec.productId = line.productId
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
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      return { id, status: 'draft', total: toDecimalString(total) } as any
    },
  })

  const updateOrder = useMutation({
    mutationFn: async ({ id, data }: { id: UUID; data: UpdateOrderInput }) => {
      if (!id) throw new Error('Order id is required')
      if (!data || typeof data !== 'object') throw new Error('Update data is required — did you pass undefined?')
      // DTO-safe: normalize status and guard against legacy {type} payloads; use optional chaining to avoid "cannot read property 'type' of undefined"
      const rawStatus = (data as any)?.status
      const newStatus = rawStatus ? String(rawStatus).trim().toLowerCase() : null
      if (newStatus && !['draft', 'confirmed', 'fulfilled', 'cancelled', 'refunded'].includes(newStatus)) {
        throw new Error(`Invalid status: ${String(rawStatus)}`)
      }
      // Legacy guard: callers mistakenly passing {type:'confirmed'} instead of {status}
      if (newStatus === null && (data as any)?.type !== undefined) {
        throw new Error('Invalid payload: `type` is not a valid order field — did you mean `status`?')
      }
      let shouldCreateSale = false
      await (database as any).write(async () => {
        const rec: any = await (database as any).get('orders').find(id)
        const prevStatus = String(rec.status || '').toLowerCase()
        if (newStatus) {
          await rec.update((r: any) => {
            r.status = newStatus
            // bump sync version for conflict detection (§4)
            r.syncVersion = (r.syncVersion || 1) + 1
            // DTO-safe: use model fields (schema v5) — ensures _changed tracks correctly and avoids column.type crash
            if (newStatus === 'confirmed' && !r.confirmedAt) {
              try { r.confirmedAt = Date.now() } catch { try { r._raw.confirmed_at = Date.now() } catch {} }
            }
            if (newStatus === 'fulfilled' && !r.fulfilledAt) {
              try { r.fulfilledAt = Date.now() } catch { try { r._raw.fulfilled_at = Date.now() } catch {} }
            }
            if (newStatus === 'confirmed' || newStatus === 'fulfilled') {
              try { r.paymentStatus = newStatus === 'fulfilled' ? 'fulfilled' : 'confirmed' } catch {}
            }
          })
          if (newStatus === 'fulfilled' && prevStatus !== 'fulfilled') {
            shouldCreateSale = true
          }
        }
        // Offline fulfillment mirrors backend FulfillOrder -> CreateFromOrder: create sale + sale_lines locally
        if (shouldCreateSale) {
          const salesCol: any = (database as any).get('sales')
          // idempotent: don't duplicate if sale for this order already exists
          const existing: any[] = await salesCol.query(Q.where('order_id', id)).fetch()
          if (existing.length === 0) {
            const orderLinesCol: any = (database as any).get('order_lines')
            const lines: any[] = await orderLinesCol.query(Q.where('order_id', id)).fetch()
            const saleId = uuidv4()
            const receipt = `RCPT-${shortId(saleId, 6)}`
            // compute total from order lines if order total is 0/NaN
            const rawTotal = rec.total || rec._raw?.total || '0'
            const computedTotal = lines.reduce((s: number, l: any) => {
              const q = toNumber(l.quantity ?? l._raw?.quantity)
              const p = toNumber(l.unitPrice ?? l._raw?.unit_price)
              return s + q * p
            }, 0)
            const totalStr = toDecimalString(rawTotal !== '0' && rawTotal ? rawTotal : computedTotal || 0)
            const subtotalStr = toDecimalString(rec.subtotal ?? rec._raw?.subtotal ?? totalStr)
            await salesCol.create((sRec: any) => {
              sRec._raw.id = saleId
              sRec.businessId = bid
              sRec.orderId = id
              sRec.customerId = rec.customerId || rec._raw?.customer_id || null
              sRec.receiptNumber = receipt
              sRec.staffId = userId || bid
              sRec.paymentMethod = rec.paymentMethod || rec._raw?.payment_method || 'cash'
              sRec.subtotal = subtotalStr
              sRec.taxAmount = toDecimalString(rec.taxAmount ?? rec._raw?.tax_amount ?? 0)
              sRec.total = totalStr
              sRec.status = 'completed'
              sRec.soldAt = nowMillis()
              sRec.syncVersion = 1
            })
            const saleLinesCol: any = (database as any).get('sale_lines')
            for (const ol of lines) {
              const q = toDecimalString(ol.quantity ?? ol._raw?.quantity)
              const p = toDecimalString(ol.unitPrice ?? ol._raw?.unit_price)
              await saleLinesCol.create((sl: any) => {
                sl._raw.id = uuidv4()
                sl.businessId = bid
                sl.saleId = saleId
                sl.productId = ol.productId || ol._raw?.product_id
                sl.productVariantId = ol.productVariantId || ol._raw?.product_variant_id || null
                sl.quantity = q
                sl.unitPrice = p
                sl.lineTotal = toDecimalString(toNumber(q) * toNumber(p))
                sl.syncVersion = 1
              })
            }
          }
        }
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      return { id } as any
    },
  })

  const deleteOrder = useMutation({
    mutationFn: async (id: UUID) => {
      await (database as any).write(async () => {
        const rec: any = await (database as any).get('orders').find(id)
        await rec.update((r: any) => {
          r.deletedAt = nowMillis()
        })
        await rec.markAsDeleted()
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const getOrder = (id: UUID) =>
    useQuery({
      queryKey: ['orders', id],
      queryFn: async () => {
        // Prefer local Watermelon first (offline)
        try {
          const rec: any = await (database as any).get('orders').find(id)
          const raw = rec._raw
          const lineCol: any = (database as any).get('order_lines')
          const lines = (await lineCol
            .query(Q.where('order_id', id))
            .fetch()) as any[]
          return {
            id: raw.id,
            businessId: raw.business_id,
            customerId: raw.customer_id,
            status: raw.status,
            subtotal: raw.subtotal,
            taxAmount: raw.tax_amount,
            total: raw.total,
            paymentMethod: raw.payment_method,
            createdAt: toISO(raw.created_at),
            updatedAt: toISO(raw.updated_at),
            lines: lines.map((l: any) => ({
              id: l.id,
              orderId: l._raw.order_id,
              productId: l._raw.product_id,
              description: l._raw.description || '',
              quantity: l._raw.quantity,
              unitPrice: l._raw.unit_price,
              lineTotal: l._raw.line_total,
            })),
          } as any
        } catch {
          const res = await api.get(`/orders/${id}`)
          return (res.data as any).order || res.data
        }
      },
      enabled: !!id && !!bid,
    })

  // Keep isLocalLoading in loading calc to avoid unused-var lint
  void isLocalLoading
  return {
    orders,
    total,
    limit,
    offset,
    hasNextPage,
    hasPreviousPage,
    nextPage,
    previousPage,
    resetPagination,
    isLoading:
      ((getOrders.isLoading as any) || isLocalLoading) && orders.length === 0,
    isFetching: getOrders.isFetching as any,
    error: getOrders.error,
    refetch: getOrders.refetch,
    createOrder: createOrder.mutateAsync,
    isCreating: createOrder.isPending,
    updateOrder: updateOrder.mutateAsync,
    isUpdating: updateOrder.isPending,
    deleteOrder: deleteOrder.mutateAsync,
    isDeleting: deleteOrder.isPending,
    getOrder,
  }
}
