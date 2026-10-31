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

## Phase 2: Google Sign In — keep Clerk OAuth (decision)

**Today**

`login.tsx` `handleGoogleSignIn()` uses Clerk `startSSOFlow({ strategy: 'oauth_google' })` — a browser-based
OAuth flow. The `@react-native-google-signin/google-signin` native module is installed + plugged but **never
`GoogleSignIn.configure()`d**, so if native Google Sign In is intended, it will not load/run.

**Decision**

Keep Clerk OAuth as the single Google sign-in path. The native `@react-native-google-signin/google-signin`
module/package is unused dead weight: leave it installed/plugged but do not add `GoogleSignIn.configure()`.
If native Sign In is ever wanted later, add `GoogleSignIn.configure({ webClientId })`, register the Android
SHA-1 fingerprint in Google Cloud Console, and replace `handleGoogleSignIn` — but that is out of scope.

**Prerequisite (do this in Clerk dashboard, not code)**

Enable Google as a social connection in the Clerk dashboard for the publishable key in `.env.development`
(`pk_test_aW1tZW5zZS1zYWxtb24tMTc4Ny5jbGVyay5hY2NvdW50cy5kZWIk`), with the configured redirect/deep-link
scheme (`bizsawa` / `exp+bizsawa-mobile`). Without this, `startSSOFlow({ strategy: 'oauth_google' })` returns
an error and `Alert.alert('Google Sign-in Failed', ...)` shows it.

```callstack [Current Google sign-in flow — Clerk OAuth]
 result = handleGoogleSignIn()
├── existingClerk = getClerkInstance()
├── if existingClerk.session: syncClerkSession() → router.replace
└── else: result = startSSOFlow({ strategy: 'oauth_google' })
    ├── if result.createdSessionId: syncClerkSession() → router.replace
    └── catch (not ERR_CANCELED): Alert.alert('Google Sign-in Failed', ...)
```

```changes

```

## Phase 3: Assets / logos

**Today**

`components/auth/AuthShell.tsx` `BrandMark` uses `require('../../assets/adaptive-icon.png')`; `app.json`
`icon`/`splash` reference existing `assets/icon-light.png` / `assets/splash-icon.png`. Assets are bundled and
render correctly in isolation.

**Proposed**

No code change. Verify after the network fix (#1) that the device can reach the API/EAS updates — cold-start
stall from a failed update check is the most likely reason logos "do not render" in the field.

```changes

```

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
