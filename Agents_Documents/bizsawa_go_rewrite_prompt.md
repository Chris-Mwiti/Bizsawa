# BizSawa — Go Rewrite Agent Brief
> A complete system prompt for a coding agent rewriting the BizSawa Node.js backend in Go.
> Version: 2.1 | Date: June 2026 | Updated: Added full module roster, WAHA HTTP integration, complete chart JSON schemas, content generation, and revised architecture diagram.

---

## 0. AGENT OVERVIEW

You are a **senior Go engineer** tasked with a full rewrite of the BizSawa backend — an AI-powered financial and business management assistant for small businesses and entrepreneurs in Kenya and East Africa. The current codebase is Node.js. You will produce idiomatic, production-grade Go.

BizSawa's north-star features:
- **AI business assistant** (LLM + MCP tool calls for contextual DB queries)
- **Mpesa & payments integration** (event-driven, isolated worker)
- **Multi-tenant** subscription model (one user → multiple businesses)
- **Financial reporting** (P&L, Cash Flow, Balance Sheet, and more — auto-scheduled via WhatsApp)
- **Fine-grained access control** per business and per user role
- **Core POS modules**: products, orders, sales, inventory, expenses, taxes, customers
- **Invoicing**: generation, delivery, payment tracking
- **Pre-computed AI insights**: stored in DB, backgrounded, cached
- **Chart visualization API**: JSON shaped for react-native-gifted-charts
- **Content generation**: AI-written product descriptions, business summaries, recommendations
- **WhatsApp delivery**: report dispatch and notifications via whatsmeow

Study this entire brief before writing a single line of code. Every architectural decision below is a constraint, not a suggestion.

---

## 1. TARGET ARCHITECTURE — MODULAR MONOLITH

### 1.1 Philosophy
Adopt a **Modular Monolith** with strict bounded-context isolation. This means:
- A single deployable binary with logically separated modules
- Each module owns its own DB schema prefix (e.g., `auth_*`, `payments_*`, `ai_*`)
- Modules communicate **only through internal event buses or explicit public Go interfaces** — never by directly importing each other's internal packages
- The architecture must be splittable into microservices later with minimal refactoring

### 1.2 Top-Level Directory Structure

```
bizsawa/
├── cmd/
│   ├── api/            # Main HTTP server entry point
│   ├── worker/         # AI + insights + reports background workers
│   └── payment-worker/ # Isolated payment worker process
├── internal/
│   ├── auth/           # Auth module (bounded context)
│   │   ├── domain/
│   │   ├── repository/
│   │   ├── service/
│   │   ├── handler/
│   │   └── module.go
│   ├── tenancy/        # Multi-tenancy & subscription management
│   ├── business/       # Business profile management
│   ├── users/          # Business-scoped user management (staff/members)
│   ├── customers/      # Customer CRM per business
│   ├── products/       # Product catalogue & pricing
│   ├── orders/         # Order lifecycle (cart → confirmed → fulfilled)
│   ├── sales/          # Sales records, POS transactions
│   ├── inventory/      # Stock levels, adjustments, alerts
│   ├── expenses/       # Expense tracking & categorization
│   ├── taxes/          # Tax rules, VAT computation, filing summaries
│   ├── invoices/       # Invoice generation, delivery & status tracking
│   ├── payments/       # Payment processing (Mpesa, etc.) — event-driven
│   ├── reports/        # Financial report computation & export
│   ├── insights/       # Pre-computed AI insights stored in DB
│   ├── visualizations/ # Chart JSON serialization (gifted-charts schema)
│   ├── ai/             # LLM orchestration, MCP tools, content generation
│   ├── whatsapp/       # WhatsApp delivery via whatsmeow
│   ├── notifications/  # Email, SMS, push, WhatsApp dispatcher
│   └── shared/         # Cross-cutting concerns
│       ├── eventbus/
│       ├── outbox/
│       ├── idempotency/
│       ├── circuitbreaker/
│       ├── middleware/
│       ├── pagination/
│       ├── errors/
│       └── config/
├── pkg/
├── migrations/
├── scripts/
├── docs/
├── go.mod
└── go.sum
```

### 1.3 Module Interface Contract
Every module MUST expose a single `module.go` file that is its only public surface:

```go
// internal/sales/module.go
package sales

// Module is the public facade for the sales bounded context.
// Other modules may only call methods on this interface.
type Module struct {
    svc *salesService
}

func New(db *gorm.DB, eventBus eventbus.Bus, cfg Config) *Module { ... }

// Only expose what other modules genuinely need
func (m *Module) GetSalesSummary(ctx context.Context, businessID uuid.UUID, period Period) (*SalesSummary, error)
func (m *Module) RegisterRoutes(r chi.Router) { ... }
```

---

## 2. HTTP ROUTING — Chi Router

### 2.1 Installation
```bash
go get github.com/go-chi/chi/v5
go get github.com/go-chi/chi/v5/middleware
go get github.com/go-chi/cors
go get github.com/go-chi/jwtauth/v5
```

### 2.2 Root Router Setup (`cmd/api/server.go`)
```go
package main

import (
    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
    "github.com/go-chi/cors"
    "net/http"
    "time"
)

func NewRouter(modules *Modules) http.Handler {
    r := chi.NewRouter()

    // Core middleware stack — ORDER MATTERS
    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    r.Use(middleware.Timeout(60 * time.Second))
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   []string{"https://*.bizsawa.com"},
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
        AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Idempotency-Key", "X-Request-ID"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

    // Custom middleware
    r.Use(TenantResolutionMiddleware)  // Resolves tenant/business from JWT or subdomain
    r.Use(IdempotencyMiddleware)       // Attaches idempotency key handler

    // Public routes
    r.Route("/api/v1/auth", modules.Auth.RegisterRoutes)
    r.Route("/api/v1/public", modules.Tenancy.RegisterPublicRoutes)

    // Protected routes — require valid JWT
    r.Group(func(r chi.Router) {
        r.Use(AuthMiddleware)           // Validates JWT, sets user in context
        r.Use(AuthorizationMiddleware)  // Casbin enforcement

        // Business & user management
        r.Route("/api/v1/businesses",        modules.Business.RegisterRoutes)
        r.Route("/api/v1/businesses/{bizID}/members", modules.Users.RegisterRoutes)

        // Catalogue & customers
        r.Route("/api/v1/products",          modules.Products.RegisterRoutes)
        r.Route("/api/v1/customers",         modules.Customers.RegisterRoutes)

        // POS flow: orders → sales
        r.Route("/api/v1/orders",            modules.Orders.RegisterRoutes)
        r.Route("/api/v1/sales",             modules.Sales.RegisterRoutes)

        // Stock
        r.Route("/api/v1/inventory",         modules.Inventory.RegisterRoutes)

        // Finance
        r.Route("/api/v1/expenses",          modules.Expenses.RegisterRoutes)
        r.Route("/api/v1/taxes",             modules.Taxes.RegisterRoutes)
        r.Route("/api/v1/invoices",          modules.Invoices.RegisterRoutes)

        // Reports & charts
        r.Route("/api/v1/reports",           modules.Reports.RegisterRoutes)
        r.Route("/api/v1/visualizations",    modules.Visualizations.RegisterRoutes)

        // AI services
        r.Route("/api/v1/ai",                modules.AI.RegisterRoutes)
        r.Route("/api/v1/insights",          modules.Insights.RegisterRoutes)

        // Notifications & WhatsApp settings
        r.Route("/api/v1/whatsapp",          modules.WhatsApp.RegisterRoutes)

        // Payment routes — proxied to isolated payment worker via events
        r.Route("/api/v1/payments",          modules.Payments.RegisterRoutes)
    })

    // Internal health/metrics
    r.Get("/health", HealthHandler)
    r.Get("/ready",  ReadinessHandler)

    return r
}
```

### 2.3 Route Grouping Pattern (per module)
```go
// internal/sales/handler/routes.go
func (h *Handler) RegisterRoutes(r chi.Router) {
    r.Get("/",            h.ListSales)
    r.Post("/",           h.CreateSale)
    r.Get("/{saleID}",   h.GetSale)
    r.Put("/{saleID}",   h.UpdateSale)
    r.Delete("/{saleID}", h.DeleteSale)
    r.Post("/{saleID}/void", h.VoidSale)
}
```

### 2.4 Chi Context Helpers
Use strongly-typed context keys — never raw strings:

```go
package middleware

type contextKey string

const (
    ContextKeyUserID     contextKey = "userID"
    ContextKeyTenantID   contextKey = "tenantID"
    ContextKeyBusinessID contextKey = "businessID"
    ContextKeyRequestID  contextKey = "requestID"
)

func UserIDFromCtx(ctx context.Context) (uuid.UUID, bool) {
    v, ok := ctx.Value(ContextKeyUserID).(uuid.UUID)
    return v, ok
}
```

---

## 3. DATABASE ORM — GORM

### 3.1 Installation
```bash
go get gorm.io/gorm
go get gorm.io/driver/postgres
go get github.com/golang-migrate/migrate/v4
```

### 3.2 Multi-Tenant Schema Strategy
Use **schema-per-tenant** OR **row-level tenant isolation** depending on scale.
For BizSawa at current scale, use **shared schema with `tenant_id` on every table**, enforced via GORM scopes.

```go
// internal/shared/db/tenant_scope.go
func TenantScope(tenantID uuid.UUID) func(db *gorm.DB) *gorm.DB {
    return func(db *gorm.DB) *gorm.DB {
        return db.Where("tenant_id = ?", tenantID)
    }
}

// Usage in every repository:
func (r *SaleRepository) FindAll(ctx context.Context, tenantID uuid.UUID) ([]*Sale, error) {
    var sales []*Sale
    err := r.db.WithContext(ctx).
        Scopes(TenantScope(tenantID)).
        Find(&sales).Error
    return sales, err
}
```

### 3.3 Base Model (embed in every domain entity)
```go
// internal/shared/db/base_model.go
package db

import (
    "github.com/google/uuid"
    "gorm.io/gorm"
    "time"
)

type BaseModel struct {
    ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID  uuid.UUID      `gorm:"type:uuid;not null;index"`
    CreatedAt time.Time
    UpdatedAt time.Time
    DeletedAt gorm.DeletedAt `gorm:"index"` // soft delete
}
```

### 3.4 Repository Pattern with Transaction Support
```go
// internal/shared/repository/repository.go
type Repository[T any] interface {
    FindByID(ctx context.Context, id uuid.UUID) (*T, error)
    FindAll(ctx context.Context, opts QueryOptions) ([]*T, int64, error)
    Create(ctx context.Context, entity *T) error
    Update(ctx context.Context, entity *T) error
    SoftDelete(ctx context.Context, id uuid.UUID) error
    WithTx(tx *gorm.DB) Repository[T]
}
```

### 3.5 GORM Transactions — Clean Pattern
```go
// Idempotency check BEFORE the transaction (avoid unnecessary lock contention)
existing, err := repo.FindByIdempotencyKey(ctx, key)
if err != nil { return nil, err }
if existing != nil { return existing, nil } // early return

// Atomic write inside transaction
err = db.Transaction(func(tx *gorm.DB) error {
    txRepo := repo.WithTx(tx)
    txOutbox := outboxRepo.WithTx(tx)

    if err := txRepo.Create(ctx, &sale); err != nil {
        return err // tx auto-rollback
    }

    // Outbox event written in same transaction
    return txOutbox.Insert(ctx, &OutboxEvent{
        AggregateID: sale.ID.String(),
        EventType:   "sale.created",
        Payload:     mustMarshal(sale),
    })
})
```

---

## 4. TRANSACTIONAL OUTBOX PATTERN

### 4.1 Why
Prevent data corruption when a write to the DB succeeds but publishing an event to the message broker fails. The outbox guarantees at-least-once delivery.

### 4.2 Outbox Table Schema
```sql
-- migrations/XXXXXX_create_outbox.sql
CREATE TABLE outbox_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    aggregate_id    TEXT NOT NULL,
    aggregate_type  TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | PROCESSING | SENT | DEAD
    attempts        INT NOT NULL DEFAULT 0,
    max_attempts    INT NOT NULL DEFAULT 5,
    scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_outbox_status_scheduled ON outbox_events(status, scheduled_at)
    WHERE status IN ('PENDING', 'PROCESSING');
```

### 4.3 Outbox Repository
```go
// internal/shared/outbox/repository.go
type OutboxRepository interface {
    Insert(ctx context.Context, event *OutboxEvent) error   // called inside transaction
    ClaimBatch(ctx context.Context, batchSize int) ([]*OutboxEvent, error)
    MarkSent(ctx context.Context, id uuid.UUID) error
    MarkFailed(ctx context.Context, id uuid.UUID, err error) error
    WithTx(tx *gorm.DB) OutboxRepository
}
```

### 4.4 Outbox Relay Worker (Background Goroutine)
```go
// internal/shared/outbox/relay.go
func (r *OutboxRelay) Start(ctx context.Context) {
    ticker := time.NewTicker(r.cfg.PollInterval) // e.g., 500ms
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            r.processOneBatch(ctx)
        }
    }
}

func (r *OutboxRelay) processOneBatch(ctx context.Context) {
    events, err := r.repo.ClaimBatch(ctx, r.cfg.BatchSize)
    if err != nil {
        r.logger.Error("outbox claim failed", "err", err)
        return
    }
    for _, evt := range events {
        if err := r.broker.Publish(ctx, evt); err != nil {
            _ = r.repo.MarkFailed(ctx, evt.ID, err)
        } else {
            _ = r.repo.MarkSent(ctx, evt.ID)
        }
    }
}
```

