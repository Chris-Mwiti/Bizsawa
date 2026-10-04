# Backend — Module Interactions

How the modules call each other: synchronous calls, River job bridges, and the full end-to-end sequences for the money paths.

## 1. Dependency map (sync calls)

```
auth ──MembershipResolver──→ users (RoleForUser, AddOwner)
     ──SubscriptionProvisioner──→ tenancy (EnsureDefaultSubscription)
business ──guard──→ tenancy (EnforceBusinessLimit)
         ──members──→ users (AddOwner)
orders ──sync──→ inventory (DecrementForOrder / RestoreForOrder)
       ──sync──→ invoices (buildInvoicePayload, GetInvoiceByOrderID)
       ──sync──→ sales (CreateFromOrder on fulfill)
       ──async─→ payments (order.event/OrderPaymentInit → InitiateOrder)
sales ──sync──→ taxes (RecordSaleTax) + inventory (DeductForSale / RestoreForSale)
expenses ──sync──→ taxes (RecordExpenseTax)
payments ──sync──→ MpesaClient (Daraja STK/C2B/B2C, token/post)
         ──async─→ payment.event/PaymentConfirmed → orders.PaymentUpdate
                                                   + invoices.RecordPayment/SettleCustomerPayment
invoices ──async─→ invoice.event/InvoicePaid → PDF build (WhatsApp channel)
                              /InvoiceCancelled → owner notify (stub)
analytics ──async─→ analytics.compute(All) → Compute/UpsertSnapshot
tenancy ──STK──→ payments.MpesaClient via mpesaAdapter
          (subscription upgrades; isolated from business payments)
chat ──read-only──→ mcp.Registry (authz-filtered) ──→ sales/inventory/
                     customers/expenses/invoices services
waha ←── direct /waha routes only (workers log instead of calling today)
sync ──direct SQL/GORM──→ all tables (pull/push, ledger repair via
         inventory.ApplyLedger helpers)
users/tenancy ──email──→ shared/email ResendSender (OTP, invites)
```

Direction rule: **orders/sales/expenses call taxes and inventory synchronously** (they need the write to succeed or fail together); **money confirmation crosses domains asynchronously** (River jobs), so a Daraja callback can never half-update an order and an invoice.

## 2. Event flow summary

All state transitions emit River jobs transactionally (`order.*`, `invoice.*`, `payment.*`, `sale.created`, `analytics.compute`):

| Publisher | Job | Consumer | Effect |
|---|---|---|---|
| orders.Confirm | `order.event/OrderPaymentInit` | `orderWorker` | `paymentService.InitiateOrder` |
| orders.Confirm/Fulfill | `order.confirmed/fulfilled` | logs/metrics | audit trail |
| payments.ExecuteProvider / callback | `payment.created/confirmed/retry` | `paymentWorker` | `ExecuteProvider`, then `PaymentConfirmed → orders.PaymentUpdate + invoices.RecordPayment` |
| invoices.Send/RecordPayment/Cancel | `invoice.sent/paid/cancelled` | `invoiceWorker` | `InvoicePaid → PDF()`; `InvoiceCancelled → notify owner` |
| sales.Create | `sale.created` | `saleWorker` | log-only today |
| analytics HTTP Get | `analytics.compute[.all]` | analytics workers | `Compute → UpsertSnapshot` |

## 3. Sequences

### A. Order confirm → pay → fulfill (the central money path)

