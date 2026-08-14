# Mobile Backend Integration Plan

## Summary

Integrate the Expo mobile app with the Go backend by replacing the current demo/Node-style API assumptions with backend DTOs, authenticated tenant-aware requests, idempotent mutations, business onboarding state, and role-aware client behavior.

## Backend Gaps Found In Mobile

- Mobile points to `/api` on port `3000`; backend serves `/api/v1` on port `5504`.
- Mobile expects auth response `{ token, business }`; backend returns `{ userId, accessToken, refreshToken }`.
- Mobile uses numeric IDs; backend uses UUID strings.
- Mobile sends number values for money and quantity; backend serializes decimals as JSON strings.
- Mobile calls unsupported routes such as `/auth/google`, `/analytics/*`, `/achievements`, `/chatbot/chat`, `/credit/trust-preview`, `/payments/initiate`, and `/payments/{orderId}/status`.
- Mobile hooks expect bare arrays; backend list endpoints return envelopes such as `{ products }`, `{ customers }`, `{ businesses }`.
- Backend authorization needs selected business context through JWT claims or `X-Business-ID`; mobile currently stores only a token and business-shaped user data.
- Payment initiation requires `X-Idempotency-Key`; mobile currently sends no idempotency keys.

## Implementation Changes

- Add frontend DTOs matching `backend/docs/openapi.yaml`.
- Update the Axios client to use `/api/v1`, persist access/refresh tokens, inject `Authorization`, inject `X-Business-ID`, refresh tokens on `401`, and add idempotency keys to mutating requests.
- Add business context for loading, creating, selecting, and persisting the active business.
- Add role helpers for `OWNER`, `MANAGER`, `CASHIER`, and `VIEWER` so UI screens can hide or disable forbidden actions.
- Rework resource hooks for products, customers, orders, sales, expenses, inventory, analytics summaries, and payments against backend route shapes.
- Split full business-owner onboarding into account registration, business setup, and profile setup.

## Test Plan

- Run `npx tsc --noEmit` from `mobile`.
- Verify register/login stores `userId`, `accessToken`, and `refreshToken`.
- Verify selecting a business persists `businessId` and causes protected requests to include `X-Business-ID`.
- Verify list hooks unwrap backend envelopes.
- Verify product/order/sale/expense/payment requests serialize UUIDs and decimal strings correctly.
- Verify payment initiation sends a stable `X-Idempotency-Key`.
- Manually exercise: register, create business, create profile, add product, adjust inventory, create customer, create order, create sale, record expense, initiate payment, and role-gated forbidden actions.

## Assumptions

- `backend/docs/openapi.yaml` is the source of truth.
- Google auth, chatbot, achievements, and credit preview need backend support before they can become live mobile features.
- Decimal API values remain strings at the network boundary and are converted only for UI display.
- The first business returned by `GET /businesses` may be auto-selected when no previous selection exists.
