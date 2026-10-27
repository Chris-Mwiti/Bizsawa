# Intelligence — analytics · chat · waha · mcp (+ observability)

Read-side insights, the AI agent loop, WhatsApp notifications and the tool registry. Writes here are snapshot caches and outbox events only — never business records.

## analytics — `internal/analytics` · routes `GET /analytics`, `/tax`, `/ai-insights`, `/refresh`

Snapshots (`StoredSnapshot` → `analytics_snapshots`) cache full computes per business/timeframe; sales/expenses writes invalidate them.

Repository: `NewRepository`, `WithTx`, `RevenueSeries` (bucketed revenue), `ProfitSeries` (revenue − expenses + margin), `CategorySeries`, `TopProducts`, `ExpenseBreakdown`, `CashFlowSeries` (inflow vs outflow), `CustomerSegments` (spend cohorts), `CustomerLTV`, `SalesVelocity` (count/AOV/cycle proxy), `TaxSummary` (16% VAT for KRA), `UpsertSnapshot` (atomic replace), `FindSnapshot`.

Domain: `Timeframe.Valid()`.

Workers: `ComputeArgs.Kind()` / `InsertOpts()`, `ComputeAllArgs.Kind()` / `InsertOpts()`; `worker.Work` (single snapshot), `computeAllWorker.Work` (all timeframes).

Module: `New(db, ingest, logger)`; `RegisterRoutes`; `RegisterWorkers`; `Service()`.

Service: `NewService`, `Compute` (build + persist), `GetAIInsights` (trends + recommendations), `TaxSummary`, `Get` (cache or compute-on-demand).

Handlers: `TaxSummary`, `Get`, `AIInsights`, `Refresh` (enqueue recompute).

## chat — `internal/chat` · routes `POST /chatbot/chat`, `POST /chat/business-owner`

Single-agent tool-using loop over the MCP registry with heuristic fallback when no LLM key is set. Empty message → 400 (F2).

Module: `NewModule(registry)`; `Handler()`; `Service()`.

Service: `NewService(registry)` (env LLM config); `Chat(ctx, session, req)` (tool loop → synthesis → heuristic fallback).

Handler: `NewHandler(svc, registry)`; `Chat` (auth + business ctx, non-empty validation, language normalize).

## waha — `internal/waha` · routes `POST /waha/send`, `POST /waha/notify`

WhatsApp sending via WAHA gateway. Resource normalises to `whatsapp` in RBAC (F3 fix).

Client (`client.go`): `NewClient(baseURL, session, apiKey)`; `SendText`; `SendMedia`.

Service: `NewService`; `Send`; `SendMedia`; `SendNotification` (typed dispatch).

Templates (`templates.go`): `Template.Render` (`{{.X}}` substitution); `InvoiceTemplate`; `OrderStatusTemplate`; `PaymentReminderTemplate`; `MarketingTemplate`; `RenderNotification(kind, data)`.

Module: `New(baseURL, session, apiKey, logger)`; `RegisterRoutes`; `Service()`.

Handlers: `Send` (validates non-empty → 4xx, never 500 on bad input); `Notify`.

## mcp — `internal/mcp` · JSON-RPC tool server + registry

Profile-scoped tool registry backing the chat agent loop.

Registry (`registry.go`): `NewRegistry(enforcer, tools…)`; `List(session)` (profile/role-filtered descriptors); `Call` / `CallWithContext` (authz + business check + meta); `ErrorPayload` (JSON-RPC codes).

Schema (`schema.go`): `ObjectSchema`, `StringSchema`, `IntegerSchema`, `BooleanSchema` builders.

Tools (`tools.go`): `DefaultTools(services)` (owner/customer-service catalog); `NewDefaultRegistry`.

Server (`server.go`): `NewServer(cfg, auth, registry, ready)`; `Router()` (health/metrics/profile endpoints).

Auth (`auth.go`): `NewAuthenticator`; `Authenticate` (bearer → session per profile).

## observability — `internal/observability` (middleware, no routes except `/metrics`)

Middleware (`middleware.go`): `HTTPMiddleware(service)` (traces + metrics + logs per request); `MetricsHandler()` (Prometheus exposition).

Tracing (`tracing.go`): `Tracer(name)`; `Start(ctx, tracer, span, attrs…)`; `RecordError`; `EndWithStatus`.

Metrics (`metrics.go`): `InitMetrics` / `GetMetrics` (HTTP/MCP/DB/cache/queue instruments); `RecordHTTP`; `IncActiveHTTP`; `RecordMCPTool`; `IncActiveMCP`; `RecordMCPWorkflow`.

MCP spans (`mcp.go`): `StartToolSpan` / `EndToolSpan`; `StartWorkflowSpan` / `EndWorkflowSpan`.

Logging (`logging.go`): `NewLogger` (JSON + trace IDs); `TraceHandler` (`Enabled`/`Handle`/`WithAttrs`/`WithGroup`); `LoggerWithTrace`.

Config (`config.go`): `LoadConfig(service, env)`; `TracesTarget()` / `MetricsTarget()`.
