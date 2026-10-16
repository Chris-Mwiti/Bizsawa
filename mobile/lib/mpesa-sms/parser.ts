// TypeScript mirror of the Android Kotlin MpesaParser (VERSION 2).
// Pure function, no native dependencies — used on iOS, in tests, and as a
// fallback when the native sms-capture module is unavailable.
// Rule changes must bump SMS_PARSER_VERSION and land in both implementations.
// v2: payer phone is optional — genuine Pochi la Biashara traffic can be
// name-only ("received Ksh10.00 from LINUS KIBET on …", no digits), so a
// missing phone yields rawPayerPhone: null instead of no_payer_phone.

import { SMS_PARSER_VERSION, type SmsParseOutcome, type SmsChannel } from './types'

export const PARSER_VERSION = SMS_PARSER_VERSION

const RECEIPT_LEADING = /^\s*([A-Z0-9]{6,16})\s+Confirmed/i
const RECEIPT =
  /(?:receipt|code|ref(?:erence)?|transaction\s*(?:id|code))\s*[:#]?\s*([A-Z0-9]{6,16})/i
const AMOUNT = /\bKsh\s*([\d,]+\.\d{2})/i
const PHONE = /\+?254[17]\d{8}|\b0[17]\d{8}\b/

const REVERSAL_HINT = /reversal.*reversed|reversed.*reversal/i
const SENT_HINT = /\bsent\s+to\b/i
const WITHDRAW_HINT = /\bwithdraw(?:al|n)?\b.*\bagent\b|\bagent\b.*\bwithdraw/i
const AIRTIME_HINT = /\bairtime\b/i
const FULIZA_HINT = /\bfuliza\b/i
const TILL_HINT = /\btill\b|buy\s*goods/i
const PAYBILL_HINT = /\bpay\s*bill\b|paybill|account\s*(?:no|number|ref)/i
const POCHI_HINT = /\bpochi\b/i

function parseAmountMinor(raw: string): number | null {
  const clean = raw.replace(/,/g, '').trim()
  if (!/^\d+\.\d{2}$/.test(clean)) return null
  const [shillings, cents] = clean.split('.')
  const value = Number(shillings) * 100 + Number(cents)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

// Africa/Nairobi is UTC+3 with no DST. Device SMS timestamps carry no zone,
// so interpret wall-clock as Nairobi time.
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000

function parseDateTime(text: string): number | null {
  const patterns: Array<{ re: RegExp; parse: (d: string, t: string) => number | null }> = [
    {
      // 08/10/2026 at 09:41 AM (also 2-digit year)
      re: /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i,
      parse: (d, t) => {
        const [dd, mm, yyRaw] = d.split('/').map(Number)
        const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
        if (!m) return null
        let hh = Number(m[1]) % 12
        if (/pm/i.test(m[3])) hh += 12
        const yyyy = yyRaw < 100 ? 2000 + yyRaw : yyRaw
        if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null
        return Date.UTC(yyyy, mm - 1, dd, hh, Number(m[2])) - NAIROBI_OFFSET_MS
      },
    },
    {
      // 2026-10-08 09:41 (ISO-like, no AM/PM)
      re: /(\d{4}-\d{1,2}-\d{1,2})\s+(\d{1,2}:\d{2})(?!\s*[AP]M)/,
      parse: (d, t) => {
        const [yyyy, mm, dd] = d.split('-').map(Number)
        const [hh, min] = t.split(':').map(Number)
        return Date.UTC(yyyy, mm - 1, dd, hh, min) - NAIROBI_OFFSET_MS
      },
    },
    {
      // 08-10-2026 09:41
      re: /(\d{1,2}-\d{1,2}-\d{2,4})\s+(\d{1,2}:\d{2})/,
      parse: (d, t) => {
        const [dd, mm, yyRaw] = d.split('-').map(Number)
        const [hh, min] = t.split(':').map(Number)
        const yyyy = yyRaw < 100 ? 2000 + yyRaw : yyRaw
        return Date.UTC(yyyy, mm - 1, dd, hh, min) - NAIROBI_OFFSET_MS
      },
    },
  ]
  for (const p of patterns) {
    const m = p.re.exec(text)
    if (!m) continue
    const ts = p.parse(m[1], m[2])
    if (ts !== null && Number.isFinite(ts)) return ts
  }
  return null
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('254')) return digits
  if (digits.startsWith('0')) return `254${digits.slice(1)}`
  return digits
}

export function parseMpesaSms(body: string): SmsParseOutcome {
  const text = body.trim()
  if (!text) return { kind: 'rejected', reason: 'empty_message' }
  if (REVERSAL_HINT.test(text)) return { kind: 'reversal' }
  if (SENT_HINT.test(text)) return { kind: 'rejected', reason: 'sent_money' }
  if (WITHDRAW_HINT.test(text)) return { kind: 'rejected', reason: 'withdrawal' }
  if (AIRTIME_HINT.test(text)) return { kind: 'rejected', reason: 'airtime' }
  if (FULIZA_HINT.test(text)) return { kind: 'rejected', reason: 'fuliza' }

  const receipt = (RECEIPT_LEADING.exec(text) ?? RECEIPT.exec(text))?.[1]?.toUpperCase()
  if (!receipt) return { kind: 'rejected', reason: 'no_receipt' }
  const amountRaw = AMOUNT.exec(text)?.[1]
  if (!amountRaw) return { kind: 'rejected', reason: 'no_amount' }
  const amountMinor = parseAmountMinor(amountRaw)
  if (amountMinor === null) return { kind: 'rejected', reason: 'bad_amount' }
  const occurredAtMillis = parseDateTime(text)
  if (occurredAtMillis === null) return { kind: 'rejected', reason: 'no_datetime' }

  let channelType: SmsChannel = 'unknown'
  if (POCHI_HINT.test(text)) channelType = 'pochi'
  else if (TILL_HINT.test(text)) channelType = 'till'
  else if (PAYBILL_HINT.test(text)) channelType = 'paybill'

  const phoneRaw = PHONE.exec(text)?.[0] ?? null

  return {
    kind: 'ok',
    payment: {
      receiptCode: receipt,
      amountMinor,
      currency: 'KES',
      occurredAtMillis,
      channelType,
    },
    rawPayerPhone: phoneRaw === null ? null : normalizePhone(phoneRaw),
  }
}
