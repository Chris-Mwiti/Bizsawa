// DEV-ONLY fail-fast harness for SMS capture. Paste a real M-PESA message
// (or tap a template), run it through parse → hash → offline queue →
// POST /payments/ingest, and read the per-stage result. Never ships to
// production: renders nothing outside __DEV__.
import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { parseMpesaSms } from '../lib/mpesa-sms/parser'
import { isMpesaSender } from '../lib/mpesa-sms/sender'
import { hashPayerPhone } from '../lib/mpesa-sms/payerHash'
import { isAutoCaptureSupported, getAutoCaptureAvailability } from '../modules/sms-capture'
import { useSmsAutoCapture } from '../hooks/api/useSmsAutoCapture'
import { grantSmsConsent, hasSmsConsent, revokeSmsConsent } from '../lib/mpesa-sms/consent'
import {
  enqueueSmsItem,
  flushSmsQueue,
  getSmsQueueCount,
  newClientEventId,
} from '../lib/mpesa-sms/queue'
import { SMS_TEMPLATES } from '../lib/mpesa-sms/templates'
import { SMS_PARSER_VERSION, SMS_CONSENT_VERSION } from '../lib/mpesa-sms/types'

export default function SmsTestScreen() {
  const router = useRouter()
  if (!__DEV__) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Not available in production.</Text>
      </View>
    )
  }
  return <SmsTestBody onClose={() => router.back()} />
}