### 4.5 Message Broker
Use **Redis Streams** (already available via Redis for caching) as the internal event bus for the modular monolith. If you later extract microservices, swap to Kafka or RabbitMQ by changing only the broker implementation — the outbox interface stays constant.

```bash
go get github.com/redis/go-redis/v9
```

---

## 5. IDEMPOTENCY KEYS

### 5.1 Scope
Idempotency keys are MANDATORY for:
- All payment initiation endpoints
- Order/sale creation
- Inventory write-offs
- Any AI recommendation request that triggers side effects

### 5.2 HTTP Header Contract
Clients MUST send: `X-Idempotency-Key: <client-generated-uuid>`

### 5.3 Idempotency Middleware
```go
// internal/shared/middleware/idempotency.go
func IdempotencyMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Only apply to mutating requests
        if r.Method == http.MethodGet || r.Method == http.MethodHead {
            next.ServeHTTP(w, r)
            return
        }

        key := r.Header.Get("X-Idempotency-Key")
        if key == "" {
            // For payment routes this should be a hard 400, for others a warning
            next.ServeHTTP(w, r)
            return
        }

        // Check Redis cache for prior response
        cached, err := cache.Get(r.Context(), "idem:"+key)
        if err == nil && cached != "" {
            // Replay cached response
            w.Header().Set("X-Idempotency-Replayed", "true")
            w.Write([]byte(cached))
            return
        }

        // Intercept response, cache it, then write to client
        rec := &responseRecorder{ResponseWriter: w}
        next.ServeHTTP(rec, r)

        // Cache for 24 hours
        _ = cache.Set(r.Context(), "idem:"+key, rec.body.String(), 24*time.Hour)
    })
}
```

### 5.4 DB-Level Idempotency (for critical entities)
```sql
ALTER TABLE payments ADD COLUMN idempotency_key TEXT UNIQUE;
ALTER TABLE orders   ADD COLUMN idempotency_key TEXT UNIQUE;
```

On conflict, return the existing row — don't return an error to the client.

---

## 6. CIRCUIT BREAKER — External Service Calls

### 6.1 Installation
```bash
go get github.com/sony/gobreaker/v2
```

### 6.2 Wrap Every External Call
Apply circuit breakers to: Mpesa STK Push, Mpesa C2B, Anthropic/OpenAI LLM API, Content generation APIs, Email/SMS providers.

```go
// internal/shared/circuitbreaker/factory.go
package circuitbreaker

import (
    "github.com/sony/gobreaker/v2"
    "time"
)

type Config struct {
    Name        string
    MaxRequests uint32        // requests allowed during half-open
    Interval    time.Duration // stats window in closed state
    Timeout     time.Duration // duration of open state before half-open
    FailureRate  float64      // e.g. 0.6 = trip at 60% failure rate
    MinRequests  uint32       // minimum requests before failure rate kicks in
}

func New[T any](cfg Config) *gobreaker.CircuitBreaker[T] {
    return gobreaker.NewCircuitBreaker[T](gobreaker.Settings{
        Name:        cfg.Name,
        MaxRequests: cfg.MaxRequests,
        Interval:    cfg.Interval,
        Timeout:     cfg.Timeout,
        ReadyToTrip: func(counts gobreaker.Counts) bool {
            if counts.Requests < uint32(cfg.MinRequests) {
                return false
            }
            failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
            return failureRatio >= cfg.FailureRate
        },
        OnStateChange: func(name string, from, to gobreaker.State) {
            // Emit metric / log
            logger.Warn("circuit breaker state change",
                "name", name, "from", from.String(), "to", to.String())
        },
    })
}
```

```go
// internal/payments/mpesa/client.go
type MpesaClient struct {
    httpClient *http.Client
    cb         *gobreaker.CircuitBreaker[*MpesaSTKResponse]
    cfg        MpesaConfig
}

func (c *MpesaClient) InitiateSTKPush(ctx context.Context, req *STKPushRequest) (*MpesaSTKResponse, error) {
    return c.cb.Execute(func() (*MpesaSTKResponse, error) {
        // actual HTTP call to Safaricom Daraja API
        return c.doSTKPush(ctx, req)
    })
}
```

### 6.3 Fallback Strategy
When the circuit is open, return a graceful error:
```go
var ErrServiceUnavailable = errors.New("payment service temporarily unavailable, please retry")

if errors.Is(err, gobreaker.ErrOpenState) {
    return nil, ErrServiceUnavailable
}
```

---

## 7. PAYMENTS MODULE — EVENT-DRIVEN ISOLATION

### 7.1 Threat Model
The payment service processes financial transactions. If the main API server is compromised (SQL injection, RCE, etc.), it must not directly affect payment processing. Therefore:
- The payments module runs as a **separate process** (`cmd/payment-worker/`)
- The main API **never directly calls** payment processing logic
- All payment commands are published as events to a **Redis Stream** or lightweight queue
- The payment worker **consumes** these events, processes them, and publishes result events back

### 7.2 Payment Event Flow

```
[Client] ──POST /api/v1/payments/initiate──▶ [API Server]
                                                    │
                                    Write to DB + Outbox (same TX)
                                                    │
                                         [Redis Stream: payments.commands]
                                                    │
                                         [Payment Worker Process]
                                                    │
                                        Safaricom Daraja API (via CB)
                                                    │
                                         [Redis Stream: payments.results]
                                                    │
                                    [API Server consumes & updates order status]
                                                    │
                                         [Notify client via WebSocket/Polling]
```

### 7.3 Payment Command Schema
```go
type PaymentCommand struct {
    CommandID      uuid.UUID   `json:"commandId"`
    IdempotencyKey string      `json:"idempotencyKey"`
    TenantID       uuid.UUID   `json:"tenantId"`
    BusinessID     uuid.UUID   `json:"businessId"`
    OrderID        uuid.UUID   `json:"orderId"`
    Provider       string      `json:"provider"` // "mpesa" | "card" | "cash"
    Amount         decimal.Decimal `json:"amount"`
    Currency       string      `json:"currency"` // "KES"
    PhoneNumber    string      `json:"phoneNumber,omitempty"`
    Metadata       map[string]any `json:"metadata"`
    IssuedAt       time.Time   `json:"issuedAt"`
}
```

### 7.4 Payment Worker (`cmd/payment-worker/main.go`)
```go
func main() {
    ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer cancel()

    // Payment worker has its OWN DB connection, its OWN config
    // Even if main API is down, this keeps processing
    worker := payments.NewWorker(cfg, mpesaClient, paymentRepo, eventPublisher)
    
    g, ctx := errgroup.WithContext(ctx)
    g.Go(func() error { return worker.Run(ctx) })
    
    if err := g.Wait(); err != nil && !errors.Is(err, context.Canceled) {
        log.Fatal(err)
    }
}
```

---

## 8. MULTI-TENANCY MODEL

### 8.1 Data Model
```
User (one account)
 └── Subscription (free | premium | enterprise)
      └── Business 1  ←── tenant
      └── Business 2  ←── tenant
      └── Business N  ←── tenant (premium allows N businesses)

Business
 ├── Members (User → Business role mapping)
 ├── Sales / Orders
 ├── Inventory
 ├── Payments
 └── Reports
```

### 8.2 Subscription Tiers
| Tier | Max Businesses | AI Access | Reports | API Access |
|------|---------------|-----------|---------|------------|
| Free | 1 | No | Basic (P&L only) | No |
| Premium | 5 | Yes | Full suite | Limited |
| Enterprise | Unlimited | Yes | Custom + Export | Full |

### 8.3 Tenant Resolution Middleware
```go
func TenantResolutionMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 1. Extract business ID from route param or header
        businessID := chi.URLParam(r, "businessID")
        if businessID == "" {
            businessID = r.Header.Get("X-Business-ID")
        }
        // 2. Verify caller is a member of this business (from JWT user claims)
        // 3. Inject tenantID + businessID into context
        ctx := context.WithValue(r.Context(), ContextKeyBusinessID, parsedID)
        ctx = context.WithValue(ctx, ContextKeyTenantID, tenantID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### 8.4 Subscription Enforcement (Service Layer)
```go
// internal/tenancy/service.go
func (s *TenancyService) EnforceBusinessLimit(ctx context.Context, userID uuid.UUID) error {
    sub, err := s.repo.GetActiveSubscription(ctx, userID)
    if err != nil { return err }
    
    count, err := s.businessRepo.CountByOwner(ctx, userID)
    if err != nil { return err }
    
    if count >= sub.Plan.MaxBusinesses {
        return ErrBusinessLimitReached
    }
    return nil
}
```

---

## 9. AI MODULE — ASYNC MCP TOOL CALLS

### 9.1 Architecture Goals
- AI requests must **never block** the HTTP response thread
- Background workers pull from a queue, call the LLM with MCP tool context, then cache the result
- Cached results prevent redundant LLM calls for repeated insight types

### 9.2 Full Async Flow

```
[Client] POST /api/v1/ai/insights
        ──▶ Validate, generate requestID, enqueue to Redis Stream
        ◀── 202 Accepted { "requestId": "...", "pollUrl": "/ai/insights/status/{requestId}" }

[AI Worker]
   ├── Pull request from stream
   ├── Identify request type (SALES_INSIGHTS | INVENTORY_ALERT | CASHFLOW_FORECAST | ...)
   ├── Check Redis cache: "ai:{tenantID}:{requestType}:{dateHash}" → HIT? return cached
   ├── Build MCP tool context (query DB for relevant records)
   ├── Call LLM (Anthropic Claude via circuit breaker)
   ├── Parse structured response
   ├── Write to Redis cache (TTL: 1-4 hours depending on type)
   └── Publish result event → [Redis Stream: ai.results]

[API Server] Consumes ai.results, updates status in DB

[Client] GET /api/v1/ai/insights/status/{requestId}
        ◀── { "status": "READY", "result": {...} }   (or "PROCESSING" / "FAILED")
```

### 9.3 Request Type Registry
```go
type AIRequestType string

const (
    AIRequestSalesInsights      AIRequestType = "SALES_INSIGHTS"
    AIRequestInventoryAlerts    AIRequestType = "INVENTORY_ALERTS"
    AIRequestCashFlowForecast   AIRequestType = "CASHFLOW_FORECAST"
    AIRequestExpenseAnalysis    AIRequestType = "EXPENSE_ANALYSIS"
    AIRequestBusinessSummary    AIRequestType = "BUSINESS_SUMMARY"
    AIRequestPricingRecommend   AIRequestType = "PRICING_RECOMMENDATION"
    AIRequestTaxEstimate        AIRequestType = "TAX_ESTIMATE"
    AIRequestCustom             AIRequestType = "CUSTOM"
)
```

### 9.4 MCP Tool Call Integration
```go
// internal/ai/mcp/tools.go
// MCP tools expose DB query capabilities to the LLM
// The LLM decides which tools to call based on the request type

type MCPTool interface {
    Name()        string
    Description() string
    InputSchema() json.RawMessage
    Execute(ctx context.Context, tenantID uuid.UUID, input json.RawMessage) (json.RawMessage, error)
}

// Example tool: GetSalesSummary
type GetSalesSummaryTool struct {
    salesRepo sales.Repository
}

func (t *GetSalesSummaryTool) Execute(ctx context.Context, tenantID uuid.UUID, input json.RawMessage) (json.RawMessage, error) {
    var params struct {
        StartDate string `json:"start_date"`
        EndDate   string `json:"end_date"`
        GroupBy   string `json:"group_by"` // "day" | "week" | "month"
    }
    if err := json.Unmarshal(input, &params); err != nil {
        return nil, err
    }
    summary, err := t.salesRepo.GetSummary(ctx, tenantID, params.StartDate, params.EndDate, params.GroupBy)
    if err != nil {
        return nil, err
    }
    return json.Marshal(summary)
}
```

### 9.5 AI Worker — Go Concurrency Pattern (Worker Pool)
```go
// internal/ai/worker/pool.go
type AIWorkerPool struct {
    workers    int
    jobQueue   <-chan AIJob
    llmClient  LLMClient
    mcpTools   map[string]MCPTool
    cache      CacheClient
    resultBus  EventPublisher
}

func (p *AIWorkerPool) Start(ctx context.Context) {
    var wg sync.WaitGroup
    for i := 0; i < p.workers; i++ {
        wg.Add(1)
        go func(workerID int) {
            defer wg.Done()
            p.runWorker(ctx, workerID)
        }(i)
    }
    wg.Wait()
}

