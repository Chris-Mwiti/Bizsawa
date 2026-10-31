import { handleIncomingSms } from './index'

export type AutoCaptureResult =
  | { stored: true; receipt?: string; amountMinor?: number }
  | { stored: false; reason: string }

/**
 * Broadcast-receiver based capture (PesaCast style). No consent window: the
 * native receiver stores every M-PESA SMS in a native queue; this drains it.
 */
export async function drainPendingSms(): Promise<AutoCaptureResult[]> {
  const { getPendingSms } = await import('../../modules/sms-capture')
  const pending = await getPendingSms()
  const results: AutoCaptureResult[] = []
  for (const body of pending) {
    try {
      const r = await handleIncomingSms({ body, sender: 'MPESA', requireConsent: false })
      results.push(r.stored ? { stored: true, receipt: r.item.mpesa_receipt, amountMinor: r.item.amount_minor } : { stored: false, reason: r.reason })
    } catch {
      results.push({ stored: false, reason: 'internal' })
    }
  }
  return results
}

export function isAutoCaptureSupported(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isAutoCaptureSupported: native } = require('../../modules/sms-capture')
    return native()
  } catch {
    return false
  }
}
