package com.bizsawa.mobile.smscapture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

private const val TAG = "SmsBroadcastReceiver"
private const val PENDING_FILE = "bizsawa_pending_sms.json"

class SmsBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val grouped = messages.groupBy { it.displayOriginatingAddress }
        for ((sender, parts) in grouped) {
            if (!sender.equals("MPESA", ignoreCase = true)) continue
            val fullBody = parts.joinToString("") { it.displayMessageBody }
            Log.d(TAG, "M-PESA SMS received (${fullBody.length} chars)")
            enqueue(context, fullBody)
            try {
                SmsCaptureModule.instance?.sendEvent("onSmsReceived", mapOf("message" to fullBody))
            } catch (_: Exception) {
            }
        }
    }

    companion object {
        @Synchronized
        fun enqueue(context: Context, body: String) {
            val file = File(context.filesDir, PENDING_FILE)
            val arr = try {
                if (file.exists()) JSONArray(file.readText()) else JSONArray()
            } catch (_: Exception) {
                JSONArray()
            }
            arr.put(body)
            file.writeText(arr.toString())
        }

        @Synchronized
        fun drain(context: Context): List<String> {
            val file = File(context.filesDir, PENDING_FILE)
            if (!file.exists()) return emptyList()
            val out = mutableListOf<String>()
            try {
                val arr = JSONArray(file.readText())
                for (i in 0 until arr.length()) out.add(arr.optString(i))
            } catch (_: Exception) {
            }
            file.delete()
            return out
        }
    }
}
