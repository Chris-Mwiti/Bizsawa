# ✅ Phase 2: Backend-minted credentials and tenant streams

[Phase 1](01-self-hosted-service.md) added the PowerSync service and its database bootstrap. This phase gives the service credentials it can verify and expands the sync rules to every tenant table.

**Today**

The production PowerSync config expects a Clerk JWKS URL (`PS_JWKS_URI`), and the sync config exposes only one stream. There is no backend endpoint that issues PowerSync credentials, so a client cannot authenticate to the service.

**Proposed**

The Go API gains a small `internal/powersync` module. `POST /api/v1/powersync/token` resolves the user and business from the existing auth middleware and returns a 15-minute HS256 JWT plus the public PowerSync URL. The token's top-level `business_id` claim is the value PowerSync passes to `auth.parameter('business_id')`.

The client now gets a credential from the API and presents it to the sync service:

```mermaid diff [Clients receive PowerSync credentials from the Go API]
 flowchart LR
+ Client[Client] -->|POST /api/v1/powersync/token| API[Go API]
+ API -->|HS256 JWT: sub, business_id, aud, kid| Client
+ Client -->|WebSocket Token JWT| PS[PowerSync service]
+ PS -->|client_auth.jwks| PS
  PS -->|logical replication| PG[(Postgres)]
+ PS -->|14 tenant buckets| Client
  %% ref node:API [[c3afc92..84ddfa3:backend/internal/powersync/handler.go]]
  %% ref node:PS [[c3afc92..84ddfa3:backend/powersync/service.prod.yaml]]
  %% ref node:PG [[c3afc92..84ddfa3:backend/powersync/sync-config.yaml]]
```

```callstack [Mint a PowerSync token]
 response = Handler.Token(req) [[c3afc92..84ddfa3:backend/internal/powersync/handler.go]]
├── userID = middleware.UserIDFromCtx(ctx) [[backend/internal/shared/middleware/context.go]]
├── businessID = middleware.BusinessIDFromCtx(ctx) [[backend/internal/shared/middleware/context.go]]
├── token, expires = TokenService.Mint(userID, businessID) [[c3afc92..84ddfa3:backend/internal/powersync/token.go]]
│   ├── claims = {sub, business_id, aud, iss, exp}
│   ├── header.kid = cfg.JWTKeyID
│   └── return jwt.SignedString(base64url signing key)
└── return {token, expires_at, powersync_url}
```

`authz.ResourceAction` treats the token endpoint as a read even though it uses `POST`, so owner, manager, cashier, and viewer can all mint a credential. The route is registered under the existing authz group:

```go {3-7}
func (h *Handler) Token(w http.ResponseWriter, r *http.Request) {
  userID, ok := middleware.UserIDFromCtx(r.Context())
  ...
  token, expires, err := h.svc.Mint(userID, businessID)
  ...
  sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{
    "token": token, "expires_at": expires.UTC().Format(time.RFC3339),
    "powersync_url": h.svc.URL(),
  })
}
// [!note L5] The business comes from the authenticated context, not the request body.
```

The sync config now has 14 streams, one per table in `syncableTables`, each using `auth.parameter('business_id')` and `deleted_at IS NULL`:

```yaml
streams:
  products:
    auto_subscribe: true
    query: SELECT * FROM products WHERE business_id = auth.parameter('business_id') AND deleted_at IS NULL
  # ... the same shape for product_variants, customers, inventory_items,
  # stock_movements, orders, order_lines, sales, sale_lines, expenses,
  # invoices, invoice_lines, payment_commands, and tax_rules.
```

`payment_commands` is present so clients can display payment state, but `PushWithUser` rejects uploads for tables in `readOnlySyncTables`. The server alone creates that state from M-Pesa callbacks.

```go {4-7}
for table, changes := range req.Changes {
  if !isSyncable(table) {
    result.Errors[table] = append(result.Errors[table], "table not syncable")
    continue
  }
  if isReadOnly(table) {
    result.Errors[table] = append(result.Errors[table], "table is read-only")
    continue
  }
  // ...
}
// [!note isReadOnly] True for payment_commands only.
```

```changes
c3afc92..84ddfa3
backend/cmd/api/server.go
backend/cmd/api/main.go
backend/internal/powersync/handler.go
backend/internal/powersync/module.go
backend/internal/powersync/token.go
backend/internal/shared/config/config.go
backend/internal/shared/authz/authz.go
backend/powersync/sync-config.yaml
backend/internal/sync/types.go
backend/internal/sync/push.go
backend/powersync/service.prod.yaml
backend/docker-compose.yml
backend/Makefile
backend/.env.example
backend/internal/powersync/module_test.go
backend/internal/sync/types_test.go
```
