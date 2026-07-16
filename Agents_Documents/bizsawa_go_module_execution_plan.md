# BizSawa Go Rewrite Module Execution Plan

Reference inputs:
- `Agents_Documents/bizsawa_go_rewrite_prompt.md`
- `Agents_Documents/bizsawa_go_architecture_v2.png`

Primary language: Go.

Architecture target: modular monolith API with separate worker binaries for background jobs and isolated payment processing. The API uses Chi, GORM/PostgreSQL, Redis Streams, Redis cache, transactional outbox, idempotency, Casbin authorization, and circuit breakers around every external service.

## Execution Principles

1. Build foundation before business behavior.
2. Every bounded context exposes only `internal/<module>/module.go`.
3. Every module follows `domain -> repository -> service -> handler -> module.go`.
4. Every persistent entity includes `tenant_id` and `business_id` where applicable.
5. Every write path emits audit/outbox records where domain events are needed.
6. Money uses `shopspring/decimal`, never `float64`.
7. Payment processing never runs inside the main API process.
8. AI, reports, WhatsApp, and notifications are async by default.
9. Each phase ends with migrations, tests, and a runnable smoke path.

## Phase 0: Repository Bootstrap

Goal: create the Go backend skeleton without mixing it into the existing frontend.

Deliverables:
- `go.mod` with module path, Go 1.23, and baseline dependencies.
- Top-level directories:
  - `cmd/api`
  - `cmd/worker`
  - `cmd/payment-worker`
  - `internal`
  - `migrations`
  - `scripts`
  - `docs`
- Local dev config templates:
  - `.env.example`
  - `docker-compose.yml` for Postgres, Redis, API, worker, payment worker, and optional WAHA.
- Health endpoints:
  - `GET /health`
  - `GET /ready`

Acceptance checks:
- `go test ./...` passes.
- API binary starts and returns healthy status without business modules enabled.

## Phase 1: Shared Foundation

Goal: implement the platform primitives all modules depend on.

Modules/packages:
- `internal/shared/config`
- `internal/shared/db`
- `internal/shared/errors`
- `internal/shared/http`
- `internal/shared/middleware`
- `internal/shared/pagination`
- `internal/shared/eventbus`
- `internal/shared/outbox`
- `internal/shared/idempotency`
- `internal/shared/circuitbreaker`
- `internal/shared/cache`
- `internal/shared/audit`

Core work:
- GORM Postgres connection pool and readiness checks.
- Redis client for cache, idempotency, and Streams.
- Base model with UUID, tenant ID, timestamps, and soft delete.
- Tenant-scoped GORM query helpers.
- App error contract and JSON response helpers.
- Validator integration.
- Chi router bootstrap with CORS, request ID, recovery, timeout, tenant resolution, idempotency, auth placeholder, and authz placeholder.
- Transactional outbox table, repository, relay, and Redis Streams publisher.
- Event bus interface with Redis Streams implementation.
- Circuit breaker factory using `gobreaker`.
- Idempotency middleware and DB-level helpers.
- Audit log table and write helper.

Acceptance checks:
- Unit tests for errors, tenant scopes, idempotency cache behavior, and circuit breaker fallback.
- Integration test for outbox insert -> relay -> Redis Stream publish.

## Phase 2: Auth, Tenancy, Business, and Users

Goal: establish identity, tenant boundaries, business membership, and authorization.

Implementation order:
1. `internal/auth`
2. `internal/tenancy`
3. `internal/business`
4. `internal/users`
5. Casbin policy setup in shared authz/middleware

Auth:
- User registration and login.
- Password hashing with `x/crypto`.
- JWT access token and refresh token rotation.
- Session/revocation storage.
- Public routes under `/api/v1/auth`.

Tenancy:
- Subscription plans: Free, Premium, Enterprise.
- User -> subscription -> N businesses model.
- Business limit enforcement.
- Public subscription routes where needed.

Business:
- Business profile, settings, tax/payment metadata.
- Owner-created business creates tenant/business context.

Users:
- Business members with roles: OWNER, MANAGER, CASHIER, VIEWER.
- Invite member flow.
- Role updates.
- User profile.

Authz:
- Casbin GORM adapter.
- RBAC + domain policy model.
- Route-to-resource/action mapper.
- Seed policies from the prompt's module map.

Acceptance checks:
- Register -> create business -> invite member -> login -> access protected route.
- Casbin denies CASHIER report generation and allows CASHIER sales creation.
- Tenant isolation tests prove user A cannot read business B records.

## Phase 3: Catalogue and CRM

Goal: add foundational POS data.

