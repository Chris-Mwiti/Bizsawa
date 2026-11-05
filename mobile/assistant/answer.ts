import {
  addMoney,
  displayMoney,
  displayMoneyUnits,
  formatDate,
  formatQuantity,
  parseMoney,
  parseQuantity,
} from './money'
import { detectLocale, route } from './router'
import {
  customerSearchText,
  expenseSummaryText,
  inventoryValuationText,
  invoiceListText,
  lowStockText,
  productSalesText,
  salesSummaryText,
  unsupportedText,
} from './templates'
import type {
  AssistantAnswer,
  AssistantCard,
  AssistantLocale,
  AssistantStore,
  LimitArgs,
  PageArgs,
  PeriodArgs,
  SearchArgs,
} from './types'

export interface AnswerOptions {
  store: AssistantStore
  now?: Date
  locale?: AssistantLocale
  productNames?: Record<string, string>
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

async function loadProductNames(
  store: AssistantStore,
  ids: string[],
  overrides?: Record<string, string>,
): Promise<Record<string, string>> {
  let fromStore: Record<string, string> = {}

  try {
    fromStore = await store.productNames(ids)
  } catch {
    fromStore = {}
  }

  return { ...fromStore, ...overrides }
}

export async function answer(
  query: string,
  options: AnswerOptions,
): Promise<AssistantAnswer> {
  const now = options.now ?? new Date()
  const routed = route(query, now)
  const locale = options.locale ?? routed?.locale ?? detectLocale(query)
  const { store } = options

  if (!routed) {
    return { text: unsupportedText(locale), cards: [], locale }
  }

  if (routed.tool === 'summarize_sales') {
    const args = routed.arguments
    const output = await store.summarizeSales(args as PeriodArgs)
    const cards: AssistantCard[] = [
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
    ]

    return {
      text: salesSummaryText(output, locale),
      cards,
      tool: { name: 'summarize_sales', arguments: args, output },
      locale,
    }
  }

  if (routed.tool === 'list_sales_by_product') {
    const args = routed.arguments
    const output = await store.listSalesByProduct(args as LimitArgs)
    const labels = await loadProductNames(
      store,
      output.results.map((row) => row.key),
      options.productNames,
    )
    const labeled = output.results.map((row) => ({
      label: labels[row.key] ?? `Product ${shortId(row.key)}`,
      row,
    }))

    return {
      text: productSalesText(output.results, labels, locale),
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
      chart: {
        kind: 'bar',
        title: locale === 'sw' ? 'Mauzo kwa bidhaa' : 'Sales by product',
        series: labeled.slice(0, 6).map(({ label, row }) => ({
          label,
          value: parseMoney(row.total) / 100,
        })),
      },
      tool: { name: 'list_sales_by_product', arguments: args, output },
      locale,
    }
  }

  if (routed.tool === 'list_low_stock_items') {
    const args = routed.arguments
    const output = await store.listLowStockItems(args as LimitArgs)
    const labels = await loadProductNames(
      store,
      output.results.map((row) => row.product_id),
      options.productNames,
    )

    return {
      text: lowStockText(output.results, labels, locale),
      cards: [
        {
          kind: 'list',
          title: locale === 'sw' ? 'Bidhaa zinazokwisha' : 'Low stock',
          items: output.results.map((row) => ({
            label: labels[row.product_id] ?? `Product ${shortId(row.product_id)}`,
            value: `${formatQuantity(parseQuantity(row.quantity))} ${locale === 'sw' ? 'zimebaki' : 'left'}`,
            meta: `${locale === 'sw' ? 'kiwango' : 'threshold'} ${formatQuantity(parseQuantity(row.low_stock_threshold))}`,
          })),
        },
      ],
      tool: { name: 'list_low_stock_items', arguments: args, output },
      locale,
    }
  }

  if (routed.tool === 'get_inventory_valuation') {
    const args = routed.arguments
    const output = await store.getInventoryValuation(args as LimitArgs)
    const labels = await loadProductNames(
      store,
      output.results.map((row) => row.product_id),
      options.productNames,
    )
    const rows = output.results.map((row) => ({
      productId: row.product_id,
      quantity: row.quantity,
    }))
    const units = rows.reduce(
      (sum, row) => sum + parseQuantity(row.quantity),
      0,
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
            label: labels[row.productId] ?? `Product ${shortId(row.productId)}`,
            value: formatQuantity(parseQuantity(row.quantity)),
          })),
        },
      ],
      tool: { name: 'get_inventory_valuation', arguments: args, output },
      locale,
    }
  }

  if (routed.tool === 'summarize_expenses_by_category') {
    const args = routed.arguments
    const output = await store.summarizeExpensesByCategory(args as PeriodArgs)
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
      tool: {
        name: 'summarize_expenses_by_category',
        arguments: args,
        output,
      },
      locale,
    }
  }

  if (routed.tool === 'list_invoices') {
    const args = routed.arguments
    const output = await store.listInvoices(args as PageArgs)
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
      tool: { name: 'list_invoices', arguments: args, output },
      locale,
    }
  }

  const args = routed.arguments
  const output = await store.searchCustomers(args as SearchArgs)
  const customerQuery = typeof args.query === 'string' ? args.query : ''

  return {
    text: customerSearchText(output.results, customerQuery, locale),
    cards: [
      {
        kind: 'list',
        title: locale === 'sw' ? 'Wateja' : 'Customers',
        items: output.results.map((row) => ({
          label: row.name,
          value: `${row.loyalty_points} ${locale === 'sw' ? 'pointi' : 'points'}`,
          meta: [
            row.phone_last4
              ? `${locale === 'sw' ? 'simu inaishia' : 'phone ends'} ${row.phone_last4}`
              : '',
            row.email_domain,
          ]
            .filter(Boolean)
            .join(' · '),
        })),
      },
    ],
    tool: { name: 'search_customers', arguments: args, output },
    locale,
  }
}
