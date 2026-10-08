# Module ↔ DB table registry (load-test coverage map)

Every k6 request is tagged `{module, table, op}` so results slice per table.
`module` = backend module under test, `table` = primary registry table exercised.

| Module (k6 file) | Postgres tables | Endpoints hit |
|---|---|---|
| auth (`modules/auth.js`) | `auth_users`, `auth_accounts`, `auth_otps`, `auth_refresh_tokens` | POST /auth/login, GET /auth/check-email, POST /auth/email-otp/*, POST /auth/refresh |
| business (`modules/business.js`) | `businesses`, `business_members`, `business_invites`, `tenancy_subscriptions`, `subscription_payments`, `user_profiles` | GET/POST /businesses, GET /profile, GET /subscriptions |
| users (`modules/users.js`) | `user_profiles`, `business_members`, `business_invites` | GET /businesses/{id}/members, GET /invites, POST …/invite |
| products (`modules/products.js`) | `products`, `product_variants` | GET/POST /products, GET/PUT/DELETE /products/{id} (create→update→delete lifecycle) |
| customers (`modules/customers.js`) | `customers` (+ `sales`/`invoices` for history) | GET/POST /customers, GET /customers/top, GET /customers/{id}/purchase-history |
| taxes (`modules/taxes.js`) | `tax_rules`, `tax_entries` | GET/POST /taxes/rules, GET /taxes/summary |
| inventory (`modules/inventory.js`) | `inventory_items`, `stock_movements` | GET /inventory, /low-stock, /movements, /valuation, POST /inventory/adjustments |
| orders (`modules/orders.js`) | `orders`, `order_lines` | GET/POST /orders, POST /orders/{id}/confirm|fulfill|cancel |
| sales (`modules/sales.js`) | `sales`, `sale_lines` | GET/POST /sales, GET /sales/summary|by-product|by-payment-method, POST /sales/{id}/void |
| expenses (`modules/expenses.js`) | `expenses` | GET/POST /expenses, GET /expenses/summary, GET+DELETE /expenses/{id} |
| invoices (`modules/invoices.js`) | `invoices`, `invoice_lines` | GET/POST /invoices, GET /invoices/{id}, POST …/record-payment |
| payments (`modules/payments.js`) | `payment_commands` | GET /payments (writes gated: `WRITE_PAYMENTS=1` — hits M-Pesa sandbox) |
| analytics (`modules/analytics.js`) | `analytics_snapshots` (+ aggregates) | GET /analytics, /tax, /ai-insights, POST /analytics/refresh (heavy, low weight) |
| sync (`modules/sync.js`) | `conflicts`, `outbox_events` (+ all synced tables) | GET /sync/pull, POST /sync/push, GET /sync/conflicts |
| waha-chat (`modules/waha-chat.js`) | `outbox_events` | POST /waha/send|notify (validation-only unless `WRITE_WAHA=1`), POST /chatbot/chat (unless `WRITE_LLM=1`) |
| e2e (`workflows/e2e-business.js`) | all of the above in one chain | restock → order → confirm → fulfill → sale → invoice → pay → dashboard |
| mobile (`workflows/mobile-flows.js`) | same tables, mobile access pattern | cold-start burst, tab reads, offline-queue replay via /sync/push |

Shared infra tables (`audit_log`, `auth_refresh_tokens`, River queues) are exercised
implicitly on every authenticated request (middleware + job enqueue).
