import { describe, expect, it } from 'vitest'
import { presentTool } from '../present'

describe('presentTool', () => {
  it('renders server sales data as metric cards', () => {
    const answer = presentTool(
      'summarize_sales',
      {},
      {
        count: 3,
        subtotal: '2500',
        tax_amount: '400',
        total: '2900',
        currency: 'KES',
        from: '2026-10-01T00:00:00Z',
        to: '2026-11-01T00:00:00Z',
      },
      { locale: 'en' },
    )

    expect(answer.cards).toHaveLength(3)
    expect(answer.cards[0]).toMatchObject({ kind: 'metric', value: '3' })
    expect(answer.text).toContain('KES')
  })

  it('renders a product bar chart with friendly names', () => {
    const answer = presentTool(
      'list_sales_by_product',
      { limit: 5 },
      {
        results: [
          {
            key: '11111111-1111-4111-8111-111111111111',
            total: '1800',
            count: 4,
            currency: 'KES',
          },
        ],
      },
      {
        locale: 'sw',
        productNames: {
          '11111111-1111-4111-8111-111111111111': 'Sukari',
        },
      },
    )

    expect(answer.chart?.series[0]).toEqual({ label: 'Sukari', value: 1800 })
    expect(answer.cards[0].kind).toBe('list')
  })

  it('degrades unknown output without throwing', () => {
    const answer = presentTool('list_invoices', {}, null, { locale: 'en' })
    expect(answer.cards).toEqual([])
    expect(answer.chart).toBeUndefined()
  })
})
