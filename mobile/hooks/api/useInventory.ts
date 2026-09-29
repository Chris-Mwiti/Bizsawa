import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import type { UUID } from '../../lib/api-dtos'
import { toNumber, toDecimalString } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { randomUUID } from 'expo-crypto'
import { toISO, nowMillis } from '../../lib/syncDates'

export interface InventoryItem {
  id: UUID
  businessId: UUID
  productId: UUID
  quantity: number
  lowStockThreshold: number
  createdAt?: string
  updatedAt?: string
}
export interface StockMovement {
  id: UUID
  businessId: UUID
  productId: UUID
  quantityDelta: number
  movementType: string
  referenceType?: string | null
  referenceId?: UUID | null
  notes?: string
  occurredAt: string
}
export interface InventoryValuation {
  productId: UUID
  quantity: number
}
export interface AdjustStockInput {
  productId: UUID
  quantityDelta: number | string
  lowStockThreshold?: number | string
  notes?: string
}

function mapRawItem(raw: any): InventoryItem {
  return {
    id: raw.id,
    businessId: raw.business_id,
    productId: raw.product_id,
    quantity: toNumber(raw.quantity),
    lowStockThreshold: toNumber(raw.low_stock_threshold),
    createdAt: toISO(raw.created_at),
    updatedAt: toISO(raw.updated_at),
  } as any
}
function mapRawMovement(raw: any): StockMovement {
  return {
    id: raw.id,
    businessId: raw.business_id,
    productId: raw.product_id,
    quantityDelta: toNumber(raw.quantity_delta),
    movementType: raw.movement_type,
    notes: raw.notes,
    occurredAt: toISO(raw.occurred_at),
  } as any
}

export const useInventory = () => {
  const queryClient = useQueryClient()
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const bid = activeBusinessId || ''
  const [localInv, setLocalInv] = useState<InventoryItem[]>([])
  const [localMov, setLocalMov] = useState<StockMovement[]>([])
  const [_, setLoading] = useState(true)
  useEffect(() => {
    if (!bid) {
      setLocalInv([])
      setLoading(false)
      return
    }
    const col: any = (database as any).get('inventory_items')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => {
        setLocalInv(rows.map(mapRawItem))
        setLoading(false)
      })
    return () => sub.unsubscribe()
  }, [bid])
  useEffect(() => {
    if (!bid) return
    const col: any = (database as any).get('stock_movements')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => setLocalMov(rows.map(mapRawMovement)))
    return () => sub.unsubscribe()
  }, [bid])

  const getInventory = useQuery({
    queryKey: ['inventory', bid],
    queryFn: async () => {
      const res = await api.get<{ inventory: any[] }>('/inventory')
      return (res.data.inventory || []).map((r: any) => ({
        id: r.id,
        businessId: r.businessId,
        productId: r.productId,
        quantity: toNumber(r.quantity),
        lowStockThreshold: toNumber(r.lowStockThreshold),
      })) as any
    },
    enabled: !!bid,
  })
  const getStockMovements = useQuery({
    queryKey: ['inventory', 'movements', bid],
    queryFn: async () => {
      const res = await api.get<{ movements: any[] }>('/inventory/movements')
      return (res.data.movements || []).map(mapRawMovement)
    },
    enabled: !!bid,
  })

  const adjustStock = useMutation({
    mutationFn: async (input: AdjustStockInput) => {
      const delta = toDecimalString(input.quantityDelta)
      const now = nowMillis()
      await (database as any).write(async () => {
        // upsert inventory_items
        const col: any = (database as any).get('inventory_items')
        const existing = (await col
          .query(
            Q.where('product_id', input.productId),
            Q.where('business_id', bid),
          )
          .fetch()) as any[]
        if (existing.length) {
          const rec: any = existing[0]
          await rec.update((r: any) => {
            const newQty = toNumber(r.quantity) + toNumber(delta)
            r.quantity = String(newQty)
            if (input.lowStockThreshold !== undefined)
              r.lowStockThreshold = toDecimalString(input.lowStockThreshold)
            r.syncVersion = (r.syncVersion || 1) + 1
          })
        } else {
          await col.create((rec: any) => {
            rec._raw.id = randomUUID()
            rec.businessId = bid
            rec.productId = input.productId
            rec.quantity = delta
            rec.lowStockThreshold = toDecimalString(
              input.lowStockThreshold ?? 0,
            )
            rec.syncVersion = 1
          })
        }
        const movCol: any = (database as any).get('stock_movements')
        await movCol.create((rec: any) => {
          rec._raw.id = randomUUID()
          rec.businessId = bid
          rec.productId = input.productId
          rec.quantityDelta = delta
          rec.movementType = toNumber(delta) >= 0 ? 'in' : 'out'
          rec.notes = input.notes || ''
          rec.occurredAt = now
          rec.syncVersion = 1
        })
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      return {
        productId: input.productId,
        quantityDelta: toNumber(delta),
      } as any
    },
  })

  // Merge pending local inventory (not yet on server) with server data — ensures new stock adjustments appear immediately
  const inventoryMerged = (() => {
    const server = getInventory.data as any[] | undefined
    if (server === undefined) return localInv
    if (!localInv.length) return server
    const ids = new Set(server.map((s: any) => s.id))
    const pending = localInv.filter((l: any) => !ids.has(l.id))
    return pending.length ? [...server, ...pending] : server
  })()
  const movementsMerged = (() => {
    const server = getStockMovements.data as any[] | undefined
    if (server === undefined) return localMov
    if (!localMov.length) return server
    const ids = new Set(server.map((s: any) => s.id))
    const pending = localMov.filter((l: any) => !ids.has(l.id))
    return pending.length ? [...server, ...pending] : server
  })()
  return {
    inventory: inventoryMerged,
    isLoadingInventory:
      (getInventory.isLoading as any) &&
      !localInv.length &&
      inventoryMerged.length === 0,
    inventoryError: (getInventory.error as ApiError)?.friendlyMessage || null,
    lowStockItems: [] as any,
    isLoadingLowStock: false,
    movements: movementsMerged,
    isLoadingMovements: false,
    valuation: [] as any,
    isLoadingValuation: false,
    adjustStock: adjustStock.mutateAsync,
    isAdjustingStock: adjustStock.isPending,
    refetchInventory: getInventory.refetch,
  }
}
