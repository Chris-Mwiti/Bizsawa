// Facade: sender gate → consent gate → parse (native if present, TS
// fallback) → payer hash → offline queue. Never throws on parse failure;
// unparseable messages resolve to { stored: false } with a reason.

import { SMS_CONSENT_VERSION, SMS_PARSER_VERSION, type SmsIngestItem, type SmsParseOutcome } from './types'
import { parseMpesaSms } from './parser'
import { isMpesaSender } from './sender'
import { hashPayerPhone } from './payerHash'
import { enqueueSmsItem, flushSmsQueue, getSmsQueueCount, newClientEventId } from './queue'
import { hasSmsConsent } from './consent'

async function parseNative(body: string): Promise<SmsParseOutcome | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../modules/sms-capture')
    const fn = mod?.parseMpesaSms ?? mod?.default?.parseMpesaSms
    if (typeof fn !== 'function') return null
    return (await fn(body)) as SmsParseOutcome
  } catch {
    return null
  }
}

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
  const outcome = (await parseNative(args.body)) ?? parseMpesaSms(args.body)
  if (outcome.kind === 'reversal') return { stored: false, reason: 'reversal_ignored' }
  if (outcome.kind === 'rejected') return { stored: false, reason: outcome.reason }
  const payerHash = await hashPayerPhone(outcome.rawPayerPhone)
  const item: SmsIngestItem = {
    client_event_id: newClientEventId(),
    mpesa_receipt: outcome.payment.receiptCode,
    amount_minor: outcome.payment.amountMinor,
    currency: 'KES',
    occurred_at: new Date(outcome.payment.occurredAtMillis).toISOString(),
    channel_type: outcome.payment.channelType,
    source: 'sms_device',
    payer_hash: payerHash,
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
