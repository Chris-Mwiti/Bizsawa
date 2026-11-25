import { usePowerSyncOrNull, useQuery, useStatusOrNull } from '@powersync/react'
import { toNumber } from '../../lib/api-dtos'
import { isPowerSyncEnabledForPlatform } from '../../sync/powersync/config'
import type { Product } from './useProducts'

interface ProductRow {
  id: string
  tenant_id: string
  business_id: string
  name: string
  description: string | null
  sku: string | null
  category: string | null
  supplier: string | null
  barcode: string | null
  image_url: string | null
  tax_rule_id: string | null
  price: string
  cost: string
  is_active: number
  created_at: string
  updated_at: string
}

interface VariantRow {
  id: string
  product_id: string
  name: string
  sku: string | null
  barcode: string | null
  price: string
  cost: string
  is_active: number
}

interface InventoryRow {
  id: string
  product_id: string
  quantity: string
  low_stock_threshold: string
}

export function usePowerSyncProducts(businessId: string) {
  const db = usePowerSyncOrNull()
  const status = useStatusOrNull()

  const productsQuery = useQuery<ProductRow>(
    `SELECT * FROM products
     WHERE business_id = ? AND deleted_at IS NULL
     ORDER BY name COLLATE NOCASE`,
    [businessId],
  )

  const variantsQuery = useQuery<VariantRow>(
    `SELECT * FROM product_variants
     WHERE business_id = ? AND deleted_at IS NULL
     ORDER BY name COLLATE NOCASE`,
    [businessId],
  )

  const inventoryQuery = useQuery<InventoryRow>(
    `SELECT * FROM inventory_items
     WHERE business_id = ? AND deleted_at IS NULL`,
    [businessId],
  )

  const variantsByProduct = new Map<string, VariantRow[]>()
  for (const variant of variantsQuery.data || []) {
    const rows = variantsByProduct.get(variant.product_id)
    if (rows) rows.push(variant)
    else variantsByProduct.set(variant.product_id, [variant])
  }

  const inventoryByProduct = new Map<string, InventoryRow>()
  for (const item of inventoryQuery.data || []) {
    inventoryByProduct.set(item.product_id, item)
  }

  const products: Product[] = (productsQuery.data || []).map((row) => {
    const inventory = inventoryByProduct.get(row.id)
    return {
      id: row.id,
      tenantId: row.tenant_id,
      businessId: row.business_id,
      name: row.name,
      description: row.description ?? undefined,
      sku: row.sku ?? undefined,
      category: row.category ?? undefined,
      supplier: row.supplier ?? null,
      barcode: row.barcode ?? undefined,
      imageUrl: row.image_url ?? undefined,
      taxRuleId: row.tax_rule_id ?? null,
      price: toNumber(row.price),
      cost: toNumber(row.cost),
      isActive: row.is_active === 1,
      variants: (variantsByProduct.get(row.id) || []).map((variant) => ({
        id: variant.id,
        productId: variant.product_id,
        name: variant.name,
        sku: variant.sku ?? undefined,
        barcode: variant.barcode ?? undefined,
        price: variant.price,
        cost: variant.cost,
        isActive: variant.is_active === 1,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      stockQuantity: toNumber(inventory?.quantity ?? '0'),
      buyingPrice: toNumber(row.cost),
      minStockLevel: inventory ? toNumber(inventory.low_stock_threshold) : null,
      maxStockLevel: null,
      lastRestockedAt: null,
    }
  })

  return {
    enabled: isPowerSyncEnabledForPlatform() && !!db,
    hasSynced: status?.hasSynced === true,
    isLoading:
      productsQuery.isLoading ||
      variantsQuery.isLoading ||
      inventoryQuery.isLoading,
    error:
      productsQuery.error?.message ||
      variantsQuery.error?.message ||
      inventoryQuery.error?.message ||
      null,
    products,
  }
}
