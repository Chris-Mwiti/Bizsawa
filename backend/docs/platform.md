# Backend — Platform (cross-cutting concerns)

Everything in `internal/shared/` plus the middleware chain. Rule of thumb: domain packages own business rules; `shared/` owns the *mechanisms* every domain reuses.

## config — `shared/config/config.go`

`Config` + `Load()` from env via godotenv. Load order `.env.development → .env → environment`. Sections: Database / Redis / CORS / JWT / Google / MCP / WhatsApp / Crypto / M-Pesa / Email / Observability. Key envs: `DATABASE_DSN, REDIS_ADDR, JWT_*, GOOGLE_*_CLIENT_ID, MPESA_*, EMAIL_*, OTEL_*`. `TracesTarget/MetricsTarget` fall back to a generic endpoint when unset.

## Middleware chain — `shared/middleware/` + `cmd/api/server.go NewRouter`

Order: `observability.HTTPMiddleware → RequestID → RealIP → Recoverer → Timeout(60s) → CORS` (exposes `X-Idempotency-Key`, `X-Business-ID`) `→ TenantResolution → Idempotency`.

- `context.go` — ctx keys + accessors (`WithUserID/TenantID/BusinessID`).
- `tenant.go` — `TenantResolution`: header → lowercase mirror → `?businessId=` fallback → ctx.
- `idempotency.go` — `Idempotency`: copies `X-Idempotency-Key` into ctx (propagation only; enforcement is per-domain).

## Authorization — `shared/authz/authz.go, errors.go`

In-code Casbin-style map (not a Casbin policy file): `Enforcer{policy map[Role]map[resource]map[action]bool}`, `seedDefaults()`:

- **OWNER** — everything.
- **MANAGER** — everything except `delete` on most resources and no payments admin.
- **CASHIER** — read products/inventory/invoices/insights + read/write customers/orders/sales/expenses.
- **VIEWER** — read-only.

`Middleware` derives `ResourceAction` from the chi route pattern (segment after `v1`; `businesses/{id}/members → members`) plus method → `read/write/delete`, resolves the role through `users.Service.RoleForUser`, and denies when there is no `businessID` in ctx or the policy bit is absent.

## Transactional outbox via River — `emit` pattern (per service)

There is no `outbox_events` table (dropped in migration `000011`). Instead:

1. Service opens a GORM tx **and** a raw `sqlDB.Begin()`.
2. Writes domain rows in the GORM tx.
3. `emit(ctx, sqlTx, …)` → `river.Client.InsertTx(sqlTx, …)` enqueues the domain job in the same DB transaction.
4. Both commit together — the event can never exist without the write, nor vice versa.

Job kinds: `order.event`, `invoice.event`, `payment.event`, `sale.event`, `analytics.compute`, `analytics.compute.all`. Adding a new async side effect = new job kind + worker registration in `cmd/api/main.go`, never a direct cross-domain HTTP call.

## Idempotency — header + DB columns

- HTTP layer only propagates the key (`middleware/idempotency.go`).
- Enforcement is per domain and DB-backed:
  - **payments**: `POST /payments` *requires* `X-Idempotency-Key` (`errIdempotencyRequired → 422`); dedupe via `FindByIdempotency`, plus `FindByOrder` / `FindByProviderRequestID` / `FindByAccountReference` for callback matching.
  - **orders/sales**: `FindByIdempotency(businessID, key)` (+ `FindByOrder` for order-derived sales).
  - **tenancy upgrades**: `FindSubscriptionPaymentByIdempotency` on `checkout_request_id`.
- `shared/idempotency/store.go` (Redis-backed `Store{Get, Set}`) exists but is **unused** — domains use DB columns. This matters for mobile retries on flaky connections: resend the same key, get the original result, never a double sale/payment.

## Event bus (Redis Streams) — scaffolded, unused

`shared/eventbus/eventbus.go, redis_streams.go` defines `Event/Bus` + `RedisStreamsBus{Publish, Subscribe}` with **zero call sites**. Events flow through River PG jobs. Do not add new publishers on the Streams bus without first deciding to deprecate one path.

## Circuit breaker — scaffolded, unwired

`shared/circuitbreaker/factory.go` provides generic `New[T]` over `sony/gobreaker` (defaults: maxReq 5, 1m interval, 30s timeout, 0.6 failure ratio). **No domain imports it** — M-Pesa/WAHA calls go direct with logging. Wiring it around `MpesaClient`/`waha.Client` is the obvious next reliability step.

## Cache — health only

`shared/cache/redis.go` `Client/RedisClient{Get, Set, Del, Ping, Close, Raw}` over go-redis. Today it is used for readiness (`/ready` pings DB+Redis) and MCP health — there is **no read-through caching** of domain data.

## Errors / HTTP envelope / pagination

- `shared/errors/errors.go` — `AppError{Code, StatusCode, Message}` + sentinels `ErrInternal/NotFound/Unauthorized/Forbidden/Conflict/Unprocessable/TooManyRequests/PaymentFailed/ServiceUnavailable`.
- `shared/http/respond.go` — `Envelope`, `JSON`, `Error` (AppError→status), `Decode`.
- `shared/pagination/pagination.go` — `Page{Limit, Offset}`, `FromRequest` (default 25, max 100); every `List`/breakdown repo uses it.

## Crypto / email / DB helpers

- `shared/crypto/manager.go` — `Manager{BlindIndex, Encrypt, Decrypt}`; used for business M-Pesa shortcode/settings at rest.
- `shared/email/email.go` — `Sender` iface, `ResendSender/NoopSender`, `NewSender`; OTP + invite templates.
- `shared/db/` — `base_model.go` (`BaseModel`, `TenantModel`), `connection.go` (`Open/Ping/SQLDB`), `tenant_scope.go` (`TenantScope/BusinessScope`).
- `shared/audit/` (`model.go`, `repository.go`) — `Entry` audit log + `Insert`.
- `shared/models/payment_order.go` — shared `InitiateRequest` bridging orders → payments without an import cycle.
- `shared/outbox/model.go` — generic `BaseModel[T]` helper (legacy name; the real outbox is River `InsertTx`).
