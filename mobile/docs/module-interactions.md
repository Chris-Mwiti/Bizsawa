# Mobile — Module Interactions

How a tap becomes a synced server write: the canonical request paths and the named end-to-end flows.

## 1. Canonical request paths

### Read (list screen, e.g. sales)

```
(tabs)/sales/index.tsx
 └─ useBusinessContext().activeBusinessId + useAuth().userId
     └─ useSales() / useProducts()
         ├─ useQuery(['sales', bid], enabled: !!bid) ──→ api.get('/sales')
         │       transport: lib/api.ts injects JWT + X-Business-ID
         ├─ Watermelon sales.observe() subscription
         └─ mergeLocalFirst(server, local, {overlayFields})
              └─ renders merged rows; SyncStatusBadge dots pending rows
```

Analytics variant: `useAnalytics().getRevenueAnalytics(timeframe)` → `GET /analytics?timeframe=` → server lazily enqueues `analytics.compute` via River → snapshot row → response. Charts (`RevenueChart`, `ProfitChart`, `CategoryPieChart`) render the series in `MONEY_STYLE`.

### Write (POS sale)

```
SalesEntryModal → useSales.createSale
  → database.write(sales.create + sale_lines.create[])
  → db/stockOps.applyLocalStockLedgerBatch (local mirror)
  → syncNow() ──→ POST /sync/push (X-Idempotency-Key: uuid)
  │                 ├─ accepted → pull applies sync_version, row clean
  │                 ├─ rejected → extractRejectedIds keeps row pending
  │                 └─ conflict → conflicts table → badge → /sync-conflicts
  └─ queryClient.invalidateQueries(['sales', bid]) + ['analytics']
  └─ UI feedback: SuccessCelebration, OfflineBanner count bump
```

Offline business create is the same shape with a queue: `BusinessContext.createBusiness` writes an optimistic `randomUUID` row + `AsyncStorage bizsawa_pending_business*`, reconciled on reconnect.

### AI coach

```
app/coach.tsx → useChat().mutateAsync({message, history, lang})
  → POST /chatbot/chat ──→ chat.Service → mcp.Registry tools
  → ChatResponse{reply, toolCalls} → CoachMessageMarkdown renders
```

## 2. Named flows

| Flow | Path |
|---|---|
| Boot | `index.tsx`: onboarding flag → auth → `GET /businesses` → `/onboarding`, `/(tabs)`, `/auth/business-setup`, `/auth/login` |
| Email login | `login.tsx` → `AuthContext.login` → persist → `GET /businesses` → tabs or business-setup |
| Offline unlock | `login.tsx` offline chip → `verifyOfflineCredential` (SHA256, 7-day grace) or biometric/PIN → local workspace, `isAuthenticated=false` but `bid` from AsyncStorage |
| Invite accept | `accept-invite.tsx` → `useInvites` → `POST …/accept-invite` (OTP) → member row → select business |
| Order with M-Pesa | `sales/orders.tsx` → `useOrders.create` → local rows → push → server Confirm → `order.event` → STK push → Daraja callback → confirmed (status visible after next pull; `useSyncStatus` dots it meanwhile) |
| Invoice chase | `sales/invoices.tsx` → create → push → server `Send` → WAHA WhatsApp (server-side) → `record-payment` on collection |
| Conflict resolve | `SyncProvider` detects → redirect `/sync-conflicts` → Keep-mine/Use-server → resolve + `syncNow` |
| Held navigation | `AppTabBar` → `gate(href)` → prefetch destination queries (≤4s) → commit → `RouteLoadingBar` clears |

## 3. Feedback surfaces (where state becomes visible)

- **`OfflineBanner`** — connectivity + pending/conflict counts + recovery actions (refresh/reset/resolve). Only always-on global indicator.
- **`SyncStatusBadge` / `useSyncStatus(table, recordId)`** — per-row pending/conflict dots in lists.
- **`RouteLoadingBar/Chip`** — held (prefetching) navigations.
- **`Toast`** — mutation results (`friendlyMessage` from `standardizeApiError`).
- **`PaywallModal`** — `useSubscription` plan limits (`EnforceBusinessLimit` server-side).
- **Analytics refresh** — after a sale/order push, client fires `POST /analytics/refresh?timeframe=week` and invalidates `['analytics']` so dashboard numbers converge without a manual pull-to-refresh.
