# Plan: Offline Auth, Multistep Onboarding, Profile Edit

## 1. Problem Analysis (Verification)

### Offline Login — why password hash sync fails
- Backend stores `PasswordHash = bcrypt(password)` with per-user salt. Client never receives hash; API only returns `AuthResponse{userId, accessToken, refreshToken}`.
- Attempting to “sync login credentials” would require exposing `PasswordHash` via `/auth/sync` — insecure and still unverifiable offline because `bcrypt.CompareHashAndPassword` needs the original hash, which we would have to ship to device (leaks credential DB).
- Even if we shipped hash to `AsyncStorage`, current storage is plaintext `AsyncStorage` (`bizsawa_access_token`, `bizsawa_refresh_token`) — extractable via backup.
- JWT `accessToken` (60m) + `refreshToken` (5d) are already cached, but `api.ts` refresh requires online `POST /auth/refresh`. Offline after 60m, user locked out even with valid refresh.

**Conclusion:** Do not sync server hash. Cache **locally-derived** credential proof at successful online login time, before hashing on server, and verify offline against that cache.

### Verified workaround
- On `AuthContext.login` success (online), derive local offline proof:
  1. `bcrypt` hash of plaintext password (client-side via `expo-crypto` + `bcryptjs` or simple SHA256 + SecureStore) OR store `email + passwordHash_local` in `expo-secure-store` (Keychain/Keystore encrypted, not AsyncStorage).
  2. Also persist `JWT + refreshToken + userId + businessId` in SecureStore with `offlineGraceUntil = now + 7 days`.
- Offline `login` flow (`!NetInfo.isConnected`):
  - If `SecureStore.get(email)` exists and `offlineGraceUntil > now` and `localHash == hash(inputPassword)` (or `bcrypt.compare`), succeed without network: `setIsAuthenticated(true)`, load cached `businessId`/`business` from SecureStore.
  - Else deny with “Offline login not available — connect once to enable”.
- Fallback for devices with biometrics: after first online login, prompt “Enable offline unlock with FaceID / PIN?” — store 4-digit PIN hash in SecureStore, allow biometric/PIN to unlock cached session without typing password.
- Token verification offline: decode JWT payload (`exp` check) locally, no signature verify (no server key). Accept if `exp > now` or `offlineGrace` valid. Queue `refresh` for when online.

### Business onboarding — gap vs backend schema
- Backend `Business` requires only `name` (`CreateBusinessRequest{Name required, Slug auto, Currency default KES, Timezone Africa/Nairobi, TaxPIN, Phone, Email, Address, MpesaPaymentType, MpesaShortcode}`) — `mobile BusinessContext.createBusiness` already supports all.
- `app/auth/register.tsx:1` collects 8 fields in single ScrollView but `AuthContext.register` drops all except `email/password` — `businessType`/`yearsInBusiness` have no DB column, never sent; business `name` collected but never used to `createBusiness`.
- Result: user signs up, no business created, must manually create business elsewhere; required tax/address/mpesa fields never captured.
- `app/onboarding.tsx:1` is marketing carousel, not business capture.

### Profile edit — gap
- `app/(tabs)/profile.tsx:1` read-only cards: `useBusiness` + `useAuth` display, only `Sign out`. No `PUT /businesses/{id}` or `PATCH /user/profile` or password change. `Business.service.UpdateBusiness` exists but unused.

---

## 2. Solution Plan

