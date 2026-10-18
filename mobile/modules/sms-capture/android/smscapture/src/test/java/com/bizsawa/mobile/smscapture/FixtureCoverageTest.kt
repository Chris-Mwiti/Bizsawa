package com.bizsawa.mobile.smscapture

import org.junit.Assert.fail
import org.junit.Test

/**
 * LOUD sample request (brief Phase 1 gate). Fails while any receivable
 * message type (till/paybill/pochi) has placeholder-only coverage.
 *
 * This failure is EXPECTED until the product owner supplies anonymised REAL
 * samples: redact payer names/phones/balances, keep structure and
 * punctuation verbatim, set isPlaceholder=false on the new Fixture, and
 * this test goes green by itself. A green parser suite WITHOUT this gate
 * would falsely imply real-world validity.
 */
class FixtureCoverageTest {

    @Test fun receivableKindsHaveRealSamples() {
        val missing = MpesaFixtures.COVERED_KINDS.filter { kind ->
            MpesaFixtures.ALL.none { it.kind == kind && !it.isPlaceholder }
        }
        if (missing.isNotEmpty()) {
            fail(
                "NO REAL SAMPLES for ${missing.joinToString()}. " +
                    "Paste anonymised real Safaricom messages into MpesaFixtures.kt " +
                    "(redact names/phones/balances, keep structure verbatim) and " +
                    "set isPlaceholder=false. Parser patterns are still placeholders.",
            )
        }
    }
}
