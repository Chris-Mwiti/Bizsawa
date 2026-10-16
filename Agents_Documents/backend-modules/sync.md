# Sync — `internal/sync` · routes `GET /sync/pull`, `POST /sync/push`, `/conflicts`

Offline-first backbone for the mobile app (WatermelonDB `synchronize()`). Pull is cursor-based with per-table caps (F5); push applies version-checked batches in FK order with conflicts instead of overwrites.

Module: `New(db)`; `RegisterRoutes` (pull/push/conflicts); `Service()`; `Handler()`.

Service (`service.go`):
- `NewService(db)` — constructor.
- `Pull(ctx, businessID, since)` — delta since cursor, default 1000 rows/table.
- `PullWithLimit(ctx, businessID, since, perTable)` — explicit cap (clamped 1–5000), `ORDER BY updated_at` + tombstone sweep.
- `Push(ctx, businessID, req)` — batch apply without user attribution.
- `PushWithUser(ctx, businessID, userID, req)` — canonical order (products → … → tax_rules) respecting FKs; per-record `sync_version` match → apply, mismatch → `Conflict` row; offline order side-effects (confirm → invoice + inventory, fulfill → sale, cancel → restore); sales post-pass deduction; analytics invalidation on sales/expense writes.
- `ForceApplyClientPayload` — `kept_client` resolution overwrite.
- `Conflict.TableName()` → `conflicts`.

Table helpers (same file): `insertRecord` (UUID/timestamp/numeric sanitizing + FK guards → controlled errors instead of 23503), `insertPushedMovement` (ledger-mirrored stock rows, reference-deduped), `validateFKs`, `updateRecord` (allow-listed columns + version bump), `ensureInvoiceForOrder` (advisory-locked, MAX-suffix numbering, duplicate retry), `ensureSaleForOrder` (unique `order_id` → idempotent), `ForceApplyClientPayload`, ledger line readers, `restoreInventoryForOrder` / `restoreInventoryForSale`, `ensureSaleDeducted`.

Handlers (`handler.go`): `NewHandler`; `Pull` (`since` ms/RFC3339 + `limit`/`per_table` clamp); `Push` (idempotent via middleware); `ListConflicts`; `ResolveConflict` (`kept_client` → force-apply, `kept_server` → mark).
