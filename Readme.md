# Bizsawa (Bizworth / FinAI)

**The operating system for small trade.**

Bizsawa is a mobile-first business management platform built for Kenyan and East African MSME owners, shopkeepers, and managers who run their day-to-day trade from a phone on intermittent connectivity. It unifies point-of-sale (sales/orders), inventory, invoicing (with WhatsApp delivery), expenses, M-Pesa payments, and pre-computed analytics into a single offline-first workspace.

> **Job to be done:** record a sale in under 10 seconds, see today's cash in one glance, chase an overdue invoice over WhatsApp, and know what to restock — without leaving the shop floor.

---

## Table of Contents

- [Product Overview](#product-overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Backend Modules](#backend-modules)
- [Reliability & Platform Concerns](#reliability--platform-concerns)
- [Offline-First Mobile Sync](#offline-first-mobile-sync)
- [AI Features](#ai-features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Design Principles](#design-principles)
- [Roadmap Notes](#roadmap-notes)

---

## Product Overview

Small traders juggle sales, stock, invoices, expenses, and cash flow between customers in Kiswahili and English — often with low digital literacy, high time pressure, and unreliable connectivity. Bizsawa is designed around that reality:

- **Mobile-first, ink-first UI** — numbers-first, calm, and legible over flashy dashboards.
- **Works offline** — a shop owner can keep selling with no signal; the app syncs back up when connectivity returns.
- **Bilingual by default** — English/Kiswahili (en-KE/sw), KES currency formatting throughout.
- **WhatsApp-native invoicing** — because that's where the customer conversation already happens.
- **M-Pesa-native payments** — the dominant payment rail for the target market.

See [`PRODUCT.md`](./PRODUCT.md) for the full product brief, target users, and brand/design principles.

## Architecture

Bizsawa is a **modular monolith** written in Go, backed by PostgreSQL and Redis, paired with a React Native (Expo) mobile client that treats local storage as the source of truth when offline.

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│   Mobile (Expo / RN)     │        │        Backend (Go)           │
│  WatermelonDB (offline)  │◄──────►│  Chi HTTP API · River workers  │
│  TanStack Query          │  sync  │  PostgreSQL · Redis · WAHA    │
└─────────────────────────┘        └──────────────────────────────┘
```

- **API layer** — [go-chi](https://github.com/go-chi/chi) router, one route group per domain module, mounted under `/api/v1`.
- **Persistence** — PostgreSQL via GORM, with raw `pgx/v5` access where needed (e.g. for the job queue).
- **Background work** — [River](https://riverqueue.com/), a Postgres-backed job queue, drives async workers per module (invoice reminders, sales aggregation, payment reconciliation, etc.) instead of a separate broker.
- **Caching / streams** — Redis, including a Redis Streams–backed event bus for cross-module domain events.
- **Multi-tenancy** — every request resolves a business/tenant context via middleware before hitting domain handlers.

## Tech Stack

**Backend**
- Go
- [Chi](https://github.com/go-chi/chi) — HTTP routing & middleware
- GORM + PostgreSQL — primary datastore
- [River](https://riverqueue.com/) (`riverpgxv5`, `riverdatabasesql`) — Postgres-native async job queue
- Redis — caching + Streams-based event bus
- [Casbin](https://casbin.org/) — RBAC/ABAC/ACL authorization
- `golang-migrate` — schema migrations
- WAHA (WhatsApp HTTP API) — WhatsApp messaging integration
- M-Pesa Daraja API — mobile money payments

**Mobile**
- React Native + Expo (Expo Router)
- [WatermelonDB](https://watermelondb.dev/) — offline-first local database, source of truth when disconnected
- TanStack Query — server-state sync layer
- Tamagui + NativeWind — UI/styling
- Firebase + Google Sign-In — auth providers
- React Native Reanimated / Worklets

## Backend Modules

The backend is organized as one package per business domain under `backend/internal/`, each following a consistent `domain / handler / service / repository / module` shape:

| Module | Responsibility |
|---|---|
| `auth` | Authentication, token issuance |
| `tenancy` | Multi-tenant business context resolution |
| `business`, `users` | Business accounts and staff/user management |
| `products`, `inventory` | Product catalogue and stock levels |
| `customers` | Customer relationship records |
| `orders`, `sales` | Order lifecycle and point-of-sale transactions |
| `invoices` | Invoice generation, state machine, WhatsApp delivery |
| `payments` | M-Pesa integration, payment state machine |
| `expenses` | Expense tracking |
| `taxes` | Tax computation |
| `analytics` | Pre-computed business analytics/aggregates |
| `chat`, `mcp` | AI assistant and tool-calling surface (see [AI Features](#ai-features)) |
| `waha` | WhatsApp messaging client and templates |
| `sync` | Mobile offline sync protocol |

Cross-cutting concerns live under `internal/shared/`: `authz`, `outbox`, `eventbus`, `circuitbreaker`, `idempotency`, `cache`, `crypto`, `middleware`, `errors`, `pagination`.

## Reliability & Platform Concerns

Several domains that touch money or external systems (`orders`, `payments`, `invoices`, `sales`) are built with explicit reliability patterns rather than bare CRUD:

- **State machines** — orders, payments, and invoices each move through an explicit state machine (`state_machine.go`) rather than ad-hoc status flags.
- **Transactional outbox** (`shared/outbox`) — domain events are written in the same transaction as the state change they describe, then published asynchronously, avoiding dual-write inconsistency.
- **Idempotency keys** (`shared/idempotency`, `middleware.Idempotency`) — mutating requests carry an `X-Idempotency-Key` header so retries (common on flaky mobile connections) don't double-process a sale or payment.
- **Circuit breaker** (`shared/circuitbreaker`) — wraps calls to external dependencies (M-Pesa, WAHA) to fail fast and recover gracefully.
- **Event bus over Redis Streams** (`shared/eventbus`) — decouples modules; e.g. a completed sale can trigger inventory and analytics updates without direct coupling.
- **Async workers via River** — each domain that needs background processing (`invoices/workers.go`, `payments/workers.go`, `orders/workers.go`, `sales/workers.go`, `analytics/workers.go`) runs as Postgres-backed jobs, so retries and scheduling don't need a separate message broker.
- **Authorization** — Casbin-based RBAC/ABAC/ACL enforcement (`shared/authz`), checked centrally rather than per-handler.

## Offline-First Mobile Sync

The mobile app is designed for shop owners who may not have reliable connectivity:

- WatermelonDB holds the local, on-device source of truth.
- The `sync` backend module implements the protocol the client uses to reconcile local changes with PostgreSQL once connectivity returns.
- TanStack Query manages the online data-fetching layer on top of that local store.

See [`Agents_Documents/Offline_Functionalit`](./Agents_Documents/Offline_Functionalit) and [`mobile_backend_integration.md`](./mobile_backend_integration.md) for the detailed offline sync design.

## AI Features

Bizsawa includes an AI assistant surface built on the **Model Context Protocol (MCP)**:

- `internal/chat` — conversational AI service (business coach / assistant, per the `AI_Coach.png` and `Social_Generator.png` product surfaces).
- `internal/mcp` — an MCP server (`cmd/mcp-server`) exposing business data and actions as tools, with its own auth flow, tool registry, and per-tenant authorization checks (`internal/mcp/auth.go`, `registry.go`, `tools.go`) — so the assistant can act on a business's real data without bypassing tenant/authz boundaries.

## Project Structure

```
Bizsawa/
├── backend/
│   ├── cmd/
│   │   ├── api/            # Main HTTP API entrypoint
│   │   ├── mcp-server/     # MCP (AI tool-calling) server entrypoint
│   │   └── migrate/        # Migration CLI
│   ├── internal/           # Domain modules + shared platform code
│   ├── migrations/         # SQL migrations (golang-migrate)
│   ├── docs/                # openapi.yaml + WAHA integration notes
│   └── docker-compose.yml  # Postgres, Redis, WAHA (local dev)
├── mobile/                  # Expo / React Native app
├── Agents_Documents/        # Architecture docs, execution plans, agent briefs
├── NOTES/                   # Working notes / implementation logs
└── PRODUCT.md               # Product brief, users, brand & design principles
```

## Getting Started

### Prerequisites
- Go (recent stable version)
- Node.js + a package manager (npm/bun) for the mobile app
- Docker & Docker Compose

### Backend

```bash
cd backend

# Start Postgres, Redis (and optionally WAHA) for local dev
docker compose up -d postgres redis

# Configure environment (DATABASE_DSN, REDIS_ADDR, JWT_SIGNING_KEY, etc.)
cp .env.example .env.development   # create if not present; see internal/shared/config

# Run migrations
go run ./cmd/migrate up

# Start the API server (default :5564)
go run ./cmd/api

# (optional) Start the MCP server for AI tool access (default :5574)
go run ./cmd/mcp-server
```

To enable WhatsApp locally, start the `waha` profile:

```bash
docker compose --profile whatsapp up -d
```

### Mobile

```bash
cd mobile
npm install   # or: bun install
npm run start
```

## API Documentation

The REST API is documented via OpenAPI at [`backend/docs/openapi.yaml`](./backend/docs/openapi.yaml). WhatsApp-specific integration rules are documented in [`backend/docs/WAHA_RULES_IMPLEMENTATION.md`](./backend/docs/WAHA_RULES_IMPLEMENTATION.md).

## Design Principles

Bizsawa's product and interface decisions are grounded in a documented brand voice — *trusted, grounded, precise* — and a set of concrete usability rules (WCAG 2.1 AA targets, 48px+ touch targets, bilingual number/date formatting, reduced-motion support). Full detail lives in [`PRODUCT.md`](./PRODUCT.md).

## Roadmap Notes

Ongoing design/architecture work and execution plans are tracked in [`Agents_Documents/`](./Agents_Documents), including the Go backend rewrite plan (`bizsawa_go_rewrite_prompt.md`, `bizsawa_go_module_execution_plan.md`) and MCP implementation plan (`mcp_implementation_plan.md`). Day-to-day progress notes live in [`NOTES/`](./NOTES).

---

*Internal module path: `github.com/Codecx-Org/FinAI` — the codebase is also referred to as FinAI/Bizworth internally.*