func (p *AIWorkerPool) runWorker(ctx context.Context, id int) {
    for {
        select {
        case <-ctx.Done():
            return
        case job, ok := <-p.jobQueue:
            if !ok {
                return
            }
            if err := p.processJob(ctx, job); err != nil {
                log.Error("ai worker error", "workerID", id, "jobID", job.RequestID, "err", err)
            }
        }
    }
}
```

### 9.6 Cache Key Strategy
```go
func aiCacheKey(tenantID uuid.UUID, requestType AIRequestType, params map[string]string) string {
    // Hash params for stable cache key
    h := sha256.New()
    for _, k := range sortedKeys(params) {
        h.Write([]byte(k + "=" + params[k]))
    }
    return fmt.Sprintf("ai:%s:%s:%x", tenantID, requestType, h.Sum(nil))
}
```

---

## 10. FINANCIAL REPORTS MODULE

### 10.1 Core Reports (MANDATORY)

| Report | Description | Frequency |
|--------|-------------|-----------|
| **Profit & Loss (Income Statement)** | Revenue − COGS − Operating Expenses = Net Profit | Daily/Monthly/Annual |
| **Cash Flow Statement** | Operating + Investing + Financing activities | Monthly |
| **Balance Sheet** | Assets = Liabilities + Equity (snapshot) | Monthly/Quarterly |
| **Sales Report** | Revenue by product, category, time period, staff | Daily/Weekly/Monthly |
| **Inventory Valuation Report** | Stock value (FIFO/LIFO/WAC), turnover rate | Weekly/Monthly |
| **Accounts Receivable Aging** | Outstanding invoices grouped by age (0–30, 31–60, 61–90, 90+ days) | Weekly |
| **Accounts Payable Aging** | Money owed to suppliers, grouped by age | Weekly |
| **Tax Summary Report** | VAT collected, VAT paid, net VAT liability (Kenya VAT 16%) | Monthly |
| **Expense Breakdown Report** | Expenses by category, vendor, cost centre | Monthly |
| **Unit Economics Report** | Revenue per customer, profit per product/SKU | Monthly |

### 10.2 Report Generation Architecture
```go
// internal/reports/service.go
type ReportService interface {
    GeneratePnL(ctx context.Context, req PnLRequest) (*PnLReport, error)
    GenerateCashFlow(ctx context.Context, req CashFlowRequest) (*CashFlowReport, error)
    GenerateBalanceSheet(ctx context.Context, req BalanceSheetRequest) (*BalanceSheetReport, error)
    GenerateSalesReport(ctx context.Context, req SalesReportRequest) (*SalesReport, error)
    GenerateInventoryReport(ctx context.Context, req InventoryReportRequest) (*InventoryReport, error)
    GenerateTaxSummary(ctx context.Context, req TaxSummaryRequest) (*TaxSummaryReport, error)
    ExportToPDF(ctx context.Context, reportID uuid.UUID) (io.Reader, error)
    ExportToExcel(ctx context.Context, reportID uuid.UUID) (io.Reader, error)
}
```

### 10.3 P&L Report Data Model
```go
type PnLReport struct {
    TenantID    uuid.UUID   `json:"tenantId"`
    BusinessID  uuid.UUID   `json:"businessId"`
    Period      DateRange   `json:"period"`
    GeneratedAt time.Time   `json:"generatedAt"`

    Revenue struct {
        Sales          decimal.Decimal `json:"sales"`
        OtherIncome    decimal.Decimal `json:"otherIncome"`
        TotalRevenue   decimal.Decimal `json:"totalRevenue"`
    } `json:"revenue"`

    COGS struct {
        OpeningStock   decimal.Decimal `json:"openingStock"`
        Purchases      decimal.Decimal `json:"purchases"`
        ClosingStock   decimal.Decimal `json:"closingStock"`
        TotalCOGS      decimal.Decimal `json:"totalCogs"`
    } `json:"cogs"`

    GrossProfit    decimal.Decimal `json:"grossProfit"`
    GrossMargin    float64         `json:"grossMarginPercent"`

    OperatingExpenses struct {
        Salaries       decimal.Decimal `json:"salaries"`
        Rent           decimal.Decimal `json:"rent"`
        Utilities      decimal.Decimal `json:"utilities"`
        Marketing      decimal.Decimal `json:"marketing"`
        Other          decimal.Decimal `json:"other"`
        Total          decimal.Decimal `json:"total"`
    } `json:"operatingExpenses"`

    OperatingProfit decimal.Decimal `json:"operatingProfit"`
    NetProfit       decimal.Decimal `json:"netProfit"`
    NetMargin       float64         `json:"netMarginPercent"`
}
```

### 10.4 Report Generation is Async
Heavy reports (balance sheet aggregation, full P&L) should be generated by the worker pool and returned via the same polling pattern as AI requests. Light reports (daily sales summary) can be synchronous.

---

## 11. SECURITY — AUTH, AUTHZ & FINE-GRAINED PERMISSIONS

### 11.1 Library Stack
```bash
go get github.com/golang-jwt/jwt/v5
go get github.com/casbin/casbin/v2
go get github.com/casbin/gorm-adapter/v3
go get golang.org/x/crypto
```

### 11.2 Authentication (JWT)
```go
// internal/auth/service/token.go
type TokenService struct {
    signingKey []byte
    issuer     string
    accessTTL  time.Duration  // 15 minutes
    refreshTTL time.Duration  // 30 days
}

type Claims struct {
    jwt.RegisteredClaims
    UserID     uuid.UUID `json:"uid"`
    TenantID   uuid.UUID `json:"tid"` // owner's tenant
    BusinessID uuid.UUID `json:"bid"` // active business context
    Roles      []string  `json:"roles"`
}

// Middleware validates JWT on every protected request
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := extractBearerToken(r)
        claims, err := tokenSvc.Verify(token)
        if err != nil {
            respondUnauthorized(w)
            return
        }
        ctx := context.WithValue(r.Context(), ContextKeyUserID, claims.UserID)
        ctx = context.WithValue(ctx, ContextKeyTenantID, claims.TenantID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### 11.3 Authorization — Casbin (RBAC + ABAC + ACL)

Casbin supports all three models through a policy file (CONF). Use a hybrid model:
- **RBAC** for predefined roles (OWNER, MANAGER, CASHIER, VIEWER)
- **ACL** for custom per-user permission overrides
- **ABAC** for attribute conditions (e.g., "only access own business records")

```go
// internal/shared/authz/casbin.go
import (
    "github.com/casbin/casbin/v2"
    gormadapter "github.com/casbin/gorm-adapter/v3"
)

func NewEnforcer(db *gorm.DB) (*casbin.Enforcer, error) {
    adapter, err := gormadapter.NewAdapterByDB(db)
    if err != nil { return nil, err }
    
    return casbin.NewEnforcer("config/rbac_model.conf", adapter)
}
```

```ini
# config/rbac_model.conf
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act, eft

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && r.obj == p.obj && r.act == p.act
```

```go
// Policy seeding (initial data migration)
// Format: (role/user, businessID, resource, action)
e.AddPolicies([][]string{
    {"OWNER",   "*",          "reports",   "read"},
    {"OWNER",   "*",          "reports",   "generate"},
    {"OWNER",   "*",          "ai",        "query"},
    {"OWNER",   "*",          "payments",  "initiate"},
    {"MANAGER", "*",          "reports",   "read"},
    {"MANAGER", "*",          "inventory", "write"},
    {"CASHIER", "*",          "sales",     "write"},
    {"CASHIER", "*",          "sales",     "read"},
    {"VIEWER",  "*",          "sales",     "read"},
    // Deny examples
    {"CASHIER", "*",          "reports",   "generate", "deny"},
    {"CASHIER", "*",          "ai",        "query",    "deny"},
})
```

### 11.4 Authorization Middleware
```go
func AuthorizationMiddleware(enforcer *casbin.Enforcer) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            userID, _ := UserIDFromCtx(r.Context())
            businessID, _ := BusinessIDFromCtx(r.Context())
            
            // Map HTTP path to resource/action
            resource, action := routeToResourceAction(r)
            
            allowed, err := enforcer.Enforce(userID.String(), businessID.String(), resource, action)
            if err != nil || !allowed {
                respondForbidden(w)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

### 11.5 User Creation by Business Owner
```go
// POST /api/v1/businesses/{businessID}/members
// Owner can invite members and assign them roles
type InviteMemberRequest struct {
    Email       string   `json:"email" validate:"required,email"`
    Role        string   `json:"role" validate:"required,oneof=MANAGER CASHIER VIEWER"`
    Permissions []string `json:"permissions"` // optional ACL overrides
}

func (s *AuthService) InviteMember(ctx context.Context, ownerID, businessID uuid.UUID, req InviteMemberRequest) error {
    // 1. Enforce OWNER calling this endpoint
    // 2. Create or look up user by email
    // 3. Create BusinessMember record
    // 4. Assign Casbin role: e.AddRoleForUserInDomain(userID, role, businessID)
    // 5. Apply any ACL overrides from req.Permissions
    // 6. Send invitation email
}
```

### 11.6 Additional Security Measures
- **Rate limiting**: Use `golang.org/x/time/rate` per user per endpoint
- **Input validation**: Use `github.com/go-playground/validator/v10` on all request structs
- **SQL injection**: GORM parameterizes all queries; never interpolate user input into raw SQL
- **Secrets**: Use `github.com/spf13/viper` + environment variables; never hardcode credentials
- **TLS**: Enforce HTTPS at the load balancer layer; generate short-lived JWTs
- **Audit log**: Write an append-only `audit_log` table entry for every write operation (via middleware)

---

## 12. GO CONCURRENCY BEST PRACTICES

Treat these as hard rules throughout the codebase:

### 12.1 Goroutine Lifecycle — Always Controllable
```go
// WRONG — goroutine leaks if context is never cancelled
go func() {
    for { doWork() }
}()

// RIGHT — goroutine exits when context is cancelled
go func() {
    for {
        select {
        case <-ctx.Done():
            return
        default:
            doWork()
        }
    }
}()
```

### 12.2 Channel Ownership — Creator Closes
```go
// The goroutine that creates a channel is responsible for closing it.
// Consumer goroutines NEVER close a channel they didn't create.
func producer(ctx context.Context) <-chan Job {
    ch := make(chan Job, 100)
    go func() {
        defer close(ch) // only the producer closes
        for _, job := range jobs {
            select {
            case <-ctx.Done(): return
            case ch <- job:
            }
        }
    }()
    return ch
}
```

### 12.3 Worker Pool Pattern (Standard Template)
```go
func RunWorkerPool(ctx context.Context, workers int, jobs <-chan Job, process func(context.Context, Job) error) error {
    g, ctx := errgroup.WithContext(ctx)
    
    for i := 0; i < workers; i++ {
        g.Go(func() error {
            for {
                select {
                case <-ctx.Done():
                    return ctx.Err()
                case job, ok := <-jobs:
                    if !ok {
                        return nil // channel closed, worker done
                    }
                    if err := process(ctx, job); err != nil {
                        // Log but don't stop pool on individual job failure
                        log.Error("job failed", "err", err)
                    }
                }
            }
        })
    }
    return g.Wait()
}
```

Use `golang.org/x/sync/errgroup` for all worker pool coordination:
```bash
go get golang.org/x/sync
```

### 12.4 Context Propagation — Always Thread Through
```go
// WRONG — context ignored
func (s *Service) DoThing() error { ... }

// RIGHT — context propagated through all layers
func (s *Service) DoThing(ctx context.Context) error { ... }
```

### 12.5 Avoid Shared Mutable State — Use Channels or sync.Mutex
```go
// For simple shared counters, use atomic
var requestCount int64
atomic.AddInt64(&requestCount, 1)

// For complex shared state, protect with mutex
type SafeCache struct {
    mu    sync.RWMutex
    store map[string]any
}
func (c *SafeCache) Get(key string) (any, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    v, ok := c.store[key]
    return v, ok
}
```

### 12.6 Fan-Out / Fan-In (for parallel data fetching)
```go
// Fetch P&L components in parallel, merge results
func (s *ReportService) GeneratePnL(ctx context.Context, req PnLRequest) (*PnLReport, error) {
    type result struct {
        revenue  *Revenue
        expenses *Expenses
        err      error
    }

    revCh := make(chan result, 1)
    expCh := make(chan result, 1)

    go func() {
        rev, err := s.salesRepo.GetRevenueSummary(ctx, req)
        revCh <- result{revenue: rev, err: err}
    }()

    go func() {
        exp, err := s.expenseRepo.GetExpenseSummary(ctx, req)
        expCh <- result{expenses: exp, err: err}
    }()

    revResult := <-revCh
    expResult := <-expCh

    if revResult.err != nil { return nil, revResult.err }
    if expResult.err != nil { return nil, expResult.err }

    return buildPnL(revResult.revenue, expResult.expenses), nil
}
```

### 12.7 Graceful Shutdown
```go
// cmd/api/main.go
func main() {
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()

    srv := &http.Server{
        Addr:    cfg.Addr,
        Handler: NewRouter(modules),
    }

    g, ctx := errgroup.WithContext(ctx)

    g.Go(func() error {
        if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
            return err
        }
        return nil
    })

    g.Go(func() error {
        <-ctx.Done()
        shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
        defer cancel()
        return srv.Shutdown(shutdownCtx)
    })

    // Start background workers
    g.Go(func() error { return outboxRelay.Start(ctx) })
    g.Go(func() error { return aiWorkerPool.Start(ctx) })

    if err := g.Wait(); err != nil {
        log.Fatal("server exited with error", "err", err)
    }
}
```

---

## 13. FULL LIBRARY DEPENDENCY MANIFEST

```go
// go.mod — required dependencies
module github.com/bizsawa/backend

go 1.23

require (
    // HTTP
    github.com/go-chi/chi/v5           v5.x.x
    github.com/go-chi/cors             v1.x.x
    github.com/go-chi/jwtauth/v5       v5.x.x

    // Database
    gorm.io/gorm                        v1.x.x
    gorm.io/driver/postgres             v1.x.x
    github.com/golang-migrate/migrate/v4 v4.x.x

    // Auth & AuthZ
    github.com/golang-jwt/jwt/v5        v5.x.x
    github.com/casbin/casbin/v2         v2.x.x
    github.com/casbin/gorm-adapter/v3   v3.x.x
    golang.org/x/crypto                 v0.x.x

    // Resilience
    github.com/sony/gobreaker/v2        v2.x.x

    // Async & Concurrency
    golang.org/x/sync                   v0.x.x

    // Redis (cache + event streams + idempotency)
    github.com/redis/go-redis/v9        v9.x.x

    // Validation
    github.com/go-playground/validator/v10 v10.x.x

    // Config
    github.com/spf13/viper              v1.x.x

    // Logging
    golang.org/x/exp/slog               // Go 1.21+ built-in: log/slog

    // Decimal arithmetic (avoid float for money)
    github.com/shopspring/decimal       v1.x.x

    // UUID
    github.com/google/uuid              v1.x.x

    // Testing
    github.com/stretchr/testify         v1.x.x
    github.com/testcontainers/testcontainers-go v0.x.x // integration tests with real Postgres/Redis
)
```

---

## 14. ERROR HANDLING CONTRACT

```go
// internal/shared/errors/errors.go
package errors

