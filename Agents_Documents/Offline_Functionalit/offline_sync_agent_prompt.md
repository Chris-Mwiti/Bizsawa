# BizSawa Offline-First Sync — Implementation Brief for AI Coding Agent

## Context

BizSawa is an AI-powered financial and business management platform for small businesses in Kenya and East Africa. It has a React Native mobile app and a Go (Chi + GORM) backend on PostgreSQL. Connectivity in the target market is intermittent, so the mobile app must work fully offline and reconcile cleanly when the device reconnects.

**Current state:** PostgreSQL is the sole source of truth; the app depends on live network calls.

**Target state:** The local on-device database becomes the source of truth while offline. When connectivity returns, local changes push to Postgres and remote changes pull down, with conflicts resolved explicitly rather than silently overwritten — this is a financial app, so silent data loss on conflict is unacceptable.

Your job is to implement this end-to-end: mobile local-first storage, backend sync endpoints, conflict resolution, and the supporting schema changes. Follow the architecture below precisely — do not substitute alternate libraries or patterns without flagging the deviation first.

---

## 1. Architecture Overview

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   React Native App      │         │      Go Backend           │
│                          │  push   │   (Chi + GORM + Postgres) │
│  WatermelonDB (SQLite)  │────────▶│   POST /sync/push          │
│  - local-first writes   │         │   - idempotent, versioned │
│  - _status tracking     │         │                            │
│  - UUID primary keys    │◀────────│   GET /sync/pull           │
│                          │  pull   │   - delta since cursor     │
└─────────────────────────┘         └──────────────────────────┘
        ▲                                        │
        │ NetInfo listener                       ▼
        └── triggers sync on reconnect    Postgres: sync_version,
                                            deleted_at, conflicts table
