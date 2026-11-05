import {
  addMoney,
  displayMoney,
  displayMoneyUnits,
  formatDate,
  formatQuantity,
  parseMoney,
  parseQuantity,
} from './money'
import {
  customerSearchText,
  expenseSummaryText,
  inventoryValuationText,
  invoiceListText,
  lowStockText,
  productSalesText,
  salesSummaryText,
} from './templates'
import type {
  AssistantAnswer,
  AssistantChart,
  AssistantLocale,
  AssistantToolName,
  CustomerSearchOutput,
  ExpenseSummaryOutput,
  InventoryValuationOutput,
  InvoiceListOutput,
  LowStockOutput,
  ProductSalesOutput,
  SalesSummary,
} from './types'

export interface PresentOptions {
  locale: AssistantLocale
  now?: Date
  productNames?: Record<string, string>
}

type Row = Record<string, any>

function asRecord(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : null
}

function rows(value: unknown): Row[] {
  const record = asRecord(value)
  return Array.isArray(record?.results) ? (record.results as Row[]) : []
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

function nameFor(
  id: string,
  names: Record<string, string> | undefined,
): string {
  return names?.[id] ?? `Product ${shortId(id)}`
}

function salesAnswer(
  output: SalesSummary,
  locale: AssistantLocale,
): AssistantAnswer {
  return {
    text: salesSummaryText(output, locale),
    cards: [
      {
        kind: 'metric',
        label: locale === 'sw' ? 'Mauzo' : 'Sales',
        value: String(output.count),
      },
      {
        kind: 'metric',
        label: locale === 'sw' ? 'Mapato' : 'Revenue',
        value: displayMoney(output.total),
      },
      {
        kind: 'metric',
        label: locale === 'sw' ? 'Kodi' : 'Tax',
        value: displayMoney(output.tax_amount),
      },
    ],
    locale,
  }
}

function productSalesAnswer(
  output: ProductSalesOutput,
  options: PresentOptions,
): AssistantAnswer {
  const { locale } = options
  const labeled = output.results.map((row) => ({
    label: nameFor(row.key, options.productNames),
    row,
  }))
  const chart: AssistantChart = {
    kind: 'bar',
    title: locale === 'sw' ? 'Mauzo kwa bidhaa' : 'Sales by product',
    series: labeled.slice(0, 6).map(({ label, row }) => ({
      label,
      value: parseMoney(row.total) / 100,
    })),
  }

  return {
    text: productSalesText(
      output.results,
      Object.fromEntries(labeled.map(({ label, row }) => [row.key, label])),
      locale,
    ),
    cards: [
      {
        kind: 'list',
        title: locale === 'sw' ? 'Bidhaa kwa mauzo' : 'Sales by product',
        items: labeled.map(({ label, row }) => ({
          label,
          value: displayMoney(row.total),
          meta:
            locale === 'sw'
              ? `mauzo ${row.count}`
              : `${row.count} sale line${row.count === 1 ? '' : 's'}`,
        })),
      },
    ],
    chart,
    locale,
  }
}

function lowStockAnswer(
  output: LowStockOutput,
  options: PresentOptions,
): AssistantAnswer {
  const { locale } = options
  const labels = Object.fromEntries(
    output.results.map((row) => [
      row.product_id,
      nameFor(row.product_id, options.productNames),
    ]),
  )

  return {
    text: lowStockText(output.results, labels, locale),
    cards: [
      {
        kind: 'list',
        title: locale === 'sw' ? 'Bidhaa zinazokwisha' : 'Low stock',
        items: output.results.map((row) => ({
          label: nameFor(row.product_id, options.productNames),
          value: `${formatQuantity(parseQuantity(row.quantity))} ${locale === 'sw' ? 'zimebaki' : 'left'}`,
          meta: `${locale === 'sw' ? 'kiwango' : 'threshold'} ${formatQuantity(parseQuantity(row.low_stock_threshold))}`,
        })),
      },
    ],
    locale,
  }
}

function valuationAnswer(
  output: InventoryValuationOutput,
  options: PresentOptions,
): AssistantAnswer {
  const { locale } = options
  const rows = output.results.map((row) => ({
    productId: row.product_id,
    quantity: row.quantity,
  }))
  const units = rows.reduce((sum, row) => sum + parseQuantity(row.quantity), 0)
  const labels = Object.fromEntries(
    rows.map((row) => [row.productId, nameFor(row.productId, options.productNames)]),
  )

  return {
    text: inventoryValuationText(rows, locale),
    cards: [
      {
        kind: 'metric',
        label: locale === 'sw' ? 'Vitengo stoo' : 'Units on hand',
        value: formatQuantity(units),
        hint: `${output.results.length} ${locale === 'sw' ? 'bidhaa' : 'products'}`,
      },
      {
        kind: 'list',
        title: locale === 'sw' ? 'Stoo kwa bidhaa' : 'Stock on hand',
        items: rows.map((row) => ({
          label: labels[row.productId],
          value: formatQuantity(parseQuantity(row.quantity)),
        })),
      },
    ],
    locale,
  }
}

function expensesAnswer(
  output: ExpenseSummaryOutput,
  options: PresentOptions,
): AssistantAnswer {
  const { locale } = options
  const total = addMoney(output.results.map((row) => row.amount))

  return {
    text: expenseSummaryText(output, locale),
    cards: [
      {
        kind: 'metric',
        label: locale === 'sw' ? 'Matumizi' : 'Expenses',
        value: displayMoneyUnits(total),
      },
      {
        kind: 'list',
        title: locale === 'sw' ? 'Matumizi kwa aina' : 'Expenses by category',
        items: output.results.map((row) => ({
          label: row.category,
          value: displayMoney(row.amount),
          meta: `${row.count} ${locale === 'sw' ? 'kumbukumbu' : 'record' + (row.count === 1 ? '' : 's')}`,
        })),
      },
    ],
    chart: {
      kind: 'bar',
      title: locale === 'sw' ? 'Matumizi kwa aina' : 'Expenses by category',
      series: output.results.slice(0, 6).map((row) => ({
        label: row.category,
        value: parseMoney(row.amount) / 100,
      })),
    },
    locale,
  }
}

function invoicesAnswer(
  output: InvoiceListOutput,
  options: PresentOptions,
): AssistantAnswer {
  const { locale } = options
  const now = options.now ?? new Date()
  const pending = output.results.filter(
    (row) =>
      row.status !== 'paid' &&
      row.status !== 'cancelled' &&
      parseMoney(row.amount_due) > 0,
  )
  const outstanding = addMoney(pending.map((row) => row.amount_due))

  return {
    text: invoiceListText(output.results, now, locale),
    cards: [
      {
        kind: 'metric',
        label: locale === 'sw' ? 'Deni linalosubiri' : 'Outstanding',
        value: displayMoneyUnits(outstanding),
        hint: `${pending.length} ${locale === 'sw' ? 'ankara' : 'invoice' + (pending.length === 1 ? '' : 's')}`,
      },
      {
        kind: 'list',
        title: locale === 'sw' ? 'Ankara' : 'Invoices',
        items: output.results.map((row) => ({
          label: `${row.invoice_number} · ${row.status}`,
          value: displayMoney(row.amount_due),
          meta: row.due_at
            ? `${locale === 'sw' ? 'hadi' : 'due'} ${formatDate(row.due_at)}`
            : undefined,
        })),
      },
    ],
    locale,
  }
}

function customersAnswer(
  output: CustomerSearchOutput,
  args: Record<string, unknown>,
  options: PresentOptions,
): AssistantAnswer {
  const { locale } = options
  const query = typeof args.query === 'string' ? args.query : ''

  return {
    text: customerSearchText(output.results, query, locale),
    cards: [
      {
        kind: 'list',
        title: locale === 'sw' ? 'Wateja' : 'Customers',
        items: output.results.map((row) => ({
          label: row.name,
          value: `${row.loyalty_points} ${locale === 'sw' ? 'pointi' : 'points'}`,
          meta: [
            row.phone_last4
              ? `${locale === 'sw' ? 'simu inaisha' : 'phone ends'} ${row.phone_last4}`
              : '',
            row.email_domain,
          ]
            .filter(Boolean)
            .join(' · '),
        })),
      },
    ],
    locale,
  }
}

// presentTool turns a server tool-call result into the same cards/chart the
// offline deterministic path renders. Unknown shapes degrade to an empty set
// so the assistant text still displays.
export function presentTool(
  name: AssistantToolName,
  args: Record<string, unknown>,
  output: unknown,
  options: PresentOptions,
): AssistantAnswer {
  const data = asRecord(output)

  switch (name) {
    case 'summarize_sales':
      return data
        ? salesAnswer(data as unknown as SalesSummary, options.locale)
        : { text: '', cards: [], locale: options.locale }
    case 'list_sales_by_product':
      return data
        ? productSalesAnswer(
            { results: rows(data) } as ProductSalesOutput,
            options,
          )
        : { text: '', cards: [], locale: options.locale }
    case 'list_low_stock_items':
      return data
        ? lowStockAnswer(
            { results: rows(data) } as LowStockOutput,
            options,
          )
        : { text: '', cards: [], locale: options.locale }
    case 'get_inventory_valuation':
      return data
        ? valuationAnswer(
            { results: rows(data) } as InventoryValuationOutput,
            options,
          )
        : { text: '', cards: [], locale: options.locale }
    case 'summarize_expenses_by_category':
      return data
        ? expensesAnswer(
            {
              results: rows(data),
              from: String(data.from ?? ''),
              to: String(data.to ?? ''),
            } as ExpenseSummaryOutput,
            options,
          )
        : { text: '', cards: [], locale: options.locale }
    case 'list_invoices':
      return data
        ? invoicesAnswer(
            { results: rows(data) } as InvoiceListOutput,
            options,
          )
        : { text: '', cards: [], locale: options.locale }
    case 'search_customers':
      return data
        ? customersAnswer(
            { results: rows(data) } as CustomerSearchOutput,
            args,
            options,
          )
        : { text: '', cards: [], locale: options.locale }
    default:
      return { text: '', cards: [], locale: options.locale }
  }
}