import (
    "errors"
    "fmt"
    "net/http"
)

type AppError struct {
    Code       string `json:"code"`
    Message    string `json:"message"`
    StatusCode int    `json:"-"`
    Cause      error  `json:"-"`
}

func (e *AppError) Error() string { return fmt.Sprintf("[%s] %s", e.Code, e.Message) }
func (e *AppError) Unwrap() error { return e.Cause }

var (
    ErrNotFound          = &AppError{Code: "NOT_FOUND",           StatusCode: http.StatusNotFound}
    ErrUnauthorized      = &AppError{Code: "UNAUTHORIZED",        StatusCode: http.StatusUnauthorized}
    ErrForbidden         = &AppError{Code: "FORBIDDEN",           StatusCode: http.StatusForbidden}
    ErrConflict          = &AppError{Code: "CONFLICT",            StatusCode: http.StatusConflict}
    ErrUnprocessable     = &AppError{Code: "UNPROCESSABLE",       StatusCode: http.StatusUnprocessableEntity}
    ErrTooManyRequests   = &AppError{Code: "RATE_LIMITED",        StatusCode: http.StatusTooManyRequests}
    ErrPaymentFailed     = &AppError{Code: "PAYMENT_FAILED",      StatusCode: http.StatusPaymentRequired}
    ErrServiceUnavail    = &AppError{Code: "SERVICE_UNAVAILABLE", StatusCode: http.StatusServiceUnavailable}
    ErrBusinessLimitReached = &AppError{Code: "BUSINESS_LIMIT_REACHED", StatusCode: http.StatusForbidden}
)
```

---

## 15. TESTING STRATEGY

### 15.1 Unit Tests
- Test every `service.go` file in isolation using mocked repositories and external clients
- Use `github.com/stretchr/testify/mock`
- 80%+ coverage on service layer

### 15.2 Integration Tests
- Use `testcontainers-go` to spin up real Postgres and Redis for integration tests
- Test outbox relay end-to-end
- Test Casbin policy enforcement

### 15.3 Contract Tests for Payment Worker
- Payment worker and main API communicate via Redis Streams — write contract tests for the event schema

```go
// Example integration test
func TestSaleCreation_WithOutbox(t *testing.T) {
    // Spin up Postgres container
    // Run migrations
    // Create a sale via service
    // Assert outbox_events table has a pending event
    // Run outbox relay once
    // Assert Redis stream has the event
}
```

---

## 16. EXECUTION ORDER FOR THE CODING AGENT

Work in this sequence. Do NOT skip ahead:

1. **Phase 1 — Foundation**
   - Set up `go.mod`, project directory structure, base configs
   - Implement `shared/` packages: errors, db, eventbus, middleware, config
   - Set up GORM connection pool with health checks
   - Set up Redis client
   - Write and run all DB migrations

2. **Phase 2 — Auth & Tenancy**
   - `auth` module: registration, login, JWT issuance, refresh token rotation
   - `tenancy` module: subscription plans, business creation, member invitation
   - `users` module: business-scoped staff accounts, role assignment
   - Casbin enforcer setup, policy seeding, authorization middleware

3. **Phase 3 — Catalogue & CRM**
   - `customers` module: customer profiles, contact history, purchase history
   - `products` module: product catalogue, variants, pricing, category tree

4. **Phase 4 — Core Transactional Modules**
   - `orders` → `sales` → `inventory` → `expenses` → `taxes`
   - Each following Repository → Service → Handler pattern
   - Idempotency keys on order/sale creation
   - Outbox events on every write

5. **Phase 5 — Invoices**
   - Invoice generation (Maroto PDF), delivery status, payment linkage
   - WhatsApp dispatch via whatsmeow (background worker)
   - Scheduled invoice reminders

6. **Phase 6 — Payments (Isolated Worker)**
   - Payment domain model + repository
   - `cmd/payment-worker/` process
   - Mpesa Daraja integration (STK Push, B2C, C2B callbacks) with circuit breaker
   - Idempotency enforcement on every payment command

7. **Phase 7 — Reports Module**
   - P&L, Cash Flow, Balance Sheet computation queries
   - Async report generation via worker pool
   - PDF/Excel export using Maroto + excelize
   - Automated report scheduling + WhatsApp delivery

8. **Phase 8 — Insights & Visualization**
   - `insights` module: background pre-computation, DB storage, cache TTLs
   - `visualizations` module: chart JSON serialization for gifted-charts API

9. **Phase 9 — AI Module & Content Generation**
   - MCP tool registry for all core modules
   - Async AI request queue (Redis Streams)
   - AI worker pool with LLM circuit breaker and result caching
   - Content generation service (product descriptions, business summaries)
   - Structured output with Go generics

10. **Phase 10 — WhatsApp Integration**
    - whatsmeow client bootstrap (QR pairing, session store in Postgres)
    - Message templates for reports, invoices, insights, alerts
    - Delivery status webhooks

11. **Phase 11 — Hardening**
    - Rate limiting per user/endpoint
    - Audit log middleware
    - Full test suite (unit + integration)
    - Docker Compose for local dev (Postgres, Redis, API, Payment worker, WAHA sidecar)
    - `Dockerfile` multi-stage build for production

---

## 17. WHAT THE AGENT MUST NEVER DO

- ❌ Never use `float64` for monetary values — always use `github.com/shopspring/decimal`
- ❌ Never hardcode secrets — all from environment/config
- ❌ Never import one module's `internal/` packages from another module
- ❌ Never spin up unbounded goroutines — always use worker pools or errgroups
- ❌ Never make direct payment processing calls from the main API server — always via events
- ❌ Never skip tenant isolation — every DB query must be scoped by `tenant_id`
- ❌ Never trust `X-Idempotency-Key` header for payment operations without DB-level uniqueness enforcement
- ❌ Never block the HTTP handler thread for AI LLM calls
- ❌ Never return internal error messages or stack traces to the client
- ❌ Never use `interface{}` / `any` where a typed struct is feasible

---

## 18. CORE BUSINESS MODULES — DETAILED SPECIFICATIONS

### 18.1 Products Module (`internal/products/`)

Products are the catalogue items a business sells. Every sale line item, order line, and invoice line references a product.

```go
// internal/products/domain/product.go
type Product struct {
    db.BaseModel
    BusinessID  uuid.UUID       `gorm:"type:uuid;not null;index"`
    SKU         string          `gorm:"uniqueIndex:idx_business_sku"`
    Name        string          `gorm:"not null"`
    Description string
    Category    string          `gorm:"index"`
    Unit        string          // "piece" | "kg" | "litre" | "box"
    CostPrice   decimal.Decimal `gorm:"type:numeric(15,4)"`
    SellingPrice decimal.Decimal `gorm:"type:numeric(15,4)"`
    TaxRateID   *uuid.UUID      `gorm:"type:uuid"` // FK to taxes
    IsActive    bool            `gorm:"default:true"`
    ImageURL    string
    Barcode     string          `gorm:"index"`
    // AI-generated fields
    AIDescription    string    // content generation service output
    AIDescriptionAt  *time.Time
}

type ProductVariant struct {
    db.BaseModel
    ProductID   uuid.UUID       `gorm:"type:uuid;not null"`
    Name        string          // "Red / XL"
    SKU         string
    CostPrice   decimal.Decimal `gorm:"type:numeric(15,4)"`
    SellingPrice decimal.Decimal `gorm:"type:numeric(15,4)"`
    Attributes  datatypes.JSON  // {"color":"red","size":"XL"}
}
```

**Routes**: `GET /products`, `POST /products`, `GET /products/{id}`, `PUT /products/{id}`, `DELETE /products/{id}`, `POST /products/{id}/generate-description` (triggers AI content generation).

---

### 18.2 Customers Module (`internal/customers/`)

CRM for the business. Tracks purchase history, outstanding balances, and provides context to the AI assistant.

```go
type Customer struct {
    db.BaseModel
    BusinessID    uuid.UUID `gorm:"type:uuid;not null;index"`
    Name          string    `gorm:"not null"`
    Phone         string    `gorm:"index"`
    Email         string
    Address       string
    LoyaltyPoints int
    Notes         string
    TotalSpend    decimal.Decimal `gorm:"type:numeric(15,2)"`
    LastPurchaseAt *time.Time
    Tags          datatypes.JSON  // ["vip","wholesale"]
}
```

**MCP tool**: `GetTopCustomers`, `GetCustomerPurchaseHistory` — feeds the AI for personalised insights.

**Routes**: `GET /customers`, `POST /customers`, `GET /customers/{id}`, `GET /customers/{id}/history`.

---

### 18.3 Orders Module (`internal/orders/`)

Orders represent the full lifecycle: `DRAFT → CONFIRMED → FULFILLED → CANCELLED`. A sale is the terminal event of a fulfilled order.

```go
type OrderStatus string

const (
    OrderStatusDraft      OrderStatus = "DRAFT"
    OrderStatusConfirmed  OrderStatus = "CONFIRMED"
    OrderStatusFulfilled  OrderStatus = "FULFILLED"
    OrderStatusCancelled  OrderStatus = "CANCELLED"
    OrderStatusRefunded   OrderStatus = "REFUNDED"
)

type Order struct {
    db.BaseModel
    IdempotencyKey  string      `gorm:"uniqueIndex"`
    BusinessID      uuid.UUID
    CustomerID      *uuid.UUID
    Status          OrderStatus `gorm:"default:'DRAFT'"`
    LineItems       []OrderLineItem
    SubTotal        decimal.Decimal `gorm:"type:numeric(15,2)"`
    TaxAmount       decimal.Decimal `gorm:"type:numeric(15,2)"`
    DiscountAmount  decimal.Decimal `gorm:"type:numeric(15,2)"`
    TotalAmount     decimal.Decimal `gorm:"type:numeric(15,2)"`
    PaymentStatus   string      // "UNPAID" | "PARTIAL" | "PAID"
    Notes           string
}

type OrderLineItem struct {
    db.BaseModel
    OrderID     uuid.UUID
    ProductID   uuid.UUID
    VariantID   *uuid.UUID
    Quantity    decimal.Decimal `gorm:"type:numeric(10,3)"`
    UnitPrice   decimal.Decimal `gorm:"type:numeric(15,4)"`
    TaxRate     decimal.Decimal `gorm:"type:numeric(5,4)"`
    Discount    decimal.Decimal `gorm:"type:numeric(15,2)"`
    LineTotal   decimal.Decimal `gorm:"type:numeric(15,2)"`
}
```

**On `CONFIRMED`**: emit `order.confirmed` event → inventory module decrements stock.
**On `FULFILLED`**: emit `order.fulfilled` event → sales module records the transaction.

---

### 18.4 Sales Module (`internal/sales/`)

Sales records are immutable snapshots of completed transactions. They are the source of truth for all revenue reporting.

```go
type Sale struct {
    db.BaseModel
    IdempotencyKey string    `gorm:"uniqueIndex"`
    BusinessID     uuid.UUID
    OrderID        *uuid.UUID  // can be nil for walk-in POS
    CustomerID     *uuid.UUID
    CashierID      uuid.UUID   // the staff member who processed it
    SaleDate       time.Time   `gorm:"index"`
    LineItems      []SaleLineItem
    Revenue        decimal.Decimal `gorm:"type:numeric(15,2)"`
    COGS           decimal.Decimal `gorm:"type:numeric(15,2)"`
    GrossProfit    decimal.Decimal `gorm:"type:numeric(15,2)"`
    TaxCollected   decimal.Decimal `gorm:"type:numeric(15,2)"`
    PaymentMethod  string      // "MPESA" | "CASH" | "CARD" | "CREDIT"
    ReceiptNumber  string      `gorm:"uniqueIndex"`
    IsVoided       bool
    VoidedAt       *time.Time
    VoidedBy       *uuid.UUID
}
```

**MCP tools exposed**: `GetSalesSummary`, `GetSalesByProduct`, `GetSalesByStaff`, `GetSalesByPaymentMethod`.

---

### 18.5 Users Module (`internal/users/`)

Business-scoped users are staff members operating within a single business. Different from the global `auth` user (the account owner). A global user can be a member of multiple businesses with different roles.

```go
type BusinessMember struct {
    db.BaseModel
    BusinessID  uuid.UUID   `gorm:"type:uuid;not null"`
    UserID      uuid.UUID   `gorm:"type:uuid;not null"`
    Role        string      // OWNER | MANAGER | CASHIER | VIEWER
    IsActive    bool        `gorm:"default:true"`
    InvitedBy   uuid.UUID
    InvitedAt   time.Time
    JoinedAt    *time.Time
    // Casbin policy is the source of truth for permissions
    // This table is for display/management only
}

type UserProfile struct {
    db.BaseModel
    UserID      uuid.UUID   `gorm:"uniqueIndex"`
    FirstName   string
    LastName    string
    Phone       string
    AvatarURL   string
    Timezone    string      `gorm:"default:'Africa/Nairobi'"`
    Language    string      `gorm:"default:'en'"`
}
```

**Routes**: `GET /businesses/{biz}/members`, `POST /businesses/{biz}/members/invite`, `PUT /businesses/{biz}/members/{id}/role`, `DELETE /businesses/{biz}/members/{id}`.

---

### 18.6 Inventory Module (`internal/inventory/`)

```go
type InventoryItem struct {
    db.BaseModel
    BusinessID      uuid.UUID
    ProductID       uuid.UUID    `gorm:"uniqueIndex:idx_biz_product"`
    VariantID       *uuid.UUID
    QuantityOnHand  decimal.Decimal `gorm:"type:numeric(12,3)"`
    ReorderLevel    decimal.Decimal `gorm:"type:numeric(12,3)"`
    ReorderQuantity decimal.Decimal `gorm:"type:numeric(12,3)"`
    LocationCode    string          // e.g. "SHELF-A3"
}

