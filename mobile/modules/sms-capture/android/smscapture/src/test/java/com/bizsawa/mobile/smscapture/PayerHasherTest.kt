package com.bizsawa.mobile.smscapture

import org.junit.Assert.*
import org.junit.Test

/** JVM-only hasher tests via the fixed-key seam. Keystore needs a device. */
class PayerHasherTest {

    private val hasher = PayerHasher(FixedKeyProvider("test-key-0123456789abcdef".toByteArray()))

    @Test fun deterministic() {
        assertEquals(hasher.hash("254712345678"), hasher.hash("254712345678"))
    }

    @Test fun differentPhonesDifferentHashes() {
        assertNotEquals(hasher.hash("254712345678"), hasher.hash("254722000111"))
    }

    @Test fun outputIsTruncatedHex() {
        val h = hasher.hash("254712345678")
        assertEquals(PayerHasher.HASH_HEX_LEN, h.length)
        assertTrue(h.matches(Regex("[0-9a-f]+")))
    }

    @Test fun outputContainsNoPhone() {
        val h = hasher.hash("254712345678")
        assertFalse(h.contains("254712345678"))
        assertFalse(h.contains("0712345678"))
    }

    @Test fun differentKeysDifferentHashes() {
        val other = PayerHasher(FixedKeyProvider("another-key-9876543210fedcba".toByteArray()))
        assertNotEquals(hasher.hash("254712345678"), other.hash("254712345678"))
    }
}
