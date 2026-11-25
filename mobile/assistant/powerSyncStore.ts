import type {
  AssistantStore,
  LimitArgs,
  PageArgs,
  PeriodArgs,
  SearchArgs,
} from './types'
import {
  buildCustomerCandidates,
  buildExpenseSummary,
  buildInventoryValuation,
  buildInvoiceList,
  buildLowStockItems,
  buildProductSales,
  buildSalesSummary,
} from './aggregate'
import { getPowerSyncDatabase } from '../sync/powersync'
import { isPowerSyncEnabledForPlatform } from '../sync/powersync/config'

function isoFrom(value: string | undefined, fallbackMs: number): string {
  if (!value) return new Date(fallbackMs).toISOString()
  const time = new Date(value).getTime()
  return new Date(Number.isFinite(time) ? time : fallbackMs).toISOString()
}

function resolveRange(args: PeriodArgs): { fromMs: number; toMs: number; from: string; to: string } {
  const now = Date.now()
  const toMs = args.to ? new Date(args.to).getTime() : now
  const safeTo = Number.isFinite(toMs) ? toMs : now
  const fallbackFrom = new Date(safeTo)
  fallbackFrom.setMonth(fallbackFrom.getMonth() - 1)
  const fromMs = args.from ? new Date(args.from).getTime() : fallbackFrom.getTime()
  const safeFrom = Number.isFinite(fromMs) ? fromMs : fallbackFrom.getTime()

  return {
    fromMs: safeFrom,
    toMs: safeTo,
    from: isoFrom(args.from, safeFrom),
    to: isoFrom(args.to, safeTo),
  }
}

function rowText(row: any, key: string): string {
  const v = row[key]
  return v === undefined || v === null ? '' : String(v)
}

function rowNumber(row: any, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null) {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return 0
}

function rowMs(row: any, key: string): number | null {
  const v = row[key]
  if (v === undefined || v === null) return null
  const ms = new Date(String(v)).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function createPowerSyncStore(businessId: string): AssistantStore {
  const db = getPowerSyncDatabase()
  if (!isPowerSyncEnabledForPlatform()) {
    throw new Error('PowerSync is not enabled')
  }

  async function fetchSales(fromMs: number, toMs: number): Promise<any[]> {
    const rows: any[] = await db.getAll(
      `SELECT subtotal, tax_amount, total FROM sales
       WHERE business_id = ? AND deleted_at IS NULL AND status != 'void'
         AND sold_at >= ? AND sold_at < ?
       ORDER BY sold_at`,
      [businessId, new Date(fromMs).toISOString(), new Date(toMs).toISOString()],
    )
    return rows
  }

  return {
    async summarizeSales(args: PeriodArgs) {
      const range = resolveRange(args)
      const rows = await fetchSales(range.fromMs, range.toMs)
      return buildSalesSummary(
        rows.map((row) => ({
          subtotal: rowText(row, 'subtotal'),
          taxAmount: rowText(row, 'tax_amount'),
          total: rowText(row, 'total'),
        })),
        range.from,
        range.to,
      )
    },

    async listSalesByProduct(args: LimitArgs) {
      const rows: any[] = await db.getAll(
        'SELECT product_id, line_total FROM sale_lines WHERE business_id = ? AND deleted_at IS NULL',
        [businessId],
      )
      return buildProductSales(
        rows.map((row) => ({
          productId: row.product_id,
          lineTotal: rowText(row, 'line_total'),
        })),
        args.limit,
      )
    },

    async listLowStockItems(args: LimitArgs) {
      const rows: any[] = await db.getAll(
        'SELECT product_id, quantity, low_stock_threshold FROM inventory_items WHERE business_id = ? AND deleted_at IS NULL',
        [businessId],
      )
      return buildLowStockItems(
        rows.map((row) => ({
          productId: row.product_id,
          quantity: rowText(row, 'quantity'),
          lowStockThreshold: rowText(row, 'low_stock_threshold'),
        })),
        args.limit,
      )
    },

    async getInventoryValuation(args: LimitArgs) {
      const rows: any[] = await db.getAll(
        'SELECT product_id, quantity FROM inventory_items WHERE business_id = ? AND deleted_at IS NULL',
        [businessId],
      )
      return buildInventoryValuation(
        rows.map((row) => ({
          productId: row.product_id,
          quantity: rowText(row, 'quantity'),
        })),
        args.limit,
      )
    },

    async summarizeExpensesByCategory(args: PeriodArgs) {
      const range = resolveRange(args)
      const rows: any[] = await db.getAll(
        `SELECT category, amount, tax_amount FROM expenses
         WHERE business_id = ? AND deleted_at IS NULL
           AND spent_at >= ? AND spent_at < ?`,
        [businessId, new Date(range.fromMs).toISOString(), new Date(range.toMs).toISOString()],
      )
      return buildExpenseSummary(
        rows.map((row) => ({
          category: rowText(row, 'category'),
          amount: rowText(row, 'amount'),
          taxAmount: rowText(row, 'tax_amount'),
        })),
        range.from,
        range.to,
      )
    },

    async listInvoices(args: PageArgs) {
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 50)
      const offset = Math.max(args.offset ?? 0, 0)
      const rows: any[] = await db.getAll(
        `SELECT id, invoice_number, status, total, amount_paid, amount_due, currency,
                due_at, sent_at, paid_at, customer_id
         FROM invoices
         WHERE business_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [businessId, limit, offset],
      )
      return buildInvoiceList(
        rows.map((row) => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          status: row.status,
          total: rowText(row, 'total'),
          amountPaid: rowText(row, 'amount_paid'),
          amountDue: rowText(row, 'amount_due'),
          currency: rowText(row, 'currency'),
          dueAt: rowMs(row, 'due_at'),
          sentAt: rowMs(row, 'sent_at'),
          paidAt: rowMs(row, 'paid_at'),
          customerId: rowText(row, 'customer_id'),
        })),
        limit,
        offset,
      )
    },

    async searchCustomers(args: SearchArgs) {
      const rows: any[] = await db.getAll(
        `SELECT id, name, phone, email, loyalty_points FROM customers
         WHERE business_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 50`,
        [businessId],
      )
      return buildCustomerCandidates(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          loyaltyPoints: rowNumber(row, 'loyalty_points'),
        })),
        args.query,
        args.limit,
      )
    },

    async productNames(ids: string[]) {
      if (ids.length === 0) return {}
      const rows: any[] = await db.getAll(
        'SELECT id, name FROM products WHERE business_id = ? AND deleted_at IS NULL',
        [businessId],
      )
      const byId = Object.fromEntries(rows.map((row) => [row.id, row.name]))
      return Object.fromEntries(ids.map((id) => [id, byId[id]]))
    },
  }
}
