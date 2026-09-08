# BizSawa Deployment Sage — Build, Test, Bundle, Ship (Android)

> Status: PLAN — read-only. Execute only after exiting plan mode (`/build`).
> Last audited: 2026-09-06 | Mobile `biz-sawa-mobile-application@1.0.0` Expo SDK 54 / RN 0.81.5 / bun 1.3.10 | Backend Go 1.25 / chi / GORM / River / Postgres 16 / Redis 7 | EAS project `875b82a6-0306-4849-949b-b55ac683eb92` | No CI, no Dockerfile, no E2E suite (verified).

---

## 0. Current-state audit (what we walked)

```
mobile/app.json:  name BizSawa, slug bizsawa-mobile, version 1.0.0, android.package com.bizsawa.mobile, ios.bundle com.bizsawa.mobile, scheme bizsawa
mobile/eas.json:  cli >=5.9, builds {development (dev-client), preview (internal), production} — all empty (no env/channel/env vars)
mobile/package.json: scripts start/android/ios/web/lint/format — no test, no e2e, no build:android
mobile/android:  Expo prebuild present (android/app/build.gradle, Kotlin 2.0.21, compileSdk 35, target 35, hermes on)
mobile tests:    none (zero __tests__/tests/e2e outside node_modules)
backend:         docker-compose.yml only postgres+redis+waha, no Dockerfile, no .github/workflows, go.mod no CI lint
backend tests:   6 *_test.go (invoices, authz, crypto, mcp, payments) — no business/order/sync/tenancy subscription tests
api.ts:          getApiUrl() resolves EXPO_PUBLIC_API_URL or Expo hostUri or localhost:5504 -> /api/v1, uses X-Business-ID header + businessId query
tenancy:         plans free(1 biz) / premium(5 biz, AI, full reports) / enterprise — subscription_payments table now isolated (migration 000015)
```

**Gaps that block shipping:**
1. No CI — no lint/typecheck/test gate.
2. No env injection — `EXPO_PUBLIC_API_URL` never set for preview/production, preview build will hit `10.0.2.2:5504` and 403.
3. No E2E — business workflows (register → create business → add product → adjust inventory → add customer → create order → fulfill → sale → expense → invoice → M-Pesa STK → subscription STK → offline sync → analytics zero-fill) untested.
4. No `eas` secrets, no `credentials.json`, no `build:android` pipeline for testers (APK/AAB).
5. No backend Dockerfile/Deploy, no health/ready wired to cloud.
6. No Play Console metadata, signing, internal track.

---

## 1. Exact steps we would have taken (sequential, ordered by dependency)

### Phase A — Harden the graph (1 day)

**A1. Env & secrets**
- Add `mobile/.env.example` → `mobile/.env.development` (gitignored): `EXPO_PUBLIC_API_URL=https://api.dev.bizsawa.com/api/v1`, `EXPO_PUBLIC_EAS_PROJECT_ID=875b82a6...`.
- `eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.dev.bizsawa.com/api/v1` for `preview` + `production` separately.
- Add `mobile/eas.json` env overrides:
```json
"preview": {"distribution":"internal","channel":"preview","env":{"EXPO_PUBLIC_API_URL":"https://api.staging.bizsawa.com/api/v1"}},
"production": {"channel":"production","autoIncrement":true,"env":{"EXPO_PUBLIC_API_URL":"https://api.bizsawa.com/api/v1"}},
"production-simulator": {"extends":"production"}
```

**A2. Lint/type gates (no new deps)**
- `mobile: npm run lint -- --max-warnings=0 && npx tsc --noEmit --skipLibCheck`
- `backend: go vet ./... && golangci-lint run` (add `backend/.golangci.yml` already present) + `go test ./... -run Test` fast.

**A3. Backend Dockerfile + compose for cloud**
- Add `backend/Dockerfile` (multi-stage):
```Dockerfile
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api && go build -o /out/migrate ./cmd/migrate
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /out/api /api
COPY --from=builder /out/migrate /migrate
COPY migrations /migrations
EXPOSE 5564
CMD ["/api"]
```
- Add `backend/.dockerignore`, extend `docker-compose.yml` with `api` service + `migrate` init.
- Add `backend/cmd/migrate/main.go` already exists — wire `migrate up` on deploy.

### Phase B — CI/CD pipeline (GitHub Actions)

