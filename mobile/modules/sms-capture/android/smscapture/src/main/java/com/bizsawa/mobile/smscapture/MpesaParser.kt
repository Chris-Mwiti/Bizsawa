package com.bizsawa.mobile.smscapture

import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Pure M-Pesa confirmation-SMS parser. No Android dependencies: every input
 * is a [String], every output is data. Runs on the JVM unit-test runtime
 * exactly as it runs on device.
 *
 * PRIVACY: the parser extracts receipt, amount, timestamp, channel and the
 * payer phone (for hashing only) when present. Payer name, balance,
 * transaction cost and the raw text are NEVER part of any output object — by
 * construction there is nowhere to put them. [ParseResult.Ok.rawPayerPhone]
 * is null for name-only messages (genuine Pochi traffic can omit the phone)
 * and otherwise goes straight to [PayerHasher] and is dropped.
 *
 * PLACEHOLDER PATTERNS: until the product owner supplies anonymised real
 * samples, the regexes below are best-guess scaffolding. They are fenced by
 * [MpesaFixtures] coverage metadata and [FixtureCoverageTest], which fails
 * loudly while any message type has placeholder-only coverage. Do NOT treat
 * a green parser suite as validation against real Safaricom traffic.
 *
 * Date handling uses java.text.SimpleDateFormat (not java.time) because the
 * app has no core-library desugaring and minSdk is 24. Instances are created
 * per call — SimpleDateFormat is not thread-safe.
 */
object MpesaParser {

    /** Bump on ANY rule change. Every stored record carries this version. */
    const val VERSION = "2"

    private val NAIROBI: TimeZone = TimeZone.getTimeZone("Africa/Nairobi")

    // Named capture groups per brief. All case-insensitive, whitespace-tolerant.
    // Receipt has two shapes: Safaricom's leading "<CODE> Confirmed…" (the
    // common case — real messages open with the code) and keyword-led
    // variants elsewhere in the body.
    private val RECEIPT_LEADING =
        Regex("""(?i)^\s*(?<receipt>[A-Z0-9]{6,16})\s+Confirmed""")
    private val RECEIPT =
        Regex("""(?i)(?:receipt|code|ref(?:erence)?|transaction\s*(?:id|code))\s*[:#]?\s*(?<receipt>[A-Z0-9]{6,16})""")
    private val AMOUNT =
        Regex("""(?i)\bKsh\s*(?<amount>[\d,]+\.\d{2})""")
    private val DATE_TIME = listOf(
        // e.g. 08/10/2026 at 09:41 AM
        SimplePattern(Regex("""(?i)(?<date>\d{1,2}/\d{1,2}/\d{2,4})\s+at\s+(?<time>\d{1,2}:\d{2}\s*(?:AM|PM))"""), "dd/MM/yyyy hh:mm a", "dd/MM/yy hh:mm a"),
        // e.g. 08-10-2026 09:41 / 2026-10-08 09:41
        SimplePattern(Regex("""(?<date>\d{1,2}-\d{1,2}-\d{2,4})\s+(?<time>\d{1,2}:\d{2})"""), "dd-MM-yyyy HH:mm", "dd-MM-yy HH:mm"),
        SimplePattern(Regex("""(?<date>\d{4}-\d{1,2}-\d{1,2})\s+(?<time>\d{1,2}:\d{2})"""), "yyyy-MM-dd HH:mm", null),
    )
    private val PHONE =
        Regex("""(?<phone>\+?254[17]\d{8}|\b0[17]\d{8}\b)""")

    private val REVERSAL_HINT = Regex("""(?i)\breversal\b.*\breversed\b|\breversed\b.*\breversal\b""")
    private val SENT_HINT = Regex("""(?i)\bsent\s+to\b""")
    private val WITHDRAW_HINT = Regex("""(?i)\bwithdraw(?:al|n)?\b.*\bagent\b|\bagent\b.*\bwithdraw""")
    private val AIRTIME_HINT = Regex("""(?i)\bairtime\b""")
    private val FULIZA_HINT = Regex("""(?i)\bfuliza\b""")
    private val TILL_HINT = Regex("""(?i)\btill\b|buy\s*goods""")
    private val PAYBILL_HINT = Regex("""(?i)\bpay\s*bill\b|paybill|account\s*(?:no|number|ref)""")
    private val POCHI_HINT = Regex("""(?i)\bpochi\b""")

