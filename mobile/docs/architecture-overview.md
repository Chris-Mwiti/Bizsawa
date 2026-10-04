# Mobile — Architecture Overview

High-level layers of the Expo app, the provider tree, and the offline invariant everything else serves.

## 1. Layers

```
┌ Screens ──────────────────────────────┐  app/ (Expo Router)
│ Tabs · Auth · Detail · Sheets · Sync  │  dumb about transport
├ Hooks ────────────────────────────────┤  hooks/api/*, useSyncStatus…
│ useQuery (server) + observe (local)   │  mergeLocalFirst joins them
│ + useMutation (local write → syncNow) │
├ Contexts ─────────────────────────────┤  contexts/
│ Auth (who) · Business (which tenant)  │  hydrated from SecureStore/
│ Tour (onboarding state)               │  AsyncStorage for offline boot
├ Transport ────────────────────────────┤  lib/api.ts axios instance
│ JWT + X-Business-ID inject, 401 →     │  single-flight refresh retry
│ refresh retry, friendlyMessage errors │
├ Sync engine ──────────────────────────┤  sync/client.ts + SyncProvider
│ push (POST /sync/push + idempotency   │  pull (GET /sync/pull?since=)
│ key) · pull-apply · conflicts table   │
└ Local DB ─────────────────────────────┘  db/ WatermelonDB, SQLite JSI
   source of truth when offline            16 tables, _status outbox
```

UI never touches axios or SQLite directly (except boot/splash and a few one-shot `api.get` calls): screens consume **contexts for identity** (`useAuth`, `useBusinessContext`) and **TanStack hooks for data**, which internally fan out to the server read, the Watermelon subscription, the merge, and the sync trigger.

## 2. Provider tree (`app/_layout.tsx`)

```
TamaguiProvider
 └─ QueryClientProvider (staleTime 60s)
     └─ AuthProvider          # isAuthenticated, userId, userData, tokens
         └─ BusinessProvider  # businesses, activeBusiness(Id,Role)
             └─ SyncProvider  # state, pendingCount, conflictCount, refreshCounts
                 └─ TourProvider
                     └─ NavigationGateProvider   # intercepts router, warms queries
                         └─ Stack + OfflineBanner + Toast
                             + RouteLoadingBar / RouteLoadingChip
```

Ordering is load-bearing: Business needs Auth (user/token), Sync needs Business (bid for counts), Gate needs everything (it warms per-screen queries). `OfflineBanner` sits above the stack so the toast pill overlays every page.

## 3. The offline invariant

**Local SQLite is the source of truth while offline.** Concretely:

- Every domain write path does `database.write(col.create/update/markAsDeleted)` first. Watermelon stamps `_status = created|updated|deleted` — that column *is* the outbox; there is no separate outbox table.
- The write then calls `sync/client.syncNow()` (debounced; also auto on reconnect and on a 15s poll when `pendingCount > 0`).
- `syncNow()` runs Watermelon `synchronize`: `GET /sync/pull?since=` applies server changes (sanitized, deduped, unknown-column-stripped) and `POST /sync/push {changes, lastPulledAt}` (with `X-Idempotency-Key: randomUUID()`) uploads locals.
- Readers join both worlds with `mergeLocalFirst(server, local, {overlayFields})`: pending locals win on overlay fields, synced rows defer to the server, server-absent locals are appended, `_status: deleted` rows are hidden.

So a sale recorded in a signal dead-zone appears instantly (local row), survives app restarts (SQLite), uploads once (idempotency key + `FindByIdempotency` server-side), and converges without the UI ever branching on connectivity — except for the banner, the badge, and the conflict screen.

## 4. Identity and tenant plumbing

- **Who:** `AuthContext` cold-starts from SecureStore (AsyncStorage fallback). Online → JWT-expiry check + `POST /auth/refresh`. Offline → `isAuthenticated=false` but tokens are kept so the manual offline-login path (cached credential + 7-day grace, PIN/biometric) can still unlock the local workspace.
- **Which business:** `BusinessContext` hydrates `activeBusinessId` from AsyncStorage *first* (so `bid` exists offline), then `refreshBusinesses (GET /businesses)`, resolves the role via `GET /businesses/:id/members`, exposes `can(resource, action)` via `lib/permissions.canRole`.
- **How requests are scoped:** `lib/api.ts` request interceptor injects `Authorization: Bearer <access>`, `X-Business-ID` (+ lowercase mirror + `?businessId=` fallback) from the two contexts on every call.

## 5. What is deliberately absent

- **No global client store** (Zustand/Redux). Cross-screen server state lives in the QueryClient cache keyed by `[domain, bid, …]`; cross-screen local state lives in Watermelon + three narrow contexts.
- **`App.tsx` is dead code** (default Expo template). The bundle entry is `expo-router/entry` via `index.ts`.
- **`store/` is docs, not code** (`creds-setup.md`, `play-listing.md`).
