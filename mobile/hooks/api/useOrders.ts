import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import type { CreateOrderRequest, Order, UUID } from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { mergeLocalFirst } from '../../lib/mergeLocalFirst'
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
    _status: src._status,
    _changed: src._changed,
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

  // Offline-first merge: a locally-edited order keeps its optimistic values until the
  // server confirms the push. Money fields (subtotal/taxAmount/total) stay
  // server-authoritative because the backend derives them from order lines.
  const allOrdersMerged = mergeLocalFirst<Order>(
    getOrders.data?.orders as Order[] | undefined,
    local,
    { overlayFields: ['status', 'customerId', 'paymentMethod'] as (keyof Order)[] },
  )
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
      const subtotal = req.lines.reduce(
        (s, l) => s + toNumber(l.unitPrice) * toNumber(l.quantity),
        0,
      )
      // Backend tax is 16% — mirror exactly to avoid sync_version conflicts (§ tax divergence fix)
      const tax = Math.round(subtotal * 0.16 * 100) / 100
      const total = Math.round((subtotal + tax) * 100) / 100
      await (database as any).write(async () => {
        const col: any = (database as any).get('orders')
        await col.create((rec: any) => {
          rec._raw.id = id
          rec.businessId = bid
          rec.customerId = req.customerId || null
          rec.status = 'draft'
          rec.subtotal = toDecimalString(subtotal)
          rec.taxAmount = toDecimalString(tax)
          rec.total = toDecimalString(total)
          rec.paymentMethod = req.paymentMethod || 'cash'
          rec.paymentStatus = 'pending'
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
      if (!id || typeof id !== 'string') throw new Error('Order id is required')
      // Normalize undefined/null data to empty object to avoid "can't access value of type undefined"
      const safeData: any = data && typeof data === 'object' ? data : {}
      // DTO-safe: normalize status and guard against legacy {type} payloads; use optional chaining to avoid "cannot read property 'type' of undefined"
      const rawStatus = safeData?.status
      const newStatus = rawStatus ? String(rawStatus).trim().toLowerCase() : null
      if (newStatus && !['draft', 'confirmed', 'fulfilled', 'cancelled', 'refunded'].includes(newStatus)) {
        throw new Error(`Invalid status: ${String(rawStatus)}`)
      }
      // Legacy guard: callers mistakenly passing {type:'confirmed'} instead of {status}
      if (newStatus === null && safeData?.type !== undefined) {
        throw new Error('Invalid payload: `type` is not a valid order field — did you mean `status`?')
      }
      const customerPhoneForConfirm = safeData?.customerPhone as string | undefined
      if ('customerPhone' in safeData) delete safeData.customerPhone

      // Online-first: try REST endpoints directly when connected so backend transactional
      // Confirm → invoice + inventory + payment init runs on server (fixes sync bypass)
      if (newStatus && ['confirmed', 'fulfilled', 'cancelled'].includes(newStatus)) {
        try {
          const { default: NetInfo } = await import('@react-native-community/netinfo')
          const net: any = await NetInfo.fetch()
          if (net.isConnected) {
            const { generateIdempotencyKey, clearIdempotencyKey, OperationId } = await import('../../lib/idempotency')
            if (newStatus === 'confirmed') {
              const opId = OperationId.confirmOrder(id)
              const key = await generateIdempotencyKey(opId)
              // Resolve phone locally if not provided
              let phone = customerPhoneForConfirm
              if (!phone) {
                try {
                  const rec: any = await (database as any).get('orders').find(id)
                  const cid = rec.customerId || rec._raw?.customer_id
                  if (cid) {
                    const cRec: any = await (database as any).get('customers').find(cid).catch(() => null)
                    phone = cRec?.phone || cRec?._raw?.phone
                  }
                } catch {}
              }
              const res = await api.post(`/orders/${id}/confirm`, phone ? { customerPhone: phone } : {}, { headers: { 'X-Idempotency-Key': key } })
              await clearIdempotencyKey(opId)
              // Mirror server state locally: update order status + invoice will arrive via pull, but optimistically mark synced
              try {
                await (database as any).write(async () => {
                  const rec: any = await (database as any).get('orders').find(id)
                  await rec.update((r: any) => {
                    r.status = 'confirmed'
                    r.paymentStatus = 'confirmed'
                    if (!r.confirmedAt) try { r.confirmedAt = Date.now() } catch { try { r._raw.confirmed_at = Date.now() } catch {} }
                    // heal totals from server if diverged
                    const srv: any = (res.data as any)?.data || res.data
                    if (srv?.total) r.total = toDecimalString(srv.total)
                    if (srv?.subtotal) r.subtotal = toDecimalString(srv.subtotal)
                    if (srv?.taxAmount || srv?.tax_amount) r.taxAmount = toDecimalString(srv.taxAmount || srv.tax_amount)
                    r._raw._status = 'synced'
                    r._raw._changed = ''
                  })
                })
              } catch {}
              // Trigger pull to fetch server-created invoice
              import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
              queryClient.invalidateQueries({ queryKey: ['orders'] })
              queryClient.invalidateQueries({ queryKey: ['invoices'] })
              return res.data as any
            }
            if (newStatus === 'fulfilled') {
              const opId = OperationId.fulfillOrder(id)
              const key = await generateIdempotencyKey(opId)
              const res = await api.post(`/orders/${id}/fulfill`, {}, { headers: { 'X-Idempotency-Key': key } })
              await clearIdempotencyKey(opId)
              try {
                await (database as any).write(async () => {
                  const rec: any = await (database as any).get('orders').find(id)
                  await rec.update((r: any) => {
                    r.status = 'fulfilled'
                    r.paymentStatus = 'fulfilled'
                    if (!r.fulfilledAt) try { r.fulfilledAt = Date.now() } catch { try { r._raw.fulfilled_at = Date.now() } catch {} }
                    r._raw._status = 'synced'
                    r._raw._changed = ''
                  })
                })
              } catch {}
              import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
              queryClient.invalidateQueries({ queryKey: ['orders'] })
              queryClient.invalidateQueries({ queryKey: ['sales'] })
              return res.data as any
            }
            if (newStatus === 'cancelled') {
              const opId = OperationId.cancelOrder(id)
              const key = await generateIdempotencyKey(opId)
              const res = await api.post(`/orders/${id}/cancel`, {}, { headers: { 'X-Idempotency-Key': key } })
              await clearIdempotencyKey(opId)
              try {
                await (database as any).write(async () => {
                  const rec: any = await (database as any).get('orders').find(id)
                  await rec.update((r: any) => { r.status = 'cancelled'; r._raw._status = 'synced'; r._raw._changed = '' })
                })
              } catch {}
              queryClient.invalidateQueries({ queryKey: ['orders'] })
              return res.data as any
            }
          }
        } catch (e: any) {
          // Fall through to offline path if REST fails (network, 5xx, not found)
          const status = e?.response?.status
          if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
            // For 4xx (e.g. already confirmed 409) surface error but also heal local
            if (status === 409 || status === 404) {
              console.warn('[Orders] REST confirm failed with', status, e?.response?.data)
              // fall through to local update to keep UI consistent
            } else {
              throw e
            }
          }
          console.warn('[Orders] REST update failed — falling back to local Watermelon', e?.message)
        }
      }

      let shouldCreateSale = false
      let shouldCreateInvoice = false
      await (database as any).write(async () => {
        let rec: any
        try {
          rec = await (database as any).get('orders').find(id)
        } catch (e: any) {
          throw new Error(`Order not found locally: ${id} — ${e?.message || 'not found'}`)
        }
        if (!rec) throw new Error(`Order ${id} not found`)
        const prevStatus = String(rec.status ?? rec._raw?.status ?? '').toLowerCase()
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
          if (newStatus === 'confirmed' && prevStatus !== 'confirmed') {
            shouldCreateInvoice = true
          }
          if (newStatus === 'fulfilled' && prevStatus !== 'fulfilled') {
            shouldCreateSale = true
          }
        }
        // Offline confirm mirrors backend Confirm → CreateInvoice: create local invoice immediately
        if (shouldCreateInvoice) {
          const invoicesCol: any = (database as any).get('invoices')
          const existingByOrder: any[] = await invoicesCol.query(Q.where('order_id', id)).fetch().catch(() => [] as any[])
          if (existingByOrder.length === 0) {
            const orderLinesCol: any = (database as any).get('order_lines')
            const lines: any[] = await orderLinesCol.query(Q.where('order_id', id)).fetch()
            const invoiceId = uuidv4()
            const invoiceNumber = `INV-${invoiceId.slice(0, 6).toUpperCase()}`
            const subtotal = toNumber(rec.subtotal ?? rec._raw?.subtotal ?? '0')
            const tax = toNumber(rec.taxAmount ?? rec._raw?.tax_amount ?? '0')
            const total = toNumber(rec.total ?? rec._raw?.total ?? '0')
            const dueAt = Date.now() + 5 * 86400000
            await invoicesCol.create((inv: any) => {
              inv._raw.id = invoiceId
              inv.businessId = bid
              inv.customerId = rec.customerId || rec._raw?.customer_id || null
              inv.orderId = id
              inv.invoiceNumber = invoiceNumber
              inv.status = 'draft'
              inv.subtotal = toDecimalString(subtotal || total / 1.16 || 0)
              inv.taxAmount = toDecimalString(tax)
              inv.total = toDecimalString(total)
              inv.amountPaid = toDecimalString(0)
              inv.amountDue = toDecimalString(total)
              inv.currency = 'KES'
              inv.notes = `Invoice for order ${id.slice(0, 8)}`
              inv.dueAt = dueAt
              inv.syncVersion = 1
            })
            const invoiceLinesCol: any = (database as any).get('invoice_lines')
            for (const ol of lines) {
              const prodId = ol.productId || ol._raw?.product_id
              const qty = toDecimalString(ol.quantity ?? ol._raw?.quantity)
              const price = toDecimalString(ol.unitPrice ?? ol._raw?.unit_price)
              const lineTotal = toDecimalString(toNumber(qty) * toNumber(price))
              const desc = prodId ? `Product ${String(prodId).slice(0, 6)}` : 'Item'
              await invoiceLinesCol.create((il: any) => {
                il._raw.id = uuidv4()
                il.businessId = bid
                il.invoiceId = invoiceId
                il.productId = prodId || null
                il.description = desc
                il.quantity = qty
                il.unitPrice = price
                il.lineTotal = lineTotal
                il.syncVersion = 1
              })
            }
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
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
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