type StockMovement struct {
    db.BaseModel
    BusinessID  uuid.UUID
    ProductID   uuid.UUID
    Type        string  // "PURCHASE" | "SALE" | "ADJUSTMENT" | "RETURN" | "WRITE_OFF"
    Quantity    decimal.Decimal `gorm:"type:numeric(12,3)"` // signed
    Reference   string          // order ID, purchase ID, etc.
    Note        string
    MovedBy     uuid.UUID
}
```

**Background job**: run every 15 minutes, check for stock below `ReorderLevel`, emit `inventory.low_stock` event → AI insights picks it up.

**MCP tools**: `GetLowStockItems`, `GetInventoryValuation`, `GetStockMovements`.

---

### 18.7 Expenses Module (`internal/expenses/`)

```go
type ExpenseCategory string
const (
    ExpenseCategoryRent        ExpenseCategory = "RENT"
    ExpenseCategoryUtilities   ExpenseCategory = "UTILITIES"
    ExpenseCategorySalaries    ExpenseCategory = "SALARIES"
    ExpenseCategoryMarketing   ExpenseCategory = "MARKETING"
    ExpenseCategorySupplies    ExpenseCategory = "SUPPLIES"
    ExpenseCategoryTransport   ExpenseCategory = "TRANSPORT"
    ExpenseCategoryMaintenance ExpenseCategory = "MAINTENANCE"
    ExpenseCategoryTaxes       ExpenseCategory = "TAXES"
    ExpenseCategoryOther       ExpenseCategory = "OTHER"
)

type Expense struct {
    db.BaseModel
    BusinessID    uuid.UUID
    Category      ExpenseCategory `gorm:"index"`
    Description   string
    Amount        decimal.Decimal `gorm:"type:numeric(15,2)"`
    Currency      string          `gorm:"default:'KES'"`
    ExpenseDate   time.Time       `gorm:"index"`
    Vendor        string
    ReceiptURL    string          // uploaded receipt image
    IsTaxDeductible bool
    TaxAmount     decimal.Decimal `gorm:"type:numeric(15,2)"`
    RecordedBy    uuid.UUID
    IsRecurring   bool
    RecurringInterval string    // "MONTHLY" | "WEEKLY" | null
}
```

**MCP tool**: `GetExpenseSummaryByCategory` — used by the P&L report and AI expense analysis.

---

### 18.8 Taxes Module (`internal/taxes/`)

Handles Kenya VAT (16%), excise duties, and custom tax rules per business.

```go
type TaxRule struct {
    db.BaseModel
    BusinessID  uuid.UUID
    Name        string          // "Standard VAT" | "Zero-rated" | "Exempt"
    Rate        decimal.Decimal `gorm:"type:numeric(5,4)"` // 0.1600 = 16%
    TaxType     string          // "VAT" | "EXCISE" | "WITHHOLDING"
    IsDefault   bool
    IsActive    bool            `gorm:"default:true"`
}

type TaxEntry struct {
    db.BaseModel
    BusinessID      uuid.UUID
    ReferenceType   string    // "SALE" | "EXPENSE" | "INVOICE"
    ReferenceID     uuid.UUID
    TaxRuleID       uuid.UUID
    TaxableAmount   decimal.Decimal `gorm:"type:numeric(15,2)"`
    TaxAmount       decimal.Decimal `gorm:"type:numeric(15,2)"`
    Direction       string    // "COLLECTED" | "PAID"
    PeriodYear      int
    PeriodMonth     int
}
```

**Tax Summary computation**:
```go
// internal/taxes/service.go
func (s *TaxService) ComputePeriodSummary(ctx context.Context, businessID uuid.UUID, year, month int) (*TaxSummary, error) {
    collected, _ := s.repo.SumByDirection(ctx, businessID, "COLLECTED", year, month)
    paid, _ := s.repo.SumByDirection(ctx, businessID, "PAID", year, month)
    return &TaxSummary{
        VATCollected:  collected,
        VATInputCredit: paid,
        NetVATLiability: collected.Sub(paid),
        Period: fmt.Sprintf("%d-%02d", year, month),
    }, nil
}
```

---

### 18.9 Invoices Module (`internal/invoices/`)

Invoices are sent to customers for credit sales or professional services. They track payment status and support auto-reminders.

```go
type InvoiceStatus string
const (
    InvoiceStatusDraft    InvoiceStatus = "DRAFT"
    InvoiceStatusSent     InvoiceStatus = "SENT"
    InvoiceStatusViewed   InvoiceStatus = "VIEWED"
    InvoiceStatusPartial  InvoiceStatus = "PARTIAL"
    InvoiceStatusPaid     InvoiceStatus = "PAID"
    InvoiceStatusOverdue  InvoiceStatus = "OVERDUE"
    InvoiceStatusCancelled InvoiceStatus = "CANCELLED"
)

type Invoice struct {
    db.BaseModel
    BusinessID      uuid.UUID
    CustomerID      uuid.UUID
    OrderID         *uuid.UUID
    InvoiceNumber   string          `gorm:"uniqueIndex"`
    Status          InvoiceStatus   `gorm:"index"`
    IssueDate       time.Time
    DueDate         time.Time       `gorm:"index"`
    LineItems       []InvoiceLineItem
    SubTotal        decimal.Decimal `gorm:"type:numeric(15,2)"`
    TaxAmount       decimal.Decimal `gorm:"type:numeric(15,2)"`
    DiscountAmount  decimal.Decimal `gorm:"type:numeric(15,2)"`
    TotalAmount     decimal.Decimal `gorm:"type:numeric(15,2)"`
    AmountPaid      decimal.Decimal `gorm:"type:numeric(15,2)"`
    AmountDue       decimal.Decimal `gorm:"type:numeric(15,2)"`
    Notes           string
    Terms           string
    PDFURL          string
    SentAt          *time.Time
    ViewedAt        *time.Time
    PaidAt          *time.Time
    ReminderSentAt  *time.Time
    // WhatsApp delivery
    WhatsAppSentAt  *time.Time
    WhatsAppStatus  string  // "PENDING" | "DELIVERED" | "READ" | "FAILED"
}
```

**Invoice PDF generation** — use `github.com/johnfercher/maroto/v2`:
```go
// internal/invoices/pdf/generator.go
import (
    "github.com/johnfercher/maroto/v2"
    "github.com/johnfercher/maroto/v2/pkg/components/col"
    "github.com/johnfercher/maroto/v2/pkg/components/row"
    "github.com/johnfercher/maroto/v2/pkg/components/text"
    "github.com/johnfercher/maroto/v2/pkg/config"
)

func GenerateInvoicePDF(inv *Invoice, business *Business, customer *Customer) ([]byte, error) {
    cfg := config.NewBuilder().
        WithPageSize(consts.A4).
        WithOrientation(consts.Portrait).
        Build()
    
    m := maroto.New(cfg)
    
    // Business header, logo, invoice number, dates
    // Line items table with quantity, price, tax, subtotal
    // Totals section
    // Payment instructions (Mpesa Paybill / Till number)
    // Terms & notes footer
    
    doc, err := m.Generate()
    if err != nil { return nil, err }
    return doc.GetBytes(), nil
}
```

**Automated reminder cron** (background worker — runs every hour):
```go
func (w *InvoiceWorker) SendOverdueReminders(ctx context.Context) {
    overdue, _ := w.repo.FindOverdueWithoutRecentReminder(ctx, 24*time.Hour)
    for _, inv := range overdue {
        // Update status to OVERDUE
        // Send WhatsApp reminder via whatsapp module
        // Record ReminderSentAt
    }
}
```

**Routes**: `GET /invoices`, `POST /invoices`, `GET /invoices/{id}`, `POST /invoices/{id}/send`, `POST /invoices/{id}/send-whatsapp`, `POST /invoices/{id}/record-payment`, `GET /invoices/{id}/pdf`.

---

## 19. WHATSAPP MODULE (`internal/whatsapp/`)

### 19.1 Library Choice: whatsmeow + WAHA sidecar (dual-track)

Use **two complementary approaches**:

**Option A — `go.mau.fi/whatsmeow`** (embedded Go library, zero external dependencies):
- Compiles directly into the BizSawa binary
- Full protocol implementation, no intermediate HTTP hop
- Best for high-volume production (reports, invoices)
- Requires QR pairing per business session; store session keys in Postgres

**Option B — WAHA sidecar** (Docker-based REST API, for local dev and lower-volume):
- Run as `docker run devlikeapro/waha` alongside the stack
- Call via HTTP to `http://waha:3000/api/sendText`
- Use for development and testing without protocol complexity

**Architecture decision**: implement whatsmeow as the primary path; wrap both behind a `WhatsAppClient` interface so you can swap implementations per environment.

```bash
go get go.mau.fi/whatsmeow
go get go.mau.fi/libsignal
go get go.mau.fi/util
```

### 19.2 WhatsApp Client Interface
```go
// internal/whatsapp/client.go
type Client interface {
    SendText(ctx context.Context, phone string, message string) error
    SendDocument(ctx context.Context, phone string, filename string, data []byte, caption string) error
    SendTemplate(ctx context.Context, phone string, tmpl MessageTemplate) error
    IsConnected() bool
}

// whatsmeow implementation
type WhatsmeowClient struct {
    client  *whatsmeow.Client
    store   *sqlstore.Container
    logger  waLog.Logger
}

func (c *WhatsmeowClient) SendText(ctx context.Context, phone string, message string) error {
    jid, err := types.ParseJID(phone + "@s.whatsapp.net")
    if err != nil { return err }
    _, err = c.client.SendMessage(ctx, jid, &waE2E.Message{
        Conversation: proto.String(message),
    })
    return err
}

func (c *WhatsmeowClient) SendDocument(ctx context.Context, phone string, filename string, data []byte, caption string) error {
    jid, _ := types.ParseJID(phone + "@s.whatsapp.net")
    resp, err := c.client.Upload(ctx, data, whatsmeow.MediaDocument)
    if err != nil { return err }
    _, err = c.client.SendMessage(ctx, jid, &waE2E.Message{
        DocumentMessage: &waE2E.DocumentMessage{
            URL:           proto.String(resp.URL),
            MediaKey:      resp.MediaKey,
            Mimetype:      proto.String("application/pdf"),
            FileEncSHA256: resp.FileEncSHA256,
            FileSHA256:    resp.FileSHA256,
            FileLength:    proto.Uint64(resp.FileLength),
            FileName:      proto.String(filename),
            Caption:       proto.String(caption),
        },
    })
    return err
}
```

### 19.3 Session Store (Postgres)
```go
// whatsmeow needs a persistent store for session keys
// Use the built-in sqlstore with GORM-managed Postgres

func NewWhatsmeowStore(db *sql.DB) (*sqlstore.Container, error) {
    return sqlstore.New("pgx", db, waLog.Stdout("Database", "WARN", true))
}
```

### 19.4 Message Templates
```go
type MessageTemplate string
const (
    TmplInvoiceDue      MessageTemplate = "invoice_due"
    TmplInvoicePaid     MessageTemplate = "invoice_paid"
    TmplReportReady     MessageTemplate = "report_ready"
    TmplInsightAlert    MessageTemplate = "insight_alert"
    TmplLowStock        MessageTemplate = "low_stock"
    TmplPaymentReceived MessageTemplate = "payment_received"
)

// internal/whatsapp/templates.go
var templates = map[MessageTemplate]string{
    TmplInvoiceDue: `📋 *Invoice Due Reminder*

Hi {{.CustomerName}},

Invoice *#{{.InvoiceNumber}}* for *KES {{.Amount}}* is due on *{{.DueDate}}*.

Please make payment to:
• M-Pesa Paybill: {{.Paybill}}
• Account: {{.AccountNumber}}

_{{.BusinessName}}_`,

    TmplReportReady: `📊 *{{.ReportType}} Report Ready*

Your *{{.Period}}* report for *{{.BusinessName}}* is ready.

• Revenue: KES {{.Revenue}}
• Expenses: KES {{.Expenses}}  
• Net Profit: KES {{.NetProfit}}

The full PDF report is attached.`,
}
```

### 19.5 WhatsApp Worker (Background)
WhatsApp dispatch is always async — never block an HTTP response waiting for WhatsApp delivery.

```go
// Emit to Redis Stream, consumed by notifications worker
type WhatsAppJob struct {
    JobID    uuid.UUID
    Phone    string
    Template MessageTemplate
    Data     map[string]any
    // For document sends:
    Filename string
    FileData []byte
    Caption  string
}
```

---

## 20. INSIGHTS MODULE (`internal/insights/`)

### 20.1 Design: Pre-Compute, Store, Serve

Insights are NOT computed on demand. They are pre-computed by a background worker on a schedule, stored in the DB, and served instantly to the client. This prevents:
- LLM latency blocking the UI
- Repeated identical LLM calls wasting tokens
- Duplicate AI requests from multiple users/devices

