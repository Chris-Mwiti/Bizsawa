# BizSawa MCP Server Implementation Plan

## Purpose

Implement a production MCP server for BizSawa that can safely power two chatbot experiences:

- **Business-owner chatbot:** business analytics, sales/inventory/expense/tax/invoice summaries, operational actions, and AI-assisted business guidance.
- **Customer-service chatbot:** customer lookup, purchase/order/invoice/payment support, invoice resend workflows, and issue triage without exposing owner-only financial or administrative tools.

The MCP server must follow the existing BizSawa Go architecture: a Chi/GORM modular monolith with separate workers, PostgreSQL tenant-scoped data, Redis cache/streams, idempotency, authorization, circuit breakers, audit logging, and payment isolation.

## Current Project Context

The current backend is a Go modular monolith under `backend/`.

Key dependencies already in use:

- `github.com/go-chi/chi/v5` for HTTP routing.
- `gorm.io/gorm` with `gorm.io/driver/postgres` for PostgreSQL persistence.
- `github.com/redis/go-redis/v9` for Redis cache and Redis Streams.
- `github.com/golang-jwt/jwt/v5` for JWT access tokens.
- `github.com/shopspring/decimal` for money values.
- `github.com/sony/gobreaker/v2` for circuit breakers.
- `github.com/riverqueue/river` for background jobs.
- `github.com/qmuntal/stateless` for state machines.
- `golang.org/x/crypto` for password/security primitives.

Implemented architecture patterns:

- Root API in `backend/cmd/api`.
- Modules under `backend/internal/<module>` following `domain -> repository -> service -> handler -> module.go`.
- Shared platform packages under `backend/internal/shared`.
- Tenant and business context in `internal/shared/middleware`.
- Tenant/business query helpers in `internal/shared/db`.
- Role policy enforcement in `internal/shared/authz`.
- Idempotency middleware with `X-Idempotency-Key`.
- Redis and PostgreSQL readiness checks.
- Payment command persistence and worker-oriented payment flow.
- OpenAPI contract in `backend/docs/openapi.yaml`.

Architecture target from `bizsawa_go_architecture_v2.png`:

- Client apps call the Chi API gateway.
- The API runs as a modular monolith.
- Payments are isolated through a payment worker and event flow.
- Golang river carries events/jobs.
- PostgreSQL stores tenant-scoped application data.
- Redis cache supports insights, chart JSON, and idempotency.
- External services include Mpesa Daraja, LLM API, WAHA/whatsmeow, email/SMS/PDF.
- Security and multi-tenancy are cross-cutting layers.
- Visualization responses must stay compatible with `react-native-gifted-charts`.

## MCP Design Rules To Enforce

This implementation must apply the rules in `Agents_Documents/Mcp_Rules`:

- Use focused, curated MCP servers/toolsets. Avoid an "everything" toolset.
- Keep each active tool list comfortably under 30 tools; target 10-20 tools per persona/workflow.
- Group tools by workflow and persona, not by backend resource table.
- Include dependency tools in each workflow toolset so agents can complete tasks without guessing IDs.
- Use consistent snake_case tool names with predictable verbs: `search_*`, `get_*`, `list_*`, `create_*`, `send_*`, `summarize_*`.
- Write descriptions for agents: explain when to use the tool, required prerequisites, and follow-up actions.
- Use dynamic tool discovery to hide unavailable tools based on auth, role, plan, business context, and external service health.
- Use response filtering and compact outputs to prevent context bloat.
- Use RAG-style knowledge tools for documentation/help content instead of dumping whole resources.
- Implement OAuth-compatible authorization for remote MCP access, including PKCE, protected resource metadata, audience validation, short-lived tokens, and least privilege.
- Enforce root boundaries: tools may only access the authenticated tenant/business/customer context.
- Monitor tool call metadata, latency, payload sizes, failures, rate-limit hits, and suspicious usage patterns.
- Never log credentials, raw tokens, full conversation history, full tool responses, PII-heavy payloads, or business-sensitive records.

