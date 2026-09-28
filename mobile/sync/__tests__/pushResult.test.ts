import { describe, expect, it } from 'vitest'
import { extractRejectedIds } from '../pushResult'

describe('extractRejectedIds', () => {
  it('reads the table -> id map from a raw push body', () => {
    const body = { rejected: { products: ['p1', 'p2'] } }
    expect(extractRejectedIds(body)).toEqual({ products: ['p1', 'p2'] })
  })

  it('unwraps an axios-style { data } envelope', () => {
    const res = { status: 200, data: { rejected: { orders: ['o1'] } } }
    expect(extractRejectedIds(res)).toEqual({ orders: ['o1'] })
  })

  it('unwraps a double data envelope', () => {
    const res = { data: { data: { rejected: { sales: ['s1'] } } } }
    expect(extractRejectedIds(res)).toEqual({ sales: ['s1'] })
  })

  it('returns undefined when nothing was rejected', () => {
    expect(extractRejectedIds({ applied: { products: ['p1'] } })).toBeUndefined()
    expect(extractRejectedIds({ rejected: {} })).toBeUndefined()
    expect(extractRejectedIds({ rejected: { products: [] } })).toBeUndefined()
  })

  it('returns undefined for malformed or empty input', () => {
    expect(extractRejectedIds(undefined)).toBeUndefined()
    expect(extractRejectedIds(null)).toBeUndefined()
    expect(extractRejectedIds('nope')).toBeUndefined()
    expect(extractRejectedIds({ rejected: null })).toBeUndefined()
    expect(extractRejectedIds({ rejected: 'products' })).toBeUndefined()
    expect(extractRejectedIds({ rejected: ['p1'] })).toBeUndefined()
  })

  it('drops non-string and empty ids instead of forwarding garbage', () => {
    const body = { rejected: { products: ['p1', '', null, 7, 'p2'] } }
    expect(extractRejectedIds(body)).toEqual({ products: ['p1', 'p2'] })
  })

  it('skips tables whose id list is not an array', () => {
    const body = { rejected: { products: ['p1'], orders: 'o1' } }
    expect(extractRejectedIds(body)).toEqual({ products: ['p1'] })
  })

  it('keeps multiple tables', () => {
    const body = { rejected: { products: ['p1'], order_lines: ['l1', 'l2'] } }
    expect(extractRejectedIds(body)).toEqual({ products: ['p1'], order_lines: ['l1', 'l2'] })
  })

  it('returns undefined when every table is malformed', () => {
    const body = { rejected: { products: 'nope', orders: [] } }
    expect(extractRejectedIds(body)).toBeUndefined()
  })

  it('does not loop forever on a self-referential envelope', () => {
    const res: Record<string, unknown> = {}
    res.data = res
    expect(() => extractRejectedIds(res)).not.toThrow()
  })
})