### Phase A — Secure offline login (high priority)
- **A1** Add `expo-secure-store` + `expo-local-authentication` + `expo-crypto` deps.
- **A2** Migrate `lib/api.ts` storage: new `SecureStorage` wrapper (`setItemAsync`/`getItemAsync` with `keychainAccessible`) for `accessToken, refreshToken, userId, businessId, offlineCredential`. Keep `AsyncStorage` as fallback read for migration.
- **A3** Extend `contexts/AuthContext.tsx`:
  - `persistAuthResponse` writes to SecureStore + AsyncStorage (dual).
  - `cacheOfflineCredential(email,password)` → `SecureStore.setItem('offline_cred_'+email, JSON.stringify({hash, offlineGraceUntil, userId, businessId}))`.
  - `login(email,password)` → `NetInfo.fetch()`; if online → normal `api.post('/auth/login')` + `cacheOfflineCredential`; if offline → `tryOfflineLogin(email,password)` → `bcryptjs.compare` or `SHA256` check + `offlineGraceUntil` check.
  - `checkAuthStatus` → try SecureStore first, then AsyncStorage, verify JWT `exp` via `jwt-decode` offline, allow.
  - Biometric: `expo-local-authentication.authenticateAsync()` after online login to enable PIN fallback.
- **A4** `app/auth/login.tsx` add `Offline available` badge, `Try offline login` path, and `Use biometrics` button when cached.

### Phase B — Multistep business onboarding (high)
- **B1** New `app/onboarding/business.tsx` (or repurpose `app/auth/register.tsx` into stepper) with 4 steps, progress dots, per-step validation:
  - **Step 1 — Owner & credentials**: `ownerName`, `ownerEmail`, `password`, `confirmPassword` (maps to `RegisterRequest`).
  - **Step2 — Business core**: `name*` (required), `slug` (auto from name, editable), `category` (reuse `businessTypes` chips but map to backend `category`? Actually backend has no businessType column — map to `address` note or drop; keep for UX but store in `business.address` suffix), `phone` (whatsappNumber), `email` (business email).
  - **Step3 — Details (optional but prompted)**: `currency` (KES/USD... picker), `timezone` (Africa/Nairobi default), `taxPin` (KRA PIN), `address`, `yearsInBusiness` (for analytics, store locally or in notes).
  - **Step4 — Mpesa (optional)**: `mpesaPaymentType` (`paybill`/`pochi_biashara`/`buy_goods`), `mpesaShortcode`, `mpesaShortcode` encrypted via backend `crypto`.
- **B2** On final “Create Business” → `register({email,password})` → `createBusiness({name,slug,currency,timezone,taxPin,phone,email:businessEmail,address,mpesaPaymentType,mpesaShortcode})` sequentially, with offline queue: if `!isConnected`, save pending `businessCreate` JSON to `AsyncStorage`+Watermelon and `SyncProvider` will `POST /businesses` when online.
- **B3** Keep single-step `register.tsx` as fallback but hide behind `?legacy` flag; default route after marketing `onboarding.tsx` → `business onboarding` → `login`.

### Phase C — Profile edit (medium)
- **C1** `app/(tabs)/profile.tsx` add `Edit` buttons on Business and User cards.
- **C2** Modals:
  - **User profile**: `firstName`, `lastName`, `phone`, `avatarUrl`, `timezone` → `PUT /user/profile` (need backend endpoint check; if missing, use `api.put('/auth/profile')` or `PATCH /customers/me` — verify; fallback store locally).
  - **Business edit**: same fields as onboarding step 2-4 → `PUT /businesses/{id}` via `BusinessContext.updateBusiness` (wrap `api.put`).
  - **Password change**: `currentPassword`, `newPassword` → `POST /auth/change-password` (if not exists, `POST /auth/reset` local).
- **C3** Offline: queue edits in `SecureStore` pending map, `SyncProvider` pushes on reconnect.

### Phase D — Verification
- `npx tsc --noEmit`, `go vet ./internal/...`, `expo-secure-store` import check, manual offline airplane test: login online → go offline → logout → login offline → success; onboarding offline → creates business when back online.

---

## 3. Execution Order
1. A1-A3 (SecureStore + AuthContext offline cache) — unblocks offline login verification.
2. B1-B2 (multistep onboarding) — captures all backend fields.
3. C1-C2 (profile edit) — reuses onboarding components.
4. D (lint/format, `gofmt -w`, `prettier --write`).

