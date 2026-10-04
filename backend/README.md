# Bizsawa Backend (Go)

Modular monolith in Go (`github.com/Codecx-Org/FinAI/backend`): Chi HTTP API + River (Postgres-backed) workers, PostgreSQL + Redis, multi-tenant by business.

> Deep dives live in [`docs/`](./docs/):
> - [`docs/architecture-overview.md`](./docs/architecture-overview.md) — high-level shape, request lifecycle, tenancy, topology
> - [`docs/modules.md`](./docs/modules.md) — per-domain low-level reference (files, types, routes, services, repos, workers, state machines)
> - [`docs/platform.md`](./docs/platform.md) — cross-cutting platform (config, middleware, authz, River/outbox, idempotency, errors, pagination, …)
> - [`docs/module-interactions.md`](./docs/module-interactions.md) — who calls whom, event flows, end-to-end sequences
> - [`docs/operations.md`](./docs/operations.md) — entrypoints, wiring order, migrations, OpenAPI gaps, compose, observability

## High level

```
Client (mobile, offline-first)
   │  HTTPS /api/v1  (+ X-Business-ID, X-Idempotency-Key)
   ▼
Chi router (cmd/api/server.go NewRouter)
   │  observability → RequestID → RealIP → Recoverer → Timeout(60s)
   │  → CORS → TenantResolution → Idempotency
   ├─ public: /health /ready /metrics /api/v1/status /auth /invites
   │          /public/plans /mpesa/* /subscriptions/callback
   ├─ auth-only (JWT): /businesses /profile
   └─ auth + authz (JWT + role): products, inventory, customers, orders,
      sales, expenses, invoices, payments, taxes, analytics, chat, sync,
      /businesses/{id}/members, waha, subscriptions
   ▼
Handler → Service → Repository (GORM + BusinessScope tenant filter)
              └─► River InsertTx in the SAME DB tx (transactional outbox)
   ▼
River workers (async side effects) · Daraja M-Pesa · WAHA WhatsApp · Resend email
```

- **One package per domain** under `internal/` (19 dirs). Each follows `domain.go / handler.go / service.go / repository.go / module.go`, plus `workers.go` / `state_machine.go` where the domain needs it.
- **Shared platform** lives at `internal/shared/` (16 subpackages) — not `shared/` at repo root.
- **State machines, not status flags**, for money-moving entities: orders, payments, invoices (`state_machine.go` each, built on `qmuntal/stateless`).
- **No separate broker.** Async work = River jobs in Postgres (`order.event`, `invoice.event`, `payment.event`, `sale.event`, `analytics.compute[.all]`), inserted transactionally with the write they describe.
- **Multi-tenancy** is enforced, not advisory: `TenantResolution` middleware puts `businessID` in ctx, `BusinessScope` GORM scopes filter every query, and the authz middleware checks `RoleForUser` (via `users.Service`) against an in-code policy map.

## Low level — module map