Implementation order:
1. `internal/products`
2. `internal/customers`

Products:
- Product and product variant models.
- SKU uniqueness per business.
- Category, barcode, image URL, tax rule link.
- Route set:
  - `GET /api/v1/products`
  - `POST /api/v1/products`
  - `GET /api/v1/products/{id}`
  - `PUT /api/v1/products/{id}`
  - `DELETE /api/v1/products/{id}`
  - `POST /api/v1/products/{id}/generate-description`

Customers:
- Customer profile with phone, email, address, tags, notes, loyalty points, total spend.
- Purchase history query interface.
- MCP-facing service methods:
  - `GetTopCustomers`
  - `GetCustomerPurchaseHistory`

Acceptance checks:
- CRUD tests for products and customers.
- SKU duplicate returns conflict inside the same business and succeeds across businesses.
- Customer list is tenant-scoped and paginated.

## Phase 4: Core Transaction Flow

Goal: implement the POS write path from order to sale to stock and tax effects.

Implementation order:
1. `internal/taxes`
2. `internal/inventory`
3. `internal/orders`
4. `internal/sales`
5. `internal/expenses`

Taxes:
- Tax rules and tax entries.
- Kenya VAT default rule support.
- Period summary computation.
- Routes under `/api/v1/taxes`.

Inventory:
- Inventory item and stock movement models.
- Stock adjustment/write-off.
- Low-stock detector job.
- Event consumer for `order.confirmed`.
- MCP-facing methods:
  - `GetLowStockItems`
  - `GetInventoryValuation`
  - `GetStockMovements`

Orders:
- Draft, confirmed, fulfilled, cancelled, refunded lifecycle.
- Order line calculations.
- Idempotent order creation.
- `order.confirmed` and `order.fulfilled` outbox events.

Sales:
- Immutable sales records.
- Receipt number generation.
- POS walk-in sales.
- Void sale flow.
- Idempotent sale creation.
- Event consumer for `order.fulfilled`.
- MCP-facing methods:
  - `GetSalesSummary`
  - `GetSalesByProduct`
  - `GetSalesByStaff`
  - `GetSalesByPaymentMethod`

Expenses:
- Expense categories and recurring metadata.
- Expense summary by category for reports and AI.
- Tax paid entry creation where applicable.

Acceptance checks:
- Confirming an order decrements inventory exactly once.
- Fulfilling an order creates exactly one sale.
- Sale creation emits outbox event and tax entry.
- Replaying an idempotency key returns the existing order/sale.

## Phase 5: Invoices

Goal: support invoice creation, PDF generation, delivery state, reminders, and payment linkage.

Module:
- `internal/invoices`

Core work:
- Invoice and invoice line models.
- Invoice status lifecycle: draft, sent, viewed, partial, paid, overdue, cancelled.
- Invoice number generation.
- PDF generation with Maroto.
- Routes:
  - `GET /api/v1/invoices`
  - `POST /api/v1/invoices`
  - `GET /api/v1/invoices/{id}`
  - `POST /api/v1/invoices/{id}/send`
  - `POST /api/v1/invoices/{id}/send-whatsapp`
  - `POST /api/v1/invoices/{id}/record-payment`
  - `GET /api/v1/invoices/{id}/pdf`
- Worker task for overdue reminders.
- Outbox events for invoice sent, invoice paid, invoice overdue.

Acceptance checks:
- Invoice totals match order/tax calculations.
- PDF generation is deterministic enough for test assertions.
- Recording payment updates amount paid, amount due, and status.

## Phase 6: Payments and Isolated Payment Worker

Goal: isolate payment command processing from the main API.

Modules/binaries:
- `internal/payments`
- `cmd/payment-worker`

API process responsibilities:
- Accept payment initiation requests.
- Validate idempotency key.
- Persist payment command record.
- Write outbox event to `payments.commands`.
- Return accepted/pending response.
- Expose payment status polling endpoints.

Payment worker responsibilities:
- Own DB pool/config.
- Consume `payments.commands`.
- Call Mpesa Daraja through circuit breaker.
- Handle STK Push, B2C, and C2B callbacks.
- Publish `payments.results`.
- Persist provider references and status transitions.

Acceptance checks:
- Main API has no direct Mpesa client dependency.
- Contract tests validate `PaymentCommand` and result event schema.
- Duplicate payment commands are deduplicated at DB level by idempotency key.
- Circuit-open errors map to service unavailable without leaking provider internals.

## Phase 7: Reports

Goal: compute financial reports and exports.

Module:
- `internal/reports`

