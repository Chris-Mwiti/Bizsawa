# Backend — Architecture Overview

High-level shape of the Go backend: what the pieces are, how a request flows, how tenancy is enforced, and how the process is put together at runtime.

## 1. Shape: modular monolith

- Module `github.com/Codecx-Org/FinAI/backend`, service names `bizsawa-api` / `bizsawa-mcp`.
- Layout: `cmd/` (3 entrypoints) · `internal/` (19 domain + platform dirs) · `migrations/` (20 versions) · `docs/openapi.yaml` · `docker-compose.yml` · `Dockerfile`, `Dockerfile.mcp`, `Dockerfile.otel` · `otel-collector-config.yaml`, `prometheus.yml`.
- One package per business domain under `internal/`, each shaped as `domain.go / handler.go / service.go / repository.go / module.go`, with `workers.go` and/or `state_machine.go` added only where the domain needs background work or a lifecycle.
- Shared code is **not** a top-level `shared/` dir — it is `internal/shared/` (16 subpackages).

```
backend/
├── cmd/api/            # HTTP API entrypoint (main.go, server.go)
├── cmd/mcp-server/     # standalone MCP entrypoint (main.go)
├── cmd/migrate/        # golang-migrate CLI (main.go)
├── internal/
│   ├── auth/ business/ products/ inventory/ customers/
│   ├── orders/ sales/ invoices/ payments/ expenses/ taxes/
│   ├── analytics/ chat/ mcp/ waha/ sync/ users/ tenancy/
│   ├── observability/
│   └── shared/         # audit authz cache circuitbreaker config crypto db
│                       #   email errors eventbus http idempotency middleware
│                       #   models outbox pagination
├── migrations/000001…000020
└── docs/openapi.yaml + OBSERVABILITY.md + WAHA_RULES_IMPLEMENTATION.md
```

## 2. Request lifecycle

```
① Chi Router (NewRouter in cmd/api/server.go)
      observability.HTTPMiddleware → RequestID → RealIP → Recoverer
      → Timeout(60s) → CORS (exposes X-Idempotency-Key, X-Business-ID)
      → TenantResolution → Idempotency
② Route class
      public  — no auth: /health /ready /metrics /otel/health
                /api/v1/status /auth/* /invites /public/plans
                /mpesa/* /subscriptions/callback
      auth    — Auth.Middleware (Bearer JWT → WithUserID/TenantID/BusinessID):
                /businesses /profile
      authz   — Auth.Middleware + Authz.Middleware (role check):
                products inventory customers orders sales expenses invoices
                payments taxes analytics chat sync /businesses/{id}/members
                waha subscriptions
③ Handler  — decodes input (shared/http.Decode), calls Service
④ Service   — business rules, state-machine transitions, emits River jobs
⑤ Repository — GORM with BusinessScope/TenantScope tenant filter
⑥ Response  — shared/http.Envelope JSON or mapped AppError status
```

Error mapping is central: each module's `errors.go` returns `shared/errors.AppError{Code, StatusCode, Message}` sentinels (e.g. `errBusinessRequired → FORBIDDEN`, payments' `errIdempotencyRequired → UNPROCESSABLE`), and `shared/http.Error` maps them to HTTP status codes.

## 3. Tenancy: three layers

1. **Resolution** — `shared/middleware/tenant.go TenantResolution` puts the business/tenant id into ctx (header `X-Business-ID`, lowercase mirror, `?businessId=` fallback).
2. **Data isolation** — `shared/db/tenant_scope.go` `TenantScope/BusinessScope` GORM scopes filter every repository query by `business_id`; base types in `shared/db/base_model.go` (`BaseModel`, `TenantModel`) carry the column.
3. **Authorization** — `shared/authz/authz.go Enforcer` holds `map[Role]map[resource]map[action]bool` seeded in `seedDefaults()` for `OWNER/MANAGER/CASHIER/VIEWER`; `Middleware` derives `resource` from the chi route pattern segment after `v1` (e.g. `businesses/{id}/members → members`) and `action` from the HTTP method (`read/write/delete`), resolving the caller's role via `users.Service.RoleForUser`. Requests without a `businessID` in ctx are denied.

## 4. Async model: River as the bus

There is **no separate message broker**. Background work runs on [River](https://riverqueue.com/) (Postgres-native queue via `riverpgxv5`/`riverdatabasesql`):

- Services that mutate state open a GORM tx **and** a raw `sqlDB.Begin()`, perform writes, then `emit(ctx, sqlTx, …)` → `river.Client.InsertTx(…)`; both commit together. This is the transactional-outbox pattern (the old `outbox_events` table was dropped in migration `000011`).
- Job kinds on the wire: `order.event`, `invoice.event`, `payment.event`, `sale.event`, `analytics.compute`, `analytics.compute.all`.
- Workers bridge domains without direct imports: `orderWorker` (orders → payments `InitiateOrder`), `paymentWorker` (payments → orders `PaymentUpdate` + invoices `RecordPayment`/`SettleCustomerPayment`), `invoiceWorker` (post-paid PDF build / owner notify), `saleWorker` (today: log-only), analytics `worker`/`computeAllWorker` (recompute snapshots).

Note: `shared/eventbus` defines a Redis-Streams `Bus` (`RedisStreamsBus{Publish, Subscribe}`) but has **zero call sites** — River is the real event path.

## 5. Runtime topology (compose)

`docker-compose.yml`: `postgres:16-alpine` (5432) · `redis:7-alpine` (host 6378→6379) · `migrate` (profile `migrate`, runs `/app/migrate up`) · `api` (5504 + 9464 metrics; needs postgres/redis/otel) · `mcp` (profile `mcp`, 5574) · `otel-collector` (4317/4318/8888/13133) · `jaeger` (16686) · `prometheus` (9090) · `grafana` (3001→3000, anon viewer) · `waha` (profile `whatsapp`, 3000, GOWS engine).

External systems: **Daraja M-Pesa** (STK push, C2B register/confirmation/validation, B2C, transaction-status, STK query) via `payments/mpesa.go MpesaClient`; **WAHA** (WhatsApp text/media) via `waha/client.go Client`; **Resend email** (OTP, invites) via `shared/email` (`ResendSender`/`NoopSender`).
