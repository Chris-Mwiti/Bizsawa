import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import type { CreateOrderRequest, Order, UUID } from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { v4 as uuidv4 } from 'uuid'
import { Q } from '@nozbe/watermelondb'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { toISO, nowMillis } from '../../lib/syncDates'

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
        quantity: toDecimalString(item.quantity),
        unitPrice: toDecimalString(item.unitPrice),
      })),
  }
}
function mapRaw(raw: any): Order {
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
      const now = nowMillis()
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
      await (database as any).write(async () => {
        const rec: any = await (database as any).get('orders').find(id)
        await rec.update((r: any) => {
          if (data.status) r.status = data.status
          r.syncVersion = (r.syncVersion || 1) + 1
        })
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['orders'] })
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