```
POST /orders {lines, idempotency-key}
  → orders.Create (FindByIdempotency → Create order+lines, status=draft)
POST /orders/{id}/confirm
  → machine Fire TriggerConfirm (draft→confirmed)
  → inventory.DecrementForOrder(lines)            [sync, same tx]
  → buildInvoicePayload → invoices.CreateInvoice  [sync]
  → buildPaymentPayload → emit OrderPaymentInit   [River, same tx]
orderWorker: OrderPaymentInit
  → payments.InitiateOrder(InitiateRequest) → PaymentCommand(pending)
  → emit PaymentCreated
paymentWorker: PaymentCreated
  → payments.ExecuteProvider → machine→processing → MpesaClient.STKPush
  → MarkProviderAccepted
Daraja POST /mpesa/stk/callback {checkout_id, result}
  → HandleMpesaCallback: match provider_request_id/accountReference
  → MarkSucceeded + emit PaymentConfirmed
paymentWorker: PaymentConfirmed
  → orders.PaymentUpdate + invoices.RecordPayment/SettleCustomerPayment
POST /orders/{id}/fulfill
  → machine Fire TriggerFullfill (confirmed→fulfilled)
  → sales.CreateFromOrder(buildSalesPayload)      [sync]
  → taxes.RecordSaleTax + inventory already decremented at confirm
  → emit OrderFulfilled
```

Failure branches: `TriggerFailed` (draft/confirmed→cancelled) on provider failure; `Cancel`/`Refund` restore inventory via `RestoreForOrder` and void/compensate downstream.

### B. Direct POS sale

```
POST /sales {lines, idempotency-key}
  → FindByIdempotency (retry-safe) → create sale+lines (receipt via NextReceipt)
  → taxes.RecordSaleTax                            [sync]
  → inventory.DeductForSale                        [sync]
  → emit SaleCreated                               [River, same tx]
POST /sales/{id}/void → machine/flag → inventory.RestoreForSale
```

### C. Invoice send → pay → settle

```
POST /invoices → CreateInvoice (draft, NextNumber)
POST /invoices/{id}/send → machine Fire TriggerSent + emit InvoiceSent
POST /invoices/{id}/send-whatsapp → waha templates → SendText/SendMedia
POST /invoices/{id}/record-payment → FIFO Allocate across lines → emit InvoicePaid
invoiceWorker: InvoicePaid → PDF() for WhatsApp channel
POST /invoices/customer/{id}/settle → loop FindUnpaidByCustomer, allocate oldest-first
```

### D. Subscription upgrade (tenancy × payments, isolated path)

```
POST /subscriptions/upgrade/initiate {plan, phone, idempotency-key}
  → FindSubscriptionPaymentByIdempotency → mpesaAdapter.STKPush (NOT the business flow)
  → MarkSubscriptionPaymentProcessing{checkout_request_id}
Daraja POST /subscriptions/callback {checkout_id, result}
  → HandleSubscriptionCallback: match → UpsertActiveSubscription
GET /subscriptions/subscription → current plan (gates EnforceBusinessLimit)
```

### E. Chat / MCP read path (never bypasses authz)

```
POST /chatbot/chat {message, history, lang}
  → chat.Handler builds mcp.Session{UserID, BusinessID, Role} from ctx + authz role
  → chat.Service.Chat: registry.List (authz-filtered descriptors)
      → callLLM (or heuristicChat keyword router when LLM unavailable)
      → execHeuristicTools → curated read tools only
      → callLLMSynthesis / fallbackAnswer
```

The MCP registry exposes only reads (`summarize_sales`, `list_low_stock_items`, `search_customers`, …) — the assistant can inspect real tenant data but cannot move money except through the same service methods the HTTP handlers use.

### F. Mobile sync push/pull (server side)

```
GET /sync/pull?since= → Pull: per-table TableChanges{Upserted, Deleted} by sync_version
POST /sync/push {changes, lastPulledAt}
  → FK-ordered upsert (validateFKs → insertRecord/updateRecord)
  → ensureInvoiceForOrder / ensureSaleForOrder (derive missing docs)
  → ledger repair (saleLedgerLines/orderLedgerLines, restore/ensure helpers)
  → PushResult + Conflict rows for losers
GET /sync/conflicts → ListConflicts
POST /sync/conflicts/{id}/resolve → ResolveConflict / ForceApplyClientPayload
```

Client-side counterpart: `mobile/docs/local-first-sync.md`.
