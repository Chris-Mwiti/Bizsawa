import { describe, expect, it } from 'vitest'
import {
  DISPUTED_STATUS,
  filterByChannel,
  formatCaptureDate,
  formatKesMinor,
  isUnverifiedStatus,
  mergeCaptures,
  statusPill,
  sumMinor,
  type CaptureRow,
} from '../captureSummary'

const row = (over: Partial<CaptureRow>): CaptureRow => ({
  id: 'a',
  amountMinor: 1000,
  currency: 'KES',
  occurredAt: '2026-10-14T11:24:00.000Z',
  channelType: 'pochi',
  source: 'sms_device',
  verificationStatus: 'device_reported',
  ...over,
})

describe('captureSummary helpers', () => {
  it('recognises the unverified statuses only', () => {
    expect(isUnverifiedStatus('device_reported')).toBe(true)
    expect(isUnverifiedStatus(DISPUTED_STATUS)).toBe(true)
    expect(isUnverifiedStatus('verified')).toBe(false)
  })

  it('merges fetches newest-first without duplicates', () => {
    const merged = mergeCaptures(
      [row({ id: 'a', occurredAt: '2026-10-14T10:00:00Z' })],
      [row({ id: 'a', occurredAt: '2026-10-14T10:00:00Z' }), row({ id: 'b', occurredAt: '2026-10-14T12:00:00Z' })],
    )
    expect(merged.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('filters by channel case-insensitively', () => {
    const rows = [row({ id: 'a', channelType: 'pochi' }), row({ id: 'b', channelType: 'till' })]
    expect(filterByChannel(rows, 'POCHI').map((r) => r.id)).toEqual(['a'])
    expect(filterByChannel(rows, null)).toHaveLength(2)
  })

  it('sums minor units and formats KES', () => {
    expect(sumMinor([row({ amountMinor: 1000 }), row({ amountMinor: 250 })])).toBe(1250)
    expect(formatKesMinor(1250)).toBe('KES 12.50')
  })

  it('labels status pills', () => {
    expect(statusPill('device_reported')).toBe('PENDING')
    expect(statusPill('disputed')).toBe('DISPUTED')
  })

  it('formats dates with time', () => {
    expect(formatCaptureDate('2026-10-14T11:24:00.000Z')).toContain('2026')
  })
})
