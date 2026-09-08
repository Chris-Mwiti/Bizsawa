import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import type {
  Product as BackendProduct,
  UUID,
} from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { v4 as uuidv4 } from 'uuid'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'

// Offline-first wrapper — Phase 2.2 (§3.6): all local writes go through WatermelonDB writers
// Reads remain TanStack Query for now, but writes are local-first and sync via synchronize()

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

  const getProducts = useQuery({
    queryKey: ['products', bid],
    queryFn: async () => {
      const res = await api.get<{ products: BackendProduct[] }>('/products')
      return (res.data.products || []).map(mapProduct)
    },
    enabled: !!bid,
  })

  const createProduct = useMutation({
    mutationFn: async (data: CreateProductInput) => {
      if (!bid) throw new Error('Select a business first')
      const id = uuidv4()
      await (database as any).write(async () => {
        const col: any = (database as any).get('products')
        await col.create((rec: any) => {
          rec._raw.id = id
          rec.businessId = bid
          rec.tenantId = bid
          rec.name = data.name.trim()
          rec.category = data.category?.trim() || 'Other'
          rec.price = toDecimalString(data.price)
          rec.cost = toDecimalString(data.cost ?? data.buyingPrice ?? 0)
          rec.isActive = true
          rec.syncVersion = 1
          if ((data as any).description)
            rec._raw.description = (data as any).description.trim()
          if ((data as any).sku) rec._raw.sku = (data as any).sku.trim()
          if ((data as any).barcode)
            rec._raw.barcode = (data as any).barcode.trim()
        })
        // Create variants locally — they sync via product_variants table
        if (data.variants?.length) {
          const vcol: any = (database as any).get('product_variants')
          for (const v of data.variants) {
            if (!v.name?.trim()) continue
            await vcol.create((rec: any) => {
              rec._raw.id = v.id || uuidv4()
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
      return mapProduct({
        id,
        businessId: bid as any,
        name: data.name,
        price: toDecimalString(data.price),
        cost: toDecimalString(data.cost ?? data.buyingPrice ?? 0),
        variants: data.variants,
      } as any)
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
            r._raw.description = (data as any).description?.trim() || null
          if ((data as any).sku !== undefined)
            r._raw.sku = (data as any).sku?.trim() || null
          if ((data as any).barcode !== undefined)
            r._raw.barcode = (data as any).barcode?.trim() || null
          r.syncVersion = (r.syncVersion || 1) + 1
        })
        // Replace variants: delete existing, create new (offline-first)
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
              rec._raw.id = (v as any).id || uuidv4()
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
      await (database as any).write(async () => {
        const rec: any = await (database as any).get('products').find(id)
        await rec.update((r: any) => {
          r.deletedAt = Date.now()
        })
        await rec.markAsDeleted()
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  // Offline-first merge: server is source of truth for synced rows (heals 0/NaN), but pending local creates (ids not on server) must appear immediately.
  const productsData = (() => {
    const server = getProducts.data as any[] | undefined
    const localWithVariants = localProductsWithVariants as any[]
    if (server === undefined) return localWithVariants
    if (!localWithVariants.length) return server
    const serverIds = new Set(server.map((s: any) => s.id))
    const pending = localWithVariants.filter((l: any) => !serverIds.has(l.id))
    // For existing server products, merge local variants if server has none yet (offline pending variants)
    const merged = server.map((s: any) => {
      const localMatch = localWithVariants.find((l: any) => l.id === s.id)
      if (
        localMatch?.variants?.length &&
        (!s.variants || s.variants.length === 0)
      ) {
        return { ...s, variants: localMatch.variants }
      }
      return s
    })
    return pending.length ? [...merged, ...pending] : merged
  })()
  return {
    products: productsData || [],
    isLoading:
      getProducts.isLoading &&
      !localProducts.length &&
      productsData.length === 0,
    error: (getProducts.error as ApiError)?.friendlyMessage || null,
    refetch: getProducts.refetch,
    createProduct: createProduct.mutateAsync,
    isCreating: createProduct.isPending,
    updateProduct: updateProduct.mutateAsync,
    isUpdating: updateProduct.isPending,
    deleteProduct: deleteProduct.mutateAsync,
    isDeleting: deleteProduct.isPending,
  }
}
