// Option 1 auto-capture orchestration (SMS User Consent API).
// Android-only; iOS callers never reach here (isAutoCaptureSupported).
// Flow: arm consent → system one-tap dialog on next SMS →
// approved text arrives as onSmsReceived → handleIncomingSms (consent gate,
// TS parse, hash, queue, best-effort flush) → re-arm.
// Consent lasts ~5 min or one message, so every terminal state re-arms.
//
// Sender filter is deliberately OFF (null): Safaricom sender IDs vary
// (MPESA, M-PESA, Safaricom…) and an exact filter silently drops everything
// else — the failure mode we just hit in the field. The Consent API does
// not reveal the true sender, so non-M-PESA texts are filtered by the strict
// TS parse instead (receipt+amount+datetime+channel must all match) and show
// up as logged rejections, never stored.

import {
  addSmsReceivedListener,
  addSmsTimeoutListener,
  isAutoCaptureSupported,
  startSmsUserConsent,
  stopSmsUserConsent,
} from '../../modules/sms-capture'
import { handleIncomingSms } from './index'
import { hasSmsConsent } from './consent'

// Null = match any sender. See header: the native filter is off so a
// sender-ID variant can never silently swallow a payment SMS.
export const AUTO_CAPTURE_SENDER: string | null = null

export type AutoCaptureResult =
  | { stored: true; receipt?: string; amountMinor?: number }
  | { stored: false; reason: string }

export async function armAutoCapture(
  onResult: (r: AutoCaptureResult) => void,
  sender: string | null = AUTO_CAPTURE_SENDER,
  onRearmError?: (message: string) => void,
): Promise<() => void> {
  if (!isAutoCaptureSupported()) throw new Error('auto-capture not supported on this device')
  if (!(await hasSmsConsent())) throw new Error('SMS capture consent not granted')

  let stopped = false
  const rearm = () => {
    if (stopped) return
    // Silent re-arm failure = silently dead listener. Surface it so the UI
    // can flip to error instead of showing a fake 'listening'.
    startSmsUserConsent(sender).catch((e: unknown) =>
      onRearmError?.(e instanceof Error ? e.message : String(e)),
    )
  }

  const subMsg = addSmsReceivedListener((event) => {
    // The Consent API never reveals the true sender, so when the filter is
    // off there is nothing honest to gate on here — pass the filter value
    // through and let the strict parse reject non-payment texts with a
    // visible reason. (With an exact filter, sender IS the verified ID.)
    handleIncomingSms({ body: event.message, sender: sender ?? 'MPESA' })
      .then((r) => {
        onResult(
          r.stored
            ? { stored: true, receipt: r.item.mpesa_receipt, amountMinor: r.item.amount_minor }
            : { stored: false, reason: r.reason },
        )
      })
      .catch(() => onResult({ stored: false, reason: 'internal' }))
      .finally(rearm)
  })
  // Consent window expiry (~5 min) is a heartbeat: it proves the native
  // listener is alive and re-arms it. Report it so the test screen can log
  // "still listening" instead of silence being ambiguous with "dead".
  const subTimeout = addSmsTimeoutListener(() => {
    onResult({ stored: false, reason: 'consent_window_expired_rearmed' })
    rearm()
  })

  // Initial arm.
  await startSmsUserConsent(sender)

  return () => {
    stopped = true
    subMsg.remove()
    subTimeout.remove()
    stopSmsUserConsent().catch(() => {})
  }
}

export { isAutoCaptureSupported }
