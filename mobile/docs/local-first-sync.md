# Mobile — Local-First Sync

WatermelonDB schema, the sync engine, the merge rule, and conflict handling. Server side: `backend/docs/module-interactions.md` §F.

## 1. Schema (`db/schema.ts`, v5 — 16 tables)

Every table carries `business_id` (indexed), `sync_version`, `deleted_at` (+ Watermelon `id/created_at/updated_at`):

`products, product_variants, customers, inventory_items, stock_movements, orders, order_lines, sales, sale_lines, expenses, invoices, invoice_lines, payment_commands, payments` (legacy alias), `tax_rules, conflicts`.

Money/quantities are **`string`** (decimal-safe); booleans/dates are `boolean`/`number`.

## 2. Database (`db/database.ts`, `db/models/`, `db/stockOps.ts`)

- `SQLiteAdapter({jsi:true})` + `schemaMigrations`: v2 (variant cols) → v3 (`payments.type`) → v4 (create `payment_commands`) → v5 (`orders.payment_status/confirmed_at/fulfilled_at`). 14 model classes registered (`Payment` covers both payment tables). `localCreateProduct` helper for offline creates.
- Models (e.g.): `Product(@field businessId/tenantId/price/cost/syncVersion, @text name/category, …)`, `Sale/SaleLine, Order/OrderLine, Invoice/InvoiceLine, Customer, Expense, InventoryItem, StockMovement, ProductVariant, Payment, Conflict(table_name/record_id/client_payload/server_payload/client_version/server_version/resolution?)`.
- `db/stockOps.ts` — `applyLocalStockLedgerBatch`: mirrors the server inventory ledger locally on sale create/void so stock counts stay correct with no signal.

## 3. Sync engine (`sync/client.ts`, `sync/SyncProvider.tsx`, `sync/pushResult.ts`)

`syncNow()` runs Watermelon `synchronize`:

- **Pull:** `GET /sync/pull?since=` → sanitize (`RawRecord.setRawSanitized` + `Model._setRaw` patches), `repairCorruptedLocal` (NaN/1970 dates), `_changed` cleaning, pull `created→updated` dedup, unknown-column stripping → apply.
- **Push:** `POST /sync/push {changes, lastPulledAt}` with `X-Idempotency-Key: randomUUID()` → `extractRejectedIds(response)` (tolerates axios/data envelopes) returned as `experimentalRejectedIds` so rejected rows **stay pending** instead of being marked clean.
- Triggers: `startSyncEngine()` (hydration + reconnect listener + 8-min interval), `pushPendingOnly`, `refreshFromRemote`, `manualSync`, `getPendingChangesCount/Debug` (14 `PENDING_TABLES`), `getConflictsCount`, `debugSyncState`, `resetLocalDatabase`, `getLastSyncDebug`. Hardening: `_isSyncing` mutex so polls never pile up (mirrors the server's `refreshBusyRef` guard).

`SyncProvider` (`useSync(): {state:'online'|'offline'|'syncing'|'conflict', lastSyncAt, pendingCount, conflictCount, refreshCounts, trigger}`) polls counts every 15s, auto-pushes on `pending > 0 && online` (10s debounce), and auto-redirects to `/sync-conflicts` when new conflicts land.

## 4. Merge rule (`lib/mergeLocalFirst.ts`)

`mergeLocalFirst(server, local, {overlayFields, keepLocalWhenServerEmpty})`:

1. Row has local `_status created/updated` → **local wins** on overlay fields (optimistic edit preserved).
2. Row is clean/synced → **server wins**.
3. Row exists only locally → appended (offline create).
4. Row `_status: deleted` → hidden.

Every list screen reads through this join, so offline writes render instantly and converge silently when the push succeeds.

## 5. Conflicts (`app/sync-conflicts.tsx`, `db` conflicts table)

- Detection: server `POST /push` returns `Conflict` rows (loser payloads); client stores them in the `conflicts` table → `SyncProvider` badge → auto-redirect.
- Resolution UI: per-row Keep-mine / Use-server → `POST /sync/conflicts/:id/resolve` + `resolveConflictLocally(resolution: 'kept_client' | 'kept_server')` + `deleteLocalConflict` + `syncNow`.
- Server authority is explicit: `ForceApplyClientPayload` exists but is only invoked from this screen — never silently.