## Recommended Shape

Build one MCP service binary with two curated tool profiles:

- `cmd/mcp-server`
- `internal/mcp`
- `internal/mcp/auth`
- `internal/mcp/catalog`
- `internal/mcp/tools`
- `internal/mcp/toolsets`
- `internal/mcp/transport`
- `internal/mcp/observability`

The service can expose separate MCP endpoints or profiles:

- `/mcp/business-owner`
- `/mcp/customer-service`

The implementation should share module services directly, not call the REST API internally. This keeps type safety, avoids JSON re-parsing, and reuses tenant-scoped repository/service behavior. If a module service lacks a narrow method needed by MCP, add that method to the owning module service rather than querying tables from MCP code.

## Phase 1: MCP Foundation

Deliverables:

- Add `backend/cmd/mcp-server/main.go`.
- Add `backend/internal/mcp` packages for server boot, auth context, tool registry, tool execution, schema helpers, and observability.
- Reuse existing config loading, DB connection, Redis client, crypto manager, module constructors, and authz enforcer.
- Register only read-only tools first.
- Add health/readiness endpoints for the MCP process.
- Add config values:
  - `MCP_ADDR`
  - `MCP_PUBLIC_URL`
  - `MCP_AUTH_ISSUER`
  - `MCP_AUTH_AUDIENCE`
  - `MCP_TOOL_PAYLOAD_LIMIT_BYTES`
  - `MCP_ENABLE_CUSTOMER_SERVICE`
  - `MCP_ENABLE_BUSINESS_OWNER`
  - `MCP_TELEMETRY_ENABLED`

Acceptance checks:

- `go test ./...` passes.
- `go run ./cmd/mcp-server` starts with Postgres and Redis.
- The MCP server refuses unauthenticated tool calls.
- Tool list changes based on user role and business context.

## Phase 2: Authorization And Context

Implement MCP authorization as a resource-server layer.

Required behavior:

- Validate JWT or OAuth access token signature, expiry, issuer, and audience.
- Require the token audience to match the MCP server resource.
- Expose protected resource metadata at `/.well-known/oauth-protected-resource`.
- Return `401` with `WWW-Authenticate` metadata when token is missing.
- Return `403` for authenticated users without permission.
- Bind each MCP session to:
  - `user_id`
  - `tenant_id`
  - `business_id`
  - `role`
  - `subscription_plan`
  - `tool_profile`
  - `request_id`
- Reuse `internal/shared/authz.Enforcer` for resource/action decisions.
- Add MCP-specific action mapping:
  - read tools -> `read`
  - generation/report/chart tools -> `generate`
  - settings/send/write tools -> `write` or `configure`
  - destructive tools -> excluded from v1

Root boundary rules:

- Business-owner tools must require a valid `business_id`.
- Customer-service tools must only return records for the active `business_id`.
- No tool accepts `tenant_id` from the model.
- No tool accepts arbitrary SQL, table names, file paths, or raw Redis stream names.
- All IDs supplied by the model must be validated as UUIDs and checked against the active business.

## Phase 3: Curated Toolsets

### Business-Owner Toolset V1

Target: 12-18 tools.

Read and summary tools:

- `get_business_profile`
- `list_business_members`
- `summarize_sales`
- `list_sales_by_product`
- `list_sales_by_payment_method`
- `list_sales_by_staff`
- `list_low_stock_items`
- `get_inventory_valuation`
- `list_stock_movements`
- `summarize_expenses_by_category`
- `summarize_tax_period`
- `list_invoices`
- `get_invoice`
- `list_payments`
- `get_payment_status`
- `search_customers`
- `get_customer_purchase_history`
- `search_business_knowledge`

Optional write tools after read-only validation:

