import { describe, expect, it } from 'vitest'

import {
  extractRouteId,
  matchGatePath,
  normalizeHref,
} from '../routeGateMatchers'

describe('normalizeHref', () => {
  it('strips query strings and hashes', () => {
    expect(normalizeHref('/(tabs)/sales?action=new-sale')).toBe('/(tabs)/sales')
    expect(normalizeHref('/orders/abc#totals')).toBe('/orders/abc')
  })

  it('strips trailing slashes but keeps the root path', () => {
    expect(normalizeHref('/orders/abc/')).toBe('/orders/abc')
    expect(normalizeHref('/')).toBe('')
  })

  it('returns empty string for non-strings so callers never throw', () => {
    expect(normalizeHref(undefined)).toBe('')
    expect(normalizeHref(null)).toBe('')
    expect(normalizeHref(42)).toBe('')
  })
})

describe('matchGatePath', () => {
  it('maps the root path onto the tabs index', () => {
    expect(matchGatePath('/')).toEqual({ kind: 'static', path: '/(tabs)' })
  })

  it('matches static routes verbatim', () => {
    expect(matchGatePath('/(tabs)/stock')).toEqual({
      kind: 'static',
      path: '/(tabs)/stock',
    })
  })

  it('extracts ids from order and invoice detail routes', () => {
    expect(matchGatePath('/orders/ord_123')).toEqual({
      kind: 'detail',
      detail: 'order',
      id: 'ord_123',
    })
    expect(matchGatePath('/invoices/inv_9')).toEqual({
      kind: 'detail',
      detail: 'invoice',
      id: 'inv_9',
    })
  })

  it('does not treat a list route as a detail route', () => {
    // '/orders' and '/invoices' are list screens with no id segment.
    expect(matchGatePath('/orders')).toEqual({
      kind: 'static',
      path: '/orders',
    })
  })

  it('returns null only for empty input', () => {
    expect(matchGatePath('')).toBeNull()
  })
})

describe('extractRouteId', () => {
  it('ignores query strings and trailing slashes', () => {
    expect(extractRouteId('/orders/ord_1?tab=lines')).toBe('ord_1')
    expect(extractRouteId('/invoices/inv_2/')).toBe('inv_2')
  })

  it('returns null for non-detail routes', () => {
    expect(extractRouteId('/(tabs)/sales')).toBeNull()
    expect(extractRouteId('/orders')).toBeNull()
    expect(extractRouteId('/')).toBeNull()
  })
})