Reports:
- Profit and Loss.
- Cash Flow Statement.
- Balance Sheet.
- Sales Report.
- Inventory Valuation.
- Accounts Receivable Aging.
- Accounts Payable Aging.
- Tax Summary.
- Expense Breakdown.
- Unit Economics.

Core work:
- Report request/status models.
- Sync path for light reports.
- Async generation for heavy reports via `cmd/worker`.
- PDF export using Maroto.
- Excel export using excelize.
- Report schedule model and cron integration.
- WhatsApp dispatch event creation for scheduled reports.

Acceptance checks:
- P&L combines sales revenue, COGS, and expenses correctly.
- Tax summary uses tax module period totals.
- Heavy report endpoint returns `202 Accepted` with poll URL.
- Scheduled report emits WhatsApp job.

## Phase 8: Visualizations

Goal: serialize backend data into `react-native-gifted-charts` JSON.

Module:
- `internal/visualizations`

Core work:
- Chart schema package:
  - Bar.
  - Line.
  - Area.
  - Pie.
  - Donut.
  - Stacked bar.
  - Standard `ChartResponse` envelope.
- Builder functions:
  - Weekly sales.
  - Monthly sales.
  - Expense category.
  - Revenue vs expenses.
  - Top products.
  - Inventory turnover.
  - Cashflow.
  - Customer spend.
  - Tax collected vs paid.
  - Profit margin.
  - Payment method split.
  - AR aging.
  - Revenue by staff.

Routes:
- `GET /api/v1/visualizations/sales/weekly`
- `GET /api/v1/visualizations/sales/monthly`
- `GET /api/v1/visualizations/expenses/by-category`
- `GET /api/v1/visualizations/revenue-vs-expenses`
- `GET /api/v1/visualizations/top-products`
- `GET /api/v1/visualizations/inventory/turnover`
- `GET /api/v1/visualizations/cashflow`
- `GET /api/v1/visualizations/customers/by-spend`
- `GET /api/v1/visualizations/tax/collected-vs-paid`

Acceptance checks:
- JSON fixtures match the gifted-charts shape from the prompt.
- All endpoints support `period`, `from`, and `to`.
- Builders avoid money math in `float64`; conversion happens only at serialization edge.

## Phase 9: Insights

Goal: pre-compute AI-assisted business insights and serve them instantly.

Module:
- `internal/insights`

Core work:
- Insight model with type, period key, severity, data payload, chart type, chart JSON, read state, expiry.
- Insight repository with freshness lookup and upsert.
- Scheduler:
  - Sales trend every 6 hours.
  - Top products daily.
  - Low stock on inventory event and every 15 minutes.
  - Cash flow alert daily.
  - Expense anomaly daily.
  - Customer behavior weekly.
  - Tax alert monthly day 25.
- Worker flow:
  - Check fresh existing insight.
  - Pull deterministic data from module interfaces.
  - Build chart JSON.
  - Request narrative from AI module.
  - Store insight.

Routes:
- `GET /api/v1/insights`
- `GET /api/v1/insights/{id}`
- `POST /api/v1/insights/refresh`
- `PUT /api/v1/insights/{id}/mark-read`
- `GET /api/v1/insights/summary`

Acceptance checks:
- Insight refresh returns `202 Accepted`.
- Fresh insights are not regenerated.
- Expired insights are regenerated.
- Low-stock event creates or refreshes a low-stock insight.

## Phase 10: AI and Content Generation

Goal: implement async AI requests, MCP-style business tools, structured output, and content generation.

Module:
- `internal/ai`

Core work:
- LLM client interface and provider implementation.
- Circuit breaker around LLM calls.
- Async request model and Redis Stream queue.
- Worker pool in `cmd/worker`.
- Cache key strategy by tenant, request type, and parameters.
- MCP tool registry wrapping public module interfaces only.
- Request types:
  - Sales insights.
  - Inventory alerts.
  - Cashflow forecast.
  - Expense analysis.
  - Business summary.
  - Pricing recommendation.
  - Tax estimate.
  - Custom.
- Content service:
  - Product description.
  - Business summary.
  - Invoice payment message.
  - Low stock alert.
  - Monthly performance summary.
  - Customer thank-you.
  - Pricing recommendation.
- Structured JSON extraction using typed Go structs.

Routes:
- `POST /api/v1/ai/insights`
- `GET /api/v1/ai/insights/status/{requestID}`
- Content generation endpoints where modules need them.

Acceptance checks:
- HTTP AI request never blocks on LLM call.
- Worker writes result status and cache.
- Product description generation updates product AI fields asynchronously.
- Invalid LLM JSON fails gracefully and is observable.

