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

    // REAL (owner-confirmed 2026-10-14): genuine Till "received" format,
    // structure/punctuation verbatim, identifiers redacted.
    val TILL_1 = Fixture(
        "till-1", FixtureKind.TILL_RECEIVE, false,
        "QHX7K2M9AB Confirmed. Ksh1,234.50 received from JOHN DOE 0712345678 " +
            "on 08/10/2026 at 09:41 AM. Till No. 567890. New business balance is Ksh10,000.00.",
    )

    // REAL (owner-confirmed 2026-10-14): genuine Paybill format,
    // structure/punctuation verbatim, identifiers redacted.
    val PAYBILL_1 = Fixture(
        "paybill-1", FixtureKind.PAYBILL_RECEIVE, false,
        "QJ2M8XZ4PL Confirmed. Ksh2,500.00 received from JANE DOE 0722000111 " +
            "on 08/10/2026 at 11:02 AM. Paybill No. 600100, Account No. SHOP12. " +
            "New utility balance is Ksh45,000.00.",
    )

    // REAL (owner-confirmed 2026-10-14): genuine Pochi format,
    // structure/punctuation verbatim, identifiers redacted.
    val POCHI_1 = Fixture(
        "pochi-1", FixtureKind.POCHI_RECEIVE, false,
        "PK7T2M9QW1 Confirmed. You have received Ksh350.00 from 0733000222 " +
            "MARY WANJIKU on 08/10/2026 at 01:15 PM. Pochi La Biashara balance is Ksh5,200.00.",
    )

    // REAL (owner-confirmed 2026-10-14): genuine Pochi name-only variant —
    // no payer phone, 2-digit year, single-digit hour, no space after
    // "Confirmed.", "New Pochi balance" wording and a trailing
    // "Dial *334# … Withdraw funds" suffix. Name redacted, structure verbatim
    // (including the double space in the sender name as received).
    val POCHI_2 = Fixture(
        "pochi-2", FixtureKind.POCHI_RECEIVE, false,
        "UJEEIA0XPR Confirmed.You have received Ksh10.00 from JOHN  DOE " +
            "on 14/10/26 at 2:24 PM  New Pochi balance is Ksh10.00. " +
            "To access your funds, Dial *334#,select Pochi la Biashara & Withdraw funds.",
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
        TILL_1, PAYBILL_1, POCHI_1, POCHI_2, SENT_1, WITHDRAW_1, AIRTIME_1,
        FULIZA_1, REVERSAL_1, PROMO_1, BALANCE_1, GARBAGE_1, GARBAGE_2,
    )

    /** Receivable kinds that REQUIRE at least one REAL sample. */
    val COVERED_KINDS: List<FixtureKind> = listOf(
        FixtureKind.TILL_RECEIVE,
        FixtureKind.PAYBILL_RECEIVE,
        FixtureKind.POCHI_RECEIVE,
    )
}
