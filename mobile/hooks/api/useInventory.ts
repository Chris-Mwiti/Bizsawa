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
import {
  getPowerSyncDatabase,
  psInsert,
  psUpdate,
  psWriteTransaction,
} from '../../sync/powersync'
import { isPowerSyncEnabledForPlatform } from '../../sync/powersync/config'
import {
  INVENTORY_SQL,
  STOCK_MOVEMENTS_SQL,
  usePowerSyncEnabledQuery,
} from './usePowerSyncReads'

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
  const psInventory = usePowerSyncEnabledQuery<any>(INVENTORY_SQL, [bid])
  const psMovements = usePowerSyncEnabledQuery<any>(STOCK_MOVEMENTS_SQL, [bid])
  const powerSyncActive = psInventory.active
  const [localInv, setLocalInv] = useState<InventoryItem[]>([])
  const [localMov, setLocalMov] = useState<StockMovement[]>([])
  const [_, setLoading] = useState(true)
  useEffect(() => {
    if (powerSyncActive) {
      setLocalInv([])
      setLoading(false)
      return
    }
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
  }, [bid, powerSyncActive])
  useEffect(() => {
    if (!bid || powerSyncActive) {
      setLocalMov([])
      return
    }
    const col: any = (database as any).get('stock_movements')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => setLocalMov(rows.map(mapRawMovement)))
    return () => sub.unsubscribe()
  }, [bid, powerSyncActive])

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
    enabled: !!bid && !powerSyncActive,
  })
  const getStockMovements = useQuery({
    queryKey: ['inventory', 'movements', bid],
    queryFn: async () => {
      const res = await api.get<{ movements: any[] }>('/inventory/movements')
      return (res.data.movements || []).map(mapRawMovement)
    },
    enabled: !!bid && !powerSyncActive,
  })

  const adjustStock = useMutation({
    mutationFn: async (input: AdjustStockInput) => {
      const delta = toDecimalString(input.quantityDelta)
      const now = new Date().toISOString()
      const movementType = toNumber(delta) >= 0 ? 'in' : 'out'

      if (isPowerSyncEnabledForPlatform()) {
        const db = getPowerSyncDatabase()
        await psWriteTransaction(db, async (tx) => {
          const existing: any[] = await tx.getAll(
            'SELECT id, quantity, low_stock_threshold FROM inventory_items WHERE product_id = ? AND business_id = ?',
            [input.productId, bid]
          )
          if (existing.length) {
            const rec = existing[0]
            const patch: any = {
              quantity: String(toNumber(rec.quantity) + toNumber(delta)),
            }
            if (input.lowStockThreshold !== undefined)
              patch.low_stock_threshold = toDecimalString(input.lowStockThreshold)
            await psUpdate(tx, 'inventory_items', rec.id, patch)
          } else {
            await psInsert(tx, 'inventory_items', {
              id: randomUUID(),
              business_id: bid,
              product_id: input.productId,
              quantity: delta,
              low_stock_threshold: toDecimalString(
                input.lowStockThreshold ?? 0
              ),
              sync_version: 1,
              created_at: now,
              updated_at: now,
            })
          }
          await psInsert(tx, 'stock_movements', {
            id: randomUUID(),
            business_id: bid,
            product_id: input.productId,
            quantity_delta: delta,
            movement_type: movementType,
            notes: input.notes || '',
            occurred_at: now,
            sync_version: 1,
            created_at: now,
            updated_at: now,
          })
        })
        queryClient.invalidateQueries({ queryKey: ['inventory'] })
        return {
          productId: input.productId,
          quantityDelta: toNumber(delta),
        } as any
      }

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
            // NOTE: never bump syncVersion here — see useCustomers.ts.
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
          rec.movementType = movementType
          rec.notes = input.notes || ''
          rec.occurredAt = nowMillis()
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
  const inventoryMerged = powerSyncActive
    ? psInventory.rows.map(mapRawItem)
    : (() => {
        const server = getInventory.data as any[] | undefined
        if (server === undefined) return localInv
        if (!localInv.length) return server
        const ids = new Set(server.map((s: any) => s.id))
        const pending = localInv.filter((l: any) => !ids.has(l.id))
        return pending.length ? [...server, ...pending] : server
      })()
  const movementsMerged = powerSyncActive
    ? psMovements.rows.map(mapRawMovement)
    : (() => {
        const server = getStockMovements.data as any[] | undefined
        if (server === undefined) return localMov
        if (!localMov.length) return server
        const ids = new Set(server.map((s: any) => s.id))
        const pending = localMov.filter((l: any) => !ids.has(l.id))
        return pending.length ? [...server, ...pending] : server
      })()
  return {
    inventory: inventoryMerged,
    isLoadingInventory: powerSyncActive
      ? psInventory.isLoading
      : (getInventory.isLoading as any) &&
        !localInv.length &&
        inventoryMerged.length === 0,
    inventoryError: powerSyncActive
      ? psInventory.error
      : (getInventory.error as ApiError)?.friendlyMessage || null,
    lowStockItems: [] as any,
    isLoadingLowStock: false,
    movements: movementsMerged,
    isLoadingMovements: false,
    valuation: [] as any,
    isLoadingValuation: false,
    adjustStock: adjustStock.mutateAsync,
    isAdjustingStock: adjustStock.isPending,
    refetchInventory: powerSyncActive
      ? async () => {}
      : getInventory.refetch,
  }
}
