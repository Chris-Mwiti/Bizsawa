import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import type {
  Product as BackendProduct,
  UUID,
} from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { mergeLocalFirst } from '../../lib/mergeLocalFirst'
import { randomUUID } from 'expo-crypto'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { usePowerSyncProducts } from './usePowerSyncProducts'
import {
  getPowerSyncDatabase,
  psDelete,
  psInsert,
  psUpdate,
  psWriteTransaction,
} from '../../sync/powersync'

// Offline-first wrapper — Phase 3 (PWA): core-domain writes go through
// PowerSync local SQLite and upload via POST /api/v1/sync/push. Reads use
// PowerSync when active; legacy WatermelonDB remains the fallback/write path
// until each domain is migrated.

export interface Product extends Omit<BackendProduct, 'price' | 'cost'> {
  price: number
  cost: number
  stockQuantity: number
  buyingPrice: number
  supplier?: string | null
  minStockLevel?: number | null
  maxStockLevel?: number | null
  lastRestockedAt?: string | null
}

export interface ProductVariantInput {
  id?: string
  name: string
  sku?: string
  barcode?: string
  price: number | string
  cost?: number | string
  isActive?: boolean
}

export interface CreateProductInput {
  name: string
  category?: string
  imageUrl?: string
  stockQuantity?: number
  price: number | string
  buyingPrice?: number | string
  cost?: number | string
  supplier?: string | null
  minStockLevel?: number | null
  maxStockLevel?: number | null
  lastRestockedAt?: string | null
  description?: string
  sku?: string
  barcode?: string
  variants?: ProductVariantInput[]
}
export type UpdateProductInput = Partial<CreateProductInput>

function mapProduct(p: BackendProduct): Product {
  return {
    ...p,
    price: toNumber(p.price),
    cost: toNumber(p.cost),
    stockQuantity: 0,
    buyingPrice: toNumber(p.cost),
    supplier: null,
    minStockLevel: null,
    maxStockLevel: null,
    lastRestockedAt: null,
    variants: (p.variants || []).map((v: any) => ({
      ...v,
      price: v.price,
      cost: v.cost,
    })),
  } as any
}