- `create_inventory_adjustment`
- `create_expense`
- `send_invoice`
- `send_invoice_whatsapp`
- `refresh_insights`

Business-owner tool rules:

- Keep tools focused on workflows: "How is my business doing?", "What stock needs action?", "Which customers matter?", "What invoices/payments need follow-up?"
- Return compact summary objects first, with optional `include_details` and bounded pagination.
- Use `decimal.Decimal` internally and serialize money as strings plus currency.
- Require idempotency keys for any write-style operation.
- For high-impact actions like sending invoices or adjusting stock, require explicit user confirmation in the chatbot layer before the tool is called.

### Customer-Service Toolset V1

Target: 8-14 tools.

Tools:

- `search_customers`
- `get_customer`
- `get_customer_purchase_history`
- `list_customer_orders`
- `get_order`
- `list_customer_invoices`
- `get_invoice`
- `send_invoice`
- `send_invoice_whatsapp`
- `get_payment_status`
- `list_customer_payments`
- `create_customer_note`
- `search_support_knowledge`

Customer-service tool rules:

- No business-wide revenue, expense, tax, member, or settings tools.
- No product cost/margin fields unless explicitly allowed by role.
- No delete tools.
- No direct payment initiation in v1.
- All customer searches must be bounded and return only the minimum fields needed to disambiguate the customer.
- Any message-send tool must return a delivery job/status, not block on WhatsApp/email delivery.

## Phase 4: Tool Naming And Response Contracts

Tool naming pattern:

- `search_*` returns candidate records from a natural-language or structured query.
- `get_*` returns one record by ID.
- `list_*` returns bounded lists.
- `summarize_*` returns aggregate values.
- `create_*` creates a domain record and requires idempotency.
- `send_*` enqueues delivery work and returns accepted status.

Standard response envelope:

```json
{
  "status": "ok",
  "data": {},
  "meta": {
    "business_id": "uuid",
    "result_count": 3,
    "tokens_estimate": 420,
    "truncated": false,
    "next_cursor": null
  }
}
```

Standard error envelope:

```json
{
  "status": "error",
  "error": "permission_denied",
  "message": "This role cannot access business-wide sales summaries.",
  "retryable": false
}
```

Response controls every list/search tool should support:

- `limit`, default `10`, max `50`.
- `cursor` or page where existing services use pagination.
- `from` and `to` for time-bounded summaries.
- `fields` for allowlisted field filtering.
- `jq_filter` only for already-safe JSON responses and only through an allowlisted/sandboxed jq implementation.

Do not return full database models by default. Build MCP-specific DTOs that omit internal timestamps, soft-delete fields, encrypted/index fields, provider payloads, raw webhook bodies, and unnecessary IDs.

## Phase 5: Dynamic Tool Discovery

Tool availability must be computed at runtime from:

- Authenticated role: OWNER, MANAGER, CASHIER, VIEWER.
- Active business membership.
- Subscription plan and limits.
- Feature flags.
- External dependency health.
- WhatsApp session state.
- Payment worker/Redis availability.

Examples:

- Hide `send_invoice_whatsapp` when WAHA/whatsmeow is disconnected.
- Hide `refresh_insights` when the plan does not include AI insights.
- Hide `summarize_expenses_by_category` from customer-service sessions.
- Hide all write tools for VIEWER.
- Hide payment tools if the payment worker or Redis stream is unhealthy.

The MCP server should notify clients with `notifications/tools/list_changed` when availability changes during an active session.

## Phase 6: RAG Knowledge Tools

Add one RAG-style search tool per chatbot profile:

- `search_business_knowledge`
- `search_support_knowledge`

Inputs:

- `query`: natural language query.
- `collection`: enum such as `user_guide`, `faq`, `policy`, `support_scripts`, `api_reference`.
- `max_results`: default `3`, max `10`.
- `min_score`: default `0.5`.

Output:

