# Mobile stability fixes: network, Google Sign In, assets

## Problem overview

The mobile app (Expo/React Native) ships three related field failures on physical Android devices:

1. **"Network Error" on every API call.** `mobile/lib/api.ts` derives the dev API host as a plain-HTTP LAN URL
   (`http://192.168.x.x:5504/api/v1`). `mobile/android/app/src/main/AndroidManifest.xml` declares
   `targetSdkVersion 36` but does **not** set `android:usesCleartextTraffic="true"`. Android 9+ blocks
   cleartext HTTP by default, so the device can never reach the LAN backend.
2. **Google Sign In module appears unloaded.** `@react-native-google-signin/google-signin` is installed,
   plugged in `app.json`, and `google-services.json` exists, but there is **no `GoogleSignIn.configure()`**
   call and no native signing-flow wiring anywhere in JS. `app/auth/login.tsx` actually signs in with Google
   through **Clerk browser OAuth** (`startSSOFlow({ strategy: 'oauth_google' })`), not the native module.
3. **Assets/logos not rendering.** No clear code bug: images use `require()` (bundled), and `app.json`
   `icon`/`splash` point to existing `assets/*.png`. The most likely cause is downstream of #1 — when the
   device cannot reach the API/EAS updates, the cold start stalls or falls back, so brand marks appear to
   not render.

## Current architecture

```mermaid [Mobile bootstrap & API flow]
flowchart TD
    U[User device] -->|HTTP LAN API| A[AndroidManifest]
    A -->|usesCleartextTraffic missing| B[Cleartext blocked on Android 9+]
    B --> N["Network Error"]
    L[login.tsx] -->|startSSOFlow oauth_google| C[Clerk browser OAuth]
    G[@react-native-google-signin] -->|installed, not configured| D[no configure() call]
    M[assets/*.png require()] -->|bundled| R[rendered in AuthShell BrandMark]
```

## Phase 1: Network — allow cleartext LAN traffic (persistent via config plugin)

**Today**

`mobile/android/app/src/main/AndroidManifest.xml` has no `usesCleartextTraffic`. Every API call from a
physical Android dev device fails with "Network Error" because the LAN API is HTTP.

**Proposed**

Add `android:usesCleartextTraffic="true"` persistently through an Expo config plugin so it survives
`npx expo prebuild` (the `mobile/android/` folder is gitignored and regenerated). Production uses HTTPS, so
the flag only affects dev/LAN.

```mermaid diff [Cleartext flag applied at prebuild]
 flowchart LR
-    A[AndroidManifest prebuild] -->|no flag| B[cleartext blocked]
+    P[with-android-cleartext-traffic plugin] -->|usesCleartextTraffic=true| A[AndroidManifest]
     A --> C[HTTP LAN API reachable]
```

```changes
6ae111d
mobile/app.json
mobile/scripts/with-android-cleartext-traffic.js
```

Config plugin added:

```js {1-8}
// mobile/scripts/with-android-cleartext-traffic.js
const { withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins')
const withAndroidCleartextTraffic = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application
    const set = (app) => { app.$ = app.$ || {}; app.$['android:usesCleartextTraffic'] = 'true' }
    if (Array.isArray(application)) application.forEach(set)
    else if (application) set(application)
    return cfg
  })
}
module.exports = createRunOncePlugin(withAndroidCleartextTraffic, 'bizsawa-android-cleartext-traffic', '1.0.0')
```

Registered in `app.json` plugins:
```
"bizsawa-sms-capture/app.plugin.js",
"./scripts/with-android-cleartext-traffic.js",
"expo-font"
```

Local workaround already applied to `mobile/android/app/src/main/AndroidManifest.xml`
(gitignored, regenerated — the plugin is the source of truth).

## Phase 2: Google Sign In — keep Clerk OAuth, fix business routing

**Today**

`login.tsx` `handleGoogleSignIn()` uses Clerk `startSSOFlow({ strategy: 'oauth_google' })` — a browser-based
OAuth flow. After `syncClerkSession()` it read `businessId` from AsyncStorage. If that silent sync failed
(network, Clerk misconfigured) or returned nil, `businessId` was unset and the user was routed to
`/auth/business-setup` — which creates a NEW business instead of reusing the existing one. The email/password
path (`handleSubmit`) correctly probed `/businesses` to detect existing businesses; the Google path did not.

Also, the sign-in screen offered email/password, email code, Apple, and Facebook options alongside Google —
surface area for bugs and user confusion.

**Decision**

Keep Clerk OAuth as the single Google sign-in path. The native `@react-native-google-signin/google-signin`
module/package is unused dead weight: leave it installed/plugged but do not add `GoogleSignIn.configure()`.
If native Sign In is ever wanted later, add `GoogleSignIn.configure({ webClientId })`, register the Android
SHA-1 fingerprint in Google Cloud Console, and replace `handleGoogleSignIn` — but that is out of scope.

**Fix — robust business resolution across sign-in methods**

After `syncClerkSession()`, `handleGoogleSignIn` now probes `GET /businesses` (same check the email/password
path uses). If the user has any existing business membership, it persists the businessId and routes to
`/(tabs)`. Only when no business exists does it route to `/auth/business-setup`. This guarantees that
signing in with email code, then later with Google (or vice versa), lands on the same business context.

