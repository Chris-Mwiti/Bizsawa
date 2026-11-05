import { describe, expect, it } from 'vitest'
import expenseFixture from '../../../contracts/assistant/fixtures/summarize_expenses_by_category.json'
import invoiceFixture from '../../../contracts/assistant/fixtures/list_invoices.json'
import lowStockFixture from '../../../contracts/assistant/fixtures/list_low_stock_items.json'
import productFixture from '../../../contracts/assistant/fixtures/list_sales_by_product.json'
import salesFixture from '../../../contracts/assistant/fixtures/summarize_sales.json'
import { answer } from '../answer'
import type {
  AssistantStore,
  ExpenseSummaryOutput,
  InvoiceListOutput,
  LowStockOutput,
  ProductSalesOutput,
  SalesSummary,
} from '../types'

const NOW = new Date('2026-11-05T09:00:00Z')

function fakeStore(overrides: Partial<AssistantStore>): AssistantStore {
  const unexpected = async () => {
    throw new Error('unexpected tool call')
  }

  return {
    summarizeSales: unexpected,
    listSalesByProduct: unexpected,
    listLowStockItems: unexpected,
    getInventoryValuation: unexpected,
    summarizeExpensesByCategory: unexpected,
    listInvoices: unexpected,
    searchCustomers: unexpected,
    productNames: async () => ({}),
    ...overrides,
  } as AssistantStore
}

describe('offline answer', () => {
  it('builds text, metric cards, and a tool call for sales', async () => {
    const output = salesFixture.output as unknown as SalesSummary
    const result = await answer('how much did I sell last month', {
      store: fakeStore({ summarizeSales: async () => output }),
      now: NOW,
    })

    expect(result.locale).toBe('en')
    expect(result.text).toContain('3 sales worth KES 2,900')
    expect(result.cards).toHaveLength(3)
    expect(result.cards[1]).toMatchObject({
      kind: 'metric',
      label: 'Revenue',
      value: 'KES 2,900',
    })
    expect(result.tool?.name).toBe('summarize_sales')
    expect(result.chart).toBeUndefined()
  })

  it('labels product charts with locally cached names', async () => {
    const output = productFixture.output as unknown as ProductSalesOutput
    const result = await answer('top selling products', {
      store: fakeStore({
        listSalesByProduct: async () => output,
        productNames: async () => ({
          '11111111-1111-4111-8111-111111111111': 'Maize Flour 2kg',
          '22222222-2222-4222-8222-222222222222': 'Cooking Oil 1L',
        }),
      }),
      now: NOW,
    })

    expect(result.text).toContain('Maize Flour 2kg')
    expect(result.chart?.series).toEqual([
      { label: 'Maize Flour 2kg', value: 1800 },
      { label: 'Cooking Oil 1L', value: 1100 },
    ])
    expect(result.cards[0]).toMatchObject({ kind: 'list' })
  })

  it('summarizes outstanding and overdue invoices', async () => {
    const output = invoiceFixture.output as unknown as InvoiceListOutput
    const result = await answer('show unpaid invoices', {
      store: fakeStore({ listInvoices: async () => output }),
      now: NOW,
    })

    expect(result.text).toBe(
      '2 invoices await payment, KES 7,800 outstanding. 1 is overdue.',
    )
    expect(result.cards[0]).toMatchObject({
      kind: 'metric',
      label: 'Outstanding',
      value: 'KES 7,800',
    })
  })

  it('answers Swahili low-stock questions', async () => {
    const output = lowStockFixture.output as unknown as LowStockOutput
    const result = await answer('bidhaa zinazokwisha ni zipi', {
      store: fakeStore({
        listLowStockItems: async () => output,
        productNames: async () => ({
          '11111111-1111-4111-8111-111111111111': 'Unga wa Mahindi',
          '22222222-2222-4222-8222-222222222222': 'Mafuta ya Kupikia',
        }),
      }),
      now: NOW,
    })

    expect(result.locale).toBe('sw')
    expect(result.text).toContain('2 bidhaa zinahitaji kuongezwa')
    expect(result.text).toContain('Unga wa Mahindi')
  })

  it('builds an expense chart', async () => {
    const output = expenseFixture.output as unknown as ExpenseSummaryOutput
    const result = await answer('expenses this month', {
      store: fakeStore({ summarizeExpensesByCategory: async () => output }),
      now: NOW,
    })

    expect(result.chart).toEqual({
      kind: 'bar',
      title: 'Expenses by category',
      series: [
        { label: 'Rent', value: 15000 },
        { label: 'Transport', value: 2400 },
      ],
    })
  })

  it('falls back without a tool call for unsupported questions', async () => {
    const result = await answer('tell me a joke', {
      store: fakeStore({}),
      now: NOW,
    })

    expect(result.tool).toBeUndefined()
    expect(result.cards).toEqual([])
    expect(result.text).toContain("can't answer that offline")
  })
})