## Phase 11: WhatsApp and Notifications

Goal: deliver reports, invoices, alerts, and reminders asynchronously.

Modules:
- `internal/whatsapp`
- `internal/notifications`

WhatsApp:
- `Client` interface.
- Primary whatsmeow implementation.
- WAHA HTTP implementation for dev/sidecar mode.
- Driver factory controlled by config.
- Circuit breaker wrapper.
- Session storage in Postgres for whatsmeow.
- Message templates:
  - Invoice due.
  - Invoice paid.
  - Report ready.
  - Insight alert.
  - Low stock.
  - Payment received.

Notifications:
- Unified dispatch job model for email, SMS, WhatsApp, and PDF/document sends.
- Redis Stream consumers in `cmd/worker`.
- Delivery status tracking.

Routes:
- `GET /api/v1/whatsapp/status`
- `POST /api/v1/whatsapp/session`
- `POST /api/v1/whatsapp/test-message`
- `PUT /api/v1/whatsapp/settings`

Acceptance checks:
- Invoice/report handlers enqueue WhatsApp jobs instead of sending inline.
- WAHA driver can be selected in local dev.
- Delivery failures are recorded and retried with bounded attempts.

## Phase 12: Hardening and Release Readiness

Goal: make the rewrite production-operable.

Core work:
- Rate limiting per user and sensitive endpoint.
- Full audit logging on write operations.
- Request/response logging hygiene.
- Metrics hooks for:
  - HTTP latency.
  - outbox lag.
  - Redis Stream lag.
  - worker job failures.
  - circuit breaker state.
  - payment command lifecycle.
- Migration runner.
- Seed data for roles, policies, and plans.
- Dockerfile multi-stage production build.
- CI pipeline:
  - `go fmt`
  - `go vet`
  - `go test ./...`
  - integration tests with Postgres and Redis.
- Security review:
  - no hardcoded secrets.
  - tenant scope on every repository query.
  - DB unique constraints for idempotent operations.
  - no direct cross-module internal imports.

Acceptance checks:
- Local stack starts with one command.
- API, worker, and payment worker shut down gracefully.
- All critical paths have unit and integration tests.
- Architecture constraints can be checked by static import tests.

## Module Dependency Order

1. Shared foundation.
2. Auth.
3. Tenancy.
4. Business.
5. Users.
6. Taxes.
7. Products.
8. Customers.
9. Inventory.
10. Orders.
11. Sales.
12. Expenses.
13. Invoices.
14. Payments.
15. Reports.
16. Visualizations.
17. AI.
18. Insights.
19. WhatsApp.
20. Notifications.

## First Milestone Scope

The first milestone should not attempt every module. It should prove the architecture works end to end.

Build:
- Shared foundation.
- Auth.
- Tenancy.
- Business.
- Users.
- Products.
- Customers.
- Taxes.
- Inventory.
- Orders.
- Sales.
- Outbox relay.
- Redis Streams.

End-to-end demo:
1. Register an owner.
2. Create a business.
3. Add products and inventory.
4. Create and confirm an order.
5. Inventory decrements.
6. Fulfill the order.
7. Sale is created.
8. Tax entry is created.
9. Outbox publishes domain events.
10. Tenant isolation and Casbin permissions are enforced.

## Risk Register

Payment isolation:
- Risk: API accidentally imports Mpesa client.
- Control: keep provider clients under payment worker package and add import-boundary tests.

Tenant isolation:
- Risk: repository query misses tenant scope.
- Control: repository helpers require tenant/business arguments and integration tests use cross-tenant fixtures.

Outbox consistency:
- Risk: domain row committed without event.
- Control: service writes domain row and outbox event in one GORM transaction.

Async complexity:
- Risk: duplicate processing from at-least-once Redis delivery.
- Control: idempotency keys, unique event processing records, and retry-safe handlers.

AI cost and latency:
- Risk: repeated LLM calls.
- Control: cache keys, precomputed insights, async queues, and circuit breakers.

WhatsApp reliability:
- Risk: protocol/session instability.
- Control: driver abstraction, WAHA fallback, delivery status, retries, and circuit breaker.

## Definition of Done

A module is complete only when:
- It has domain models, migrations, repository, service, handler, and `module.go`.
- It exposes no internal implementation to other modules.
- It has tenant-scoped queries.
- It uses typed request/response structs and validation.
- It has unit tests for service behavior.
- It has integration tests where DB, Redis, outbox, or authz behavior matters.
- It registers routes through the root Chi router.
- It has Casbin resource/action coverage.
- It emits outbox events for side effects.
- It has clear error mapping and no leaked internal errors.