export const useProducts = () => {
  const queryClient = useQueryClient()
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const bid = activeBusinessId || ''

  // Local observe fallback — products + variants (offline-first)
  const [localProducts, setLocalProducts] = useState<Product[]>([])
  const [localVariants, setLocalVariants] = useState<any[]>([])
  useEffect(() => {
    if (!bid) {
      setLocalProducts([])
      return
    }
    const col: any = (database as any).get('products')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => {
        setLocalProducts(
          rows.map(
            (r: any) =>
              ({
                id: r.id,
                businessId: r.businessId,
                name: r.name,
                category: r.category,
                price: toNumber(r.price),
                cost: toNumber(r.cost),
                description: r._raw?.description || '',
                sku: r._raw?.sku || '',
                barcode: r._raw?.barcode || '',
                imageUrl: r._raw?.image_url || '',
                variants: [],
                _status: r._raw?._status,
                _changed: r._raw?._changed,
                syncVersion: r._raw?.sync_version ?? r.syncVersion,
              }) as any,
          ),
        )
      })
    return () => sub.unsubscribe()
  }, [bid])

  useEffect(() => {
    if (!bid) {
      setLocalVariants([])
      return
    }
    try {
      const col: any = (database as any).get('product_variants')
      const sub = col
        .query(Q.where('business_id', bid))
        .observe()
        .subscribe((rows: any[]) => {
          setLocalVariants(
            rows.map((r: any) => ({
              id: r.id,
              productId: r.productId || r._raw?.product_id,
              name: r.name,
              sku: r.sku,
              barcode: r.barcode,
              price: r.price,
              cost: r.cost,
              isActive: r.isActive,
            })),
          )
        })
      return () => sub.unsubscribe()
    } catch {
      setLocalVariants([])
    }
  }, [bid])

  const localProductsWithVariants = localProducts.map((p: any) => ({
    ...p,
    variants: localVariants.filter((v: any) => v.productId === p.id),
  }))

  const powerSync = usePowerSyncProducts(bid)
  const powerSyncActive =
    powerSync.enabled &&
    !powerSync.error &&
    (powerSync.hasSynced || powerSync.products.length > 0)

  const overlayFields = [
    'name',
    'category',
    'price',
    'cost',
    'description',
    'sku',
    'barcode',
    'imageUrl',
    'taxRuleId',
    'variants',
  ] as unknown as (keyof Product)[]
  const keepLocalWhenServerEmpty = ['variants'] as unknown as (keyof Product)[]

  const getProducts = useQuery({
    queryKey: ['products', bid],
    queryFn: async ({ signal }) => {
      const res = await api.get<{ products: BackendProduct[] }>('/products', { signal })
      return (res.data.products || []).map(mapProduct)
    },
    enabled: !!bid && !powerSyncActive,
  })

  const createProduct = useMutation({
    mutationFn: async (data: CreateProductInput) => {
      if (!bid) throw new Error('Select a business first')
      const id = randomUUID()
      const now = new Date().toISOString()
      const price = toDecimalString(data.price)
      const cost = toDecimalString(data.cost ?? data.buyingPrice ?? 0)

      const productOut: any = {
        id,
        businessId: bid as any,
        tenantId: bid as any,
        name: data.name.trim(),
        category: data.category?.trim() || 'Other',
        price,
        cost,
        isActive: true,
        description: (data as any).description?.trim() ?? null,
        sku: (data as any).sku?.trim() ?? null,
        barcode: (data as any).barcode?.trim() ?? null,
        imageUrl: (data as any).imageUrl?.trim() ?? null,
        taxRuleId: (data as any).taxRuleId ?? null,
        variants: data.variants,
        createdAt: now,
        updatedAt: now,
      } as any

      if (powerSync.enabled) {
        const db = getPowerSyncDatabase()
        await psWriteTransaction(db, async (tx) => {
          await psInsert(tx, 'products', {
            id,
            business_id: bid,
            tenant_id: bid,
            name: productOut.name,
            category: productOut.category,
            price,
            cost,
            is_active: 1,
            description: productOut.description,
            sku: productOut.sku,
            barcode: productOut.barcode,
            image_url: productOut.imageUrl,
            tax_rule_id: productOut.taxRuleId,
            sync_version: 1,
            created_at: now,
            updated_at: now,
          })
          if (data.variants?.length) {
            for (const v of data.variants) {
              if (!v.name?.trim()) continue
              const vid = v.id || randomUUID()
              await psInsert(tx, 'product_variants', {
                id: vid,
                business_id: bid,
                product_id: id,
                name: v.name.trim(),
                sku: v.sku?.trim() || '',
                barcode: v.barcode?.trim() || '',
                price: toDecimalString(v.price),
                cost: toDecimalString(v.cost ?? v.price),
                is_active: v.isActive ?? true,
                sync_version: 1,
                created_at: now,
                updated_at: now,
              })
            }
          }
          if (data.stockQuantity !== undefined || data.minStockLevel != null) {
            await psInsert(tx, 'inventory_items', {
              id: randomUUID(),
              business_id: bid,
              product_id: id,
              quantity: toDecimalString(data.stockQuantity ?? 0),
              low_stock_threshold: toDecimalString(data.minStockLevel ?? 0),
              sync_version: 1,
              created_at: now,
              updated_at: now,
            })
          }
        })
        queryClient.invalidateQueries({ queryKey: ['products'] })
        return productOut
      }

      await (database as any).write(async () => {
        const col: any = (database as any).get('products')
        await col.create((rec: any) => {
          rec._raw.id = id
          rec.businessId = bid
          rec.tenantId = bid
          rec.name = data.name.trim()
          rec.category = data.category?.trim() || 'Other'
          rec.price = price
          rec.cost = cost
          rec.isActive = true
          rec.syncVersion = 1
          if ((data as any).description !== undefined) rec.description = (data as any).description?.trim() || null
          if ((data as any).sku !== undefined) rec.sku = (data as any).sku?.trim() || null
          if ((data as any).barcode !== undefined) rec.barcode = (data as any).barcode?.trim() || null
          if ((data as any).imageUrl !== undefined) rec.imageUrl = (data as any).imageUrl?.trim() || null
          if ((data as any).taxRuleId !== undefined) rec.taxRuleId = (data as any).taxRuleId || null
        })
        if (data.variants?.length) {
          const vcol: any = (database as any).get('product_variants')
          for (const v of data.variants) {
            if (!v.name?.trim()) continue
            await vcol.create((rec: any) => {
              rec._raw.id = v.id || randomUUID()
              rec.businessId = bid
              rec.productId = id
              rec.name = v.name.trim()
              rec.sku = v.sku?.trim() || ''
              rec.barcode = v.barcode?.trim() || ''
              rec.price = toDecimalString(v.price)
              rec.cost = toDecimalString(v.cost ?? v.price)
              rec.isActive = v.isActive ?? true
              rec.syncVersion = 1
            })
          }
        }
        if (data.stockQuantity !== undefined || data.minStockLevel != null) {
          const icol: any = (database as any).get('inventory_items')
          await icol.create((rec: any) => {
            rec._raw.id = randomUUID()
            rec.businessId = bid
            rec.productId = id
            rec.quantity = toDecimalString(data.stockQuantity ?? 0)
            rec.lowStockThreshold = toDecimalString(data.minStockLevel ?? 0)
            rec.syncVersion = 1
          })
        }
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      return productOut
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const updateProduct = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: UUID
      data: UpdateProductInput
    }) => {
      const patch: any = {}
      if (data.name) patch.name = data.name.trim()
      if (data.category) patch.category = data.category.trim()
      if (data.price !== undefined) patch.price = toDecimalString(data.price)
      if (data.cost !== undefined || data.buyingPrice !== undefined)
        patch.cost = toDecimalString((data.cost ?? data.buyingPrice) as any)
      if ((data as any).description !== undefined)
        patch.description = (data as any).description?.trim() || null
      if ((data as any).sku !== undefined) patch.sku = (data as any).sku?.trim() || null
      if ((data as any).barcode !== undefined)
        patch.barcode = (data as any).barcode?.trim() || null
      if ((data as any).imageUrl !== undefined)
        patch.image_url = (data as any).imageUrl?.trim() || null
      if ((data as any).taxRuleId !== undefined)
        patch.tax_rule_id = (data as any).taxRuleId || null

      if (powerSync.enabled) {
        const db = getPowerSyncDatabase()
        await psWriteTransaction(db, async (tx) => {
          await psUpdate(tx, 'products', id, patch)
          if (data.variants !== undefined) {
            const existing: any[] = await tx.getAll(
              'SELECT id FROM product_variants WHERE product_id = ?',
              [id]
            )
            for (const ex of existing) {
              await psDelete(tx, 'product_variants', ex.id)
            }
            for (const v of data.variants || []) {
              if (!v.name?.trim()) continue
              await psInsert(tx, 'product_variants', {
                id: (v as any).id || randomUUID(),
                business_id: bid,
                product_id: id,
                name: v.name.trim(),
                sku: v.sku?.trim() || '',
                barcode: v.barcode?.trim() || '',
                price: toDecimalString(v.price),
                cost: toDecimalString(v.cost ?? v.price),
                is_active: v.isActive ?? true,
                sync_version: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
            }
          }
        })
        queryClient.invalidateQueries({ queryKey: ['products'] })
        return mapProduct({ id } as any)
      }

      await (database as any).write(async () => {
        const col: any = (database as any).get('products')
        const rec: any = await col.find(id)
        await rec.update((r: any) => {
          if (data.name) r.name = data.name.trim()
          if (data.category) r.category = data.category.trim()
          if (data.price !== undefined) r.price = toDecimalString(data.price)
          if (data.cost !== undefined || data.buyingPrice !== undefined)
            r.cost = toDecimalString((data.cost ?? data.buyingPrice) as any)
          if ((data as any).description !== undefined)
            r.description = (data as any).description?.trim() || null
          if ((data as any).sku !== undefined)
            r.sku = (data as any).sku?.trim() || null
          if ((data as any).barcode !== undefined)
            r.barcode = (data as any).barcode?.trim() || null
          if ((data as any).imageUrl !== undefined)
            r.imageUrl = (data as any).imageUrl?.trim() || null
          if ((data as any).taxRuleId !== undefined)
            r.taxRuleId = (data as any).taxRuleId || null
        })
        if (data.variants !== undefined) {
          const vcol: any = (database as any).get('product_variants')
          const existing = await vcol.query(Q.where('product_id', id)).fetch()
          for (const ex of existing) {
            await ex.update((r: any) => {
              r.deletedAt = Date.now()
            })
            await ex.markAsDeleted()
          }
          for (const v of data.variants || []) {
            if (!v.name?.trim()) continue
            await vcol.create((rec: any) => {
              rec._raw.id = (v as any).id || randomUUID()
              rec.businessId = bid
              rec.productId = id
              rec.name = v.name.trim()
              rec.sku = v.sku?.trim() || ''
              rec.barcode = v.barcode?.trim() || ''
              rec.price = toDecimalString(v.price)
              rec.cost = toDecimalString(v.cost ?? v.price)
              rec.isActive = v.isActive ?? true
              rec.syncVersion = 1
            })
          }
        }
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      return mapProduct({ id } as any)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const deleteProduct = useMutation({
    mutationFn: async (id: UUID) => {
      if (!id) throw new Error('Product id is required')

      if (powerSync.enabled) {
        const db = getPowerSyncDatabase()
        await psWriteTransaction(db, async (tx) => {
          const variants: any[] = await tx.getAll(
            'SELECT id FROM product_variants WHERE product_id = ?',
            [id]
          )
          for (const v of variants) {
            await psDelete(tx, 'product_variants', v.id)
          }
          const invs: any[] = await tx.getAll(
            'SELECT id FROM inventory_items WHERE product_id = ?',
            [id]
          )
          for (const inv of invs) {
            await psDelete(tx, 'inventory_items', inv.id)
          }
          await psDelete(tx, 'products', id)
        })
        queryClient.invalidateQueries({ queryKey: ['products'] })
        return
      }

      await (database as any).write(async () => {
        const rec: any = await (database as any).get('products').find(id)
        await rec.update((r: any) => {
          r.deletedAt = Date.now()
        })
        await rec.markAsDeleted()
        // Cascade: delete variants + inventory to avoid FK orphans and ensure push sync sends correct deletes
        try {
          const vcol: any = (database as any).get('product_variants')
          const variants: any[] = await vcol.query(Q.where('product_id', id)).fetch()
          for (const v of variants) {
            try {
              await v.update((r: any) => { r.deletedAt = Date.now() })
              await v.markAsDeleted()
            } catch {}
          }
        } catch {}
        try {
          const invCol: any = (database as any).get('inventory_items')
          const invs: any[] = await invCol.query(Q.where('product_id', id)).fetch()
          for (const inv of invs) {
            try {
              await inv.update((r: any) => { r.deletedAt = Date.now() })
              await inv.markAsDeleted()
            } catch {}
          }
        } catch {}
        // Note: stock_movements are history — keep them; they validate FK but push will fail if parent deleted before child;
        // cascade delete ensures product delete is pushed after variants/inventory deletes due to syncableTables order (product_variants before inventory, products first)
        // To avoid FK violation 23503 on push, we rely on backend's validateFKs which checks parent exists AND deleted_at IS NULL;
        // since we soft-delete product first, variants still reference deleted product → they would fail FK if pushed after product.
        // Order in push is products → product_variants → inventory_items (backend syncableTables order), so product delete pushed first,
        // then variants delete. That's safe because delete is soft-delete (exists but deleted_at NOT NULL) — validateFKs only checks for insert/update, not delete.
        // So cascade here is for local completeness.
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  // Offline-first merge: a locally-edited row keeps its optimistic values until the
  // server confirms the push. Previously the server response always won for rows it
  // already knew about, so an optimistic edit was visually reverted until the round trip
  // completed. Server-owned fields (stock counts, timestamps) still come from the server.
  const legacyProducts = mergeLocalFirst<Product>(
    getProducts.data as Product[] | undefined,
    localProductsWithVariants as Product[],
    { overlayFields, keepLocalWhenServerEmpty },
  )
  const pendingLocalProducts = localProductsWithVariants.filter(
    (product: any) =>
      product._status === 'created' || product._status === 'updated',
  )
  const powerSyncProducts = powerSyncActive
    ? mergeLocalFirst<Product>(
        powerSync.products,
        pendingLocalProducts as Product[],
        { overlayFields, keepLocalWhenServerEmpty },
      )
    : null
  const productsData = powerSyncProducts ?? legacyProducts

  return {
    products: productsData || [],
    isLoading:
      (powerSyncActive ? powerSync.isLoading : getProducts.isLoading) &&
      !localProducts.length &&
      productsData.length === 0,
    error: powerSyncActive
      ? null
      : (getProducts.error as ApiError)?.friendlyMessage || null,
    refetch: getProducts.refetch,
    createProduct: createProduct.mutateAsync,
    isCreating: createProduct.isPending,
    updateProduct: updateProduct.mutateAsync,
    isUpdating: updateProduct.isPending,
    deleteProduct: deleteProduct.mutateAsync,
    isDeleting: deleteProduct.isPending,
  }
}
