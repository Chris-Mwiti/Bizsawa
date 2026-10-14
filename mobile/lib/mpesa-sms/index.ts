// Facade: sender gate → consent gate → parse (native if present, TS
// fallback) → payer hash → offline queue. Never throws on parse failure;
// unparseable messages resolve to { stored: false } with a reason.

import { SMS_CONSENT_VERSION, SMS_PARSER_VERSION, type SmsIngestItem, type SmsParseOutcome } from './types'
import { parseMpesaSms } from './parser'
import { hashPayerPhone } from './payerHash'
import { isMpesaSender } from './sender'
import { hasSmsConsent } from './consent'
import { enqueueSmsItem, flushSmsQueue, getSmsQueueCount, newClientEventId } from './queue'

export interface HandleSmsArgs {
  body: string
  sender?: string | null
  requireConsent?: boolean
}

export async function handleIncomingSms(args: HandleSmsArgs): Promise<
  | { stored: true; item: SmsIngestItem }
  | { stored: false; reason: string }
> {
  if (!isMpesaSender(args.sender)) return { stored: false, reason: 'non_mpesa_sender' }
  if (args.requireConsent !== false && !(await hasSmsConsent())) {
    return { stored: false, reason: 'consent_required' }
  }
  // Parsing is TS-side (single rule set, mirrors the Kotlin parser v2).
  // The native module only delivers raw message text via the Consent API.
  const outcome: SmsParseOutcome = parseMpesaSms(args.body)
  if (outcome.kind === 'reversal') return { stored: false, reason: 'reversal_ignored' }
  if (outcome.kind === 'rejected') return { stored: false, reason: outcome.reason }
  // Name-only messages (genuine Pochi without a phone) carry no payer_hash;
  // the backend accepts captures with an absent payer_hash.
  const payerHash = outcome.rawPayerPhone === null ? undefined : await hashPayerPhone(outcome.rawPayerPhone)
  const item: SmsIngestItem = {
    client_event_id: newClientEventId(),
    mpesa_receipt: outcome.payment.receiptCode,
    amount_minor: outcome.payment.amountMinor,
    currency: 'KES',
    occurred_at: new Date(outcome.payment.occurredAtMillis).toISOString(),
    channel_type: outcome.payment.channelType,
    source: 'sms_device',
    ...(payerHash !== undefined ? { payer_hash: payerHash } : {}),
    parser_version: SMS_PARSER_VERSION,
    consent_version: SMS_CONSENT_VERSION,
  }
  await enqueueSmsItem(item)
  // Best-effort flush; offline simply leaves it queued.
  try {
    await flushSmsQueue()
  } catch {}
  return { stored: true, item }
}

export { flushSmsQueue, getSmsQueueCount }
export { isMpesaSender } from './sender'