| `internal/` dir | Responsibility | Notable surface |
|---|---|---|
| `auth/` | Email/password, Google SSO, email-OTP; JWT access + hashed refresh | `POST /api/v1/auth/register|login|refresh|google|…otp…` |
| `business/` | Tenant (business) CRUD, M-Pesa settings, limit guard | `GET/POST /api/v1/businesses`, `GET|PUT|DELETE /{businessID}` |
| `products/` | Product + variant catalogue | `GET/POST /products`, `GET|PUT|DELETE /{id}`, `POST /{id}/generate-description` |
| `inventory/` | Stock items, adjustments, low-stock, movements, valuation; ledger helper | `GET /inventory`, `POST /adjustments`, `GET /low-stock|/movements|/valuation` |
| `customers/` | CRM, top-spenders, purchase history | `GET/POST /customers`, `GET /top`, `GET /{id}/purchase-history` |
| `orders/` | Order lifecycle + fan-out to invoices/payments/sales | `POST /orders`, `POST /{id}/confirm|fulfill|cancel|refund` |
| `sales/` | POS sales, void, summaries/breakdowns | `GET/POST /sales`, `GET /summary|/by-payment-method|…`, `POST /{id}/void` |
| `invoices/` | Invoices, send, record-payment, settle, PDF, overdue sweep | `POST /invoices`, `POST /{id}/send|/send-whatsapp|/record-payment`, `POST /customer/{id}/settle` |
| `payments/` | M-Pesa STK/C2B/B2C commands + Daraja callbacks | `GET/POST /payments`, `POST /{id}/cancel|/check`, public `POST /mpesa/…` |
| `expenses/` | Expense CRUD + category summary | `GET/POST /expenses`, `GET /summary` |
| `taxes/` | Kenya VAT rules + sale/expense tax entries + period summary | `GET/POST /taxes/rules`, `POST /kenya-vat-default`, `GET /summary` |
| `analytics/` | Precomputed snapshots + AI insights + tax summary | `GET /analytics`, `GET /tax`, `GET /ai-insights` |
| `chat/` | Owner chatbot: heuristic tool router + optional LLM synthesis | `POST /api/v1/chatbot/chat`, `POST /api/v1/chat/business-owner` |
| `mcp/` | MCP server, JWT authenticator, read-only tool registry | `POST /mcp`, `GET /health` (both API-embedded and `cmd/mcp-server`) |
| `waha/` | WAHA WhatsApp client + notification templates | `POST /waha/send`, `POST /waha/notify` |
| `sync/` | Offline-first pull/push, conflicts, FK validation, ledger repair | `GET /sync/pull`, `POST /sync/push`, `GET /sync/conflicts` |
| `users/` | Members/roles, profiles, email invites with OTP | `/businesses/{id}/members…`, `GET|POST|PUT /profile`, public `/invites` |
| `tenancy/` | Plans, subscriptions, M-Pesa STK upgrade + callback | `GET /public/plans`, `GET /subscriptions/subscription`, `POST /upgrade/initiate` |
| `observability/` | OTel traces/metrics/logging, HTTP+MCP middleware | `/metrics`, `/otel/health` |

Per-module file/type/route tables: [`docs/modules.md`](./docs/modules.md).

## Reliability patterns (used on the hot path)

- **Transactional River outbox** — service opens GORM tx + `sqlDB.Begin()`, writes rows, `emit(ctx, sqlTx, …)` → `river.Client.InsertTx`, commits both. No `outbox_events` table (migration `000011` dropped it).
- **Idempotency per domain** — `X-Idempotency-Key` → ctx; payments *require* the header; orders/sales/subscription-payments dedupe via `FindByIdempotency` / `FindByOrder` / `checkout_request_id`.
- **Authz centrally** — `shared/authz`: `Enforcer` policy map over `OWNER/MANAGER/CASHIER/VIEWER`, `Middleware` derives `resource` from the chi route pattern and `action` from the HTTP method.
- **Event bridges** — `orderWorker` (orders→payments), `paymentWorker` (payments→orders+invoices), `invoiceWorker` (post-paid PDF/notify), `saleWorker` (log-only today).

Scaffolded but **not** on the hot path: `shared/eventbus` (Redis Streams `Bus` — zero call sites), `shared/idempotency.Store` (Redis store — domains use DB columns instead), `shared/circuitbreaker.New[T]` (no domain imports it). See [`docs/platform.md`](./docs/platform.md).

## Entry points

- `cmd/api/main.go` — builds everything in dependency order (tenancy → users → auth → business → … → orders(nil payments) → payments → orders rebuilt → authz → analytics → waha → chat registry → chat → sync), registers River workers, serves `NewRouter(Dependencies{…})` + River engine under one errgroup with graceful shutdown.
- `cmd/mcp-server/main.go` — lightweight standalone MCP host (no orders/payments services, no River) on `cfg.MCP.Addr`.
- `cmd/migrate/main.go` — `golang-migrate` CLI (`up|down N|version`) over `file://migrations` with `DATABASE_DSN`.

Wiring order, migrations `000001–000020`, OpenAPI-vs-code gaps, compose services: [`docs/operations.md`](./docs/operations.md).

## Run it

```bash
docker compose up -d postgres redis
cp .env.example .env.development   # set DATABASE_DSN, REDIS_ADDR, JWT_SIGNING_KEY, …
go run ./cmd/migrate up
go run ./cmd/api                  # default :5564
go run ./cmd/mcp-server           # optional, default :5574
docker compose --profile whatsapp up -d   # optional WAHA
```
