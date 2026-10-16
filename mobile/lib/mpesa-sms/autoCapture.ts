// Option 1 auto-capture orchestration (SMS User Consent API).
// Android-only; iOS callers never reach here (isAutoCaptureSupported).
// Flow: arm consent → system one-tap dialog on next MPESA message →
// approved text arrives as onSmsReceived → handleIncomingSms (sender gate,
// consent gate, TS parse, hash, queue, best-effort flush) → re-arm.
// Consent lasts ~5 min or one message, so every terminal state re-arms.

import {
  addSmsReceivedListener,
  addSmsTimeoutListener,
  isAutoCaptureSupported,
  startSmsUserConsent,
  stopSmsUserConsent,
} from '../../modules/sms-capture'
import { handleIncomingSms } from './index'
import { hasSmsConsent } from './consent'

export const AUTO_CAPTURE_SENDER = 'MPESA'

export type AutoCaptureResult =
  | { stored: true; receipt?: string; amountMinor?: number }
  | { stored: false; reason: string }

export async function armAutoCapture(
  onResult: (r: AutoCaptureResult) => void,
  sender: string = AUTO_CAPTURE_SENDER,
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
    handleIncomingSms({ body: event.message, sender })
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
