import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import type { CreateSaleRequest, Sale, UUID } from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { mergeLocalFirst } from '../../lib/mergeLocalFirst'
import { randomUUID } from 'expo-crypto'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { useAuth } from '../../contexts/AuthContext'
import { shortId } from '../../lib/ids'
import { toISO, nowMillis } from '../../lib/syncDates'
import {
  getPowerSyncDatabase,
  psDelete,
  psInsert,
  psWriteTransaction,
} from '../../sync/powersync'
import { isPowerSyncEnabledForPlatform } from '../../sync/powersync/config'
import { SALES_SQL, usePowerSyncEnabledQuery } from './usePowerSyncReads'

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
  const psSales = usePowerSyncEnabledQuery<any>(SALES_SQL, [bid])
  const powerSyncActive = psSales.active
  const [local, setLocal] = useState<Sale[]>([])
  const [isLocalLoading, setIsLocalLoading] = useState(true)
  useEffect(() => {
    if (powerSyncActive) {
      setLocal([])
      setIsLocalLoading(false)
      return
    }
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
  }, [bid, powerSyncActive])

  const getSales = useQuery({
    queryKey: ['sales', bid],
    queryFn: async ({ signal }) => {
      const res = await api.get<{ sales: Sale[] }>('/sales', { signal })
      return res.data.sales || []
    },
    enabled: !!bid && !powerSyncActive,
  })

  const createSale = useMutation({
    mutationFn: async (data: CreateSaleInput) => {
      if (!bid) throw new Error('Select a business first')
      const req = toCreateSaleRequest(data)
      if (!req.lines?.length) throw new Error('Add at least one product')
      if (!userId) throw new Error('Not authenticated')
      const id = randomUUID()
      const receipt = `RCPT-${shortId(id, 6)}`
      const total = req.lines.reduce(
        (s, l) => s + toNumber(l.unitPrice) * toNumber(l.quantity),
        0,
      )
      const now = nowMillis()
      const nowIso = new Date(now).toISOString()

      if (isPowerSyncEnabledForPlatform()) {
        const db = getPowerSyncDatabase()
        await psWriteTransaction(db, async (tx) => {
          await psInsert(tx, 'sales', {
            id,
            business_id: bid,
            tenant_id: bid,
            order_id: req.orderId || null,
            customer_id: req.customerId || null,
            receipt_number: receipt,
            staff_id: userId,
            payment_method: req.paymentMethod || 'cash',
            subtotal: toDecimalString(total),
            tax_amount: toDecimalString(0),
            total: toDecimalString(total),
            status: 'completed',
            idempotency_key: id,
            sold_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
            sync_version: 1,
          })
          for (const line of req.lines) {
            await psInsert(tx, 'sale_lines', {
              id: randomUUID(),
              business_id: bid,
              sale_id: id,
              product_id: line.productId,
              product_variant_id: (line as any).variantId || null,
              quantity: toDecimalString(line.quantity),
              unit_price: toDecimalString(line.unitPrice),
              line_total: toDecimalString(
                toNumber(line.quantity) * toNumber(line.unitPrice),
              ),
              sync_version: 1,
              created_at: nowIso,
              updated_at: nowIso,
            })
          }
          // Standalone (walk-in) sales deduct stock immediately; order-linked
          // sales deduct at order confirm instead. Aggregate by product so a
          // single reference+product movement is pushed once.
          if (!req.orderId) {
            const byProduct = new Map<string, number>()
            for (const line of req.lines) {
              const prev = byProduct.get(line.productId) ?? 0
              byProduct.set(line.productId, prev + toNumber(line.quantity))
            }
            for (const [productId, qty] of byProduct) {
              if (qty <= 0) continue
              await psInsert(tx, 'stock_movements', {
                id: randomUUID(),
                business_id: bid,
                product_id: productId,
                quantity_delta: toDecimalString(-qty),
                movement_type: 'out',
                reference_type: 'sale',
                reference_id: id,
                notes: 'sale created',
                occurred_at: nowIso,
                sync_version: 1,
                created_at: nowIso,
                updated_at: nowIso,
              })
            }
          }
        })
        queryClient.invalidateQueries({ queryKey: ['sales'] })
        queryClient.invalidateQueries({ queryKey: ['analytics'] })
        queryClient.invalidateQueries({ queryKey: ['inventory'] })
        import('../../lib/api').then(({ api }) =>
          api
            .post('/analytics/refresh', {}, { params: { timeframe: 'week' } })
            .catch(() => {}),
        )
        return {
          id,
          receiptNumber: receipt,
          total: toDecimalString(total),
        } as any
      }

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
          rec.soldAt = nowMillis()
          rec.syncVersion = 1
        })
        const lineCol: any = (database as any).get('sale_lines')
        for (const line of req.lines) {
          await lineCol.create((rec: any) => {
            rec._raw.id = randomUUID()
            rec.businessId = bid
            rec.saleId = id
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
      if (!req.orderId) {
        try {
          const { applyLocalStockLedgerBatch } = await import('../../db/stockOps')
          await applyLocalStockLedgerBatch({
            businessId: bid,
            refType: 'sale',
            refId: id,
            side: 'out',
            movementType: 'out',
            notes: 'sale created',
            lines: req.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
            })),
          })
        } catch (e) {
          console.warn(
            '[Sales] local inventory deduction failed',
            (e as any)?.message,
          )
        }
      }
      import('../../sync/client').then((m) =>
        m.syncNow().catch(() => {}),
      )
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      return {
        id,
        receiptNumber: receipt,
        total: toDecimalString(total),
      } as any
    },
  })

  const voidSale = useMutation({
    mutationFn: async (id: UUID) => {
      if (isPowerSyncEnabledForPlatform()) {
        const db = getPowerSyncDatabase()
        await psWriteTransaction(db, async (tx) => {
          await psDelete(tx, 'sales', id)
        })
        queryClient.invalidateQueries({ queryKey: ['sales'] })
        queryClient.invalidateQueries({ queryKey: ['analytics'] })
        queryClient.invalidateQueries({ queryKey: ['inventory'] })
        import('../../lib/api').then(({ api }) =>
          api
            .post('/analytics/refresh', {}, { params: { timeframe: 'week' } })
            .catch(() => {}),
        )
        return
      }

      await (database as any).write(async () => {
        const rec: any = await (database as any).get('sales').find(id)
        await rec.update((r: any) => {
          r.deletedAt = nowMillis()
        })
        await rec.markAsDeleted()
      })
      // Restore sold stock for the voided sale (local mirror; server does the same
      // via the sync delete → ApplyLedger path or voidSale caller keeping status).
      try {
        const lineCol: any = (database as any).get('sale_lines')
        const lines: any[] = (await lineCol
          .query(Q.where('sale_id', id))
          .fetch()) as any[]
        if (lines.length) {
          const { applyLocalStockLedgerBatch } = await import('../../db/stockOps')
          await applyLocalStockLedgerBatch({
            businessId: bid,
            refType: 'sale',
            refId: id,
            side: 'in',
            movementType: 'in',
            notes: 'sale voided',
            lines: lines.map((l: any) => ({
              productId: l.productId ?? l._raw?.product_id,
              quantity: l.quantity ?? l._raw?.quantity,
            })),
          })
        }
      } catch (e) {
        console.warn('[Sales] local inventory restore on void failed', (e as any)?.message)
      }
      import('../../sync/client').then((m) => m.syncNow().catch((e) => console.warn('[Sales] auto-sync after void failed', e?.message)))
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      import('../../lib/api').then(({ api }) => api.post('/analytics/refresh', {}, { params: { timeframe: 'week' } }).catch(()=>{}))
    },
  })

  // Offline-first merge: a locally-edited sale keeps its optimistic status until the
  // server confirms the push. Sales are normally minted server-side by ensureSaleForOrder,
  // so only the fields a client can legitimately change are overlaid.
  const sales = powerSyncActive
    ? psSales.rows.map(mapRaw)
    : mergeLocalFirst<Sale>(getSales.data as Sale[] | undefined, local, {
        overlayFields: ['status', 'paymentMethod'] as (keyof Sale)[],
      })
  return {
    sales,
    isLoading: powerSyncActive
      ? psSales.isLoading
      : (getSales.isLoading && !local.length) ||
        (isLocalLoading && !getSales.data),
    error: powerSyncActive
      ? psSales.error
      : (getSales.error as ApiError)?.friendlyMessage || null,
    refetch: powerSyncActive ? async () => {} : getSales.refetch,
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
