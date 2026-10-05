# Preview distribution pipeline (v1 — pre-Play-Store)

How a stable build reaches users' phones today: EAS builds the APK,
GitHub Actions uploads it to Google Drive, the website serves it from
`web/src/download.json`, and EAS Update keeps it fresh over the air.
Play Store (`eas submit`, AAB) is the v2 path at the bottom.

## 1. The flow

```
bump version (workflow input)
  → eas build --profile preview (APK, channel=preview, autoIncrement)
  → rclone → Google Drive folder (public-link folder, SA uploads)
  → rewrite web/src/download.json (version, uc?id= link, size MB)
  → commit + push → site redeploys → Download section goes live
  → user sideloads once; later JS fixes arrive via `eas update`
```

Workflow: `.github/workflows/preview-release.yml` (manual dispatch).
Website: `DownloadApp` section (`web/src/components/DownloadApp.tsx`)
reads the manifest; empty `apkUrl` renders "First build in progress",
never a dead link.

## 2. One-time setup (needs you)

1. **Google Drive**: create folder `BizSawa-Previews`, set it to
   "Anyone with the link: Viewer" (files uploaded into it inherit this).
2. **Service account**: Google Cloud → service account → JSON key.
   Share the folder with the account's email as Editor.
3. **Repo secrets** (`Settings → Secrets → Actions`):
   - `EXPO_TOKEN` — Expo access token (builds + updates).
   - `GDRIVE_SA_JSON` — the whole service-account JSON.
   - `GDRIVE_FOLDER_ID` — from the folder URL (`/folders/<ID>`).
4. Run: Actions → "Preview release" → version `1.0.0` → notes.

## 3. Releasing

- **Hot JS fix (no native change)**: `eas update --branch preview
  --message "..."` from `mobile/`. The app checks on launch and on
  foreground (`lib/updates.ts`) and prompts to restart. No reinstall.
- **Native change / new version**: run the workflow with the new version.
  `runtimeVersion` policy is `appVersion`, so an update published for
  1.0.0 is never offered to 1.1.0 — publish per version after release.
- Manifest fields the site shows: version, build, date, MB, Android min,
  notes. All from `download.json`; no site code changes per release.

## 4. OTA — how it is possible

EAS Update splits the app in two: the **native shell** (APK, rarely
changes) and the **JS bundle** (changes constantly). `expo-updates` is
already in the app, pointed at our EAS project with channel `preview`.
Publishing (`eas update`) pushes the bundle to Expo's CDN; the client
downloads it in the background and `lib/updates.ts` asks for a restart.
Limits: JS + assets only; new native modules / SDK bumps need a fresh
APK; updates are gated by `runtimeVersion`, so mismatched builds ignore
each other instead of crashing.

## 5. Size budget (cap: 50 MB, hard ceiling 60 MB)

Measured anchors: bundled assets were 3.3 MB (crunched to ~1.6 MB),
all native modules in use, fonts 6 weights (~1–1.5 MB).

| Lever | Saving | Status |
|---|---|---|
| Remove `@react-native-firebase/app` (unused — Google Sign-In uses only `webClientId`) | ~8–12 MB native | **done** |
| PNG crunch (`optimize=True`, lossless) | 0.6 MB | **done** |
| Preview `autoIncrement` (unique versionCode per build, clean reinstalls) | hygiene | **done** |
| Drop to `armeabi-v7a`+`arm64-v8a` only (cut x86/x86_64 via config plugin) | ~10–15 MB | if first build still > 60 MB |
| Remove `expo-dev-client` (dev uses local `run:android`, not EAS dev builds) | ~4–6 MB | optional, same trigger |
| Audit Geist Mono Bold / Tamagui weight | ~1–2 MB | last resort |

R8/minify + Hermes bytecode are already on for release builds.
First action after the maiden preview build: read the real APK size
from the workflow output and apply the next lever only if over budget.

## 6. v2 — Play Store (later)

- `eas build --profile production` (AAB, Play handles per-device splits —
  the size problem mostly disappears).
- `eas submit -p android --profile production` (needs Play Console +
  service-account key; first upload is manual).
- Keep this preview track: internal testers stay on Drive + `preview`
  channel, the public moves to the store track (`production` channel).