```go
type InsightType string
const (
    InsightTypeSalesTrend        InsightType = "SALES_TREND"
    InsightTypeTopProducts       InsightType = "TOP_PRODUCTS"
    InsightTypeLowStock          InsightType = "LOW_STOCK"
    InsightTypeCashFlowAlert     InsightType = "CASHFLOW_ALERT"
    InsightTypeExpenseAnomaly    InsightType = "EXPENSE_ANOMALY"
    InsightTypeCustomerBehavior  InsightType = "CUSTOMER_BEHAVIOR"
    InsightTypeSeasonalPattern   InsightType = "SEASONAL_PATTERN"
    InsightTypePricingOpportunity InsightType = "PRICING_OPPORTUNITY"
    InsightTypeTaxAlert          InsightType = "TAX_ALERT"
)

type Insight struct {
    db.BaseModel
    BusinessID  uuid.UUID   `gorm:"type:uuid;not null;index:idx_insight_lookup"`
    Type        InsightType `gorm:"index:idx_insight_lookup"`
    PeriodKey   string      `gorm:"index:idx_insight_lookup"` // "2026-W24" | "2026-06" | "2026"
    Title       string
    Summary     string      // 1-2 sentence AI summary
    Detail      string      // full markdown AI analysis
    Severity    string      // "INFO" | "WARNING" | "CRITICAL"
    DataPayload datatypes.JSON  // raw numbers that generated this insight
    ExpiresAt   time.Time       `gorm:"index"` // auto-purge stale insights
    IsRead      bool
    // Visualization data (see section 21)
    ChartType   string          // "BAR" | "LINE" | "PIE" | "DONUT"
    ChartJSON   datatypes.JSON  // gifted-charts ready schema
}
```

### 20.2 Insight Generation Schedule

| Insight Type | Schedule | Trigger |
|---|---|---|
| Sales Trend | Every 6 hours | Cron |
| Top Products | Daily at 6am | Cron |
| Low Stock | Every 15 min | Inventory event |
| Cash Flow Alert | Daily at 8am | Cron |
| Expense Anomaly | Daily at 9am | Cron |
| Customer Behavior | Weekly Sunday | Cron |
| Tax Alert | Monthly day 25 | Cron |

### 20.3 Insight Worker Flow
```go
// internal/insights/worker/generator.go
func (w *InsightWorker) GenerateSalesTrend(ctx context.Context, businessID uuid.UUID) error {
    periodKey := currentWeekKey() // "2026-W24"
    
    // 1. Check if fresh insight already exists (skip if <6h old)
    existing, _ := w.repo.FindFreshInsight(ctx, businessID, InsightTypeSalesTrend, periodKey, 6*time.Hour)
    if existing != nil { return nil }
    
    // 2. Pull data via MCP tools (no LLM yet)
    salesData, _ := w.salesRepo.GetWeeklySummary(ctx, businessID)
    
    // 3. Build chart JSON
    chartJSON := buildBarChartJSON(salesData)
    
    // 4. Call LLM for narrative (with circuit breaker)
    narrative, _ := w.llm.GenerateInsightNarrative(ctx, InsightTypeSalesTrend, salesData)
    
    // 5. Write to DB
    return w.repo.Upsert(ctx, &Insight{
        BusinessID:  businessID,
        Type:        InsightTypeSalesTrend,
        PeriodKey:   periodKey,
        Title:       "Sales this week",
        Summary:     narrative.Summary,
        Detail:      narrative.Detail,
        Severity:    narrative.Severity,
        DataPayload: salesData,
        ChartType:   "BAR",
        ChartJSON:   chartJSON,
        ExpiresAt:   time.Now().Add(24 * time.Hour),
    })
}
```

### 20.4 API Endpoints
```
GET  /api/v1/insights                         → paginated list, optional ?type=SALES_TREND
GET  /api/v1/insights/{id}                    → single insight with full detail + chart JSON
POST /api/v1/insights/refresh                 → trigger background refresh (202 Accepted)
PUT  /api/v1/insights/{id}/mark-read          → mark as read
GET  /api/v1/insights/summary                 → dashboard summary (latest per type)
```

---

## 21. VISUALIZATIONS MODULE (`internal/visualizations/`)

### 21.1 Purpose

This module owns the serialization of business data into JSON schemas that match the `react-native-gifted-charts` API. The Go backend pre-builds these schemas so the mobile client can pass them directly to chart components with zero transformation.

The same schemas are also usable with other charting libraries (Victory Native, Chart.js, Recharts) since the data shape is a simple array of value objects.

### 21.2 Gifted Charts Data Schemas

**Bar Chart** (`BarChart data={barData}`):
```go
// internal/visualizations/schema/bar.go
type BarDataItem struct {
    Value      float64 `json:"value"`
    Label      string  `json:"label,omitempty"`
    FrontColor string  `json:"frontColor,omitempty"`
    TopLabel   string  `json:"topLabel,omitempty"`  // shown above bar
    DataPointText string `json:"dataPointText,omitempty"`
}

// Example output for weekly sales:
// [
//   {"value": 45200, "label": "Mon", "frontColor": "#4ABFF4"},
//   {"value": 62000, "label": "Tue", "frontColor": "#4ABFF4"},
//   ...
// ]
```

**Line Chart** (`LineChart data={lineData}`):
```go
type LineDataItem struct {
    Value         float64 `json:"value"`
    Label         string  `json:"label,omitempty"`
    DataPointText string  `json:"dataPointText,omitempty"`
    DataPointColor string `json:"dataPointColor,omitempty"`
}

// Multi-dataset line chart (revenue vs expenses):
type LineChartDataSet struct {
    Data   []LineDataItem `json:"data"`
    Color  string         `json:"color"`
    Curved bool           `json:"curved"`
    Area   bool           `json:"areaChart,omitempty"`
}
```

**Pie / Donut Chart** (`PieChart data={pieData}`):
```go
type PieDataItem struct {
    Value   float64 `json:"value"`
    Color   string  `json:"color"`
    Text    string  `json:"text,omitempty"`   // label on slice
    Label   string  `json:"label,omitempty"`  // legend label
    Focused bool    `json:"focused,omitempty"` // highlighted slice
}
```

**Stacked Bar Chart** (for revenue breakdown):
```go
type StackedBarItem struct {
    Stacks []struct {
        Value float64 `json:"value"`
        Color string  `json:"color"`
        Label string  `json:"label"`
    } `json:"stacks"`
    Label string `json:"label"`
}
```

### 21.3 Standard Chart Envelopes (API Response)

All visualization endpoints return a consistent envelope so the client knows exactly what to render:

```go
// internal/visualizations/schema/envelope.go
type ChartResponse struct {
    ChartType   string          `json:"chartType"`   // "BAR" | "LINE" | "PIE" | "DONUT" | "STACKED_BAR" | "AREA"
    Title       string          `json:"title"`
    Subtitle    string          `json:"subtitle"`
    Period      string          `json:"period"`
    Currency    string          `json:"currency"`    // "KES"
    Data        json.RawMessage `json:"data"`        // typed per ChartType
    DataSets    json.RawMessage `json:"dataSets,omitempty"` // for multi-line charts
    MetaStats   ChartMetaStats  `json:"metaStats"`
    GeneratedAt time.Time       `json:"generatedAt"`
}

type ChartMetaStats struct {
    Total        float64 `json:"total"`
    Average      float64 `json:"average"`
    Max          float64 `json:"max"`
    Min          float64 `json:"min"`
    ChangePercent float64 `json:"changePercent"` // vs prior period
    Trend        string  `json:"trend"`          // "UP" | "DOWN" | "FLAT"
}
```

### 21.4 Pre-Built Chart Builder Functions

```go
// internal/visualizations/builder/sales.go

// WeeklySalesBarChart returns a BAR chart of daily sales for the current week
func WeeklySalesBarChart(dailySales []SalesDayTotal) ChartResponse {
    colors := []string{"#4ABFF4","#79C3DB","#28B2B3","#4ADDBA","#91E3E3","#4ABFF4","#79C3DB"}
    items := make([]BarDataItem, len(dailySales))
    var total float64
    for i, d := range dailySales {
        v, _ := d.Revenue.Float64()
        items[i] = BarDataItem{
            Value:      v,
            Label:      d.Day.Format("Mon"),
            FrontColor: colors[i%len(colors)],
            TopLabel:   fmt.Sprintf("%.0f", v/1000) + "K",
        }
        total += v
    }
    return ChartResponse{
        ChartType: "BAR",
        Title:     "Sales This Week",
        Data:      mustMarshal(items),
        MetaStats: ChartMetaStats{Total: total, Average: total / float64(len(items))},
    }
}

// ExpenseCategoryPieChart returns PIE data for expense breakdown
func ExpenseCategoryPieChart(expensesByCategory []ExpenseCategoryTotal) ChartResponse {
    palette := []string{"#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8"}
    var total float64
    items := make([]PieDataItem, len(expensesByCategory))
    for i, e := range expensesByCategory {
        v, _ := e.Amount.Float64()
        items[i] = PieDataItem{
            Value: v,
            Color: palette[i%len(palette)],
            Label: string(e.Category),
            Text:  fmt.Sprintf("%.0f%%", 0), // computed after total
        }
        total += v
    }
    // Fill percentages
    for i := range items {
        items[i].Text = fmt.Sprintf("%.1f%%", items[i].Value/total*100)
    }
    return ChartResponse{ChartType: "PIE", Title: "Expenses by Category", Data: mustMarshal(items)}
}

// RevenueVsExpensesLineChart returns dual-dataset LINE chart
func RevenueVsExpensesLineChart(monthly []MonthlyPnLSummary) ChartResponse {
    var revData, expData []LineDataItem
    for _, m := range monthly {
        rev, _ := m.Revenue.Float64()
        exp, _ := m.Expenses.Float64()
        label := m.Month.Format("Jan")
        revData = append(revData, LineDataItem{Value: rev, Label: label})
        expData = append(expData, LineDataItem{Value: exp, Label: label})
    }
    datasets := []LineChartDataSet{
        {Data: revData, Color: "#4ABFF4", Curved: true},
        {Data: expData, Color: "#FF6B6B", Curved: true},
    }
    return ChartResponse{ChartType: "LINE", Title: "Revenue vs Expenses", DataSets: mustMarshal(datasets)}
}
```

### 21.5 Visualization API Endpoints

```
GET /api/v1/visualizations/sales/weekly          → BAR chart, current week daily sales
GET /api/v1/visualizations/sales/monthly         → BAR chart, monthly revenue for current year
GET /api/v1/visualizations/expenses/by-category  → PIE chart, current month expense breakdown
GET /api/v1/visualizations/revenue-vs-expenses   → LINE chart, last 12 months dual dataset
GET /api/v1/visualizations/top-products          → BAR chart, top 10 by revenue
GET /api/v1/visualizations/inventory/turnover    → BAR chart, turnover ratios by category
GET /api/v1/visualizations/cashflow              → AREA chart, daily cash position (rolling 30 days)
GET /api/v1/visualizations/customers/by-spend    → BAR chart, top customers by total spend
GET /api/v1/visualizations/tax/collected-vs-paid → STACKED_BAR, VAT collected vs input credit

# Query params supported on all:
?period=THIS_WEEK|THIS_MONTH|THIS_YEAR|LAST_30_DAYS|CUSTOM
&from=2026-01-01&to=2026-06-30  (when period=CUSTOM)
```

### 21.6 Inventory Turnover Ratio

A specific insight many POS businesses need:
```go
// Turnover ratio = COGS / Average Inventory Value
// High ratio = fast-moving stock (good)
// Low ratio = slow-moving stock (cash tied up)
type TurnoverRatioItem struct {
    Category     string  `json:"label"`
    TurnoverRate float64 `json:"value"`
    FrontColor   string  `json:"frontColor"` // green if >4, amber if 2-4, red if <2
}
```

---

## 22. AI CONTENT GENERATION SERVICE (`internal/ai/content/`)

### 22.1 Content Types Supported

| Content Type | Input | Output | Schedule |
|---|---|---|---|
| Product description | Product name, category, price, existing desc | 2-3 sentence rich description | On-demand |
| Business summary | Business profile, top products, recent sales | 1 paragraph about what business does | Weekly |
| Invoice payment message | Invoice details | WhatsApp-ready payment request message | On-demand |
| Low stock alert message | Product name, qty, reorder level | Natural language alert | On inventory event |
| Monthly performance summary | P&L data | Narrative business health report | Monthly |
| Customer thank-you message | Customer name, purchase history | Personalised follow-up | On-demand |
| Pricing recommendation | Product, competitors, margin analysis | "Consider adjusting price to X because..." | Weekly |

### 22.2 Content Generation Service
```go
// internal/ai/content/service.go
type ContentService struct {
    llm        LLMClient
    cb         *gobreaker.CircuitBreaker[*ContentResult]
    cache      CacheClient
    templates  map[ContentType]PromptTemplate
}

type ContentType string
const (
    ContentProductDescription     ContentType = "PRODUCT_DESCRIPTION"
    ContentBusinessSummary        ContentType = "BUSINESS_SUMMARY"
    ContentInvoicePaymentMsg      ContentType = "INVOICE_PAYMENT_MSG"
    ContentLowStockAlert          ContentType = "LOW_STOCK_ALERT"
    ContentMonthlyPerfSummary     ContentType = "MONTHLY_PERF_SUMMARY"
    ContentCustomerThankYou       ContentType = "CUSTOMER_THANK_YOU"
    ContentPricingRecommendation  ContentType = "PRICING_RECOMMENDATION"
)

type ContentRequest struct {
    Type       ContentType
    BusinessID uuid.UUID
    Locale     string    // "en" | "sw" (Swahili support)
    Context    map[string]any
}

type ContentResult struct {
    Content     string
    TokensUsed  int
    GeneratedAt time.Time
    CacheHit    bool
}

func (s *ContentService) Generate(ctx context.Context, req ContentRequest) (*ContentResult, error) {
    // 1. Build cache key from type + context hash
    cacheKey := contentCacheKey(req)
    
    // 2. Check cache (product descriptions cached for 7 days)
    if cached := s.cache.Get(ctx, cacheKey); cached != nil {
        return &ContentResult{Content: cached.Value, CacheHit: true}, nil
    }
    
    // 3. Build prompt from template + context
    prompt := s.templates[req.Type].Render(req.Context)
    
    // 4. Call LLM with circuit breaker
    result, err := s.cb.Execute(func() (*ContentResult, error) {
        return s.llm.Complete(ctx, prompt, LLMOptions{
            MaxTokens:   500,
            Temperature: 0.7,
        })
    })
    if err != nil { return nil, err }
    
    // 5. Cache and return
    s.cache.Set(ctx, cacheKey, result.Content, contentCacheTTL(req.Type))
    return result, nil
}
```

