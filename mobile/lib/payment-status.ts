/** Shared M-Pesa payment-status helpers (single source of truth for the app). */

export type NormalizedPaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'unknown';

const TERMINAL: NormalizedPaymentStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
  'expired',
];

export function normalizePaymentStatus(raw: unknown): NormalizedPaymentStatus {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  switch (s) {
    case 'pending':
      return 'pending';
    case 'processing':
    case 'processed':
    case 'accepted':
      return 'processing';
    case 'succeeded':
    case 'success':
    case 'completed':
    case 'complete':
    case 'paid':
      return 'succeeded';
    case 'failed':
    case 'failure':
    case 'error':
      return 'failed';
    case 'cancelled':
    case 'canceled':
    case 'cancel':
    case 'user_cancelled':
    case 'user_canceled':
      return 'cancelled';
    case 'expired':
    case 'timeout':
    case 'timed_out':
    case 'stale':
      return 'expired';
    default:
      return 'unknown';
  }
}

export function isPaymentTerminal(raw: unknown): boolean {
  return TERMINAL.includes(normalizePaymentStatus(raw));
}

export function isPaymentSucceeded(raw: unknown): boolean {
  return normalizePaymentStatus(raw) === 'succeeded';
}

/** Failed, cancelled, or expired — all mean "no money moved, tell the user". */
export function isPaymentFailed(raw: unknown): boolean {
  const n = normalizePaymentStatus(raw);
  return n === 'failed' || n === 'cancelled' || n === 'expired';
}

/** True while the STK prompt may still resolve (keep polling). */
export function isPaymentPending(raw: unknown): boolean {
  const n = normalizePaymentStatus(raw);
  return n === 'pending' || n === 'processing' || n === 'unknown';
}

const CODE_MESSAGES: Record<string, string> = {
  '1032':
    'M-Pesa request was cancelled on the phone. No money was charged — you can try again.',
  '1037':
    'M-Pesa request timed out waiting for a PIN. No money was charged — please try again.',
  '1': 'M-Pesa failed: insufficient balance. No money was charged.',
  '2001':
    'M-Pesa failed: wrong PIN entered. No money was charged — please try again.',
  '1019':
    'M-Pesa could not start this transaction. Check the phone number and try again.',
  '1001':
    'M-Pesa could not start this transaction. Check the phone number and try again.',
  user_cancelled:
    'M-Pesa request was cancelled. No money was charged — you can try again.',
  user_canceled:
    'M-Pesa request was cancelled. No money was charged — you can try again.',
  stale:
    'M-Pesa request expired without confirmation. No money was charged — please try again.',
};

export function paymentFailureMessage(
  payment: any,
  fallback = 'M-Pesa payment failed. No money was charged — you can try again.',
): string {
  const code = String(
    payment?.failureCode ?? payment?.failure_code ?? '',
  ).trim();
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  const msg = String(
    payment?.failureMessage ?? payment?.failure_message ?? '',
  ).trim();
  if (msg) return msg;
  return fallback;
}