```callstack [Google sign-in flow with robust business routing]
 result = handleGoogleSignIn()
├── existingClerk = getClerkInstance()
├── if existingClerk.session: syncClerkSession() → resolveBusinessAndRoute()
└── else: result = startSSOFlow({ strategy: 'oauth_google' })
    ├── if result.createdSessionId: syncClerkSession() → resolveBusinessAndRoute()
    │   ├── businesses = GET /businesses
    │   ├── if businesses.length > 0: store businessId → router.replace('/(tabs)')
    │   └── else: router.replace('/auth/business-setup')
    └── catch (not ERR_CANCELED): Alert.alert('Google Sign-in Failed', ...)
```

**Prerequisite (do this in Clerk dashboard, not code)**

Enable Google as a social connection in the Clerk dashboard for the publishable key in `.env.development`
(`pk_test_aW1tZW5zZS1zYWxtb24tMTc4Ny5jbGVyay5hY2NvdW50cy5kZWIk`), with the configured redirect/deep-link
scheme (`bizsawa` / `exp+bizsawa-mobile`). Without this, `startSSOFlow({ strategy: 'oauth_google' })` returns
an error and `Alert.alert('Google Sign-in Failed', ...)` shows it.

```changes

```

## Phase 2b: Auth — Google sign-in links to existing user by email

**Today**

`LoginWithClerk` tried `FindByProviderAccountID("clerk", sub)` first. If a Google account was
used before (even without a business), that stale no-business user was returned and the mobile
client routed to `/auth/business-setup`, making the user create a new business. Email matching
only happened if the provider link missed.

**Proposed**

Email is now the primary identity: `LoginWithClerk` looks up the user by email first (trying every
email on the Clerk account, not just the first) and links the Clerk provider/sub to that user.
`provider_account_id` is updated when it differs from the current sub. This guarantees that signing
in with email code, then later with Google (same email), lands on the same user and business.

```callstack [LoginWithClerk email-first resolution]
 resp = LoginWithClerk(token)
├── claims = VerifyToken(token)
├── emails = [claims.Email] + fetchClerkUserEmails(secret, sub)
├── email = first candidate that already exists in DB (else first)
├── if u := FindByEmail(email): link provider/sub, UpsertAccount, issue(u)  // same business
├── else if existing := FindByProviderAccountID(clerk, sub): issue(existing)
├── else if acc := FindAccount(clerk, sub): issue(acc.user)
└── else: create new user, issue
```

```changes

```

## Phase 3: UI — Google-only sign-in with brand colors

**Today**

`mobile/app/auth/login.tsx` rendered email/password fields, email code option, biometrics, and a SocialRow
with Google, Apple, and Facebook buttons. `components/auth/AuthShell.tsx` `SocialRow` accepted all three
social providers with plain single-color circles.

**Proposed**

- Remove email/password fields, email code option, biometrics, Apple, Facebook — leave **only Google**.
- `AuthShell.SocialRow` accepts only `onGoogle`; `SocialCircle` renders the Google button with the four
  Google brand segments (blue #4285F4, red #DB4437, yellow #F4B400, green #0F9D58) as quadrant views,
  with a white center circle and the "G" glyph on top.
- `mobile/app/auth/register.tsx` updated to the new `SocialRow` signature (Google-only).

```mermaid diff [UI simplification to Google-only]
 flowchart LR
-    E[Email/Password fields] -.-> L[LoginScreen]
-    O[Email code button] -.-> L
-    A[Apple button] -.-> S[SocialRow]
-    F[Facebook button] -.-> S
+    G[Google button w/ brand colors] --> L[LoginScreen]
     L --> S[SocialRow]
     S -->|Clerk startSSOFlow| B[/auth/clerk backend]
     B -->|resolves default business| C[/businesses probe]
     C -->|has business| T[/(tabs)]
     C -->|no business| BS[/auth/business-setup]
```

```changes

```

## Phase 4: Assets / logos

## Recommendations / follow-ups

- Run `npx expo prebuild --platform android` to regenerate `mobile/android/` with the cleartext plugin, then
  `npx expo run:android` and confirm API calls reach `http://<LAN-IP>:5504`.
- Decide Google Sign In path (Clerk OAuth vs native) and remove the unused alternative.
- If assets still do not render after the network fix, confirm `assets/adaptive-icon.png` is bundled and that
  `expo-updates` (`EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS`, `LAUNCH_WAIT_MS=0`) is not stalling cold start.

## References

- `mobile/lib/api.ts` — `getApiUrl()` derives the LAN HTTP host
- `mobile/android/app/src/main/AndroidManifest.xml` — local cleartext workaround (gitignored)
- `mobile/scripts/with-android-cleartext-traffic.js` — persistent config plugin (committed)
- `mobile/app.json` — plugin registered (committed)
- `mobile/app/auth/login.tsx` — `handleGoogleSignIn` uses Clerk OAuth
- `mobile/components/auth/AuthShell.tsx` — `BrandMark` logo require
