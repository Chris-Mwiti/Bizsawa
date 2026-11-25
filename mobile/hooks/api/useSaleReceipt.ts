import { useQuery } from '@tanstack/react-query'
import { Q } from '@nozbe/watermelondb'
import { database } from '../../db/database'
import { toISO } from '../../lib/syncDates'
import { isPowerSyncEnabledForPlatform } from '../../sync/powersync/config'
import { usePowerSyncEnabledQuery } from './usePowerSyncReads'

export interface SaleReceiptLine {
  id: string
  productId: string | null
  productName: string | null
  variantName: string | null
  quantity: string
  unitPrice: string
  lineTotal: string
}

export interface SaleReceiptData {
  sale: {
    id: string
    receiptNumber: string
    soldAt: string
    paymentMethod: string
    status: string
    subtotal: string
    taxAmount: string
    total: string
    customerId: string | null
  }
  lines: SaleReceiptLine[]
  customerName: string | null
}

const SALE_SQL = `SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL`

const LINES_SQL = `SELECT sl.id, sl.product_id, sl.product_variant_id, sl.quantity,
  sl.unit_price, sl.line_total, p.name AS product_name, pv.name AS variant_name
  FROM sale_lines sl
  LEFT JOIN products p ON p.id = sl.product_id
  LEFT JOIN product_variants pv ON pv.id = sl.product_variant_id
  WHERE sl.sale_id = ? AND sl.deleted_at IS NULL
  ORDER BY sl.created_at ASC`

const CUSTOMER_SQL = `SELECT name FROM customers
  WHERE id = (SELECT customer_id FROM sales WHERE id = ?)
  AND deleted_at IS NULL`

async function findLegacyName(collection: string, id: string | null) {
  if (!id) return null
  try {
    const record: any = await (database as any).get(collection).find(id)
    return record?.name ?? record?._raw?.name ?? null
  } catch {
    return null
  }
}

async function fetchLegacyReceipt(saleId: string): Promise<SaleReceiptData> {
  const record: any = await (database as any).get('sales').find(saleId)
  const raw: any = record._raw ?? record
  const lineRecords: any[] = await (database as any)
    .get('sale_lines')
    .query(Q.where('sale_id', saleId))
    .fetch()

  const lines = await Promise.all(
    lineRecords.map(async (line: any) => {
      const lineRaw: any = line._raw ?? line
      const productId = lineRaw.product_id ?? line.productId ?? null
      const variantId = lineRaw.product_variant_id ?? line.productVariantId ?? null
      const [productName, variantName] = await Promise.all([
        findLegacyName('products', productId),
        findLegacyName('product_variants', variantId),
      ])
      return {
        id: lineRaw.id ?? line.id,
        productId,
        productName,
        variantName,
        quantity: String(lineRaw.quantity ?? line.quantity ?? '1'),
        unitPrice: String(lineRaw.unit_price ?? line.unitPrice ?? '0'),
        lineTotal: String(lineRaw.line_total ?? line.lineTotal ?? '0'),
      }
    }),
  )

  const customerId = raw.customer_id ?? record.customerId ?? null
  const customerName = await findLegacyName('customers', customerId)

  return {
    sale: {
      id: raw.id ?? record.id,
      receiptNumber: raw.receipt_number ?? record.receiptNumber ?? '',
      soldAt: toISO(raw.sold_at ?? record.soldAt),
      paymentMethod: raw.payment_method ?? record.paymentMethod ?? 'cash',
      status: raw.status ?? record.status ?? 'completed',
      subtotal: String(raw.subtotal ?? record.subtotal ?? '0'),
      taxAmount: String(raw.tax_amount ?? record.taxAmount ?? '0'),
      total: String(raw.total ?? record.total ?? '0'),
      customerId,
    },
    lines,
    customerName,
  }
}

export function useSaleReceipt(saleId: string | null) {
  const saleQuery = usePowerSyncEnabledQuery<any>(SALE_SQL, [saleId])
  const linesQuery = usePowerSyncEnabledQuery<any>(LINES_SQL, [saleId])
  const customerQuery = usePowerSyncEnabledQuery<any>(CUSTOMER_SQL, [saleId])
  const active = saleQuery.active

  const legacy = useQuery({
    queryKey: ['sale-receipt', saleId],
    queryFn: () => fetchLegacyReceipt(saleId as string),
    enabled: !!saleId && !isPowerSyncEnabledForPlatform(),
  })

  if (active) {
    const row = saleQuery.rows[0]
    const receipt: SaleReceiptData | null = row
      ? {
          sale: {
            id: row.id,
            receiptNumber: row.receipt_number || '',
            soldAt: toISO(row.sold_at),
            paymentMethod: row.payment_method || 'cash',
            status: row.status || 'completed',
            subtotal: String(row.subtotal ?? '0'),
            taxAmount: String(row.tax_amount ?? '0'),
            total: String(row.total ?? '0'),
            customerId: row.customer_id ?? null,
          },
          lines: linesQuery.rows.map((line: any) => ({
            id: line.id,
            productId: line.product_id ?? null,
            productName: line.product_name ?? null,
            variantName: line.variant_name ?? null,
            quantity: String(line.quantity ?? '1'),
            unitPrice: String(line.unit_price ?? '0'),
            lineTotal: String(line.line_total ?? '0'),
          })),
          customerName: customerQuery.rows[0]?.name ?? null,
        }
      : null

    return {
      receipt,
      isLoading:
        saleQuery.isLoading || linesQuery.isLoading || customerQuery.isLoading,
      error:
        saleQuery.error || linesQuery.error || customerQuery.error || null,
    }
  }

  return {
    receipt: (legacy.data as SaleReceiptData | undefined) ?? null,
    isLoading: isPowerSyncEnabledForPlatform()
      ? !!saleId
      : legacy.isLoading,
    error: legacy.error?.message ?? null,
  }
}
