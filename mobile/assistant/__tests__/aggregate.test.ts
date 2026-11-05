import { describe, expect, it } from 'vitest'
import {
  buildCustomerCandidates,
  buildExpenseSummary,
  buildInvoiceList,
  buildLowStockItems,
  buildProductSales,
  buildSalesSummary,
} from '../aggregate'

describe('assistant aggregation', () => {
  it('sums sales in minor units without float drift', () => {
    const output = buildSalesSummary(
      [
        { subtotal: '0.10', taxAmount: '0.02', total: '0.12' },
        { subtotal: '0.20', taxAmount: '0.03', total: '0.23' },
      ],
      '2026-10-01T00:00:00Z',
      '2026-11-01T00:00:00Z',
    )

    expect(output).toEqual({
      count: 2,
      subtotal: '0.3',
      tax_amount: '0.05',
      total: '0.35',
      currency: 'KES',
      from: '2026-10-01T00:00:00Z',
      to: '2026-11-01T00:00:00Z',
    })
  })

  it('groups product lines and applies the limit', () => {
    const output = buildProductSales(
      [
        { productId: 'a', lineTotal: '500' },
        { productId: 'b', lineTotal: '1200' },
        { productId: 'a', lineTotal: '700' },
      ],
      2,
    )

    expect(output.results).toEqual([
      { key: 'a', total: '1200', count: 2, currency: 'KES' },
      { key: 'b', total: '1200', count: 1, currency: 'KES' },
    ])
  })

  it('keeps only items at or below their threshold', () => {
    const output = buildLowStockItems(
      [
        { productId: 'b', quantity: '2', lowStockThreshold: '5' },
        { productId: 'a', quantity: '5', lowStockThreshold: '5' },
        { productId: 'c', quantity: '6', lowStockThreshold: '5' },
      ],
      10,
    )

    expect(output.results.map((row) => row.product_id)).toEqual(['b', 'a'])
  })

  it('preserves quantity precision for stock', () => {
    const output = buildLowStockItems(
      [{ productId: 'a', quantity: '3.5', lowStockThreshold: '4' }],
      10,
    )

    expect(output.results[0].quantity).toBe('3.5')
  })

  it('groups expenses by category, largest first', () => {
    const output = buildExpenseSummary(
      [
        { category: 'Transport', amount: '400', taxAmount: '64' },
        { category: 'Rent', amount: '1500', taxAmount: '0' },
        { category: 'Transport', amount: '100', taxAmount: '16' },
      ],
      '2026-10-01T00:00:00Z',
      '2026-11-01T00:00:00Z',
    )

    expect(output.results).toEqual([
      {
        category: 'Rent',
        amount: '1500',
        tax_amount: '0',
        count: 1,
        currency: 'KES',
      },
      {
        category: 'Transport',
        amount: '500',
        tax_amount: '80',
        count: 2,
        currency: 'KES',
      },
    ])
  })

  it('maps invoice rows with nullable timestamps', () => {
    const output = buildInvoiceList(
      [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-1',
          status: 'sent',
          total: '5800',
          amountPaid: '0',
          amountDue: '5800',
          currency: 'KES',
          dueAt: Date.parse('2026-11-12T00:00:00Z'),
          sentAt: null,
          paidAt: null,
          customerId: 'cust-1',
        },
      ],
      10,
    )

    expect(output.results[0]).toMatchObject({
      invoice_id: 'inv-1',
      amount_due: '5800',
      due_at: '2026-11-12T00:00:00.000Z',
      sent_at: null,
      paid_at: null,
      customer_id: 'cust-1',
    })
    expect(output.results[0].order_id).toBeUndefined()
  })

  it('filters customers and masks support fields', () => {
    const output = buildCustomerCandidates(
      [
        {
          id: '1',
          name: 'Wanjiku Kamau',
          phone: '+254712345678',
          email: 'wanjiku@example.co.ke',
          loyaltyPoints: 120,
        },
        {
          id: '2',
          name: 'Otieno',
          phone: '0700',
          email: '',
          loyaltyPoints: 4,
        },
      ],
      'wanjiku',
      10,
    )

    expect(output.results).toEqual([
      {
        customer_id: '1',
        name: 'Wanjiku Kamau',
        phone_last4: '5678',
        email_domain: 'example.co.ke',
        loyalty_points: 120,
      },
    ])
    expect(buildCustomerCandidates([], 'none', 10).results).toEqual([])
  })
})
