# Load-test findings — spike / soak / stress suite, run 2026-10-07

Suite: `loadtests/` (k6 v0.57.0). Backend: `backend-api` container + postgres:16 + redis:7.
Seed: `k6-loadtest@example.com` / business `ff92bbeb-…` (“k6 Load Test Shop”, OWNER).
Profiles: `smoke` (2 VUs × 30s, verified live), `spike` (15→120 VUs burst, verified live on sales),
`soak` (15 VUs × 20m default, `SOAK_DURATION=2h` for production soak), `stress` (25→250 VUs stepwise).
Every request tagged `{module, table, op}` — see `TABLE_REGISTRY.md`.

## 0. Infra fix (applied)

`backend-postgres-1` was detached from all Docker networks → API crash-looped on DNS
(`lookup postgres … server misbehaving`). Fixed with `docker compose up -d` (re-attached
`backend_default`), then `docker compose up -d --force-recreate api`. API is now
`Up (healthy)` on `:5504`. If it happens again, check
`docker inspect backend-postgres-1 --format '{{json .NetworkSettings.Networks}}'`.

## Smoke results per module (live, 2 VUs × 30s)

| Module | checks | 5xx | p95 | Notes |
|---|---|---|---|---|
| auth | 100% | 0% | ~3ms | login, check-email, OTP send, bad-refresh rejection |
| business | 100% | 0% | 3.5ms | 2nd-business creates correctly 403 (plan limit) |
| users | 100% | 0% | 7ms | list members/invites, invite (per-VU invitee) |
| products | ~98% | 0% | 7ms | full create→update→delete lifecycle; 404s only from cross-VU list/get/delete race |
| customers | 100% | 0% | 5ms | list, top, purchase-history, create |
| taxes | 100% | 0% | 6ms | rules, summary, create |
| inventory | ~100% | ~0% | 4.5ms | list, low-stock, movements, valuation, adjust |
| orders | ~97% | ~3% | 35ms | create→confirm→fulfill→cancel; residual 5xx = F1 via auto-invoice |
| sales | ~94% | ~6% | 17ms | F1 receipt race |
| expenses | 100% | 0% | 5ms | create→get→delete lifecycle |
| invoices | ~81% | ~19% | 10ms | F1 (number race) + F4 (record-payment) |
| payments | 100% | 0% | 2.7ms | reads only (writes gated: `WRITE_PAYMENTS=1`) |
| analytics | 100% | 0% | 13ms | dashboard, tax, insights, refresh |
| sync | 100% | 0% | delta ~7ms / **full 1.3–1.8s** | F5 |
| waha-chat | amber | 0%* | ~2ms | validation-only by default; *403s are F3, 500s are F2 |
| e2e workflow | 73% full-chain | 16% | chain med ~300ms | breaks only on F1/F4 |
| mobile flows | 100% | 0% | tabs ~15ms / pull 1.6s | F5 dominates cold start |

## Spike result (live): sales, 15→120 VUs, 3m10s, 89,830 req @ 472/s

- `error_rate_5xx` **17.71%** — spike threshold (5%) correctly FAILED.
- Only **2,562 successful writes**; latency stayed healthy (p95 383ms).
- Verdict: the API absorbs bursts without slowing down, but sale writes collapse
  into 500s (F1). Correctness, not capacity, is the ceiling.

## Findings (backend)

**F1 — Duplicate document numbers under concurrency → 500 (HIGH).**
`POST /sales` → `duplicate key idx_sales_business_receipt` (`internal/sales/repository.go:65`);
`POST /invoices` → `duplicate key idx_invoices_business_number`;
`POST /orders/{id}/confirm` → `could not create invoice from order` (same invoice race).
Read-max-then-insert numbering cannot survive two cashiers. Fix options: per-business
sequence (`nextval`), advisory lock (`pg_advisory_xact_lock(business_id)`), or
insert-with-retry on 23505. Also return 409 + `Retry-After`, never a raw 500/SQLSTATE body.

**F2 — `POST /chatbot/chat` with `{}` → 500 (MEDIUM).** Validate message non-empty → 400
(`internal/chat/handler.go`). Currently burns LLM-error paths and trips every validation run.

**F3 — RBAC: `POST /waha/*` 403 for OWNER (MEDIUM).** `ResourceAction` yields resource
`waha`, but `seedDefaults` (`internal/shared/authz/authz.go:125`) seeds `whatsapp` —
no `waha` entry, so the enforcer denies everyone. Rename one side. Note: this means
WhatsApp sending is currently unusable for all roles.

**F4 — `POST /invoices/{id}/record-payment` without `paymentId` → 500 (MEDIUM).**
Zero-UUID foreign key blows up instead of 422. Cash-against-invoice (no `payment_commands`
row) is the counter norm — either accept nil `paymentId` or validate → 422.

**F5 — `GET /sync/pull` uncapped + slow (MEDIUM, mobile-critical).** No `since` → full
dataset (`internal/sync/service.go:93`); med **1.2s**, p95 **1.7s** at only ~20k rows,
and every app foreground fires one. Add keyset pagination/caps + index
`(business_id, updated_at)`; mobile should persist `lastPulledAt` (it does — server must stay fast).

**F6 — Slow invoice lookup: 400–550ms seq scans (LOW).** Settle/history query over
`(customer_id, status, amount_due)` has no supporting index; degrades as invoices grow.
Add composite index. (Also: `[ORDERS]-order` logs full order JSON at ERROR on success — noisy.)

Test-suite notes (not app bugs): `POST /orders` requires `X-Idempotency-Key` **UUID-shaped**
(else 403/409) — helper `postI` handles it; invoice lines require `description`;
`PUT /products/{id}` requires `name`; `GET /subscriptions/subscription` (not `/subscriptions`);
invites list lives at `/businesses/{id}/members/invites`; 2nd business correctly 403s
(plan guard — asserted, not a failure).

## Soak / stress (not yet run — runbook)

```bash
./run.sh soak all                    # 15 VUs × 20m per module
SOAK_DURATION=2h ./run.sh soak sync  # the one that matters most (F5)
./run.sh stress products             # 25→250 VUs stepwise, watch p95 + 5xx knee
./run.sh spike workflows             # burst-day simulation (sale rush + sync stampede)
```

Watch during soak, not just k6: `pg_stat_activity` (pool waits — `DATABASE_MAX_OPEN_CONNS=25`),
River queue depth, Redis memory, `/metrics`, and `sync/pull` latency drift. Soak passes if
p95 and 5xx are flat in the last 50% of the window.

## Test-data note

Runs created ~20k rows (products/orders/sales/invoices/customers prefixed `k6-…`,
business `ff92bbeb-…`) in the **dev** database. Leave for soak baselines, or purge per
business id in FK order (sale_lines → sales, order_lines → orders, invoice_lines →
invoices, stock_movements, payment_commands, products, customers, …) — no cleanup
script committed yet; say the word and I'll add `loadtests/cleanup.sql`.