```

---

## 2. Required Technologies — DO NOT SUBSTITUTE

These were deliberately chosen for this use case. Treat this list as fixed constraints, not suggestions:

| Layer | Technology | Why (non-negotiable reasoning) |
|---|---|---|
| **Local DB (mobile)** | **WatermelonDB** (SQLite-backed) | Purpose-built for offline-first RN apps; ships a documented `synchronize()` sync protocol matching the pull/push contract below; reactive UI bindings; scales to tens of thousands of local records |
| **Connectivity detection** | **`@react-native-community/netinfo`** | Standard, reliable reconnect-event source; used to trigger `synchronize()` automatically |
| **Primary key strategy** | **Client-generated UUIDv4** on every syncable table, on both mobile and Postgres | Records created offline must have their permanent ID before ever reaching the server — this avoids a temp-ID-to-real-ID remapping step that is painful to retrofit later. This must be done from the start, not bolted on |
| **Change tracking (Postgres)** | `updated_at` + `deleted_at` (soft delete) + integer `sync_version` per row | `sync_version` is the conflict-detection mechanism — see §4 |
| **Conflict resolution model** | **Version-counter check + explicit `conflicts` table** | NOT last-write-wins, NOT pure timestamp comparison. This is a financial app — silently overwriting a record on conflict is an unacceptable failure mode. Conflicts must be captured and surfaced for resolution, not auto-resolved by timestamp |
| **Write idempotency** | Reuse BizSawa's existing idempotency-key pattern on `POST /sync/push` | The push endpoint is an idempotent write path like the rest of the backend — do not invent a separate idempotency mechanism |

**If you find yourself reaching for last-write-wins-by-timestamp as a shortcut: stop.** That was explicitly rejected for this system because of clock drift risk and the cost of silent data loss on financial records.

---

## 3. Mobile Implementation (React Native)

1. Install and configure WatermelonDB with SQLite adapter.
2. Define WatermelonDB models mirroring the syncable Postgres tables, using UUIDv4 as the `id` field (generate client-side at record creation, not server-side).
3. Implement `synchronize()` using WatermelonDB's sync adapter, pointed at the two backend endpoints in §5.
4. Add a `NetInfo` listener that calls `synchronize()`:
   - Immediately on reconnect
   - On a periodic background interval while online (define interval — recommend 5–10 min for a business app)
   - On manual pull-to-refresh
5. Surface per-record sync status in the UI (`synced` / `pending` / `conflict` / `failed`) using WatermelonDB's `_status` field plus a mapped `conflict` state from the conflicts table (see §4). Users must be able to see what hasn't synced.
6. All local writes (create/update/delete) go through WatermelonDB first — never call the API directly from a UI action. The mutation is only ever pushed via the sync cycle.

---

## 4. Conflict Resolution — Version-Counter + Conflicts Table

1. Every syncable Postgres table gets a `sync_version integer NOT NULL DEFAULT 1`.
2. Every client mutation carries the `sync_version` the client last saw for that record.
3. On push, the server:
   - If the incoming `sync_version` matches the current DB value → apply the change, increment `sync_version`.
   - If it does NOT match (server has moved ahead since the client last synced) → **do not apply**. Instead, insert a row into a `conflicts` table containing: record table/id, the client's attempted payload, the server's current payload, both versions, and a timestamp.
4. Conflicts are surfaced to the user/admin (mobile UI and/or an admin dashboard) for manual resolution — implement at minimum a basic resolution UI: "keep mine" / "keep server's" / view diff.
5. Do not implement automatic field-level merging in this pass — that's a possible future iteration, not part of this scope.

---

## 5. Backend Implementation (Go / Chi / GORM)

1. **Schema migration** on every syncable table:
   - Convert primary keys to UUID (if not already)
   - Add `sync_version integer NOT NULL DEFAULT 1`
   - Add `deleted_at timestamptz` (soft delete — GORM's built-in soft delete support)
   - Ensure `updated_at` exists and is maintained on every write

2. **`GET /sync/pull?since=<cursor>`**
   - `cursor` is the last successful pull timestamp (or a monotonic sync-log ID if you prefer log-based delta tracking — pick one and be consistent)
   - Returns `{ created: [...], updated: [...], deleted: [...] }` for all syncable tables changed since `cursor`
   - Excludes soft-deleted records from `created`/`updated`; includes their IDs in `deleted`

3. **`POST /sync/push`**
   - Accepts a batch of client mutations (created/updated/deleted), each with client UUID, table, payload, and `sync_version`
   - Wraps the whole batch in a transaction
   - Applies the version-counter check per record (§4) — mismatches go to `conflicts`, not applied
   - Reuses the existing idempotency-key middleware/pattern already used elsewhere in the BizSawa backend — do not build a new one
   - Returns per-record result: `applied`, `conflict`, or `error`

4. **`conflicts` table** — new table: `id`, `table_name`, `record_id`, `client_payload jsonb`, `server_payload jsonb`, `client_version`, `server_version`, `created_at`, `resolved_at`, `resolution` (nullable enum: `kept_client` / `kept_server` / `merged`).

---

## 6. Execution Plan (do in this order)

**Phase 1 — Backend foundation**
1. Write and run migrations: UUID PKs, `sync_version`, `deleted_at`, `conflicts` table
2. Implement `GET /sync/pull`
3. Implement `POST /sync/push` with version-check logic (no conflicts UI yet — just correct rejection/logging)
4. Wire in the existing idempotency-key middleware to `/sync/push`
5. Write integration tests: normal push, version-mismatch push, pull-since-cursor, soft-delete propagation

**Phase 2 — Mobile local-first layer**
1. Add WatermelonDB + SQLite adapter, define schema/models matching Postgres tables (UUID PKs)
2. Migrate existing direct-API-call write paths to go through WatermelonDB local writes instead
3. Implement the WatermelonDB `synchronize()` adapter wired to `/sync/pull` and `/sync/push`
4. Add `NetInfo` reconnect listener + periodic sync interval + manual pull-to-refresh trigger

**Phase 3 — Conflict UX**
1. Add per-record sync status indicator in the mobile UI (`synced`/`pending`/`conflict`/`failed`)
2. Build a minimal conflict resolution screen (mobile or admin web) showing client vs. server payload with keep-mine/keep-theirs actions
3. Wire resolution actions back to a `POST /sync/conflicts/:id/resolve` endpoint that applies the chosen payload and increments `sync_version`

**Phase 4 — Hardening**
1. Test offline-created records syncing after extended offline periods (multiple edits queued)
2. Test simultaneous edits from two devices to the same record → confirm conflict is captured, not silently dropped
3. Load-test `/sync/pull` delta size for a device offline for a long period (pagination if the delta payload gets large)
4. Confirm idempotency: replaying the same push batch twice (simulating a dropped response) does not duplicate records

---

## 7. Explicit Non-Goals for This Pass

- No field-level automatic merging — conflicts are surfaced, not auto-merged
- No CRDT-based approach (Yjs/Automerge) — not needed at BizSawa's current concurrency scale
- No real-time (websocket) sync — this is pull/push on reconnect + interval, not live multi-device sync

---

## 8. Definition of Done

- [ ] App is fully usable offline: create, edit, delete records with no network
- [ ] On reconnect, queued local changes push to Postgres automatically
- [ ] Remote changes since last sync pull down and merge into local DB
- [ ] Version conflicts are captured in the `conflicts` table and surfaced to a user/admin, never silently overwritten
- [ ] All syncable records use client-generated UUIDs end-to-end
- [ ] Push endpoint is idempotent under retry/duplicate submission
- [ ] Per-record sync status is visible in the UI