**B1. Create `.github/workflows/ci.yml`**
- Triggers: `push` to `main`, `pull_request`, `workflow_dispatch`.
- Jobs (parallel where possible):
  - `mobile-lint-type` — `bun install --frozen-lockfile`, `bun run lint`, `npx tsc --noEmit`
  - `mobile-unit` — placeholder `bun run test` (skipped until Phase C, but job exists with `if: false` to allow later enable)
  - `backend-vet-test` — `setup-go 1.25`, `go vet ./...`, `go test ./...` with Postgres service (`postgres:16-alpine`, health `pg_isready`) + Redis service
  - `e2e` — depends on above, runs Docker compose + `./scripts/e2e.sh` (see Phase C)
- Add branch protection: require `ci` to pass before merge.
- Add `dependabot.yml` for `gomod` + `npm`.

**B2. CD for backend (on `main`)**
- Job `deploy-backend` `needs: [backend-vet-test, e2e]` `if: github.ref == 'refs/heads/main'`
- Steps: `docker build -t registry.fly.io/bizsawa-api:$SHA`, `flyctl deploy --remote-only` **or** `gcloud run deploy` **or** `render deploy`. Secrets from GitHub `MPESA_*`, `JWT_SIGNING_KEY`, `DATABASE_DSN`, `REDIS_ADDR`.
- Post-deploy: `curl https://api.bizsawa.com/ready` + `health`.

**B3. CD for mobile (EAS)**
- Use `expo/expo-github-action@v8` + `eas-build`.
- Jobs `eas-preview` (internal) on every `push` to `main` — `eas build --platform android --profile preview --non-interactive --no-wait` → artifact `aab`/`apk`.
- `eas-production` manual `workflow_dispatch` for store.

### Phase C — Integration & E2E (the missing workflows)

**C1. Choose runner: Maestro + Detox vs Playwright+API**
- For Expo/RN, **Maestro** is minimal (no native setup, YAML flows, offline sync test via airplane toggle). Keep **API E2E** in Go/Node for business logic without emulator flake.
- We would implement **both**:
  - `mobile/e2e/maestro/` flows (YAML, run via `maestro test`)
  - `mobile/e2e/api/` flows (Node `axios` + `vitest`, run against staging API)

**C2. Workflows we would implement (one file per missed execution)**

| # | Flow | Entrypoint | Asserts | Where to run |
|---|------|-----------|---------|-------------|
| 1 | Auth register → login → offline cache | `POST /auth/register` → `POST /auth/login` → `GET /auth/refresh` → kill net → `verifyOfflineCredential` | 201, JWT, SecureStore cached, offline login succeeds | API + Maestro `auth.yaml` |
| 2 | Business onboarding | `POST /businesses` (free limit 1, second fails 403), `GET /businesses`, `PUT /businesses/{id}` (taxPin bug fixed) → verify `BusinessContext` hydrate | 201/403, `X-Business-ID` persisted | API |
| 3 | Profile update | `GET /profile` w/o business header (now allowed), `PUT /profile {firstName,phone}` → reload | 200, `user_profiles` updated | API |
| 4 | Product + variants + inventory | `POST /products {variants:[{price}]}`, `GET /products`, `POST /inventory/adjust {productId, quantityDelta}`, `GET /inventory/low-stock` | variants created, quantityDelta applied, sync_version bump | API + Maestro `stock.yaml` |
| 5 | Customer CRM | `POST /customers`, `GET /customers`, `POST /customers/{id}/notes` | 201, list contains | API |
| 6 | Order → Sale → Inventory decrement | `POST /orders {lines}`, `POST /orders/{id}/confirm`, `POST /sales {orderId}`, `GET /sales/summary` | order fulfilled, sale `RCPT-`, inventory `quantity` ↓ | API |
| 7 | Expense | `POST /expenses {category,amount,spentAt}`, `GET /expenses`, `DELETE` → analytics snapshot deleted | 201, analytics invalidated | API |
| 8 | Invoice + WAHA | `POST /invoices {orderId}`, `POST /invoices/{id}/send {channel:whatsapp}`, `POST /waha/send` mock | invoice `sent`, waha 202 | API |
| 9 | Business M-Pesa (isolated) | `POST /payments/initiate {type:stk_push, orderID, amount, phone}` with `X-Idempotency-Key`, `GET /payments/{id}`, mock Daraja `POST /mpesa/callback` | 202, `payment_commands` status `processing` → `succeeded`, order `paymentStatus` updated | API |
|10 | Subscription upgrade (isolated) | `POST /subscriptions/upgrade/initiate {plan:premium,phone}` → `GET /subscriptions/payments/{id}` poll 3s → mock `POST /subscriptions/callback` with `CheckoutRequestID` → `GET /subscriptions/subscription` → `premium` | 202, `subscription_payments` succeeded, `tenancy_subscriptions` `ACTIVE premium endsAt +30d`, **no** `payment_commands` row created | API |
|11 | Sync offline/online | create product offline (NetInfo false → pending), `syncNow` → `POST /sync/push` → `GET /sync/pull` → verify server has row, `analytics snapshot` recomputed | pending 0, pull contains row | Maestro `offline.yaml` (airplane toggle) |
|12 | Analytics zero-fill | create sales on 2/7 days, `GET /analytics?timeframe=week` → `revenue.data.length==7`, zeros have `revenue=0`, `transactions=0`, bar height 2px + `0` label, line dots on baseline | 200, gap-fill | API + Maestro `insights.yaml` |

