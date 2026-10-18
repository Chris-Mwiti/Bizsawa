package com.bizsawa.mobile.smscapture

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec

/**
 * HMAC-SHA256 payer-phone hashing. The raw number is never persisted, logged
 * or returned in any structure — [hash] takes digits and returns hex.
 *
 * Key seam: [SigningKeyProvider] separates key custody from hashing so the
 * core is JVM-testable. Production uses [AndroidKeystoreKeyProvider]
 * (non-exportable key); tests use [FixedKeyProvider].
 *
 * OPEN PRODUCT LIMITATION (per-device key): the same customer hashes
 * differently on different staff phones, so repeat-customer analysis is
 * per device, never cross-device. Documented here and in the Phase 4 docs;
 * changing it later means re-hashing history under a new parser version.
 */
interface SigningKeyProvider {
    fun keyBytes(): ByteArray
}

class PayerHasher(private val keys: SigningKeyProvider) {

    /** Normalized digits in, truncated hex digest out. Deterministic. */
    fun hash(phoneDigits: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(keys.keyBytes(), "HmacSHA256"))
        val full = mac.doFinal(phoneDigits.toByteArray(Charsets.UTF_8))
        return full.joinToString("") { "%02x".format(it) }.take(HASH_HEX_LEN)
    }

    companion object {
        /** Truncated digest length (hex chars). 128 bits — plenty for dedupe. */
        const val HASH_HEX_LEN = 32
    }
}

/** Production custody: Android Keystore, HMAC key, non-exportable. */
class AndroidKeystoreKeyProvider : SigningKeyProvider {

    override fun keyBytes(): ByteArray {
        // Keystore keys are non-extractable by design: we cannot read raw
        // bytes. Instead this provider is used through keystoreMac() below,
        // which performs the MAC inside the Keystore. The interface method
        // exists for API uniformity and throws to prevent misuse.
        throw UnsupportedOperationException(
            "Keystore keys are non-exportable — use keystoreMac() instead",
        )
    }

    fun keystoreMac(phoneDigits: String): String {
        val key = getOrCreateKey()
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(key)
        val full = mac.doFinal(phoneDigits.toByteArray(Charsets.UTF_8))
        return full.joinToString("") { "%02x".format(it) }.take(PayerHasher.HASH_HEX_LEN)
    }

    private fun getOrCreateKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build(),
        )
        return gen.generateKey()
    }

    companion object {
        const val KEY_ALIAS = "bizsawa_payer_hmac"
    }
}

/** Tests (and only tests): fixed key. NEVER ship this on device. */
class FixedKeyProvider(private val key: ByteArray) : SigningKeyProvider {
    override fun keyBytes(): ByteArray = key.copyOf()
}