### 22.3 Structured Output for AI (using Go generics)
For insights that need structured data back from the LLM, use typed extraction:

```go
// internal/ai/structured/extractor.go
type InsightNarrative struct {
    Summary  string `json:"summary"`  // 1-2 sentences
    Detail   string `json:"detail"`   // full markdown analysis
    Severity string `json:"severity"` // "INFO" | "WARNING" | "CRITICAL"
    Actions  []string `json:"actions"` // recommended actions
}

func ExtractStructured[T any](ctx context.Context, llm LLMClient, prompt string) (*T, error) {
    schemaPrompt := fmt.Sprintf(`%s

Respond ONLY with valid JSON matching this schema (no markdown fences, no preamble):
%s`, prompt, generateJSONSchema[T]())
    
    raw, err := llm.Complete(ctx, schemaPrompt, LLMOptions{Temperature: 0.1})
    if err != nil { return nil, err }
    
    var result T
    // Strip any accidental markdown fences before parsing
    cleaned := strings.TrimPrefix(strings.TrimSuffix(strings.TrimSpace(raw.Content), "```"), "```json")
    if err := json.Unmarshal([]byte(cleaned), &result); err != nil {
        return nil, fmt.Errorf("LLM returned invalid JSON: %w", err)
    }
    return &result, nil
}
```

---

## 23. WHATSAPP REPORT AUTOMATION

### 23.1 Report Delivery Schedule (Per Business, Configurable)

```go
type ReportSchedule struct {
    db.BaseModel
    BusinessID     uuid.UUID
    ReportType     string    // "DAILY_SALES" | "WEEKLY_SUMMARY" | "MONTHLY_PNL"
    Schedule       string    // cron expression: "0 20 * * *" = daily 8pm
    RecipientPhone string    // WhatsApp number of the owner
    IsActive       bool
    LastSentAt     *time.Time
    Format         string    // "SUMMARY_TEXT" | "PDF_ATTACHMENT"
}
```

### 23.2 Automated Dispatch Flow

```
[Cron trigger fires]
        │
        ▼
[Report Worker: generate report]
        │
        ├── Light report (daily sales) → format as WhatsApp text template
        │
        └── Heavy report (monthly P&L) → generate Maroto PDF → attach as document
        │
        ▼
[Emit WhatsAppJob to Redis Stream]
        │
        ▼
[WhatsApp Worker: whatsmeow.SendMessage() or whatsmeow.SendDocument()]
        │
        ▼
[Update ReportSchedule.LastSentAt + delivery status]
```

### 23.3 WhatsApp Report Text (Daily Sales Example)
```
📊 *Daily Sales Summary — {{.BusinessName}}*
📅 {{.Date}}

💰 Total Revenue: *KES {{.Revenue}}*
🛒 Total Orders: *{{.OrderCount}}*
👤 New Customers: *{{.NewCustomers}}*

📦 Top Product: *{{.TopProduct}}* (KES {{.TopProductRevenue}})

💳 Payment Methods:
• M-Pesa: {{.MpesaPercent}}%
• Cash: {{.CashPercent}}%

{{if .InsightAlert}}
⚠️ Alert: {{.InsightAlert}}
{{end}}

_Powered by BizSawa AI_
```

---

## 24. UPDATED DEPENDENCY MANIFEST (v2)

Add these to the existing `go.mod`:

```go
// WhatsApp
go.mau.fi/whatsmeow        // latest — whatsmeow multidevice Go library
go.mau.fi/libsignal        // required by whatsmeow
go.mau.fi/util             // required by whatsmeow

// PDF Generation
github.com/johnfercher/maroto/v2  // grid-based PDF generator (replaces gofpdf)
github.com/xuri/excelize/v2       // Excel reports

// Invoice generation (alternative, simpler)
github.com/angelodlfrtr/go-invoice-generator  // lightweight invoice-specific PDF

// GORM JSON column support
gorm.io/datatypes            // datatypes.JSON field type

// Cron scheduler (for insight + report automation)
github.com/robfig/cron/v3   // cron expression scheduler

// Swahili locale and formatting
golang.org/x/text           // language tag, number formatting
```

```bash
# Install all new dependencies
go get go.mau.fi/whatsmeow@latest
go get github.com/johnfercher/maroto/v2@latest
go get github.com/xuri/excelize/v2@latest
go get gorm.io/datatypes@latest
go get github.com/robfig/cron/v3@latest
```

---

## 25. UPDATED CASBIN POLICIES (new modules)

```go
// Additional Casbin policies for new modules
e.AddPolicies([][]string{
    // Products
    {"OWNER",   "*", "products",       "write"},
    {"MANAGER", "*", "products",       "write"},
    {"CASHIER", "*", "products",       "read"},
    {"VIEWER",  "*", "products",       "read"},

    // Customers
    {"OWNER",   "*", "customers",      "write"},
    {"MANAGER", "*", "customers",      "write"},
    {"CASHIER", "*", "customers",      "write"},
    {"VIEWER",  "*", "customers",      "read"},

    // Orders & Sales
    {"CASHIER", "*", "orders",         "write"},
    {"CASHIER", "*", "sales",          "write"},

    // Expenses & Taxes (finance team only)
    {"OWNER",   "*", "expenses",       "write"},
    {"MANAGER", "*", "expenses",       "write"},
    {"CASHIER", "*", "expenses",       "write"},
    {"OWNER",   "*", "taxes",          "write"},
    {"MANAGER", "*", "taxes",          "read"},

    // Invoices
    {"OWNER",   "*", "invoices",       "write"},
    {"MANAGER", "*", "invoices",       "write"},
    {"CASHIER", "*", "invoices",       "read"},

    // Insights & Visualizations (all can read)
    {"OWNER",   "*", "insights",       "read"},
    {"MANAGER", "*", "insights",       "read"},
    {"CASHIER", "*", "insights",       "read"},

    // Content generation (premium only — enforced at subscription tier level)
    {"OWNER",   "*", "ai.content",     "generate"},
    {"MANAGER", "*", "ai.content",     "generate"},

    // WhatsApp settings
    {"OWNER",   "*", "whatsapp",       "configure"},
    {"MANAGER", "*", "whatsapp",       "configure"},
})
```


---

## 26. WAHA HTTP CLIENT — WhatsApp Delivery (Alternative to whatsmeow)

### 26.1 What WAHA Is

WAHA is a self-hosted WhatsApp HTTP API (REST API) that runs in a Docker container. The Core version is always free with no limits on messages or time. Under the hood it runs a real instance of WhatsApp Web. WAHA ships with three engines: WEBJS (browser-based), NOWEB (websocket Node.js), and **GOWS** (websocket Go — the most relevant for a Go stack).

GOWA (the Go-native variant) is built with Golang for optimised memory management, speed, and scalability — making it ideal for deployment on lightweight systems or containerised infrastructures.

### 26.2 Why Dual-Track (whatsmeow + WAHA)

| Concern | whatsmeow (embedded) | WAHA sidecar |
|---------|----------------------|-------------|
| Deployment complexity | Low — compiled in | Medium — extra Docker container |
| Dev/test setup | Must scan QR in code | Swagger UI on port 3000 |
| Protocol updates | Must update Go dep | Update Docker image |
| Multi-session (N businesses) | Manual session pool | Built-in session management |
| Recommended for | Production / high-volume | Local dev, testing, low-volume |

### 26.3 WAHA HTTP Client Implementation

```go
// internal/whatsapp/waha/client.go
// Used when WHATSAPP_DRIVER=waha in environment config

package waha

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type WAHAClient struct {
    baseURL    string      // e.g. "http://waha:3000"
    sessionID  string      // e.g. "bizsawa-default"
    httpClient *http.Client
}

func New(baseURL, sessionID string) *WAHAClient {
    return &WAHAClient{
        baseURL:   baseURL,
        sessionID: sessionID,
        httpClient: &http.Client{Timeout: 15 * time.Second},
    }
}

// SendText sends a plain-text WhatsApp message via WAHA REST API
// WAHA endpoint: POST /api/sendText
func (c *WAHAClient) SendText(ctx context.Context, phone, message string) error {
    payload := map[string]any{
        "session":  c.sessionID,
        "chatId":   phone + "@c.us",
        "text":     message,
    }
    return c.post(ctx, "/api/sendText", payload)
}

// SendDocument sends a file (PDF report, invoice) as a WhatsApp document
// WAHA endpoint: POST /api/sendFile
func (c *WAHAClient) SendDocument(ctx context.Context, phone, filename string, data []byte, caption string) error {
    // WAHA expects base64-encoded file content
    import "encoding/base64"
    payload := map[string]any{
        "session": c.sessionID,
        "chatId":  phone + "@c.us",
        "file": map[string]any{
            "mimetype": "application/pdf",
            "filename": filename,
            "data":     base64.StdEncoding.EncodeToString(data),
        },
        "caption": caption,
    }
    return c.post(ctx, "/api/sendFile", payload)
}

func (c *WAHAClient) post(ctx context.Context, path string, payload any) error {
    body, err := json.Marshal(payload)
    if err != nil { return err }

    req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
    if err != nil { return err }
    req.Header.Set("Content-Type", "application/json")

    resp, err := c.httpClient.Do(req)
    if err != nil { return err }
    defer resp.Body.Close()

    if resp.StatusCode >= 400 {
        return fmt.Errorf("WAHA API error: %s", resp.Status)
    }
    return nil
}

func (c *WAHAClient) IsConnected() bool {
    resp, err := c.httpClient.Get(c.baseURL + "/api/sessions/" + c.sessionID)
    if err != nil { return false }
    defer resp.Body.Close()
    return resp.StatusCode == 200
}
```

### 26.4 Environment-Based Driver Selection

```go
// internal/whatsapp/factory.go
func NewClientFromConfig(cfg Config) (Client, error) {
    switch cfg.Driver {
    case "waha":
        return waha.New(cfg.WAHABaseURL, cfg.WAHASessionID), nil
    case "whatsmeow":
        return whatsmeow.New(cfg.DBConn, cfg.Logger)
    default:
        return nil, fmt.Errorf("unknown WhatsApp driver: %s", cfg.Driver)
    }
}
```

```env
# .env
WHATSAPP_DRIVER=waha              # or "whatsmeow"
WAHA_BASE_URL=http://waha:3000
WAHA_SESSION_ID=bizsawa-prod
```

```yaml
# docker-compose.yml (dev)
services:
  waha:
    image: devlikeapro/waha
    ports:
      - "3000:3000"
    environment:
      WHATSAPP_DEFAULT_ENGINE: GOWS  # Go-based engine, best for Go stacks
```

### 26.5 Circuit Breaker Around WAHA

WAHA is an external HTTP call — always wrap with a circuit breaker:

```go
type resilientWAHAClient struct {
    client *WAHAClient
    cb     *gobreaker.CircuitBreaker[struct{}]
}

func (r *resilientWAHAClient) SendText(ctx context.Context, phone, msg string) error {
    _, err := r.cb.Execute(func() (struct{}, error) {
        return struct{}{}, r.client.SendText(ctx, phone, msg)
    })
    return err
}
```

---

## 27. COMPLETE GIFTED CHARTS JSON SCHEMA REFERENCE

This section documents the exact JSON field shapes produced by the `internal/visualizations/` module. The mobile app can consume them directly as `data={}` props.

### 27.1 BarChart / Horizontal BarChart Data Item

```go
// internal/visualizations/schema/bar.go
// Maps directly to react-native-gifted-charts BarChart `data` prop
type BarDataItem struct {
    Value          float64 `json:"value"`                    // REQUIRED — numeric bar height
    Label          string  `json:"label,omitempty"`          // X-axis label below bar
    FrontColor     string  `json:"frontColor,omitempty"`     // Bar fill colour (hex)
    GradientColor  string  `json:"gradientColor,omitempty"`  // Top gradient colour (hex)
    TopLabel       string  `json:"topLabel,omitempty"`       // Small text above bar
    TopLabelStyle  any     `json:"topLabelStyle,omitempty"`  // RN style object for topLabel
    DataPointText  string  `json:"dataPointText,omitempty"`  // Text on data point (line charts)
    LabelTextStyle any     `json:"labelTextStyle,omitempty"` // RN style object for label
    ShowXAxisIndex bool    `json:"showXAxisIndex,omitempty"` // Show tick mark
    Spacing        float64 `json:"spacing,omitempty"`        // Gap after this bar
    // Stacked bars only:
    Stacks []StackItem `json:"stacks,omitempty"`
}

type StackItem struct {
    Value       float64 `json:"value"`
    Color       string  `json:"color"`
    MarginBottom float64 `json:"marginBottom,omitempty"`
    Label       string  `json:"label,omitempty"`
}

// Stacked bar outer item wrapper
type StackedBarItem struct {
    Stacks []StackItem `json:"stacks"`
    Label  string      `json:"label,omitempty"`
}
```

