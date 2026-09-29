import { describe, expect, it } from 'vitest'
import { analyticsSnapshotKey } from '../analyticsKeys'

describe('analyticsSnapshotKey', () => {
  // These are the five projections that used to each issue their own GET /analytics.
  // They all call the same key builder, so identical inputs must produce an identical
  // key — that identity is what collapses them into a single request.
  const projections = ['summary', 'revenue', 'profit', 'categories', 'customers'] as const

  it('gives every projection the same key for the same timeframe + business', () => {
    for (const tf of ['day', 'week', 'month', 'year']) {
      const keys = projections.map(() => analyticsSnapshotKey(tf, 'biz-1'))
      for (const key of keys) {
        expect(key).toEqual(['analytics', 'snapshot', tf, 'biz-1'])
      }
      // TanStack compares query keys structurally via hashKey (JSON of the array), not by
      // reference, so each call returning a fresh array still resolves to one cache entry.
      expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(1)
    }
  })

  it('separates timeframes so switching range refetches', () => {
    const week = analyticsSnapshotKey('week', 'biz-1')
    const month = analyticsSnapshotKey('month', 'biz-1')
    expect(week).not.toEqual(month)
  })

  it('separates businesses so one tenant never sees another tenant data', () => {
    expect(analyticsSnapshotKey('week', 'biz-1')).not.toEqual(analyticsSnapshotKey('week', 'biz-2'))
  })

  it('keeps a distinct key while no business is selected', () => {
    expect(analyticsSnapshotKey('week', null)).toEqual(['analytics', 'snapshot', 'week', null])
  })

  it('is stable as a TanStack hashable key (array of primitives)', () => {
    const key = analyticsSnapshotKey('week', 'biz-1')
    expect(Array.isArray(key)).toBe(true)
    expect(key.every((part) => typeof part === 'string' || part === null)).toBe(true)
  })
})
