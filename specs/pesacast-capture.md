# PesaCast capture integration

## Problem

Bizworth's in-app SMS auto-capture uses Android's SMS User Consent API, which fails on Tecno, Infinix, and Redmi devices. Captured M-Pesa payments are also not visible to the web client. External PesaCast can capture SMS reliably but is a separate app.

## Solution

Port PesaCast's broadcast-receiver SMS capture into the Bizworth Android app and add a PesaCast webhook endpoint so both in-house and external capture feed the same backend `captured_payments` pipeline. Web and mobile read `/payments/captured`.

## Goals

- Reliable SMS capture on Tecno/Infinix/Redmi/Samsung.
- Single backend source of truth for captured payments.
- Web and mobile stay in sync.
- Preserve quarantine: captures remain `device_reported` until Daraja verifies.

## Non-goals

- No account crediting from SMS alone.
- No Play Store policy resolution beyond documenting `RECEIVE_SMS`.
- No removal of manual SMS entry fallback.

## Phases

### Phase 1: Backend PesaCast webhook

**Today**

The backend has no PesaCast receiver. External PesaCast deliveries cannot be ingested.

**Proposed**

A public HTTPS endpoint verifies PesaCast signatures/tokens, ignores test pings, and translates each transaction into the existing `IngestItem` flow.

```mermaid diff [External PesaCast delivery enters capture pipeline]
 flowchart LR
+    P[PesaCast app] -->|POST webhook| W[PesaCastWebhook handler]
+    W -->|IngestItem[]| I[payments.Service.Ingest]
     I --> C[captured_payments]
     %% ref node:I [[backend/internal/payments/ingest.go#Ingest]]
```

```changes

```

### Phase 2: Native broadcast SMS capture

**Today**

The Expo module uses the SMS User Consent API, which times out and fails on many OEM devices.

**Proposed**

Port PesaCast's `SmsReceiver` into the Expo native module. It groups multipart SMS, filters `MPESA`, and emits full text to JS without a consent window.

```mermaid diff [Broadcast receiver replaces consent-based capture]
 flowchart LR
-    C[Consent API] -->|one message| J[JS parser]
+    R[BroadcastReceiver SMS_RECEIVED] -->|full SMS body| J[JS parser]
     J --> Q[offline queue]
     Q --> I[/payments/ingest]
```

```changes

```

### Phase 3: JS capture pipeline update

**Today**

`autoCapture.ts` arms and re-arms consent windows and handles timeouts.

**Proposed**

Replace consent orchestration with broadcast listener registration. Keep parsing, hashing, queueing, and ingest unchanged.

```changes

```

### Phase 4: Web captures view

**Today**

The web app has no captures view.

**Proposed**

Add a captures page reading `/payments/captured` so web matches mobile.

```changes

```

### Phase 5: Tests and security

**Today**

No PesaCast signature or webhook tests exist.

**Proposed**

Add signature vector tests, stale timestamp tests, credential tests, and verify no secret/token/body logging.

```changes

```

### Phase 6: Rollout

**Today**

Auto-capture is the only mobile path and is unreliable on target devices.

**Proposed**

Ship broadcast capture first, keep manual entry fallback, document `RECEIVE_SMS`, and monitor capture success rates before removing legacy consent code.

```changes

```

## References

- `backend/internal/payments/ingest.go`
- `backend/internal/payments/capture.go`
- `mobile/modules/sms-capture/android/src/main/java/com/bizsawa/mobile/smscapture/SmsCaptureModule.kt`
- `mobile/lib/mpesa-sms/index.ts`
- `/tmp/pesacast/android/app/src/main/kotlin/com/pesacast/android/sms/SmsReceiver.kt`
