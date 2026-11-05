import {
  addMoney,
  formatMoneyUnits,
  formatQuantity,
  parseMoney,
  parseQuantity,
} from './money'
import type {
  CustomerCandidate,
  CustomerSearchOutput,
  ExpenseCategoryRow,
  ExpenseSummaryOutput,
  InventoryValuationOutput,
  InvoiceListOutput,
  InvoiceRow,
  InvoiceStatus,
  LowStockOutput,
  ProductSalesOutput,
  SalesSummary,
} from './types'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

export interface SaleTotalsRow {
  subtotal: string
  taxAmount: string
  total: string
}

export function buildSalesSummary(
  rows: SaleTotalsRow[],
  from: string,
  to: string,
): SalesSummary {
  return {
    count: rows.length,
    subtotal: formatMoneyUnits(addMoney(rows.map((row) => row.subtotal))),
    tax_amount: formatMoneyUnits(addMoney(rows.map((row) => row.taxAmount))),
    total: formatMoneyUnits(addMoney(rows.map((row) => row.total))),
    currency: 'KES',
    from,
    to,
  }
}

export interface SaleLineRow {
  productId: string
  lineTotal: string
}

export function buildProductSales(
  lines: SaleLineRow[],
  limit?: number,
): ProductSalesOutput {
  const grouped = new Map<string, { minor: number; count: number }>()

  for (const line of lines) {
    const current = grouped.get(line.productId) ?? { minor: 0, count: 0 }
    current.minor += parseMoney(line.lineTotal)
    current.count += 1
    grouped.set(line.productId, current)
  }

  const rows = Array.from(grouped.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.minor - a.minor || a.key.localeCompare(b.key))
    .slice(0, clampLimit(limit))
    .map((row) => ({
      key: row.key,
      total: formatMoneyUnits(row.minor),
      count: row.count,
      currency: 'KES' as const,
    }))

  return { results: rows }
}

export interface InventoryRow {
  productId: string
  quantity: string
  lowStockThreshold: string
}

export function buildLowStockItems(
  items: InventoryRow[],
  limit?: number,
): LowStockOutput {
  const rows = items
    .filter(
      (item) =>
        parseQuantity(item.quantity) <= parseQuantity(item.lowStockThreshold),
    )
    .sort((a, b) => {
      const aGap = parseQuantity(a.quantity) - parseQuantity(a.lowStockThreshold)
      const bGap = parseQuantity(b.quantity) - parseQuantity(b.lowStockThreshold)
      return aGap - bGap || a.productId.localeCompare(b.productId)
    })
    .slice(0, clampLimit(limit))
    .map((item) => ({
      product_id: item.productId,
      quantity: formatQuantity(parseQuantity(item.quantity)),
      low_stock_threshold: formatQuantity(
        parseQuantity(item.lowStockThreshold),
      ),
    }))

  return { results: rows }
}

export function buildInventoryValuation(
  items: Array<{ productId: string; quantity: string }>,
  limit?: number,
): InventoryValuationOutput {
  return {
    results: items.slice(0, clampLimit(limit)).map((item) => ({
      product_id: item.productId,
      quantity: formatQuantity(parseQuantity(item.quantity)),
    })),
  }
}

export interface ExpenseRow {
  category: string
  amount: string
  taxAmount: string
}

export function buildExpenseSummary(
  expenses: ExpenseRow[],
  from: string,
  to: string,
): ExpenseSummaryOutput {
  const grouped = new Map<
    string,
    { minor: number; taxMinor: number; count: number }
  >()

  for (const expense of expenses) {
    const current = grouped.get(expense.category) ?? {
      minor: 0,
      taxMinor: 0,
      count: 0,
    }
    current.minor += parseMoney(expense.amount)
    current.taxMinor += parseMoney(expense.taxAmount)
    current.count += 1
    grouped.set(expense.category, current)
  }

  const results: ExpenseCategoryRow[] = Array.from(grouped.entries())
    .map(([category, value]) => ({ category, ...value }))
    .sort((a, b) => b.minor - a.minor || a.category.localeCompare(b.category))
    .map((row) => ({
      category: row.category,
      amount: formatMoneyUnits(row.minor),
      tax_amount: formatMoneyUnits(row.taxMinor),
      count: row.count,
      currency: 'KES' as const,
    }))

  return { results, from, to }
}

export interface InvoiceSourceRow {
  id: string
  invoiceNumber: string
  status: InvoiceStatus
  total: string
  amountPaid: string
  amountDue: string
  currency: string
  dueAt?: number | null
  sentAt?: number | null
  paidAt?: number | null
  customerId?: string | null
  orderId?: string | null
}

function isoOrNull(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || value <= 0) return null
  return new Date(value).toISOString()
}

export function buildInvoiceList(
  invoices: InvoiceSourceRow[],
  limit?: number,
  offset = 0,
): InvoiceListOutput {
  const page = invoices.slice(offset, offset + clampLimit(limit))

  const results: InvoiceRow[] = page.map((invoice) => {
    const row: InvoiceRow = {
      invoice_id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      status: invoice.status,
      total: formatMoneyUnits(parseMoney(invoice.total)),
      amount_paid: formatMoneyUnits(parseMoney(invoice.amountPaid)),
      amount_due: formatMoneyUnits(parseMoney(invoice.amountDue)),
      currency: invoice.currency,
      due_at: isoOrNull(invoice.dueAt),
      sent_at: isoOrNull(invoice.sentAt),
      paid_at: isoOrNull(invoice.paidAt),
    }

    if (invoice.customerId) row.customer_id = invoice.customerId
    if (invoice.orderId) row.order_id = invoice.orderId

    return row
  })

  return { results }
}

export interface CustomerSourceRow {
  id: string
  name: string
  phone?: string
  email?: string
  loyaltyPoints: number
}

function last4(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4)
}

function emailDomain(value: string | undefined): string {
  const parts = (value ?? '').trim().split('@')
  return parts.length === 2 ? parts[1] : ''
}

export function buildCustomerCandidates(
  customers: CustomerSourceRow[],
  query: string | undefined,
  limit?: number,
): CustomerSearchOutput {
  const needle = (query ?? '').trim().toLowerCase()
  const results: CustomerCandidate[] = []

  for (const customer of customers) {
    if (
      needle &&
      !`${customer.name} ${customer.phone ?? ''} ${customer.email ?? ''}`
        .toLowerCase()
        .includes(needle)
    ) {
      continue
    }

    results.push({
      customer_id: customer.id,
      name: customer.name,
      phone_last4: last4(customer.phone),
      email_domain: emailDomain(customer.email),
      loyalty_points: customer.loyaltyPoints,
    })

    if (results.length >= clampLimit(limit)) break
  }

  return { results }
}
