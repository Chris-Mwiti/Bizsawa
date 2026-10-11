# Shared kernel — `internal/shared/*`

Imported by every module, never the other way round. No business logic — only cross-cutting primitives.

## db — connection, scopes, models, concurrency
- `Open(cfg)` / `Ping` / `SQLDB` (`connection.go`) — Postgres pool lifecycle.
- `TenantScope` / `BusinessScope` (`tenant_scope.go`) — GORM scoping filters.
- `BaseModel` (UUID PK + tenant + timestamps + soft delete + `sync_version`) vs `TenantModel` (membership tables, no sync_version) (`base_model.go`).
- `LockBusinessSequence` (per-business `pg_advisory_xact_lock`) + `IsDuplicateKey` (23505 across drivers) (`concurrency.go`) — the F1 primitives.

## errors / http / pagination
- `AppError` (`Code/Message/StatusCode/Cause`), `WithMessage` / `WithCause`, `FromError` (unknown → sanitised 500), `ErrBadRequest` … `ErrBusinessLimitReached` (`errors.go`).
- `Envelope`, `JSON` (status + content-type), `Error` (duplicate-key → 409 + `Retry-After`; 409/429 → `Retry-After: 1`), `Decode` (`respond.go`).
- `Page{Limit, Offset}`, `FromRequest` (default 25, max 100) (`pagination.go`).

## middleware — `context.go` / `tenant.go` / `idempotency.go`
- `With*` / `*FromCtx` pairs for user, tenant, business, idempotency key.
- `TenantResolution` (business/tenant UUID from route/header/query).
- `Idempotency` (captures `X-Idempotency-Key` on non-safe methods).

## authz — `authz.go` / `errors.go`
- `Role` (`OWNER/MANAGER/CASHIER/VIEWER`), `MembershipResolver` interface.
- `Enforcer`: `NewEnforcer` (seeded defaults), `Middleware` (role gate), `Allowed` (incl. `*` wildcard), `ResourceAction` (resource from chi pattern + method→action; `waha`→`whatsapp`, `/members` override).
- `ErrForbidden()`, `ErrBusinessRequired()`.

## config — `config.go`
- `Config` aggregate + `Database/Redis/CORS/JWT/MCP/WhatsApp/Crypto/Google/Mpesa/Email/Observability` sections; `Load()` from env; `ParseOTLPHeaders`; per-section `TracesTarget()` / `MetricsTarget()`.

## crypto / cache / idempotency / eventbus / audit / outbox / email / models
- `crypto`: `Manager` (AES-GCM + HMAC blind index); `NewManager` (32-byte keys); `BlindIndex` / `Encrypt` / `Decrypt`.
- `cache`: `Client` interface (`Get/Set/Del/Ping`); `RedisClient` (`NewRedis`, `Raw`, `Close`).
- `idempotency`: `Store` (TTL response cache); `NewStore` (24h default); `Get` / `Set` (`idem:`-prefixed).
- `eventbus`: `Event` envelope; `Bus` (`Publish/Subscribe`); `RedisStreamsBus` (`NewRedisStreamsBus`, XADD publish, XREAD subscribe); `MapToEvent`.
- `audit`: `Entry` → `audit_log`; `Repository` (`NewRepository`, `Insert`).
- `outbox`: generic `BaseModel[T]` envelope (tenant/aggregate/stream/event).
- `email`: `Sender` interface (OTP + invite); `NoopSender` (log-only dev); `ResendSender` (`NewResendSender`, `SendOTPEmail`, `SendInviteEmail`); `NewSender` (Resend when key set).
- `models`: `CommandType` (stk_push/b2c/c2b/cash); `InitiateRequest` payment payload.

## cmd — `cmd/api` / `cmd/migrate`
- `cmd/api/main.go`: builds config → DB → Redis → River → all modules → workers → server.
- `cmd/api/server.go`: Chi router, global middleware (observability/RequestID/RealIP/Recoverer/Timeout/CORS/TenantResolution/Idempotency), public routes (`/auth`, `/invites`, `/public`, `/mpesa/*`), auth group (`/profile`, `/businesses`), auth+authz group (everything else incl. `/devices`).
- `cmd/migrate/main.go`: golang-migrate runner over `migrations/` (`000001…000022` + down files).
