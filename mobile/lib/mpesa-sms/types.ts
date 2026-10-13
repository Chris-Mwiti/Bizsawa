// Shared M-Pesa SMS capture types. Mirrors:
// - Kotlin: CapturedPayment / ChannelType / ParseResult (MpesaParser.kt)
// - Backend: IngestItem / CapturedPayment (internal/payments/ingest.go, capture.go)
// Raw SMS text, payer names and balances are never stored — by construction
// there is no field for them.

export const SMS_PARSER_VERSION = '1'
export const SMS_CONSENT_VERSION = '1'

export type SmsChannel = 'till' | 'paybill' | 'pochi' | 'unknown'

export type SmsRejectReason =
  | 'empty_message'
  | 'no_receipt'
  | 'no_amount'
  | 'bad_amount'
  | 'no_datetime'
  | 'no_payer_phone'
  | 'sent_money'
  | 'withdrawal'
  | 'airtime'
  | 'fuliza'
  | 'non_mpesa_sender'
  | 'consent_required'

export interface ParsedSmsPayment {
  receiptCode: string
  amountMinor: number
  currency: 'KES'
  occurredAtMillis: number
  channelType: SmsChannel
}

export type SmsParseOutcome =
  | { kind: 'ok'; payment: ParsedSmsPayment; rawPayerPhone: string }
  | { kind: 'rejected'; reason: SmsRejectReason }
  | { kind: 'reversal' }

// Backend POST /payments/ingest item (strict fields only — unknown rejected).
export interface SmsIngestItem {
  client_event_id: string
  mpesa_receipt?: string
  amount_minor: number
  currency: string
  occurred_at: string
  channel_type: string
  source: 'sms_device'
  payer_hash?: string
  parser_version?: string
  consent_version?: string
  device_id?: string
}

export type IngestAck = 'created' | 'duplicate' | 'merged' | 'disputed'
