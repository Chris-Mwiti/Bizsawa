# Bizworth k6 load tests — spike · soak · stress

Black-box HTTP suite against the Go backend (`/api/v1`), covering **every module**,
each module's **DB table registry** slice, the **end-to-end business workflow**, and the
**mobile client pattern** (same API, phone-like behaviour). See `TABLE_REGISTRY.md`.

## Profiles

| PROFILE | Shape | What it proves |
|---|---|---|
| `smoke` (default) | 2 VUs × 30s | scripts + env work |
| `spike` | 15 → **120 VUs burst** → 15 (~4m) | burst/absorption, autoscale, no 5xx cascade |
| `soak` | 15 VUs × `SOAK_DURATION` (default 20m; use `2h` for a true soak) | leaks, connection-pool exhaustion, slow drift |
| `stress` | stepwise 25 → 75 → 150 → **250 VUs** (~8m) | breaking point, degradation curve |

Thresholds: spike p95<1200ms & 5xx<5% · soak p95<800ms & 5xx<1% · stress p95<2000ms & 5xx<10%.

## Setup

```bash
# 1. backend up (postgres + redis + api)
cd ../backend && docker compose up -d postgres redis && go run ./cmd/api

# 2. seed a user + business once (via the app or API), then export creds:
export BASE_URL=http://localhost:5504/api/v1
export TEST_EMAIL=owner@myshop.co.ke TEST_PASSWORD=secret
export BUSINESS_ID=<uuid>   # optional but recommended (X-Business-ID scoping)
# ...or export TOKEN directly (from POST /auth/login).

# 3. run
cd ../loadtests && chmod +x run.sh
./run.sh smoke all            # verify everything (fast)
./run.sh spike all            # spike every module
./run.sh soak all             # soak (set SOAK_DURATION=2h for full soak)
./run.sh stress all           # find the breaking point
./run.sh spike workflows      # e2e + mobile patterns under spike
./run.sh smoke products       # one module only
```

Writes are read-heavy by design (≈80/20) and self-cleaning where possible
(products create→update→delete, expenses create→delete). Opt-in side effects:

```bash
WRITE_PAYMENTS=1  # POST /payments → M-Pesa sandbox STK
WRITE_WAHA=1 TEST_WA_RECIPIENT=2547XXXXXXX  # real WhatsApp sends
WRITE_LLM=1       # real LLM calls on /chatbot/chat
```

Without these flags, payments/waha/chat run **validation-only** (no external spend).

## Results

JSON summaries land in `results/<profile>-<module>-summary.json`. Every sample is
tagged `{module, table, op}` — filter `http_req_duration{table:stock_movements}`
to see a single registry table's behaviour, or `{module:e2e}` / `{module:mobile}`
for workflow vs mobile traffic. Watch Postgres (`pg_stat_activity`, pool waits),
Redis, and `/metrics` (Prometheus) during soak/stress, not just k6 numbers.
