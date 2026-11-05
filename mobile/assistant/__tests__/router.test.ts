import { describe, expect, it } from 'vitest'
import {
  detectLocale,
  extractCustomerQuery,
  resolvePeriod,
  route,
} from '../router'

const NOW = new Date(2026, 10, 5, 9, 0, 0)

describe('assistant router', () => {
  it('routes English sales questions to a summary with a period', () => {
    const result = route('How much did I sell last month?', NOW)

    expect(result?.tool).toBe('summarize_sales')
    expect(result?.locale).toBe('en')
    expect(result?.arguments.from).toBeTypeOf('string')
    expect(result?.arguments.to).toBeTypeOf('string')
  })

  it('prefers low stock over inventory value', () => {
    expect(route('which products are low stock?', NOW)?.tool).toBe(
      'list_low_stock_items',
    )
  })

  it('routes Swahili questions and detects the locale', () => {
    const result = route('bidhaa zinazokwisha ni zipi?', NOW)

    expect(result?.tool).toBe('list_low_stock_items')
    expect(result?.locale).toBe('sw')
  })

  it('routes product, expense, invoice, and customer intents', () => {
    expect(route('top selling products', NOW)?.tool).toBe(
      'list_sales_by_product',
    )
    expect(route('how much did I spend this month', NOW)?.tool).toBe(
      'summarize_expenses_by_category',
    )
    expect(route('show unpaid invoices', NOW)?.tool).toBe('list_invoices')
    expect(route('find customer Wanjiku', NOW)?.tool).toBe('search_customers')
  })

  it('extracts a customer name from the query', () => {
    expect(extractCustomerQuery('find customer named Wanjiku Kamau')).toBe(
      'Wanjiku Kamau',
    )
    expect(extractCustomerQuery('search customers')).toBe('')
  })

  it('returns null for unsupported questions', () => {
    expect(route('tell me a joke', NOW)).toBeNull()
  })

  it('detects Swahili only for Swahili vocabulary', () => {
    expect(detectLocale('What are my sales?')).toBe('en')
    expect(detectLocale('Mauzo yangu ni yapi?')).toBe('sw')
  })
})

describe('period resolution', () => {
  it('uses the start of the current month', () => {
    const period = resolvePeriod('this month', NOW)
    const from = new Date(period.from)

    expect(from.getDate()).toBe(1)
    expect(from.getHours()).toBe(0)
    expect(period.to).toBe(NOW.toISOString())
  })

  it('ends last month at the start of this month', () => {
    const period = resolvePeriod('mwezi uliopita', NOW)

    expect(new Date(period.to).getTime()).toBe(
      new Date(period.from).getTime() + 31 * 24 * 60 * 60 * 1000,
    )
    expect(new Date(period.to).getDate()).toBe(1)
  })

  it('defaults to the last month', () => {
    const period = resolvePeriod('sales', NOW)
    const from = new Date(period.from)

    expect(period.to).toBe(NOW.toISOString())
    expect(from.getMonth()).toBe(9)
    expect(from.getDate()).toBe(5)
  })
})
