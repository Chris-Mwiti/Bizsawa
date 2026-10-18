package com.bizsawa.mobile.smscapture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.util.Log
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * SMS User Consent listener (Option 1 auto-capture).
 *
 * Permissionless: no READ_SMS / RECEIVE_SMS. Each incoming message matching
 * [senderAddress] surfaces a system one-tap dialog; on approval the full
 * text arrives on [SMS_RETRIEVED_ACTION] and is emitted as `onSmsReceived`.
 * Consent lasts ~5 minutes or one message — the JS hook re-arms after every
 * event, timeout, and app foreground.
 *
 * Fail-closed downstream: the raw text goes straight to the TS parser, which
 * rejects anything that is not a receivable M-PESA payment, so a spoofed or
 * unexpected sender can never become a capture.
 */
class SmsCaptureModule : Module() {

    private var receiver: BroadcastReceiver? = null

    override fun definition() = ModuleDefinition {
        Name("SmsCapture")

        Events("onSmsReceived", "onSmsTimeout")

        // Field diagnostics: the JS test screen renders this so a stale
        // native build on-device is visible (bump on any native change).
        Function("getNativeVersion") { NATIVE_VERSION }

        AsyncFunction("startUserConsent") { senderAddress: String?, promise: Promise ->
            val context = appContext.reactContext
                ?: run {
                    Log.w(TAG, "startUserConsent: no react context")
                    promise.reject("NO_CONTEXT", "SmsCapture: no react context", null)
                    return@AsyncFunction
                }
            unregister()
            Log.d(TAG, "startUserConsent sender=${if (senderAddress.isNullOrBlank()) "<any>" else "<filtered>"}")
            try {
                val client = SmsRetriever.getClient(context)
                val task = if (senderAddress.isNullOrBlank()) {
                    client.startSmsUserConsent(null)
                } else {
                    client.startSmsUserConsent(senderAddress)
                }
                // The Task resolves asynchronously: bridge it onto the JS
                // promise so a Play-Services / API failure surfaces as a
                // rejected await instead of a silent no-op. (Throwing inside
                // the failure listener never reached JS — and risked an
                // uncaught callback-thread exception.)
                task.addOnSuccessListener {
                    try {
                        register(context)
                        Log.d(TAG, "consent task accepted; receiver registered")
                        promise.resolve(Unit)
                    } catch (e: Exception) {
                        Log.w(TAG, "receiver register failed: ${e.message}")
                        promise.reject("REGISTER_FAILED", e.message ?: "SmsCapture: register failed", e)
                    }
                }
                task.addOnFailureListener { e ->
                    Log.w(TAG, "consent task failed: ${e.message}")
                    promise.reject("CONSENT_START_FAILED", e.message ?: "SmsCapture: startSmsUserConsent failed", e)
                }
            } catch (e: Exception) {
                Log.w(TAG, "startUserConsent threw: ${e.message}")
                promise.reject("CONSENT_START_FAILED", e.message ?: "SmsCapture: startSmsUserConsent failed", e)
            }
        }

        AsyncFunction("stopUserConsent") {
            unregister()
        }

        OnDestroy {
            unregister()
        }
    }

    private fun register(context: Context) {
        val r = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
                val extras: Bundle = intent.extras ?: return
                @Suppress("DEPRECATION")
                val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
                // Privacy: log lengths/codes only — never message content.
                Log.d(TAG, "onReceive statusCode=${status.statusCode}")
                when (status.statusCode) {
                    CommonStatusCodes.SUCCESS -> {
                        val message = extras.getString(SmsRetriever.EXTRA_SMS_MESSAGE) ?: return
                        Log.d(TAG, "SMS received len=${message.length}")
                        sendEvent("onSmsReceived", mapOf("message" to message))
                    }
                    CommonStatusCodes.TIMEOUT -> {
                        Log.d(TAG, "consent window timeout")
                        sendEvent("onSmsTimeout", emptyMap<String, Any>())
                    }
                }
            }
        }
        val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
        if (Build.VERSION.SDK_INT >= 33) {
            context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(r, filter)
        }
        receiver = r
    }

    private fun unregister() {
        val r = receiver
        receiver = null
        if (r == null) return
        val context = try {
            appContext.reactContext
        } catch (_: Exception) {
            null
        } ?: return
        try {
            context.unregisterReceiver(r)
        } catch (_: Exception) {
            // Already unregistered — harmless.
        }
    }

    companion object {
        const val TAG = "SmsCapture"
        /** Bump on ANY native change; the JS test screen renders it. */
        const val NATIVE_VERSION = "2"
    }
}