**C3. Scripts**
- `mobile/scripts/e2e.sh` — starts `docker-compose up postgres redis`, runs `go run ./cmd/migrate up`, starts `api` on `5505`, waits `curl /ready`, runs `bunx vitest run e2e/api`, then optional `maestro test e2e/maestro` if emulator available.
- Add `mobile/package.json` scripts: `"test:e2e:api": "vitest run e2e/api"`, `"test:e2e:maestro": "maestro test e2e/maestro"`.
- CI caches `bun.lock`, `go.mod`.

### Phase D — Bundling for test users (no store yet)

**D1. EAS preview (internal distribution)**
- `eas build --platform android --profile preview` → `aab` + `apk` (set `preview` to `apk` for sideload: `"android":{"buildType":"apk"}`).
- `eas update` not needed (no OTA yet — keep deterministic).
- Secrets: `eas secret:list`, `eas credentials` (create keystore via `eas credentials --platform android` — auto-generates `android.keystore`).

**D2. Share**
- `eas build:list` → download link, QR via `expo.dev/accounts/<you>/projects/bizsawa-mobile/builds/<id>`.
- Invite testers via `expo.dev` → `Members` + `Testers` (email), or upload `apk` to `Google Drive` + `Firebase App Distribution` (`fastlane` or `firebase appdistribution:distribute`).
- Add `mobile/fastlane/` for future `supply` to Play Internal.

### Phase E — Cloud deploy

**E1. Backend**
- Target: `Fly.io` (Postgres + Redis + app in one region `nbo` for M-Pesa latency) or `Render` or `GCP Cloud Run` + `Cloud SQL`.
- `fly.toml` with `[[services]] internal_port 5564`, `env DATABASE_DSN`, `MPESA_*`, `JWT_ISSUER/SIGNING_KEY`, `CORS_ALLOWED_ORIGINS=https://api.bizsawa.com,exp://*`.
- Deploy via `flyctl deploy` in `deploy-backend` job. Migration runs as `release_command = "./migrate up"`.

**E2. Observability**
- Add `slog` JSON → `GCP Logging`/`Datadog`, `river` UI, `GET /health` + `/ready` for uptime.

### Phase F — Store submission

**F1. Android (Play Console)**
- `eas build --platform android --profile production` → `aab` (not apk). `targetSdk 35` already compliant (Aug 2025+ requirement 34).
- Play Console: create app `com.bizsawa.mobile`, fill `Data safety` (M-Pesa phone, SecureStore), `Content rating`, `Store listing` (splash ` #F4F9F7`, icon light).
- `eas submit --platform android --profile production` → `serviceAccountKey.json` (create in Play Console → `API access` → `Link project`).
- Tracks: `internal` → `closed` → `production`. Provide `internal` testers list (your test users) for pre-review.

**F2. iOS (optional)**
- `eas build --platform ios --profile production`, `eas submit --platform ios` with `ascApiKey.p8`.

**F3. Compliance**
- Privacy policy URL, terms, M-Pesa disclaimer, `NSAllowsLocalNetworking` already in `app.json` for dev — remove for prod.
- `app.json` `version` `1.0.0` → `autoIncrement` via EAS (`production.autoIncrement true`).

---

## 2. Side-by-side research guidelines (where to read)

