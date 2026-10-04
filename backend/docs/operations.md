# Backend — Operations (entrypoints, migrations, API, deploy)

How the process boots, what the schema versions did, where the OpenAPI spec lags the code, and what runs in compose/observability.

## 1. Entrypoints

### `cmd/api/main.go` (the real server)

Boot order (dependency order matters — later modules receive earlier ones):

1. `config.Load()`, OTel `Setup`, `shareddb.Open` (+ `SQLDB` handle for River `InsertTx`), pgx pool (max 10) → `rivermigrate` up.
2. Redis client, `crypto.Manager`.
3. Modules: `tenancy → users (+InitInvites) → auth (+membership/subscription/google/email seams) → business → MpesaClient → tenancy.SetSTKProvider → products → customers → taxes → inventory → sales → expenses → invoices → orders(nil payments) → payments → orders rebuilt with payments svc → authz → analytics → waha → chatRegistry (mcp.NewDefaultRegistry) → chat → sync`.
4. River workers registered: sales, invoices, payments, orders, analytics.
5. `http.Server{NewRouter(Dependencies{…})}` + River engine under one errgroup; graceful shutdown on SIGTERM.

The double construction of the orders module (first with nil payments, then rebuilt once `payments.Service` exists) breaks the orders↔payments import cycle — `shared/models.InitiateRequest` is the type-level bridge.

### `cmd/api/server.go` — `Dependencies` + `NewRouter`

`Dependencies` struct carries `Config, Ready, all modules, Authz, Chat, Sync`. Notable routing details:

- Single `/subscriptions` mount (public callback + protected routes on one group) avoids a chi duplicate-mount panic.
- Both `POST /chatbot/chat` and `POST /chat/business-owner` route to `chat.Handler().Chat` (mobile + legacy paths).
- CORS exposes `X-Idempotency-Key` / `X-Business-ID` so the mobile client can send and read them.

### `cmd/mcp-server/main.go` (standalone AI tools host)

Lightweight: DB + Redis + crypto, then `taxes/tenancy/users/auth/business/customers/inventory/sales/expenses/invoices` (**no orders/payments services, nil River**), `authz`, `mcp.NewDefaultRegistry(services)` (read-only subset), `mcp.NewServer(cfg, Authenticator(JWT+MCP), registry, ready)` on `cfg.MCP.Addr` (default :5574).

### `cmd/migrate/main.go`

`golang-migrate` CLI (`up | down N | version`) over `file://migrations` with `DATABASE_DSN`; loads `.env.development` + `.env`.

## 2. Migrations `000001–000020`

| Version(s) | Content |
|---|---|
| 01 | Foundation: `outbox_events` (later dropped), `audit_log` |
| 02 | Auth/tenancy/business/users: `auth_users`, `auth_refresh_tokens`, `tenancy_subscriptions`, `businesses`, `business_members`, `user_profiles` |
| 03 | Catalogue/CRM: products, variants, customers |
| 04 | Core tx: `tax_rules/entries`, `inventory_items`, `stock_movements`, `orders/lines`, `sales/lines`, expenses |
| 05 | Invoices (+lines) |
| 06 | `payment_commands` |
| 07–10 | Invoice/order/payment_command alterations (order_id refs, drop invoice_id) |
| 11 | Drops outbox table (River takeover) |
| 12 | `analytics_snapshots` |
| 13–14, 16, 20 | `sync_version` columns + variant FKs (offline-sync support) |
| 15 | `subscription_payments` |
| 17 | Google SSO: `auth_accounts`, provider columns |
| 18 | `auth_otps` |
| 19 | `business_invites` |

## 3. API documentation — spec lags code

`docs/openapi.yaml` (v3.1.0, 53 paths, server `localhost:5504`) covers: Health (`/health /ready /status`), Auth (register/login/refresh), Tenancy (`/public/plans`, `/subscriptions/subscription`), profile, businesses+members, products (+generate-description), customers (+top, purchase-history), taxes, inventory, orders (+confirm/fulfill/cancel/refund), sales (+summary, by-* breakdowns, void), expenses (+summary), invoices (+send, send-whatsapp, record-payment, pdf), payments (`GET/POST /`, `GET /{id}`).

**Missing from the spec but present in code:** payments cancel/check/M-Pesa callbacks, analytics, waha, chat, sync, subscription upgrade/callback. Treat the code (`module.go` per domain) as authoritative when they disagree.

WhatsApp rules: `docs/WAHA_RULES_IMPLEMENTATION.md`. Observability: `docs/OBSERVABILITY.md`.

## 4. Compose services & ports

| Service | Image / profile | Ports | Notes |
|---|---|---|---|
| postgres | `postgres:16-alpine`, `pg_isready` health | 5432 | primary store + River queue |
| redis | `redis:7-alpine` | host 6378→6379 | Streams bus (unused), readiness, MCP health |
| migrate | profile `migrate` | — | runs `/app/migrate up`, then exits |
| api | — | 5504 + 9464 (metrics) | needs postgres/redis/otel |
| mcp | profile `mcp` | 5574 | standalone tool server |
| otel-collector | — | 4317/4318/8888/13133 | Honeycomb passthrough (`otel-collector-config.yaml`) |
| jaeger | — | 16686 | local traces |
| prometheus | — | 9090 | `prometheus.yml`, OTLP receiver |
| grafana | — | 3001→3000 | anon viewer, `grafana/` provisioning |
| waha | profile `whatsapp`, GOWS engine | 3000 | WhatsApp session host |

## 5. Observability

`internal/observability/`: OTel traces/metrics/logging setup, HTTP + MCP middleware (`HTTPMiddleware` is first in the chain), Prometheus handler. Endpoints: `/metrics` (Prometheus), `/otel/health`. Collector config: `otel-collector-config.yaml`. Lint: `.golangci.yml`. Local targets: `Makefile` (`migrate`, `run`, `test`, …).