function SmsTestBody({ onClose }: { onClose: () => void }) {
  const [sender, setSender] = useState('MPESA')
  const [body, setBody] = useState(SMS_TEMPLATES[0].body)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [autoOn, setAutoOn] = useState(false)
  const [consented, setConsented] = useState<boolean | null>(null)
  const auto = useSmsAutoCapture(autoOn && consented === true)

  const append = (line: string) => setLog((l) => [...l.slice(-49), line])

  React.useEffect(() => {
    hasSmsConsent().then(setConsented).catch(() => setConsented(false))
  }, [])
  React.useEffect(() => {
    if (auto.lastResult) append(`auto-capture: ${JSON.stringify(auto.lastResult)}`)
  }, [auto.lastResult])
  React.useEffect(() => {
    if (auto.error) append(`auto-capture ERROR: ${auto.error}`)
  }, [auto.error])

  const run = async () => {
    setBusy(true)
    try {
      append(`sender gate: "${sender}" → ${isMpesaSender(sender) ? 'ACCEPT' : 'REJECT non_mpesa_sender'}`)
      if (!isMpesaSender(sender)) return
      const outcome = parseMpesaSms(body)
      append(`parse: ${JSON.stringify(outcome.kind === 'ok' ? { kind: 'ok', payment: outcome.payment } : outcome)}`)
      if (outcome.kind !== 'ok') return
      const payerHash = outcome.rawPayerPhone === null ? undefined : await hashPayerPhone(outcome.rawPayerPhone)
      append(
        payerHash === undefined
          ? 'payer_hash: (absent — name-only message, no phone)'
          : `payer_hash: ${payerHash} (len ${payerHash.length})`,
      )
      const item = {
        client_event_id: newClientEventId(),
        mpesa_receipt: outcome.payment.receiptCode,
        amount_minor: outcome.payment.amountMinor,
        currency: 'KES',
        occurred_at: new Date(outcome.payment.occurredAtMillis).toISOString(),
        channel_type: outcome.payment.channelType,
        source: 'sms_device' as const,
        ...(payerHash !== undefined ? { payer_hash: payerHash } : {}),
        parser_version: SMS_PARSER_VERSION,
        consent_version: SMS_CONSENT_VERSION,
      }
      await enqueueSmsItem(item)
      append(`queued: ${item.client_event_id} (pending=${await getSmsQueueCount()})`)
      const res = await flushSmsQueue().catch((e: any) => ({
        sent: 0,
        acked: 0,
        remaining: -1,
        error: e?.response?.data ?? e?.message ?? String(e),
      }))
      append(`flush: ${JSON.stringify(res)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F4F9F7', padding: 16 }}>
      <TouchableOpacity onPress={onClose}>
        <Text style={{ color: '#0ea5e9', marginBottom: 12 }}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 4 }}>SMS Capture Test</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        DEV only. Paste a real message → parse → hash → queue → ingest.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {SMS_TEMPLATES.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => {
              setSender(t.sender)
              setBody(t.body)
              append(`template loaded: ${t.label}`)
            }}
            style={{ backgroundColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
          >
            <Text style={{ fontWeight: '600' }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontWeight: '600', marginBottom: 4 }}>Sender</Text>
      <TextInput
        value={sender}
        onChangeText={setSender}
        style={{ backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 12 }}
      />
      <Text style={{ fontWeight: '600', marginBottom: 4 }}>Message body</Text>
      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        style={{ backgroundColor: '#fff', borderRadius: 8, padding: 10, minHeight: 120, marginBottom: 12 }}
      />
      <TouchableOpacity
        onPress={run}
        disabled={busy}
        style={{ backgroundColor: busy ? '#94a3b8' : '#0f766e', borderRadius: 8, padding: 14, alignItems: 'center' }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Run end-to-end</Text>}
      </TouchableOpacity>
      <View style={{ marginTop: 12, backgroundColor: '#fff', borderRadius: 8, padding: 12 }}>
        <Text style={{ fontWeight: '700', marginBottom: 4 }}>Auto-capture (Android Consent API)</Text>
        {(() => {
          const avail = getAutoCaptureAvailability()
          if (!avail.available) {
            const hint =
              avail.reason === 'non_android'
                ? 'iOS has no SMS API — manual paste above is the iOS path.'
                : avail.reason === 'expo_go'
                  ? 'You are running inside Expo Go, which cannot load native modules. Install the dev-client build (android:lan) instead.'
                  : 'This build was made before the native module was added. Rebuild the native app (expo run:android / android:lan) and reinstall.'
            return <Text style={{ color: '#64748b' }}>Not available ({avail.reason}). {hint}</Text>
          }
          return (
          <>
            <Text style={{ color: '#64748b', marginBottom: 8 }}>
              Status: {auto.status}
              {auto.error ? ` — ${auto.error}` : consented ? '' : ' — grant consent to arm'}
            </Text>
            <Text style={{ color: '#64748b', marginBottom: 8, fontSize: 12 }}>
              How it works: after Start, each M-PESA SMS triggers an Android one-tap popup — tap Allow
              or nothing is captured. Listening lasts ~5 min and re-arms itself (watch the log for
              consent_window_expired_rearmed heartbeats); keep the app open until the SMS arrives.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={async () => {
                  if (consented) {
                    await revokeSmsConsent()
                    setAutoOn(false)
                    setConsented(false)
                    append('consent revoked')
                  } else {
                    await grantSmsConsent()
                    setConsented(true)
                    append('consent granted (v1)')
                  }
                }}
                style={{ backgroundColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
              >
                <Text style={{ fontWeight: '600' }}>{consented ? 'Revoke consent' : 'Grant consent'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!consented) {
                    append('grant consent first')
                    return
                  }
                  setAutoOn((v) => !v)
                  append(autoOn ? 'auto-capture stopped' : 'auto-capture listening — send a real M-PESA SMS')
                }}
                style={{ backgroundColor: '#0f766e', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>{autoOn ? 'Stop listening' : 'Start listening'}</Text>
              </TouchableOpacity>
            </View>
          </>
          )
        })()}
      </View>
      <View style={{ marginTop: 12, backgroundColor: '#0f172a', borderRadius: 8, padding: 12 }}>
        {log.length === 0 ? (
          <Text style={{ color: '#64748b' }}>No runs yet.</Text>
        ) : (
          log.map((l, i) => (
            <Text key={i} style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12, marginBottom: 4 }}>
              {l}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  )
}