- Flat `results` array.
- `content` first.
- `source` with document path/URL.
- `score`.
- `tokens_estimate`.

Initial implementation can index markdown files from `Agents_Documents`, product help, support scripts, and business policy docs. Prefer `pgvector` in PostgreSQL if adding vector search to the current stack; otherwise start with a small internal search service behind the MCP tool and keep the MCP contract stable.

Do not expose raw MCP resources for large documents.

## Phase 7: Write And Side-Effect Safety

Write tools must be added only after read tools are stable.

Rules:

- Require `X-Idempotency-Key` equivalent in MCP context for every write.
- Generate or require a stable client action ID per tool call.
- Use existing service-layer idempotency behavior where available.
- Enqueue async work for WhatsApp, email, reports, AI insights, PDFs, and payment-related side effects.
- Return accepted/status objects instead of waiting on long-running workers.
- Add audit log entries for every write/send/generate operation.
- Do not expose destructive operations in v1.
- Do not expose direct Mpesa Daraja calls from MCP. Payment actions must go through the existing payment command/event flow.

High-risk tools should require chatbot-level confirmation before invocation:

- inventory adjustment
- expense creation
- invoice sending
- WhatsApp dispatch
- report sharing
- payment initiation, when added later

## Phase 8: Observability And Monitoring

Instrument every MCP tool call.

Capture:

- tool name
- timestamp
- authenticated user/session IDs as internal correlation IDs
- business ID
- role
- success/failure
- sanitized validation errors
- latency p50/p95/p99
- payload byte size
- result count
- rate-limit hit count
- downstream dependency names
- circuit breaker state

Never capture:

- access tokens
- refresh tokens
- credentials
- raw prompt/conversation history
- raw tool responses
- provider webhook payloads
- phone numbers/emails in logs
- full customer records
- payment provider secrets

Add alerts for:

- repeated denied calls
- sudden spike in customer search/list tools
- large payload attempts
- repeated malformed tool arguments
- high latency for sales/inventory/payment tools
- WhatsApp or payment tool availability flapping

## Phase 9: Rate Limits And Abuse Controls

Add MCP-specific rate limits:

- per user
- per business
- per tool
- per profile
- stricter limits for search, send, generate, and payment-status polling tools

Controls:

- hard payload-size limits
- bounded date ranges for summaries
- bounded pagination
- no unbounded exports
- no cross-business fan-out queries
- minimum query length for customer search
- prompt-injection resilient descriptions that state tool limits clearly

## Phase 10: Implementation Sequence

1. **Foundation**
   - Add MCP server binary.
   - Initialize DB, Redis, modules, authz, logger.
   - Add protected resource metadata and token validation skeleton.

2. **Read-only business-owner tools**
   - Sales summaries.
   - Inventory low stock and valuation.
   - Expense category summary.
   - Customer top/search/purchase history.
   - Invoice/payment status lookup.

3. **Read-only customer-service tools**
   - Customer search/get.
   - Customer orders/invoices/payments.
   - Order/invoice/payment details with restricted fields.

4. **Tool curation and dynamic discovery**
   - Build profile-aware registry.
   - Add role/plan/dependency filters.
   - Emit `tools/list_changed` notifications.

5. **RAG tools**
   - Add knowledge search contract.
   - Index initial support/business docs.
   - Add score and token estimate output.

6. **Observability**
   - Structured tool-call logs.
   - Metrics counters/histograms.
   - Payload size tracking.
   - Sanitized error reporting.

7. **Safe write tools**
   - Invoice send.
   - WhatsApp invoice send.
   - Customer note.
   - Expense create.
   - Inventory adjustment.
   - Insight refresh.

8. **Hardening**
   - Integration tests with tenant isolation fixtures.
   - Import-boundary tests preventing direct payment-provider use.
   - Load tests for repeated tool calls.
   - Security review against the MCP rules.

## Initial Tool-To-Service Mapping

