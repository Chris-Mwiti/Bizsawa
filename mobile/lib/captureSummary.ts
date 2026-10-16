// Pure helpers for the M-PESA captures screen. No React Native imports so
// they stay unit-testable in plain vitest. Amounts are minor units (cents).

export interface CaptureRow {
  id: string
  mpesaReceipt?: string
  amountMinor: number
  currency: string
  occurredAt: string
  channelType: string
  source: string
  verificationStatus: string
}

export const PENDING_STATUS = 'device_reported'
export const DISPUTED_STATUS = 'disputed'

/** The two unverified statuses shown on the captures screen. */
export function isUnverifiedStatus(status: string): boolean {
  return status === PENDING_STATUS || status === DISPUTED_STATUS
}

/** Merge status-filtered fetches, newest first. */
export function mergeCaptures(...lists: CaptureRow[][]): CaptureRow[] {
  const seen = new Set<string>()
  const merged: CaptureRow[] = []
  for (const list of lists) {
    for (const row of list) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      merged.push(row)
    }
  }
  return merged.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )
}

export function filterByChannel(rows: CaptureRow[], channel: string | null): CaptureRow[] {
  if (!channel || channel === 'all') return rows
  return rows.filter((r) => r.channelType.toLowerCase() === channel.toLowerCase())
}

/** Sum of minor units — callers format. Unverified only by construction. */
export function sumMinor(rows: CaptureRow[]): number {
  return rows.reduce((sum, r) => sum + (Number.isFinite(r.amountMinor) ? r.amountMinor : 0), 0)
}

export function formatKesMinor(minor: number): string {
  return `KES ${(minor / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatCaptureDate(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
  return `${date} • ${time}`
}

/** Uppercase pill label for the verification status. */
export function statusPill(status: string): string {
  if (status === PENDING_STATUS) return 'PENDING'
  if (status === DISPUTED_STATUS) return 'DISPUTED'
  return status.toUpperCase()
}
