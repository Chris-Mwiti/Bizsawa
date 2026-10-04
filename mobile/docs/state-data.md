# Mobile — State & Data

Contexts (identity), TanStack hooks (data), the axios client (transport), and offline auth (signal-dead access).

## 1. Contexts (`contexts/`)

### `AuthContext.tsx` — `AuthProvider`, `useAuth()`

State: `isAuthenticated, userId, userData({id, ownerName, ownerEmail, name}), authTokens{access, refresh}, isLoading`.

Methods: `login, loginWithGoogle, loginWithBiometrics(email)`, OTP family (`sendVerificationOtp/checkVerificationOtp/signInWithOtp/verifyEmailWithOtp/requestPasswordResetOtp/resetPasswordWithOtp`), `register`, `setSelectedBusinessAuth(business, role?)`, `logout → /onboarding`.

Cold start: SecureStore first, AsyncStorage fallback. Offline → `isAuthenticated=false` **but tokens are kept** so the manual offline-login path can unlock the local workspace. Online → JWT-expiry check + `POST /auth/refresh`.

### `BusinessContext.tsx` — `BusinessProvider`, `useBusinessContext()`

State: `businesses, activeBusiness, activeBusinessId, activeRole, isLoading`.

- Hydrates `activeBusinessId` from AsyncStorage **first** so `bid` exists while offline.
- `refreshBusinesses (GET /businesses)`, `createBusiness/updateBusiness` (offline-queue via `AsyncStorage bizsawa_pending_business*` with optimistic `expo-crypto randomUUID`), `selectBusiness` (resolves role via `GET /businesses/:id/members`), `can(resource, action)` → `lib/permissions.canRole`.

### `TourContext.tsx` — `TourProvider`, `useTour()`, `TOUR_STEPS[10]`

welcome/sales/orders/invoices/stock/analytics/expenses/profile/navigation/offline. Persisted `bizsawa_tour_enabled/seen`.

## 2. Data hooks (`hooks/api/`)

One hook per domain — `useProducts, useSales, useOrders, useInvoices, useInventory, useCustomers, useExpenses, useAnalytics, useBusiness, useSubscription, useChat, useCreditTrust, useAchievements, useInvites, usePayments` — plus `useSyncStatus, useSwipeNavigation, useCancellableEffect`.

The shared pattern (e.g. `useProducts`, `useSales`):

1. **Server read:** `useQuery([domain, bid, …], enabled: !!bid)` against `/api/v1/<resource>`.
2. **Local read:** Watermelon `query().observe()` subscription on the matching collection.
3. **Join:** `mergeLocalFirst(server, local, {overlayFields})` — pending (`_status created/updated`) locals win on overlay fields; synced rows defer to server; server-absent locals appended; `_status: deleted` hidden.
4. **Write:** `useMutation`: `database.write(col.create/update/markAsDeleted)` → `import('../../sync/client').then(m => m.syncNow())` → `queryClient.invalidateQueries(...)`.

`QueryClient` uses `staleTime 60s`. Query keys always include `bid`, so switching businesses never leaks rows across tenants.

## 3. Transport (`lib/api.ts`, `lib/api-dtos.ts`)

- `api: AxiosInstance`, `baseURL = getApiUrl()/api/v1`. `getApiUrl()`: `EXPO_PUBLIC_API_URL` → Android emulator `10.0.2.2:5504` → Expo host → localhost.
- **Request interceptor:** injects `Authorization: Bearer <access>`, `X-Business-ID` (+ lowercase mirror + `?businessId=` fallback) from Auth/Business contexts.
- **Response interceptor:** maps failures to `friendlyMessage`, and on 401 runs a **single-flight** `POST /auth/refresh` retry before surfacing.
- `AUTH_STORAGE_KEYS`, `persistAuthResponse/clearAuthStorage`, `standardizeApiError` live here; DTO shapes in `api-dtos.ts`.
- Helpers around it: `lib/idempotency.ts` (key generation for mutating calls), `lib/ids.ts`, `lib/syncDates.ts`, `lib/mcp.ts` (chat tool client), `lib/invoicePdf.ts` (share/print), `lib/payment-status.ts` (normalize helper), `lib/format.ts` (KES/number/date).

## 4. Offline auth (`lib/offlineAuth.ts`, `lib/secureStorage.ts`)

- `secureStorage{setSecure, getSecure, removeSecure, SECURE_KEYS}` + `persistSecureAuth/getSecureAuth/clearSecureAuth` — `expo-secure-store` with AsyncStorage fallback.
- `cacheOfflineCredential/verifyOfflineCredential/getOfflineCredential/hasOfflineCredential/getOfflineGraceDaysLeft`, `set/verifyOfflinePin`, `set/isBiometricEnabled`, `decodeJwtExp/isJwtExpiredOffline`.
- Credential = `SHA256(email:password)` via `expo-crypto` → WebCrypto → DJB2 fallback, stored under `bizsawa_offline_cred_<email>` with a **7-day grace** window. Biometric login = OS `authenticateAsync` gate + offline-credential lookup (no password typed).