| Topic | Official / deep docs | Practical Kenyan / Expo context |
|-------|----------------------|--------------------------------|
| **Expo EAS Build & Submit** | `docs.expo.dev/build/introduction`, `docs.expo.dev/build/eas-json`, `docs.expo.dev/submit/android`, `docs.expo.dev/distribution/internal-distribution` — credential types, `buildType apk/aab`, `channel` env injection. | `expo.fyi/manual-android-build` (when EAS fails), `expo.fyi/maestro-with-expo` |
| **CI/CD GitHub Actions** | `docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-go`, `docs.github.com/en/actions/use-cases/caching-dependencies`, `docs.github.com/en/actions/security-guides/encrypted-secrets`. Go `golangci-lint` action `golangci/golangci-lint-action`. | `github.com/expo/expo-github-action` README — caching `bun`, `eas build --non-interactive --wait` pattern |
| **Backend deploy (Go + Postgres + River)** | `riverqueue.com/docs/running-river` (River in Docker), `gorm.io/docs/connecting_to_the_database.html`, `fly.io/docs/golang/`, `cloud.google.com/run/docs/deploying` | `render.com/docs/deploy-go` — env `DATABASE_DSN`, health checks |
| **API integration & auth** | `docs.expo.dev/guides/authentication` (SecureStore), `axios` interceptors, `tanstack.com/query` docs | `watermelondb` sync `nozbe.github.io/WatermelonDB/Advanced/Sync.html` — offline-first + `syncNow` every 8min |
| **E2E: Maestro** | `maestro.mobile.dev` — `maestro test`, `yaml` flow, `launchApp`, `tapOn`, `assertVisible` | `docs.expo.dev/guides/testing-with-maestro` — Expo dev-client + Maestro on CI (emulator `reactivecircus/android-emulator-runner@v2`) |
| **E2E: API (business workflows)** | `vitest.dev`, `axios` + `testcontainers-go` for Postgres/Redis, `stretchr/testify` | `martinfowler.com/articles/practical-test-pyramid.html` — keep 12 flows API-first, Maestro only for offline UI |
| **Android bundling (AAB/APK)** | `developer.android.com/build/building-cmdline`, `developer.android.com/studio/publish/app-signing`, `developer.android.com/distribute/security` | `docs.expo.dev/build-reference/apk` vs `aab`, `eas credentials` keystore backup |
| **Play Console submission** | `play.google.com/console` help: `support.google.com/googleplay/android-developer` — `Data safety`, `Content rating`, `Internal testing`, `Closed testing`, `Production` tracks, `serviceAccountKey` | `docs.expo.dev/submit/android#prepare-service-account` — `eas submit` + `supply` fastlane |
| **M-Pesa Daraja (isolation proof)** | `developer.safaricom.co.ke/Documentation` — `STK Push`, `C2B Simulate`, `Callback`, `TransactionStatus`, sandbox `254708374149` | Keep `BusinessShortCode/Passkey/CallbackURL` in `env`, never commit; test `POST /subscriptions/callback` with `CheckoutRequestID` lookup isolated from `payment_commands` |
| **Sync offline** | ` WatermelonDB sync docs` + `NetInfo` `reactnative.directory` | Test offline by `maestro` `setAirplaneMode` or API by mocking `NetInfo.fetch() === false` → pending queue → `syncNow` |

---

## 3. Execution checklist (copy to GitHub issues)

```
[ ] A1 env & eas.json channels
[ ] A2 lint/type gates
[ ] A3 Dockerfile + docker-compose api
[ ] B1 .github/workflows/ci.yml (lint, vet, e2e)
[ ] B2 deploy-backend (fly/render) + health
[ ] B3 eas-preview on main
[ ] C1 add e2e/maestro + e2e/api scaffolds
[ ] C2 implement 12 flows (table above) — start with 1-4,6,10,12 for premium isolation proof
[ ] D1 eas build preview apk + share via EAS internal
[ ] E1 deploy staging api + set EXPO_PUBLIC_API_URL secrets
[ ] F1 Play Console internal track + serviceAccountKey + eas submit
```

**Next human step:** exit plan mode (`/build` or `Plan mode: off`), then run Phase A1 → `eas secret:create` → `eas build --platform android --profile preview` → share QR. All commands non-interactive; `deployment_sage.md` is the source of truth — do not duplicate steps ad-hoc.

> Non-goals for v1: OTA `eas update`, iOS submission, `waha` production (profile whatsapp), load tests. Add after internal track feedback.
