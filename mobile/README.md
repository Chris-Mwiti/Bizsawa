# Bizsawa Mobile (Expo / React Native)

Offline-first shop workspace for Kenyan/East-African MSMEs: POS, orders, invoices, stock, expenses, tax, analytics, AI coach — usable with no signal, synced when back online.

> Deep dives live in [`docs/`](./docs/):
> - [`docs/architecture-overview.md`](./docs/architecture-overview.md) — high-level layers, provider tree, offline invariant
> - [`docs/routing.md`](./docs/routing.md) — every route, guards, NavigationGate prefetch
> - [`docs/ui-components.md`](./docs/ui-components.md) — primitives, chrome, charts, theme tokens
> - [`docs/state-data.md`](./docs/state-data.md) — contexts, TanStack hooks, API client, offline auth
> - [`docs/local-first-sync.md`](./docs/local-first-sync.md) — WatermelonDB schema, sync engine, merge, conflicts
> - [`docs/module-interactions.md`](./docs/module-interactions.md) — request paths and end-to-end flows

## High level

```
Screens (app/, Expo Router)
   │  hooks/api/* (TanStack Query + Watermelon observe + mergeLocalFirst)
   ├─ contexts (Auth, Business, Tour)
   ├─ lib/api (axios: JWT + X-Business-ID, 401→refresh, friendly errors)
   ├─ sync/client (push/pull vs /sync/*, idempotency keys)
   └─ db (WatermelonDB SQLite via JSI — source of truth when offline)
   ▼
Backend /api/v1  ·  River workers  ·  Daraja / WAHA / Resend
```

- **Entry is `expo-router/entry`** (`index.ts`), not `App.tsx` (that file is the unused default template).
- **No Redux/Zustand.** Server state = TanStack Query (`staleTime 60s`); local state = WatermelonDB observables + React contexts. (`store/` holds only `creds-setup.md` / `play-listing.md` — listing copy, not code.)
- **Offline invariant:** local SQLite is the source of truth while offline. Writes go to Watermelon first (`_status created/updated/deleted` = pending outbox), then `syncNow()` reconciles with `POST /sync/push` + `GET /sync/pull`. `mergeLocalFirst` keeps optimistic edits visible until the server confirms.
- **Styling:** NativeWind + Tailwind tokens mapped from a single palette (`lib/theme/palette.js`), Tamagui provider for a subset, Geist + GeistMono fonts, KES (`en-KE`/`sw`) formatting throughout.

## Low level — directory map

| Path | What lives there |
|---|---|
| `app/` | Expo Router routes: `_layout.tsx` (providers), `index.tsx` (splash/boot), `onboarding.tsx`, `(tabs)/` (home, sales+orders+invoices, stock, insights×4, profile), `auth/` (7 screens), `orders/[id]`, `invoices/[id]`, `coach`, `social`, `credit-preview`, `rewards`, `sync-conflicts` |
| `components/ui/` | `Button, Card, SoftUI, Sheet, Skeleton, Badge, Progress, BrandGradient, TimeframeSelector, SuccessCelebration` |
| `components/` | `AppTabBar, OfflineBanner, SyncStatusBadge, TabWrapper, SwipeContainer, RouteLoadingBar/Chip, SalesEntryModal, PaywallModal, Order*, CoachMessageMarkdown`, `charts/` (Revenue, Profit, CategoryPie, Analytics) |
| `components/auth/` | `AuthShell` + field/CTA/social/footer primitives |
| `contexts/` | `AuthContext, BusinessContext, TourContext` |
| `hooks/api/` | One hook per domain: `useProducts, useSales, useOrders, useInvoices, useInventory, useCustomers, useExpenses, useAnalytics, useBusiness, useSubscription, useChat, useCreditTrust, useAchievements, useInvites, usePayments` (+ `useSyncStatus, useSwipeNavigation, useCancellableEffect`) |
| `lib/` | `api, api-dtos, secureStorage, offlineAuth, mergeLocalFirst, idempotency, ids, format, syncDates, permissions, invoicePdf, payment-status, mcp, env`, `navigation/` (gate), `theme/` (palette, colors, fonts) |
| `db/` | `database, schema` (v5, 16 tables), `stockOps`, `models/` (14 models) |
| `sync/` | `SyncProvider, client, pushResult` |
| `constants/tabBar.ts` | `TAB_BAR_SCROLL_PADDING = 112` |
| `tailwind.config.js`, `tamagui.config.ts`, `global.css` | Tokens, Tamagui setup, 3-line NativeWind directives |

Stack: Expo SDK `~54`, `expo-router ~6`, React 19, WatermelonDB `^0.28` (+ `expo-sqlite ~16`, JSI), TanStack Query `^5`, axios, NativeWind 4 + Tailwind 3, Tamagui 2, `expo-secure-store`, `expo-local-authentication`, Google Sign-In `^16`, Geist via `@expo-google-fonts`.

## Provider tree (`app/_layout.tsx`)

```
TamaguiProvider
 └─ QueryClientProvider (staleTime 60s)
     └─ AuthProvider → BusinessProvider → SyncProvider → TourProvider
         └─ NavigationGateProvider
             └─ Stack + OfflineBanner + Toast + RouteLoadingBar/Chip
```

## Run it

```bash
npm install   # or: bun install
npm run start
```

API base URL resolution (`lib/api.ts getApiUrl`): `EXPO_PUBLIC_API_URL` → Android emulator `10.0.2.2:5504` → Expo host → localhost (`/api/v1` suffix).
