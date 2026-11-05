import {
  addMoney,
  displayMoney,
  displayMoneyUnits,
  formatPeriod,
  formatQuantity,
  parseMoney,
  parseQuantity,
} from './money'
import type {
  AssistantLocale,
  CustomerCandidate,
  ExpenseSummaryOutput,
  InvoiceRow,
  LowStockRow,
  ProductSaleRow,
  SalesSummary,
} from './types'

export interface LabeledRow {
  label: string
  total: string
}

function listLabels(rows: LabeledRow[], locale: AssistantLocale): string {
  return rows
    .slice(0, 3)
    .map((row) => `${row.label} (${displayMoney(row.total)})`)
    .join(locale === 'sw' ? ', ' : '; ')
}

export function unsupportedText(locale: AssistantLocale): string {
  return locale === 'sw'
    ? 'Sijaelewa swali hilo bado. Unaweza kuniuliza kuhusu mauzo, matumizi, bidhaa zinazokwisha, thamani ya stoo, ankara, au wateja.'
    : "I can't answer that offline yet. Ask me about sales, expenses, low stock, inventory value, invoices, or customers."
}

export function salesSummaryText(
  output: SalesSummary,
  locale: AssistantLocale,
): string {
  const period = formatPeriod(output.from, output.to)

  if (output.count === 0) {
    return locale === 'sw'
      ? `Hakuna mauzo yaliyorekodiwa kati ya ${period}.`
      : `No sales were recorded between ${period}.`
  }

  const plural = output.count === 1 ? 'sale' : 'sales'

  if (locale === 'sw') {
    return `Kati ya ${period} ulifanya mauzo ${output.count} yenye thamani ya ${displayMoney(output.total)} (bila kodi ${displayMoney(output.subtotal)}, kodi ${displayMoney(output.tax_amount)}).`
  }

  return `Between ${period} you made ${output.count} ${plural} worth ${displayMoney(output.total)} (subtotal ${displayMoney(output.subtotal)}, tax ${displayMoney(output.tax_amount)}).`
}

export function productSalesText(
  rows: ProductSaleRow[],
  labels: Record<string, string>,
  locale: AssistantLocale,
): string {
  if (rows.length === 0) {
    return locale === 'sw'
      ? 'Hakuna mauzo ya bidhaa yaliyopatikana bado.'
      : 'No product sales were found yet.'
  }

  const labeled: LabeledRow[] = rows.map((row) => ({
    label: labels[row.key] ?? `Product ${row.key.slice(0, 8)}`,
    total: row.total,
  }))
  const best = labeled[0]

  return locale === 'sw'
    ? `Bidhaa zinazoongoza kwa mauzo ni ${best.label} (${displayMoney(best.total)}). Orodha: ${listLabels(labeled, locale)}.`
    : `Your top product is ${best.label} (${displayMoney(best.total)}). Top sellers: ${listLabels(labeled, locale)}.`
}

export function lowStockText(
  rows: LowStockRow[],
  labels: Record<string, string>,
  locale: AssistantLocale,
): string {
  if (rows.length === 0) {
    return locale === 'sw'
      ? 'Hakuna bidhaa iliyo chini ya kiwango cha akiba kwa sasa.'
      : 'No products are below their low-stock threshold right now.'
  }

  const items = rows
    .slice(0, 3)
    .map((row) => {
      const label = labels[row.product_id] ?? `Product ${row.product_id.slice(0, 8)}`
      return `${label} (${formatQuantity(parseQuantity(row.quantity))} left, threshold ${formatQuantity(parseQuantity(row.low_stock_threshold))})`
    })
    .join(locale === 'sw' ? ', ' : '; ')

  return locale === 'sw'
    ? `${rows.length} bidhaa zinahitaji kuongezwa: ${items}.`
    : `${rows.length} product${rows.length === 1 ? '' : 's'} need restocking: ${items}.`
}

export function inventoryValuationText(
  rows: Array<{ productId: string; quantity: string }>,
  locale: AssistantLocale,
): string {
  if (rows.length === 0) {
    return locale === 'sw'
      ? 'Hakuna taarifa za stoo zilizopatikana.'
      : 'No inventory records were found.'
  }

  const total = rows.reduce(
    (sum, row) => sum + parseQuantity(row.quantity),
    0,
  )

  return locale === 'sw'
    ? `Kwa sasa una vitengo ${formatQuantity(total)} vya bidhaa katika aina ${rows.length}.`
    : `You currently have ${formatQuantity(total)} units across ${rows.length} product${rows.length === 1 ? '' : 's'}.`
}

export function expenseSummaryText(
  output: ExpenseSummaryOutput,
  locale: AssistantLocale,
): string {
  const period = formatPeriod(output.from, output.to)

  if (output.results.length === 0) {
    return locale === 'sw'
      ? `Hakuna matumizi yaliyorekodiwa kati ya ${period}.`
      : `No expenses were recorded between ${period}.`
  }

  const total = addMoney(output.results.map((row) => row.amount))
  const top = output.results[0]

  return locale === 'sw'
    ? `Matumizi kati ya ${period} yalifikia ${displayMoneyUnits(total)} katika aina ${output.results.length}. Kubwa zaidi ni ${top.category} (${displayMoney(top.amount)}).`
    : `Expenses between ${period} totalled ${displayMoneyUnits(total)} across ${output.results.length} categor${output.results.length === 1 ? 'y' : 'ies'}. The largest is ${top.category} (${displayMoney(top.amount)}).`
}

export function invoiceListText(
  rows: InvoiceRow[],
  now: Date,
  locale: AssistantLocale,
): string {
  const pending = rows.filter(
    (row) =>
      row.status !== 'paid' &&
      row.status !== 'cancelled' &&
      parseMoney(row.amount_due) > 0,
  )

  if (pending.length === 0) {
    return locale === 'sw'
      ? 'Hakuna ankara zinazosubiri malipo kwa sasa.'
      : 'No invoices are awaiting payment right now.'
  }

  const outstanding = addMoney(pending.map((row) => row.amount_due))
  const overdue = pending.filter(
    (row) => row.due_at !== null && new Date(row.due_at).getTime() < now.getTime(),
  ).length

  if (locale === 'sw') {
    const late = overdue > 0 ? ` ${overdue} zimechelewa.` : ''
    return `${pending.length} ankara zinasubiri malipo, jumla ya ${displayMoneyUnits(outstanding)}.${late}`
  }

  const late = overdue > 0 ? ` ${overdue} ${overdue === 1 ? 'is' : 'are'} overdue.` : ''
  return `${pending.length} invoice${pending.length === 1 ? '' : 's'} await payment, ${displayMoneyUnits(outstanding)} outstanding.${late}`
}

export function customerSearchText(
  rows: CustomerCandidate[],
  query: string,
  locale: AssistantLocale,
): string {
  if (rows.length === 0) {
    return locale === 'sw'
      ? `Sikupata mteja anayelingana na “${query}”.`
      : `I couldn't find a customer matching “${query}”.`
  }

  const first = rows[0]
  const details = [
    first.phone_last4 ? `phone ends ${first.phone_last4}` : '',
    first.email_domain ? first.email_domain : '',
    `${first.loyalty_points} points`,
  ]
    .filter(Boolean)
    .join(', ')

  if (rows.length === 1) {
    return locale === 'sw'
      ? `Nimempata ${first.name} (${details}).`
      : `I found ${first.name} (${details}).`
  }

  return locale === 'sw'
    ? `Nimepata wateja ${rows.length}. Wa kwanza ni ${first.name} (${details}).`
    : `I found ${rows.length} customers. The first is ${first.name} (${details}).`
}
