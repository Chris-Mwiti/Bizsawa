package com.bizsawa.mobile.smscapture

/**
 * Parser fixtures. Two provenance levels:
 * - PLACEHOLDER: best-guess scaffolding. Replace with anonymised REAL
 *   samples from the product owner (keep payer numbers/names redacted,
 *   keep structure/punctuation verbatim).
 * - REAL: pasted from a genuine Safaricom message (redacted).
 *
 * [FixtureCoverageTest] FAILS while any receivable kind (TILL/PAYBILL/POCHI)
 * has placeholder-only coverage. That failure IS the sample request — it
 * resolves itself the moment real samples land. Until then, a green parser
 * suite proves internal consistency only, NOT real-world validity.
 */
enum class FixtureKind {
    TILL_RECEIVE,
    PAYBILL_RECEIVE,
    POCHI_RECEIVE,
    SENT_MONEY,
    WITHDRAWAL,
    AIRTIME,
    FULIZA,
    REVERSAL,
    PROMO,
    BALANCE,
    GARBAGE,
}

data class Fixture(
    val id: String,
    val kind: FixtureKind,
    /** False once replaced by a redacted REAL sample. */
    val isPlaceholder: Boolean,
    val text: String,
)

object MpesaFixtures {

    // PLACEHOLDER: replace with real Till "received" sample (redact name/phone/balance).
    val TILL_1 = Fixture(
        "till-1", FixtureKind.TILL_RECEIVE, true,
        "QHX7K2M9AB Confirmed. Ksh1,234.50 received from JOHN DOE 0712345678 " +
            "on 08/10/2026 at 09:41 AM. Till No. 567890. New business balance is Ksh10,000.00.",
    )

    // PLACEHOLDER: replace with real Paybill sample (redact account/name/balance).
    val PAYBILL_1 = Fixture(
        "paybill-1", FixtureKind.PAYBILL_RECEIVE, true,
        "QJ2M8XZ4PL Confirmed. Ksh2,500.00 received from JANE DOE 0722000111 " +
            "on 08/10/2026 at 11:02 AM. Paybill No. 600100, Account No. SHOP12. " +
            "New utility balance is Ksh45,000.00.",
    )

    // PLACEHOLDER: replace with real Pochi sample (redact name/phone).
    val POCHI_1 = Fixture(
        "pochi-1", FixtureKind.POCHI_RECEIVE, true,
        "PK7T2M9QW1 Confirmed. You have received Ksh350.00 from 0733000222 " +
            "MARY WANJIKU on 08/10/2026 at 01:15 PM. Pochi La Biashara balance is Ksh5,200.00.",
    )

    // PLACEHOLDER: sent-money (must be ignored).
    val SENT_1 = Fixture(
        "sent-1", FixtureKind.SENT_MONEY, true,
        "QK9R4T2M7Z Confirmed. Ksh1,000.00 sent to PETER KAMAU 0711222333 " +
            "on 08/10/2026 at 02:00 PM. Transaction cost Ksh11.00.",
    )

    // PLACEHOLDER: agent withdrawal (must be ignored).
    val WITHDRAW_1 = Fixture(
        "withdraw-1", FixtureKind.WITHDRAWAL, true,
        "QL4M8N2P6Q Confirmed. Withdraw Ksh5,000.00 from Agent 123456 - " +
            "SAFARICOM SHOP on 08/10/2026 at 03:00 PM. New balance Ksh20,000.00.",
    )

    // PLACEHOLDER: airtime purchase (must be ignored).
    val AIRTIME_1 = Fixture(
        "airtime-1", FixtureKind.AIRTIME, true,
        "QM8N3P5Q7R Confirmed. You bought airtime worth Ksh100.00 " +
            "on 08/10/2026 at 04:00 PM. New balance Ksh900.00.",
    )

    // PLACEHOLDER: Fuliza (must be ignored).
    val FULIZA_1 = Fixture(
        "fuliza-1", FixtureKind.FULIZA, true,
        "Dear customer, your Fuliza limit is Ksh1,000.00. Outstanding balance Ksh200.00. " +
            "Repay via M-PESA.",
    )

    // PLACEHOLDER: reversal notice (must surface as Reversal, never a payment).
    val REVERSAL_1 = Fixture(
        "reversal-1", FixtureKind.REVERSAL, true,
        "Reversal: Transaction QHX7K2M9AB of Ksh1,234.50 has been reversed " +
            "on 08/10/2026 at 05:00 PM. Your account balance is Ksh10,000.00.",
    )

    // PLACEHOLDER: promo (must be ignored).
    val PROMO_1 = Fixture(
        "promo-1", FixtureKind.PROMO, true,
        "Pata bonus! Deposit Ksh500 and get Ksh50 cashback. Dial *234#. T&Cs apply.",
    )

    // PLACEHOLDER: balance-only (must be ignored).
    val BALANCE_1 = Fixture(
        "balance-1", FixtureKind.BALANCE, true,
        "Your M-PESA balance is Ksh3,450.00 as at 08/10/2026 06:00 PM. Thank you.",
    )

    val GARBAGE_1 = Fixture(
        "garbage-1", FixtureKind.GARBAGE, false,
        "lorem ipsum dolor sit amet consectetur 12345 !!! ???",
    )
    val GARBAGE_2 = Fixture(
        "garbage-2", FixtureKind.GARBAGE, false,
        "QHX7K2M9AB", // receipt alone is not a payment
    )

    val ALL: List<Fixture> = listOf(
        TILL_1, PAYBILL_1, POCHI_1, SENT_1, WITHDRAW_1, AIRTIME_1,
        FULIZA_1, REVERSAL_1, PROMO_1, BALANCE_1, GARBAGE_1, GARBAGE_2,
    )

    /** Receivable kinds that REQUIRE at least one REAL sample. */
    val COVERED_KINDS: List<FixtureKind> = listOf(
        FixtureKind.TILL_RECEIVE,
        FixtureKind.PAYBILL_RECEIVE,
        FixtureKind.POCHI_RECEIVE,
    )
}
