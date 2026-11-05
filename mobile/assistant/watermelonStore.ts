import { Q } from '@nozbe/watermelondb'
import type { Database } from '@nozbe/watermelondb'
import {
  buildCustomerCandidates,
  buildExpenseSummary,
  buildInventoryValuation,
  buildInvoiceList,
  buildLowStockItems,
  buildProductSales,
  buildSalesSummary,
} from './aggregate'
import type {
  AssistantStore,
  LimitArgs,
  PageArgs,
  PeriodArgs,
  SearchArgs,
} from './types'

type Row = any

function live(rows: Row[]): Row[] {
  return rows.filter((row) => !(row.deletedAt ?? row._raw?.deleted_at))
}

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

export function createWatermelonStore(
  database: Database,
  businessId: string,
): AssistantStore {
  async function fetchSales(fromMs: number, toMs: number): Promise<Row[]> {
    const rows = (await database
      .get('sales')
      .query(
        Q.where('business_id', businessId),
        Q.where('status', Q.notEq('void')),
        Q.where('sold_at', Q.gte(fromMs)),
        Q.where('sold_at', Q.lt(toMs)),
      )
      .fetch()) as Row[]

    return live(rows)
  }

  return {
    async summarizeSales(args: PeriodArgs) {
      const range = resolveRange(args)
      const rows = await fetchSales(range.fromMs, range.toMs)

      return buildSalesSummary(
        rows.map((row) => ({
          subtotal: row.subtotal,
          taxAmount: row.taxAmount,
          total: row.total,
        })),
        range.from,
        range.to,
      )
    },

    async listSalesByProduct(args: LimitArgs) {
      const rows = live(
        (await database
          .get('sale_lines')
          .query(Q.where('business_id', businessId))
          .fetch()) as Row[],
      )

      return buildProductSales(
        rows.map((row) => ({
          productId: row.productId,
          lineTotal: row.lineTotal,
        })),
        args.limit,
      )
    },

    async listLowStockItems(args: LimitArgs) {
      const rows = live(
        (await database
          .get('inventory_items')
          .query(Q.where('business_id', businessId))
          .fetch()) as Row[],
      )

      return buildLowStockItems(
        rows.map((row) => ({
          productId: row.productId,
          quantity: row.quantity,
          lowStockThreshold: row.lowStockThreshold,
        })),
        args.limit,
      )
    },

    async getInventoryValuation(args: LimitArgs) {
      const rows = live(
        (await database
          .get('inventory_items')
          .query(Q.where('business_id', businessId))
          .fetch()) as Row[],
      )

      return buildInventoryValuation(
        rows.map((row) => ({
          productId: row.productId,
          quantity: row.quantity,
        })),
        args.limit,
      )
    },

    async summarizeExpensesByCategory(args: PeriodArgs) {
      const range = resolveRange(args)
      const rows = live(
        (await database
          .get('expenses')
          .query(
            Q.where('business_id', businessId),
            Q.where('spent_at', Q.gte(range.fromMs)),
            Q.where('spent_at', Q.lt(range.toMs)),
          )
          .fetch()) as Row[],
      )

      return buildExpenseSummary(
        rows.map((row) => ({
          category: row.category,
          amount: row.amount,
          taxAmount: row.taxAmount,
        })),
        range.from,
        range.to,
      )
    },

    async listInvoices(args: PageArgs) {
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 50)
      const offset = Math.max(args.offset ?? 0, 0)
      const rows = live(
        (await database
          .get('invoices')
          .query(
            Q.where('business_id', businessId),
            Q.sortBy('created_at', Q.desc),
            Q.take(offset + limit),
          )
          .fetch()) as Row[],
      )

      return buildInvoiceList(
        rows.map((row) => ({
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          status: row.status,
          total: row.total,
          amountPaid: row.amountPaid,
          amountDue: row.amountDue,
          currency: row.currency,
          dueAt: row.dueAt,
          sentAt: row.sentAt,
          paidAt: row.paidAt,
          customerId: row.customerId,
        })),
        limit,
        offset,
      )
    },

    async searchCustomers(args: SearchArgs) {
      const rows = live(
        (await database
          .get('customers')
          .query(
            Q.where('business_id', businessId),
            Q.sortBy('created_at', Q.desc),
            Q.take(50),
          )
          .fetch()) as Row[],
      )

      return buildCustomerCandidates(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          loyaltyPoints: row.loyaltyPoints,
        })),
        args.query,
        args.limit,
      )
    },

    async productNames(ids: string[]) {
      if (ids.length === 0) return {}

      const rows = live(
        (await database
          .get('products')
          .query(
            Q.where('business_id', businessId),
            Q.where('id', Q.oneOf(ids)),
          )
          .fetch()) as Row[],
      )

      return Object.fromEntries(rows.map((row) => [row.id, row.name]))
    },
  }
}
