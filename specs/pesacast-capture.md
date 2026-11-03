# PesaCast capture integration

## Problem

Bizworth's in-app SMS auto-capture uses Android's SMS User Consent API. On Tecno, Infinix, and Redmi devices that flow times out or never delivers, so payments are missed. Captured payments were also only visible in the mobile app, not on web. External PesaCast can capture SMS reliably, but using it as a second app is poor UX.

## Solution

Port PesaCast's broadcast-receiver SMS capture into the Bizworth Android app and add a PesaCast webhook endpoint. Both in-house and external capture feed the same backend `captured_payments` pipeline. Mobile and web read `/payments/captured`.

## Goals

- Reliable SMS capture on Tecno, Infinix, Redmi, and Samsung.
- Single backend source of truth for captured payments.
- Web and mobile stay in sync.
- Preserve quarantine: captures remain `device_reported` until Daraja verifies.

## Non-goals

- No account crediting from SMS alone.
- No removal of manual SMS entry fallback.
- No Play Store policy resolution beyond documenting `RECEIVE_SMS`.

## Current architecture

```mermaid [Current capture flow]
flowchart LR
    U[User phone SMS] --> A[Android SMS User Consent API]
    A -->|one tap dialog| J[JS parser]
    J --> Q[offline queue]
    Q --> I[/payments/ingest]
    I --> C[captured_payments]
```

## Phases

### ✅ Phase 1: Backend PesaCast webhook

**Today**

The backend has no PesaCast receiver. External PesaCast deliveries cannot be ingested. There is no signature verification, timestamp check, or PesaCast payload model.

**Proposed**

A public HTTPS endpoint accepts PesaCast deliveries, verifies credentials, ignores test pings, and translates each transaction into the existing `IngestItem` flow.

```mermaid diff [External PesaCast delivery enters capture pipeline]
 flowchart LR
+    P[PesaCast app] -->|POST webhook| W[PesaCastWebhook handler]
+    W -->|IngestItem[]| I[payments.Service.Ingest]
     I --> C[captured_payments]
     %% ref node:I [[backend/internal/payments/ingest.go#Ingest]]
```

Call stack for a valid transaction:

```callstack [Webhook request flow]
 status = PesacastWebhook(request) [[1b90439:backend/internal/payments/pesacast.go#L167-L207]]
├── raw = readBody(request)
├── if !PesacastAuth(cfg, headers, raw): return 401
├── status, message = HandlePesacastWebhook(ctx, businessID, headers, raw)
│   ├── payload = json.Unmarshal(raw)
│   ├── if payload.Test: return 204
│   ├── for each transaction:
│   │   ├── if direction not received/paid: skip
│   │   ├── occurred = time.Parse(RFC3339, txn.Time)
│   │   ├── item = IngestItem{receipt, amount, occurred, ...}
│   │   └── items.append(item)
│   ├── results = Ingest(ctx, businessID, items)
│   └── return 200, count
└── write status + message
```

Code added:

```go {1-8}
func (h Handler) PesacastWebhook(w http.ResponseWriter, r *http.Request) {
    businessID, err := uuid.Parse(chi.URLParam(r, "businessID"))
    if err != nil {
        sharedhttp.JSON(w, http.StatusBadRequest, sharedhttp.Envelope{"error": "invalid business id"})
        return
    }
    raw, err := io.ReadAll(io.LimitReader(r.Body, maxBytes+1))
    // ...
}
// [!note PesacastWebhook] Reads raw bytes first so HMAC covers exact body.
// [!note L4] Business ID comes from the URL, not headers.
```

Config added:

```go
type PesaCastConfig struct {
    SigningSecret string
    BearerToken   string
    MaxClockSkew  time.Duration
    MaxBodyBytes  int64
    AllowInsecure bool
}
```

```changes
1b90439
backend/internal/shared/config/config.go
backend/internal/payments/pesacast.go
backend/internal/payments/handler.go
backend/internal/payments/module.go
backend/cmd/api/server.go
backend/cmd/api/main.go
backend/internal/payments/pesacast_test.go
```

### ✅ Phase 2: Native broadcast SMS capture

**Today**

The Expo module uses the SMS User Consent API. It requires a system dialog, expires after about five minutes, and fails on many OEM devices.

**Proposed**

Port PesaCast's `SmsReceiver` into the Expo native module. The receiver groups multipart SMS, filters `MPESA`, writes the body to a native queue, and emits it to JS when the app is running.