**Example — weekly sales bar data:**
```json
[
  {"value": 45200, "label": "Mon", "frontColor": "#4ABFF4", "topLabel": "45K"},
  {"value": 62000, "label": "Tue", "frontColor": "#4ABFF4", "topLabel": "62K"},
  {"value": 38500, "label": "Wed", "frontColor": "#79C3DB", "topLabel": "38K"},
  {"value": 71000, "label": "Thu", "frontColor": "#4ABFF4", "topLabel": "71K"},
  {"value": 55000, "label": "Fri", "frontColor": "#4ABFF4", "topLabel": "55K"},
  {"value": 89000, "label": "Sat", "frontColor": "#28B2B3", "topLabel": "89K"},
  {"value": 32000, "label": "Sun", "frontColor": "#79C3DB", "topLabel": "32K"}
]
```

**Example — revenue vs expenses stacked bar:**
```json
[
  {"label": "Jan", "stacks": [{"value": 85000, "color": "#4ABFF4", "label": "Revenue"}, {"value": 52000, "color": "#FF6B6B", "label": "Expenses"}]},
  {"label": "Feb", "stacks": [{"value": 91000, "color": "#4ABFF4", "label": "Revenue"}, {"value": 48000, "color": "#FF6B6B", "label": "Expenses"}]}
]
```

---

### 27.2 LineChart / AreaChart Data Item

```go
// internal/visualizations/schema/line.go
// Maps to react-native-gifted-charts LineChart `data` prop
type LineDataItem struct {
    Value          float64 `json:"value"`
    Label          string  `json:"label,omitempty"`
    DataPointText  string  `json:"dataPointText,omitempty"`  // label at point
    DataPointColor string  `json:"dataPointColor,omitempty"` // point dot colour
    DataPointShape string  `json:"dataPointShape,omitempty"` // "circular" | "rectangular"
    LabelTextStyle any     `json:"labelTextStyle,omitempty"`
    ShowStrip      bool    `json:"showStrip,omitempty"`      // vertical line at point
    StripColor     string  `json:"stripColor,omitempty"`
    StripWidth     float64 `json:"stripWidth,omitempty"`
    // For pointer tooltip:
    LabelComponent string  `json:"labelComponent,omitempty"` // custom tooltip component name
}

// Multi-dataset line chart (revenue vs expenses, etc.)
// Mobile app uses the `dataSets` prop on <LineChart> when multiple lines needed
type LineChartDataSet struct {
    Data              []LineDataItem `json:"data"`
    Color             string         `json:"color"`             // line colour
    Thickness         float64        `json:"thickness,omitempty"`
    Curved            bool           `json:"curved,omitempty"`
    IsAnimated        bool           `json:"isAnimated,omitempty"`
    AnimationDuration float64        `json:"animationDuration,omitempty"`
    StartFillColor    string         `json:"startFillColor,omitempty"`   // area chart gradient
    EndFillColor      string         `json:"endFillColor,omitempty"`
    StartOpacity      float64        `json:"startOpacity,omitempty"`
    EndOpacity        float64        `json:"endOpacity,omitempty"`
}
```

**Example — cash flow area chart (30 days):**
```json
[
  {"value": 120000, "label": "Jun 1", "dataPointColor": "#4ABFF4"},
  {"value": 95000,  "label": "Jun 2", "dataPointColor": "#FF6B6B"},
  {"value": 140000, "label": "Jun 3", "dataPointColor": "#4ABFF4"}
]
```

**Example — revenue vs expenses multi-dataset:**
```json
{
  "dataSets": [
    {
      "data": [{"value": 85000, "label": "Jan"}, {"value": 91000, "label": "Feb"}],
      "color": "#4ABFF4",
      "curved": true,
      "thickness": 2
    },
    {
      "data": [{"value": 52000, "label": "Jan"}, {"value": 48000, "label": "Feb"}],
      "color": "#FF6B6B",
      "curved": true,
      "thickness": 2
    }
  ]
}
```

---

### 27.3 PieChart / DonutChart Data Item

```go
// internal/visualizations/schema/pie.go
// Maps to react-native-gifted-charts PieChart `data` prop
type PieDataItem struct {
    Value          float64 `json:"value"`                   // REQUIRED — slice size
    Color          string  `json:"color"`                   // slice fill colour (hex)
    Text           string  `json:"text,omitempty"`          // label shown on the slice (e.g. "32%")
    Label          string  `json:"label,omitempty"`         // legend / tooltip label
    Focused        bool    `json:"focused,omitempty"`       // highlight this slice on load
    ShiftX         float64 `json:"shiftX,omitempty"`        // explode slice outward (x)
    ShiftY         float64 `json:"shiftY,omitempty"`        // explode slice outward (y)
    TextColor      string  `json:"textColor,omitempty"`     // colour of `text` label
    TextSize       float64 `json:"textSize,omitempty"`      // font size of `text` label
    GradientColor  string  `json:"gradientColor,omitempty"` // radial gradient (showGradient must be true)
}
```

**Example — expense category breakdown:**
```json
[
  {"value": 32000, "color": "#FF6B6B", "label": "Rent",       "text": "32%"},
  {"value": 18500, "color": "#4ECDC4", "label": "Stock",      "text": "18.5%"},
  {"value": 14000, "color": "#45B7D1", "label": "Salaries",   "text": "14%"},
  {"value": 9500,  "color": "#96CEB4", "label": "Utilities",  "text": "9.5%"},
  {"value": 12000, "color": "#FFEAA7", "label": "Marketing",  "text": "12%", "focused": true},
  {"value": 14000, "color": "#DDA0DD", "label": "Other",      "text": "14%"}
]
```

---

### 27.4 Complete ChartResponse Envelope

Every visualization endpoint returns this wrapper — the mobile app reads `chartType` to decide which chart component to render:

```go
// internal/visualizations/schema/envelope.go
type ChartType string
const (
    ChartTypeBar        ChartType = "BAR"
    ChartTypeLine       ChartType = "LINE"
    ChartTypeArea       ChartType = "AREA"
    ChartTypePie        ChartType = "PIE"
    ChartTypeDonut      ChartType = "DONUT"
    ChartTypeStackedBar ChartType = "STACKED_BAR"
)

type ChartResponse struct {
    ChartType   ChartType       `json:"chartType"`
    Title       string          `json:"title"`
    Subtitle    string          `json:"subtitle,omitempty"`
    Period      string          `json:"period"`
    PeriodLabel string          `json:"periodLabel"`   // "Mon 16 Jun — Sun 22 Jun 2026"
    Currency    string          `json:"currency"`      // "KES"
    // BAR, PIE, DONUT, AREA → use `data`
    Data        json.RawMessage `json:"data,omitempty"`
    // Multi-dataset LINE → use `dataSets`
    DataSets    json.RawMessage `json:"dataSets,omitempty"`
    MetaStats   ChartMetaStats  `json:"metaStats"`
    GeneratedAt time.Time       `json:"generatedAt"`
    CachedUntil *time.Time      `json:"cachedUntil,omitempty"` // lets client know when to refetch
}

type ChartMetaStats struct {
    Total         float64 `json:"total"`
    Average       float64 `json:"average"`
    Max           float64 `json:"max"`
    Min           float64 `json:"min"`
    ChangePercent float64 `json:"changePercent"` // % change vs prior period (positive = growth)
    Trend         string  `json:"trend"`         // "UP" | "DOWN" | "FLAT"
    DataPoints    int     `json:"dataPoints"`
}
```

**Full envelope example — weekly sales:**
```json
{
  "chartType": "BAR",
  "title": "Sales This Week",
  "subtitle": "Daily revenue in KES",
  "period": "THIS_WEEK",
  "periodLabel": "Mon 16 Jun — Sun 22 Jun 2026",
  "currency": "KES",
  "data": [
    {"value": 45200, "label": "Mon", "frontColor": "#4ABFF4", "topLabel": "45K"},
    {"value": 62000, "label": "Tue", "frontColor": "#4ABFF4", "topLabel": "62K"},
    {"value": 38500, "label": "Wed", "frontColor": "#79C3DB", "topLabel": "38K"},
    {"value": 71000, "label": "Thu", "frontColor": "#4ABFF4", "topLabel": "71K"},
    {"value": 55000, "label": "Fri", "frontColor": "#4ABFF4", "topLabel": "55K"},
    {"value": 89000, "label": "Sat", "frontColor": "#28B2B3", "topLabel": "89K"},
    {"value": 32000, "label": "Sun", "frontColor": "#79C3DB", "topLabel": "32K"}
  ],
  "metaStats": {
    "total": 392700,
    "average": 56100,
    "max": 89000,
    "min": 32000,
    "changePercent": 12.4,
    "trend": "UP",
    "dataPoints": 7
  },
  "generatedAt": "2026-06-19T08:00:00Z",
  "cachedUntil": "2026-06-19T09:00:00Z"
}
```

### 27.5 Mobile Integration Guide (for frontend team)

The mobile app should use this pattern for every chart:

```typescript
// Example React Native usage pattern
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';

interface ChartResponse {
  chartType: 'BAR' | 'LINE' | 'AREA' | 'PIE' | 'DONUT' | 'STACKED_BAR';
  title: string;
  subtitle?: string;
  period: string;
  periodLabel: string;
  currency: string;
  data?: BarDataItem[] | LineDataItem[] | PieDataItem[];
  dataSets?: LineChartDataSet[];  // multi-line only
  metaStats: {
    total: number;
    average: number;
    max: number;
    min: number;
    changePercent: number;
    trend: 'UP' | 'DOWN' | 'FLAT';
    dataPoints: number;
  };
  generatedAt: string;
  cachedUntil?: string;
}

function renderChart(response: ChartResponse) {
  switch (response.chartType) {
    case 'BAR':
      return <BarChart data={response.data} />;
    case 'LINE':
      return response.dataSets
        ? <LineChart dataSets={response.dataSets} />
        : <LineChart data={response.data} />;
    case 'AREA':
      return <LineChart data={response.data} areaChart />;
    case 'PIE':
      return <PieChart data={response.data} />;
    case 'DONUT':
      return <PieChart data={response.data} donut />;
    case 'STACKED_BAR':
      return <BarChart data={response.data} />;
  }
}
```

---

## 28. ADDITIONAL VISUALIZATION CHARTS

Beyond the charts in section 21, build these additional builders:

```go
// internal/visualizations/builder/

// 1. Top products by revenue — horizontal bar
func TopProductsBarChart(products []ProductRevenue) ChartResponse

// 2. Customer spend distribution — donut
func CustomerSpendDonut(segments []CustomerSpendBracket) ChartResponse
//   segments: [{"label":"0-1K","value":23},{"label":"1K-5K","value":47},...]

// 3. Monthly profit margin trend — line
func ProfitMarginLineChart(monthly []MonthlyMargin) ChartResponse
//   shows gross margin % over time, not absolute values

// 4. Payment method split — pie
func PaymentMethodPieChart(methods []PaymentMethodTotal) ChartResponse
//   {"label":"M-Pesa","value":67000},{"label":"Cash","value":23000},...

// 5. Sales vs target — stacked bar (actual vs target per month)
func SalesVsTargetChart(actuals []MonthlyTarget) ChartResponse

// 6. Inventory turnover by category — bar with colour coding
func InventoryTurnoverBarChart(categories []CategoryTurnover) ChartResponse
//   Green frontColor if turnover > 4x, Amber if 2-4x, Red if < 2x

// 7. AR aging ladder — horizontal bar (0-30, 31-60, 61-90, 90+ days)
func ARAgingChart(aging []ARAgingBucket) ChartResponse

// 8. Daily cash position (rolling 30-day) — area chart
func CashFlowAreaChart(daily []DailyCashPosition) ChartResponse

// 9. Revenue by staff member — bar
func RevenueByStaffBarChart(staff []StaffRevenue) ChartResponse

// 10. Tax collected vs VAT input credit — stacked bar
func TaxSummaryStackedBar(months []MonthlyTaxSummary) ChartResponse
```

All builder functions must follow the standard `ChartResponse` envelope from section 27.4.

---

## 29. COMPLETE MODULE → ROUTE → CASBIN RESOURCE MAP

| Module | Route Prefix | Casbin Resource | HTTP Methods |
|--------|-------------|-----------------|--------------|
| auth | `/api/v1/auth` | (public) | POST |
| tenancy | `/api/v1/subscriptions` | `subscriptions` | GET, POST, PUT |
| business | `/api/v1/businesses` | `businesses` | GET, POST, PUT, DELETE |
| users | `/api/v1/businesses/{biz}/members` | `members` | GET, POST, PUT, DELETE |
| customers | `/api/v1/customers` | `customers` | GET, POST, PUT, DELETE |
| products | `/api/v1/products` | `products` | GET, POST, PUT, DELETE |
| orders | `/api/v1/orders` | `orders` | GET, POST, PUT, DELETE |
| sales | `/api/v1/sales` | `sales` | GET, POST |
| inventory | `/api/v1/inventory` | `inventory` | GET, POST, PUT |
| expenses | `/api/v1/expenses` | `expenses` | GET, POST, PUT, DELETE |
| taxes | `/api/v1/taxes` | `taxes` | GET, POST, PUT |
| invoices | `/api/v1/invoices` | `invoices` | GET, POST, PUT, DELETE |
| payments | `/api/v1/payments` | `payments` | GET, POST |
| reports | `/api/v1/reports` | `reports` | GET, POST |
| visualizations | `/api/v1/visualizations` | `visualizations` | GET |
| insights | `/api/v1/insights` | `insights` | GET |
| ai | `/api/v1/ai` | `ai` | POST |
| whatsapp | `/api/v1/whatsapp` | `whatsapp` | GET, POST, PUT |