| MCP tool | Existing module/service target | Profile |
| --- | --- | --- |
| `search_customers` | `customers.Service.List` plus repository search extension | both |
| `get_customer` | `customers.Service.Get` | customer-service |
| `get_customer_purchase_history` | `customers.Service.GetCustomerPurchaseHistory` | both |
| `list_low_stock_items` | `inventory.Service.GetLowStockItems` | business-owner |
| `get_inventory_valuation` | `inventory.Service.GetInventoryValuation` | business-owner |
| `list_stock_movements` | `inventory.Service.GetStockMovements` | business-owner |
| `summarize_sales` | `sales.Service.GetSalesSummary` | business-owner |
| `list_sales_by_product` | `sales.Service.GetSalesByProduct` | business-owner |
| `list_sales_by_staff` | `sales.Service.GetSalesByStaff` | business-owner |
| `list_sales_by_payment_method` | `sales.Service.GetSalesByPaymentMethod` | business-owner |
| `summarize_expenses_by_category` | `expenses.Service.SummaryByCategory` | business-owner |
| `list_invoices` | `invoices.Service.List` | both, filtered |
| `get_invoice` | `invoices.Service.Get` | both, filtered |
| `send_invoice` | `invoices.Service.Send` | both, role-gated |
| `get_payment_status` | `payments.Service.Get/List extension if missing` | both, filtered |
| `search_business_knowledge` | new MCP RAG service | business-owner |
| `search_support_knowledge` | new MCP RAG service | customer-service |

Where the service target is missing search/filter support, add a narrow service method in the owning module and cover it with tenant isolation tests.

## Security Acceptance Checklist

- Every tool call requires authentication.
- Every token validates issuer, expiry, signature, and audience.
- Every tool binds to one active business.
- No tool accepts tenant ID from the model.
- Customer-service profile cannot access owner-only financial summaries.
- VIEWER cannot call write tools.
- CASHIER cannot call owner/admin tools outside seeded policy.
- All list tools are bounded.
- All write tools are idempotent.
- All write tools emit audit records.
- Payment provider calls remain outside the MCP/API process.
- Tool descriptions and schemas do not expose internal table names or secrets.
- Logs contain correlation IDs, not raw business/customer/payment data.

## Testing Plan

Unit tests:

- Tool input validation.
- Tool response DTO redaction.
- Tool registry filtering by role/profile/plan.
- Auth token claim validation.
- Error mapping.

Integration tests:

- Cross-tenant access denial.
- Customer-service profile cannot access business-owner tools.
- OWNER can access business summaries for own business only.
- VIEWER sees read-only tools only.
- WhatsApp-dependent tools disappear when WhatsApp status is disconnected.
- Payment tools disappear when Redis/payment dependency is unhealthy.
- Idempotent write tool replay returns existing result.

Contract tests:

- Tool schemas stay stable.
- Tool descriptions include prerequisites and workflow guidance.
- Response envelopes include `status`, `data`, and `meta`.
- RAG responses include `content`, `source`, `score`, and `tokens_estimate`.

Operational tests:

- MCP server starts and shuts down gracefully.
- Readiness fails when DB or Redis is unavailable.
- Tool-call metrics are emitted.
- Sensitive values are absent from logs.

## Definition Of Done

The MCP implementation is complete when:

- `cmd/mcp-server` runs independently from `cmd/api`.
- Business-owner and customer-service profiles expose separate curated toolsets.
- Tool availability changes dynamically from role, plan, business context, and dependency health.
- All tools enforce tenant/business boundaries.
- All tools use existing module services or new owning-module service methods.
- Tool outputs are compact, filtered, and safe for LLM context.
- RAG tools search knowledge instead of dumping documents.
- Write tools are idempotent, audited, and confirmation-gated by the chatbot layer.
- Monitoring captures tool usage and performance without collecting sensitive content.
- Tests prove authz, tenant isolation, tool curation, and response redaction.
