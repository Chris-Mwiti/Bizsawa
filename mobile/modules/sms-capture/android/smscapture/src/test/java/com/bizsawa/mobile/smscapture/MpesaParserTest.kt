package com.bizsawa.mobile.smscapture

import org.junit.Assert.*
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

/** JVM-only parser tests. No Android dependencies — same code runs on device. */
class MpesaParserTest {

    private fun ok(fixture: Fixture): CapturedPayment {
        val res = MpesaParser.parse(fixture.text)
        assertTrue("expected Ok for ${fixture.id}, got $res", res is ParseResult.Ok)
        return (res as ParseResult.Ok).payment
    }

    private fun rejected(fixture: Fixture, reason: String) {
        val res = MpesaParser.parse(fixture.text)
        assertTrue("expected Rejected for ${fixture.id}, got $res", res is ParseResult.Rejected)
        assertEquals(reason, (res as ParseResult.Rejected).reason)
    }

    @Test fun tillParsesReceiptAmountChannel() {
        val p = ok(MpesaFixtures.TILL_1)
        assertEquals("QHX7K2M9AB", p.receiptCode)
        assertEquals(123450L, p.amountMinor)
        assertEquals("KES", p.currency)
        assertEquals(ChannelType.TILL, p.channelType)
    }

    @Test fun paybillParses() {
        val p = ok(MpesaFixtures.PAYBILL_1)
        assertEquals("QJ2M8XZ4PL", p.receiptCode)
        assertEquals(250000L, p.amountMinor)
        assertEquals(ChannelType.PAYBILL, p.channelType)
    }

    @Test fun pochiParses() {
        val p = ok(MpesaFixtures.POCHI_1)
        assertEquals("PK7T2M9QW1", p.receiptCode)
        assertEquals(35000L, p.amountMinor)
        assertEquals(ChannelType.POCHI, p.channelType)
    }

    @Test fun pochiNameOnlyParsesWithoutPhone() {
        val res = MpesaParser.parse(MpesaFixtures.POCHI_2.text)
        assertTrue("expected Ok for pochi-2, got $res", res is ParseResult.Ok)
        val ok = res as ParseResult.Ok
        assertEquals("UJEEIA0XPR", ok.payment.receiptCode)
        assertEquals(1000L, ok.payment.amountMinor)
        assertEquals(ChannelType.POCHI, ok.payment.channelType)
        assertNull(ok.rawPayerPhone)
    }

    @Test fun timestampIsNairobiEpochMillis() {
        val p = ok(MpesaFixtures.TILL_1)
        val cal = Calendar.getInstance(TimeZone.getTimeZone("Africa/Nairobi"))
        cal.timeInMillis = p.occurredAtMillis
        assertEquals(2026, cal.get(Calendar.YEAR))
        assertEquals(Calendar.OCTOBER, cal.get(Calendar.MONTH))
        assertEquals(8, cal.get(Calendar.DAY_OF_MONTH))
        assertEquals(9, cal.get(Calendar.HOUR_OF_DAY))
        assertEquals(41, cal.get(Calendar.MINUTE))
    }

    @Test fun payerPhoneReturnedForHashingOnly() {
        val res = MpesaParser.parse(MpesaFixtures.TILL_1.text)
        assertTrue(res is ParseResult.Ok)
        // Normalized to 254… digits; the name is nowhere in the output.
        assertEquals("254712345678", (res as ParseResult.Ok).rawPayerPhone)
    }

    @Test fun ignoredClasses() {
        rejected(MpesaFixtures.SENT_1, "sent_money")
        rejected(MpesaFixtures.WITHDRAW_1, "withdrawal")
        rejected(MpesaFixtures.AIRTIME_1, "airtime")
        rejected(MpesaFixtures.FULIZA_1, "fuliza")
        // Rejection checks run receipt -> amount -> datetime, so the promo
        // (no receipt keyword) reports no_receipt.
        rejected(MpesaFixtures.PROMO_1, "no_receipt")
        rejected(MpesaFixtures.BALANCE_1, "no_receipt")
    }

    @Test fun reversalIsDistinctTypeNeverPayment() {
        val res = MpesaParser.parse(MpesaFixtures.REVERSAL_1.text)
        assertTrue("expected Reversal, got $res", res is ParseResult.Reversal)
    }

    @Test fun amountsWithCommasParseToMinorUnits() {
        // 1,234.50 -> 123450 ; 2,500.00 -> 250000 ; 350.00 -> 35000
        assertEquals(123450L, MpesaParser.parseAmountMinor("1,234.50"))
        assertEquals(250000L, MpesaParser.parseAmountMinor("2,500.00"))
        assertEquals(350L, MpesaParser.parseAmountMinor("3.50"))
        assertNull(MpesaParser.parseAmountMinor("abc"))
        assertNull(MpesaParser.parseAmountMinor("12.5")) // not 2dp
        assertNull(MpesaParser.parseAmountMinor(""))
    }

    @Test fun noNameOrBalanceLeak() {
        // Structural: CapturedPayment has exactly these fields — if anyone
        // adds payerName/balance/rawText, this test names the leak.
        val fields = CapturedPayment::class.java.declaredFields
            .map { it.name }.toSet()
        assertEquals(
            setOf("receiptCode", "amountMinor", "currency", "occurredAtMillis", "channelType"),
            fields,
        )
        val p = ok(MpesaFixtures.TILL_1)
        assertFalse(p.toString().contains("JOHN", ignoreCase = true))
        assertFalse(p.toString().contains("10,000"))
    }

    @Test fun garbageNeverThrows() {
        val garbage = listOf(
            MpesaFixtures.GARBAGE_1.text,
            MpesaFixtures.GARBAGE_2.text,
            "",
            "   ",
            "Ksh",
            "QHX7K2M9AB Confirmed Ksh Ksh Ksh",
            "0".repeat(5000),
            "🎉".repeat(100),
        )
        for (g in garbage) {
            try {
                MpesaParser.parse(g) // must not throw; any result type is fine
            } catch (e: Exception) {
                fail("parse threw on garbage: ${g.take(40)} -> $e")
            }
        }
    }

    @Test fun whitespaceCaseVariantsTolerated() {
        val lower = MpesaFixtures.TILL_1.text.lowercase()
        val res = MpesaParser.parse("  $lower  ")
        assertTrue("expected Ok for cased/padded variant, got $res", res is ParseResult.Ok)
        assertEquals("QHX7K2M9AB", (res as ParseResult.Ok).payment.receiptCode)
    }
}