    fun parse(body: String): ParseResult {
        val text = body.trim()
        if (text.isEmpty()) return ParseResult.Rejected("empty_message")

        // Reversals are detected, never parsed as payments (future work).
        if (REVERSAL_HINT.containsMatchIn(text)) return ParseResult.Reversal

        // Ignored message classes — order matters: cheapest checks first.
        if (SENT_HINT.containsMatchIn(text)) return ParseResult.Rejected("sent_money")
        if (WITHDRAW_HINT.containsMatchIn(text)) return ParseResult.Rejected("withdrawal")
        if (AIRTIME_HINT.containsMatchIn(text)) return ParseResult.Rejected("airtime")
        if (FULIZA_HINT.containsMatchIn(text)) return ParseResult.Rejected("fuliza")

        val receipt = (RECEIPT_LEADING.find(text) ?: RECEIPT.find(text))
            ?.groups?.get("receipt")?.value?.uppercase()
            ?: return ParseResult.Rejected("no_receipt")
        val amountRaw = AMOUNT.find(text)?.groups?.get("amount")?.value
            ?: return ParseResult.Rejected("no_amount")
        val amountMinor = parseAmountMinor(amountRaw)
            ?: return ParseResult.Rejected("bad_amount")
        if (amountMinor <= 0) return ParseResult.Rejected("bad_amount")
        val occurredAt = parseDateTime(text)
            ?: return ParseResult.Rejected("no_datetime")

        val channel = when {
            POCHI_HINT.containsMatchIn(text) -> ChannelType.POCHI
            TILL_HINT.containsMatchIn(text) -> ChannelType.TILL
            PAYBILL_HINT.containsMatchIn(text) -> ChannelType.PAYBILL
            else -> ChannelType.UNKNOWN
        }

        // Pochi check last: "pochi" rarely collides, till/paybill win on overlap.
        // Payer phone is optional: genuine Pochi traffic can be name-only
        // ("from LINUS KIBET on …" with no digits) — null phone parses fine
        // and the backend stores the capture without a payer_hash.
        val phoneRaw = PHONE.find(text)?.groups?.get("phone")?.value

        return ParseResult.Ok(
            payment = CapturedPayment(
                receiptCode = receipt,
                amountMinor = amountMinor,
                currency = "KES",
                occurredAtMillis = occurredAt,
                channelType = channel,
            ),
            rawPayerPhone = phoneRaw?.let { normalizePhone(it) },
        )
    }

    /** "1,234.50" -> 123450. BigDecimal only — never floats. Null on garbage. */
    internal fun parseAmountMinor(raw: String): Long? {
        return try {
            val clean = raw.replace(",", "").trim()
            if (!clean.matches(Regex("""\d+\.\d{2}"""))) return null
            BigDecimal(clean).movePointRight(2).longValueExact()
        } catch (_: Exception) {
            null
        }
    }

    internal fun parseDateTime(text: String): Long? {
        for (pattern in DATE_TIME) {
            val m = pattern.regex.find(text) ?: continue
            val date = m.groups["date"]?.value ?: continue
            val time = m.groups["time"]?.value ?: continue
            for (fmt in pattern.formats) {
                try {
                    @Suppress("SimpleDateFormat")
                    val sdf = SimpleDateFormat(fmt, Locale.US)
                    sdf.timeZone = NAIROBI
                    sdf.isLenient = false
                    val parsed = sdf.parse("$date $time") ?: continue
                    return parsed.time
                } catch (_: Exception) {
                    continue
                }
            }
        }
        return null
    }

    /** 0712… / +254712… -> 254712…. Digits only, for hashing. */
    internal fun normalizePhone(raw: String): String {
        val digits = raw.filter { it.isDigit() }
        return when {
            digits.startsWith("254") -> digits
            digits.startsWith("0") -> "254" + digits.substring(1)
            else -> digits
        }
    }

    private data class SimplePattern(
        val regex: Regex,
        val primary: String,
        val fallback: String?,
    ) {
        val formats: List<String>
            get() = if (fallback != null) listOf(primary, fallback) else listOf(primary)
    }
}

/** Channel a payment arrived on. UNKNOWN still parses (receipt+amount+date rule). */
enum class ChannelType { TILL, PAYBILL, POCHI, UNKNOWN }

/**
 * Parser output. Deliberately narrow: receipt, amount, timestamp, channel.
 * There are intentionally NO fields for payer name, balance, cost or raw
 * text — [MpesaParserTest.noNameOrBalanceLeak] pins this structurally.
 */
data class CapturedPayment(
    val receiptCode: String,
    val amountMinor: Long,
    val currency: String,
    val occurredAtMillis: Long,
    val channelType: ChannelType,
)

sealed interface ParseResult {
    /** Payment parsed. rawPayerPhone is null for name-only messages, else
     *  goes straight to PayerHasher, then dropped. */
    data class Ok(val payment: CapturedPayment, val rawPayerPhone: String?) : ParseResult
    /** Not a receivable payment (sent/withdrawal/airtime/fuliza/promo/unknown). */
    data class Rejected(val reason: String) : ParseResult
    /** Reversal detected — distinct type, never a payment. Matching engine: future work. */
    data object Reversal : ParseResult
}