```mermaid diff [Broadcast receiver replaces consent-based capture]
 flowchart LR
-    C[Consent API] -->|one message| J[JS parser]
+    R[BroadcastReceiver SMS_RECEIVED] -->|full SMS body| J[JS parser]
     J --> Q[offline queue]
     Q --> I[/payments/ingest]
```

Native receiver:

```kotlin
class SmsBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val grouped = messages.groupBy { it.displayOriginatingAddress }
        for ((sender, parts) in grouped) {
            if (!sender.equals("MPESA", ignoreCase = true)) continue
            val fullBody = parts.joinToString("") { it.displayMessageBody }
            enqueue(context, fullBody)
            SmsCaptureModule.instance?.sendEvent("onSmsReceived", mapOf("message" to fullBody))
        }
    }
}
```

Manifest:

```xml
<receiver
    android:name=".SmsBroadcastReceiver"
    android:exported="true"
    android:permission="android.permission.BROADCAST_SMS">
    <intent-filter android:priority="999">
        <action android:name="android.provider.Telephony.SMS_RECEIVED" />
    </intent-filter>
</receiver>
```

```changes
638b4a7
mobile/modules/sms-capture/android/src/main/java/com/bizsawa/mobile/smscapture/SmsBroadcastReceiver.kt
mobile/modules/sms-capture/android/src/main/java/com/bizsawa/mobile/smscapture/SmsCaptureModule.kt
mobile/modules/sms-capture/android/src/main/AndroidManifest.xml
mobile/modules/sms-capture/app.plugin.js
mobile/modules/sms-capture/index.ts
```

### ✅ Phase 3: JS capture pipeline update

**Today**

`autoCapture.ts` arms and re-arms consent windows and handles timeouts.

**Proposed**

Replace consent orchestration with broadcast drain polling. Parsing, hashing, queueing, and ingest stay unchanged.

```callstack [Broadcast drain flow]
 results = drainPendingSms()
├── pending = getPendingSms()
├── for body in pending:
│   ├── result = handleIncomingSms({ body, sender: "MPESA", requireConsent: false })
│   └── results.append(result)
└── return results
```

```changes
638b4a7
mobile/lib/mpesa-sms/autoCapture.ts
mobile/hooks/api/useSmsAutoCapture.ts
```

### ✅ Phase 4: Web captures view

**Today**

The mobile app already has a captures tab at `mobile/app/(tabs)/sales/captures.tsx`.

**Proposed**

No new code is required. PesaCast and in-house captures both land in `captured_payments`, so the existing view displays them.

```changes

```

### ✅ Phase 5: Tests and security

**Today**

No PesaCast signature or webhook tests exist.

**Proposed**

Add signature vector, stale timestamp, bearer token, and test-ping coverage. Verify no secret, token, or raw body logging.

```go
func TestPesacastSignatureVector(t *testing.T) {
    // v1=1698a50bc74d1ff1db85c4e0a5297c2ad9fdba245d5737cdb789e4cc6e098940
}
```

```changes
1b90439
backend/internal/payments/pesacast_test.go
```

### ✅ Phase 6: Rollout

**Today**

Auto-capture is the only mobile path and is unreliable on target devices.

**Proposed**

Ship broadcast capture first, keep manual entry fallback, document `RECEIVE_SMS`, and monitor capture success rates before removing legacy consent code.

```changes
f43eb07
backend/.env.example
specs/pesacast-capture.md
```

## Status code contract

| Situation | Status |
|---|---|
| Bad or missing credentials | 401 |
| Unparseable JSON body | 400 |
| Test ping (`test: true`) | 204 |
| Duplicate or accepted transaction | 200 |

## Security rules

- Read raw bytes before decoding; HMAC covers exact body.
- Constant-time signature and bearer token compares.
- Reject timestamps older than 5 minutes.
- Never log signing secret, bearer token, or raw message bodies.
- Captures remain `device_reported` until Daraja verifies.

## References

- `backend/internal/payments/ingest.go`
- `backend/internal/payments/capture.go`
- `backend/internal/payments/pesacast.go`
- `mobile/modules/sms-capture/android/src/main/java/com/bizsawa/mobile/smscapture/SmsBroadcastReceiver.kt`
- `mobile/lib/mpesa-sms/index.ts`
- `/tmp/pesacast/android/app/src/main/kotlin/com/pesacast/android/sms/SmsReceiver.kt`
