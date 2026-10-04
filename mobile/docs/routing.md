# Mobile — Routing

Every route in `app/`, what guards it, and how the NavigationGate prefetch works.

## 1. Boot and top-level routes

| Route | File | Job |
|---|---|---|
| `/` | `app/index.tsx` | Splash (~4.5s animation) + boot router: checks `AsyncStorage HAS_FINISHED_ONBOARDING`, `NetInfo`, `useAuth().isAuthenticated`, then `GET /businesses` → routes to `/onboarding`, `/(tabs)`, `/auth/business-setup`, or `/auth/login` |
| `/onboarding` | `app/onboarding.tsx` | Marketing/onboarding carousel |
| `/rewards` | `app/rewards.tsx` | Achievements (`useAchievements`) |
| `/coach` (formSheet) | `app/coach.tsx` | AI chat sheet (`useChat().mutateAsync`) |
| `/social` (formSheet) | `app/social.tsx` | Social feed sheet |
| `/credit-preview` (card) | `app/credit-preview.tsx` | Credit-trust preview (`useAuth`, `useBusiness`, `useCreditTrustPreview('en', true)`) |
| `/sync-conflicts` (card) | `app/sync-conflicts.tsx` | Conflict inbox: `GET /sync/conflicts` + `getLocalConflicts()` → Keep-mine/Use-server → `POST /sync/conflicts/:id/resolve` + `resolveConflictLocally` + `syncNow` |

## 2. Tabs (`app/(tabs)/`)

Shell: `(tabs)/_layout.tsx` (Tabs + `AppTabBar` + `SwipeContainer`).

| Tab | Route file(s) | Screens |
|---|---|---|
| Home | `(tabs)/index.tsx` | Dashboard: business header, weekly overview chart, quick actions. Deps: `useAuth.userData`, `useAnalytics().weeklyOverview`, `useProducts` |
| Sales | `(tabs)/sales/_layout.tsx` + `index.tsx`, `orders.tsx`, `invoices.tsx` | Segment sub-tabs Sales/Orders/Invoices. POS (`SalesEntryModal`, cart, checkout: `useProducts`, `useCustomers`, `useSales.createSale`); Orders (create, M-Pesa via `usePayments`: `useOrders(limit:25)`); Invoices (`useInvoices`, `useCustomers`) |
| Stock | `(tabs)/stock.tsx` | Product + inventory list, add/edit, low-stock (`useProducts`, `useInventory.isLoadingInventory`) |
| Insights | `(tabs)/insights/_layout.tsx` + `overview.tsx`, `analytics.tsx`, `expenses.tsx`, `tax.tsx` | Overview stats/category/AI-tips (`useAnalytics` overview/categories, `useExpenses`); Analytics charts day/week/month/year (`getRevenue/Profit/Category/CustomerAnalytics`); Expenses CRUD; KRA/VAT (`getTaxSummary('month')`, `activeBusiness`) |
| Profile | `(tabs)/profile.tsx` | Business edit, plan/subscription (`useSubscription`), team/invites (`useInvites`), tour toggle, logout (`useAuth`, `useBusiness`, `useBusinessContext`) |

Backward-compat: `app/orders.tsx` / `app/invoices.tsx` redirect to the tab equivalents. Detail: `app/orders/[id].tsx`, `app/invoices/[id].tsx` (edit, payments, PDF share via `lib/invoicePdf`; deps `useOrders.getOrder/updateOrder`, `useInvoices.getInvoice`, `useCustomers`, `useProducts`, `useBusinessContext`).

## 3. Auth (`app/auth/`, all on `AuthShell`)

| Screen | Flow (all through `AuthContext` + `api`) |
|---|---|
| `login.tsx` | Email/password validate → `login` → `GET /businesses` → `/(tabs)` or `/auth/business-setup`. Extras: offline chip (`WifiOff`), grace chip (`hasOfflineCredential/getOfflineGraceDaysLeft`), biometric (`authenticateAsync → loginWithBiometrics(email)`), `→ /auth/verify-otp` (email-code sign-in), `Forgot password?`. SocialRow currently alerts (Google paused, Apple/Facebook soon) |
| `register.tsx` | `register({email,password}) → POST /auth/register` → auto `applyAuth` → business-setup |
| `verify-otp.tsx` | `sendVerificationOtp(email,'sign-in')` + `signInWithOtp(email,otp,…) → POST /auth/sign-in/email-otp` |
| `verify-email.tsx` | `sendVerificationOtp(email,'email-verification')` + `verifyEmailWithOtp → POST /auth/email-otp/verify-email` |
| `forgot-password.tsx` | `requestPasswordResetOtp → POST /auth/email-otp/request-password-reset`, then `resetPasswordWithOtp → POST /auth/email-otp/reset-password` |
| `accept-invite.tsx` | Invite-code accept (`useInvites`) |
| `business-setup.tsx` | `BusinessContext.createBusiness` (works offline via queued optimistic UUID — see state-data) |

Google native path exists in `AuthContext.loginWithGoogle` (`GoogleSignin → POST /auth/google {idToken, businessId}`) but the login screen currently disables it. Biometric = OS gate + offline-credential lookup (no password, 7-day grace).

## 4. Guards (no single router guard — four layers)

1. **Boot logic** (`app/index.tsx`): onboarding flag → auth → businesses → destination. Decides the *first* screen.
2. **`AuthContext.checkAuthStatus`**: offline cold start forces manual login (tokens kept, `isAuthenticated=false`); online validates/refreshes JWT.
3. **`lib/api` 401 handling**: single-flight `POST /auth/refresh` retry; on failure clears storage (kicks back to login via boot).
4. **Tenant scoping**: every request carries `X-Business-ID`; backend denies unscopped calls. Business-less users are routed to `/auth/business-setup`.

## 5. NavigationGate prefetch (`lib/navigation/`)

`NavigationGateProvider` (`NavigationGate.tsx`) monkey-patches `router.push/replace/navigate`. For the 12 gated hrefs in `ROUTE_GATES` (`routeGates.tsx`; matchers in `routeGateMatchers.ts`):

1. Navigation **holds** (max 4s).
2. A `<GateComponent Prefetch>` warms exactly the TanStack queries the destination screen will read.
3. The held navigation **commits** — the screen renders from a warm cache instead of skeleton-flashing.

Covered: sales/stock/home, 4 insights screens, expenses, tax, profile, orders, invoices + order/invoice detail. Ungated: auth, bottom sheets, object-form hrefs. `AppTabBar` presses route through `gate(href, 'navigate', …)` with the `TAB_HREFS` map; `RouteLoadingBar/Chip` visualizes held navigations. Gate matchers have unit tests (`routeGateMatchers`); matchers are pure functions (`route-gate matchers` in backend log parlance applied client-side).
