# WatermelonDB — Concepts Reference for the BizSawa Sync Agent

This document summarizes the WatermelonDB concepts the coding agent must understand before implementing the offline-first sync feature described in `bizsawa-offline-sync-agent-prompt.md`. Sourced from the official WatermelonDB docs at watermelondb.dev. Treat this as required background reading before touching the mobile codebase — several of these concepts (writers, IDs, conflict resolver) directly affect correctness, not just style.

---

## PART A — Foundational Concepts (must know before writing any code)

### 1. Schema

The schema defines your local tables and columns (name + type: `string`, `number`, `boolean`) and is versioned with an integer `schemaVersion`. Every table implicitly gets `id`, `created_at`, and `updated_at` — you don't declare these yourself. Any time you add a column or table, you must bump `schemaVersion` and add a corresponding migration (see §7), or existing installs will break.

**BizSawa-specific implication:** every syncable Postgres table needs a matching WatermelonDB table schema with the same column set (minus Postgres-only sync metadata that stays server-side, like `sync_version`, which maps to Watermelon's internal change-tracking instead — see §5).

### 2. Models

A Model is a class extending `Model` representing one row. Fields are declared with decorators:
- `@field('column_name')` — plain field
- `@text('column_name')` — like `@field` but trims whitespace on write (useful for user-entered business data — names, notes)
- `@date('column_name')` — stores as a JS Date
- `@readonly @date('created_at')` — auto-managed timestamp fields; cannot be manually set
- `@json('column_name', sanitizerFn)` — stores a serialized JSON blob in one column; only use this for data you will never need to query by field — do not use it for anything BizSawa needs to filter/report on
- `@nochange` — field can be set on create but never modified afterward (put before the field decorator)
- `@lazy` — computed/derived property or query, evaluated once and cached on the instance, not stored in the DB

### 3. Actions → Writers and Readers (current API)

**Important — API naming has evolved.** Older docs and tutorials refer to `@action` / `database.action()` and `subAction()`. These are deprecated. The current API uses:
- `@writer` decorator (Model method) / `database.write(...)` (inline) — for any code that performs a database mutation
- `@reader` decorator / `database.read(...)` — for grouping multiple related reads that must see a single consistent snapshot
- `callReader()` / `callWriter()` — the current replacement for the deprecated `subAction()`, used when a writer needs to call another writer/reader without deadlocking the action queue

**Why this matters for BizSawa:** WatermelonDB serializes all writers — only one writer runs at a time, guaranteeing that a batch of related writes (e.g., "create an invoice + its line items") is atomic from the app's perspective. All local mutations in the BizSawa mobile app — every create/update/delete — must go through a writer. Never call `record.update()` or `collection.create()` outside a writer block; it will throw at runtime.

Use the agent instruction: **wrap every local mutation from BizSawa's business logic (invoices, transactions, inventory adjustments) in model-level `@writer` methods**, not ad hoc inline writes scattered through UI components. This keeps the codebase consistent with WatermelonDB's intended architecture and makes the eventual sync-conflict debugging tractable.

### 4. Queries and Observability

Queries are built with the `Q` query builder (`Q.where`, `Q.and`, `Q.or`, `Q.on` for joining across tables via associations, `Q.like` for pattern matching). Queries are lazy — they don't execute until `.fetch()` (one-time) or `.observe()` (reactive) is called.

`.observe()` returns an RxJS observable that emits whenever the underlying data changes — this is what should back BizSawa's UI lists (e.g., "pending sync" indicators, transaction lists) so the UI updates automatically as sync writes data in the background, with no manual refresh logic needed.

Batch fetch optimizations relevant to BizSawa's potentially large ledgers:
- `query.fetchIds()` — fetch only IDs, skip hydrating full records, when you just need to know what exists
- `query.unsafeFetchRaw()` — skip the ORM layer for performance-critical read paths (use sparingly, only where profiling shows it's needed)

### 5. Relations

Declared via `static associations` on the Model (`has_many` / `belongs_to` with a `foreignKey`), and accessed via `@relation` / `@immutableRelation` decorators. `@immutableRelation` should be used where BizSawa's data model has a relationship that must never be reassigned after creation (e.g., a line item's parent invoice) — this gives you a compile-time-adjacent guarantee against a whole class of data-integrity bugs.

Relations are lazy: `comment.author` returns a `Relation` object, not the record itself — you need `.fetch()` (one-time) or to `.observe()` it (reactive, for UI binding) to get the actual related record.

### 6. IDs — Local IDs Are Remote IDs

This is one of WatermelonDB's foundational design decisions and is **directly required** by the sync architecture we specified: WatermelonDB assumes no distinction between a record's local ID and its ID on the backend. The app generates the ID at creation time (client-side), and the backend treats that same ID as authoritative. Watermelon's default ID generation has enough entropy that collisions across devices are not a practical concern.

This eliminates an entire category of sync bugs — remapping a temporary local ID to a "real" server ID after the first successful push — which is a common source of subtle relation-corruption bugs in hand-rolled offline-sync systems. This is exactly why the BizSawa architecture spec mandates client-generated UUIDs on both the mobile schema and the Postgres schema: it isn't just "a" valid choice, it's the assumption the whole `synchronize()` engine is built around. Do not deviate from this.

---

## PART B — Sync-Specific Concepts (core of this feature)

### 7. Migrations (schema versioning)

Any schema change (new table, new column) requires a migration step so existing app installs upgrade their local SQLite schema cleanly. WatermelonDB also supports **Migration Syncs**: when a device syncs after its schema version was behind, Watermelon can request the backend to backfill any data made newly relevant by the migration (e.g., a newly-added column that older synced records never received). The backend push/pull contract should be built with this in mind from day one — retrofitting migration-aware sync later is disruptive.

### 8. The `synchronize()` Function and Its Two Endpoints

`synchronize()` is Watermelon's built-in sync engine. You do not need to implement diffing, conflict application, or "what changed locally" tracking yourself — Watermelon does this internally, tracking per-record and per-column dirtiness automatically. Your job is to implement two backend-facing functions:

```js
await synchronize({
  database,
  pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
    // fetch changes from BizSawa backend since lastPulledAt
    // return { changes: { table: { created: [], updated: [], deleted: [] } }, timestamp }
  },
  pushChanges: async ({ changes, lastPulledAt }) => {
    // POST local changes to BizSawa backend
  },
})
```

This maps directly onto the `GET /sync/pull` and `POST /sync/push` endpoints specified in the architecture brief — `pullChanges` calls `/sync/pull`, `pushChanges` calls `/sync/push`.

**Key behavioral contract the backend must honor:** Watermelon assumes every `pullChanges` response is a *complete* delta of everything changed since `lastPulledAt` — if the backend under-reports changes (e.g., due to a buggy timestamp comparison), the local copy silently drifts out of sync with no error. This is why the architecture brief specifies a `sync_version`/`updated_at`-based query rather than anything approximate.

### 9. Created vs. Updated Disambiguation

To let the client correctly bucket a pulled record as "created" vs. "updated," the backend can track a `server_created_at` timestamp: if it's after `lastPulledAt`, the client doesn't have the record yet (create it); if before, the client already has it (update it). This must stay consistent with the change-tracking timestamp — never substitute a client-supplied `created_at`, since local device clocks cannot be trusted for this purpose.

Alternatively, the backend can send all non-deleted changed records as "updated" uniformly and pass `sendCreatedAsUpdated: true` to `synchronize()` — Watermelon handles this correctly in the vast majority of cases, at a small cost of edge-case robustness (particularly around records that were deleted locally). Given BizSawa is financial data, prefer the explicit `server_created_at` approach for correctness.

### 10. Conflict Resolution Hook — `conflictResolver`

`synchronize()` accepts a `conflictResolver` callback: `(tableName, local, remote, resolved) => resolvedRecord`. This is the exact hook point where the BizSawa version-counter conflict logic from the architecture brief plugs in — **do not implement conflict detection as a separate bolt-on layer; use this hook.** When Watermelon detects that a locally-modified record also changed remotely, this function is invoked, and the agent's job is to route the conflicting pair into the `conflicts` table (per the architecture brief) rather than letting Watermelon's default resolution merge them silently.

There is also an `onWillApplyRemoteChanges` hook, called after `pullChanges` resolves but before changes are written locally — useful for showing sync-progress UI on a large initial sync, which BizSawa should use given business owners may have months of backlog data on first login.

### 11. Turbo Login (advanced — optional optimization)

For a brand-new install doing its very first sync (a business owner logging into BizSawa on a new device with an empty local DB), Watermelon offers an experimental "Turbo Login" mode that is significantly faster and lower-memory than a standard sync. Constraints the agent must respect:
- Only valid when the local database is completely empty — running it against a non-empty DB is a serious error, not a warning
- Only works with the JSI-enabled SQLite adapter, not on web and not with remote debugging attached
- Cannot be used for any subsequent (incremental) sync — first-login only
- Officially marked "unsafe" (API may still change) — evaluate whether BizSawa's typical first-sync data volume justifies the added complexity before adopting it; it is a nice-to-have, not part of the Definition of Done in the architecture brief

### 12. What WatermelonDB Deliberately Does NOT Do

Two things the agent must not assume Watermelon provides for free:
- **No backend included.** Watermelon only manages the client-side database and sync bookkeeping. All backend logic — the `/sync/pull` and `/sync/push` handlers, the `conflicts` table, idempotency — is BizSawa's Go backend's responsibility, per the architecture brief.
- **No automatic invocation scheduling.** Watermelon does not decide *when* to call `synchronize()`. The BizSawa app is responsible for triggering it (on reconnect via NetInfo, on an interval, and on manual pull-to-refresh), exactly as specified in Phase 2 of the execution plan.

---

## PART C — Direct Cross-References to the Architecture Brief

| Architecture brief requirement | WatermelonDB concept that implements it |
|---|---|
| Client-generated UUID primary keys | §6 — Local IDs = Remote IDs design assumption |
| `GET /sync/pull` / `POST /sync/push` | §8 — `pullChanges` / `pushChanges` functions passed to `synchronize()` |
| Version-counter conflict detection + `conflicts` table | §10 — `conflictResolver` hook |
| Per-record sync status in UI (`synced`/`pending`/`conflict`/`failed`) | §4 — `.observe()` reactive queries bound to Watermelon's internal per-record dirty-status tracking |
| Reconnect-triggered + interval sync | §12 — app-level responsibility; wire via NetInfo, not a Watermelon feature |
| Atomic multi-record writes (e.g., invoice + line items) | §3 — `@writer` serialization guarantee |
| Schema evolution as BizSawa's data model grows | §7 — Migrations + Migration Sync |

---

## References

- WatermelonDB Sync — Intro, Frontend, Backend, FAQ: https://watermelondb.dev/docs/Sync/
- WatermelonDB Writers, Readers, Batching: https://watermelondb.dev/docs/Writers
- WatermelonDB Relations: https://watermelondb.dev/docs/Relation
- WatermelonDB Changelog (writer/reader/action history, Turbo Login, Migration Syncs): https://watermelondb.dev/docs/CHANGELOG
- WatermelonDB Sync Implementation (advanced/internal): https://watermelondb.dev/docs/Implementation/SyncImpl
