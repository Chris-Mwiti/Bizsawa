# Commerce — orders · sales · invoices · payments

Money path of the system. Order confirm fans out to invoice + inventory + payment inside one transaction (`orders/service.go:Confirm`); fulfill mints the sale. Document numbering is advisory-locked with 409-retry (F1). All writes go through the River transactional outbox.

## orders — `internal/orders` · routes `POST/GET /orders`, `POST /orders/{id}/confirm|fulfill|cancel|refund`

Domain (`domain.go`): `Order` → `orders`, `OrderLine` → `order_lines`.

Repository (`repository.go`):
- `NewRepository(db)` — constructor.
- `WithTx(tx)` — transaction-scoped copy.
- `FindByIdempotency(ctx, businessID, key)` — safe-retries lookup.
- `Create(ctx, order, lines)` — persists order + lines.
- `FindOrderByUpdate(ctx, businessID, orderID)` — row-locked load (`SELECT … FOR UPDATE`).
- `Find(ctx, businessID, orderID)` — single order with lines.
- `List(ctx, businessID, page)` — paginated list.
- `Update(ctx, order)` / `SetStatus(ctx, businessID, orderID, status)` — save / status-only write.

Module (`module.go`): `New(db, inventory, sales, outbox, customers, invoice, payments, logger)` wires cross-module deps; `RegisterRoutes` (auth required, UUID idempotency key enforced on writes); `RegisterWorkers`; `Service()` accessor.

Handlers (`handler.go`): `List` (GET /), `Create` (POST / draft), `Get` (GET /{id}), `Confirm` (POST /{id}/confirm → invoice + inventory + payment-init events), `Fulfill` (POST /{id}/fulfill → linked sale), `Cancel` (POST /{id}/cancel + stock restore), `Refund` (POST /{id}/refund state check).

Service (`service.go`): `NewService`, `WithTx`, `Create` (draft + totals + idempotency guard), `List`, `Get`, `FindOrderByUpdate`, `PaymentUpdate` (payment-status write), `Confirm` (order → invoice via invoices svc → inventory decrement → `OrderPaymentInit` + `OrderConfirmed` outbox; 409 propagates on number contention), `FulfillOrder` (confirmed → fulfilled + `CreateFromOrder` sale + `OrderFulfilled`), `Cancel` (order + invoice cancel + inventory restore), `Refund` (state-machine validation).

Workers (`workers.go`): `OrderEventArgs.Kind()` (`order.event`); `orderWorker.Work` processes async order events.

## sales — `internal/sales` · routes `GET/POST /sales`, `GET /sales/{id}`, void, summary + by-payment/by-staff/by-product

Domain: `Sale` → `sales` (unique `order_id`, unique `(business, receipt)`), `SaleLine` → `sale_lines`.

Repository: `NewRepository`, `DB()` (raw handle for snapshot invalidation), `WithTx`, `FindByIdempotency`, `FindByOrder`, `NextReceipt` (advisory lock + `MAX(suffix)+1`), `Create` (sale + lines in tx), `Find`, `List` (sold_at DESC), `Void` (idempotent), `Summary` (count/subtotal/tax/total over range), `Breakdown(field)`, `ProductBreakdown`.

Module: `New(db, taxes, inventory, outbox, logger)`; `RegisterRoutes`; `RegisterWorkers`; `Service()`.

Handlers: `List`, `Create` (walk-in; idempotency via ctx), `Get`, `Void` (restores stock), `Summary` (from/to), `ByPayment`, `ByStaff`, `ByProduct`.

Service: `NewService`, `WithTx`, `Create` (idempotent replay), `CreateFromOrder` (idempotent on order_id), `create` (receipt inside tx under lock, 3-attempt 23505 retry → 409; taxes + inventory + `SaleCreated` event), `List`, `Get`, `Void` (ledger-guarded restore), `GetSalesSummary`, `GetSalesByPaymentMethod`, `GetSalesByStaff`, `GetSalesByProduct`.

Workers: `SaleEventArgs.Kind()`; `saleWorker.Work`.

## invoices — `internal/invoices` · routes `/invoices` CRUD + `/{id}/send|send-whatsapp|record-payment|pdf`, `/customer/{id}/settle`

Domain: `Invoice` → `invoices`, `InvoiceLine` → `invoice_lines`; statuses draft/sent/viewed/partial/paid/overdue/cancelled.

Repository: `NewRepository`, `WithTx`, `NextNumber` (advisory lock + MAX suffix), `Create`, `List` (batched customer/product name enrichment), `Find` (single + enrichment), `FindByOrderId`, `Update`, `FindUnpaidByCustomer` (FIFO settle order, indexed), `MarkOverdue`, `Delete`.

Module: `New(db, outbox, logger)`; `RegisterRoutes`; `RegisterWorkers`; `Service()`.

Handlers: `List`, `Create`, `Get`, `Send` (email), `SendWhatsApp`, `RecordPayment` (auto-mints `paymentId` when omitted — F4), `SettleCustomer` (auto-mints `paymentId`), `PDF`.

Service: `NewService`, `WithTx`, `CreateInvoice` (tx-bound numbering + 23505 retry → 409), `List`, `Get`, `GetInvoiceByOrderID`, `Send` (sent + event), `RecordPayment` (lookup **by invoice id**, amount validation, paid/partial transitions, `InvoicePaid` event), `SettleCustomerPayment` (FIFO across unpaid, allocations + remaining credit), `Cancel`, `MarkOverdue`, `PDF` (deterministic bytes with shop header).

Workers: `InvoiceEventArgs.Kind()`; `invoiceWorker.Work` (paid/cancelled/overdue/sent side effects).

## payments — `internal/payments` · routes `/payments`, `/devices`, public `/mpesa/*` callbacks

Outbound Daraja commands (`PaymentCommand` → `payment_commands`) + inbound capture (`CapturedPayment` → `captured_payments`, `CaptureDevice` → `capture_devices`).

Repository (`repository.go`): `NewRepository`, `WithTx`, `FindByIdempotency`, `Create`, `FindByProviderRequestID` / `FindByAccountReference` (callback reconcile), `Find`, `List`, `ClaimPending` / `ClaimSinglePayment` (atomic worker claim), `MarkProviderAccepted` / `MarkSucceeded` / `MarkFailed` / `MarkStatus`.

Capture store (`capture_store.go`): `FindCaptureByEvent` (replay guard), `FindCaptureByReceipt` (merge match), `CreateCapture`, `UpdateCapture`, `ListCaptured` (source/status/channel/date filters), `CreateDevice`, `FindDevice` — all business-scoped.

Capture domain (`capture.go`): `CapturedPayment` / `CaptureDevice` table maps; `VerifiedScope()` (quarantine: verified-only aggregates); `DecideMerge(existing, incoming)` pure create/duplicate/merge-upgrade/dispute (verified upgrades, never downgrades; same-receipt-different-amount keeps both disputed).

Ingest (`ingest.go`): `ValidateIngestItem` (pure: receipt charset, positive amount, ISO3 currency, Nairobi-skew time bounds, hash length); `Ingest` (per-item tx, per-item results); `RegisterDevice`; `ListCaptured`; handlers `Ingest` (strict unknown-field rejection, batch ≤50), `RegisterDevice`, `ListCaptured`; outbox `payment.captured/merged/disputed` (payloads exclude payer hashes).

Daraja client (`mpesa.go`): `NewMpesaClient`, `ProcessPayment` (STK/B2C/C2B router), `STKPush`, `B2C`, `RegisterC2BURLs`, `SimulateC2B`, `TransactionStatus`, `STKQuery`.

Module: `New(db, outbox, logger, provider, orderService, invoiceService)`; `RegisterRoutes` (initiatie/list/get/cancel/check/C2B + `/ingest`, `/captured`); `RegisterDeviceRoutes` (`POST /devices`); `RegisterPublicRoutes` (stk/c2b/b2c callbacks); `RegisterWorkers`; `Service()`.

Handlers: `Initiate`, `List`, `Get`, `Cancel`, `Check`, `RegisterC2BURLs`, `QueryTransactionStatus`, `MpesaCallback`, `MpesaValidation`.

Service: `NewService`, `WithTx`, `Initiate` / `InitiateOrder` (idempotent commands), `ExecuteProvider`, `Get`, `List`, `ClaimPayment` / `ClaimPending`, `MarkProviderAccepted` / `MarkSucceeded` / `MarkFailed`, `RegisterMpesaC2BURLs`, `QueryMpesaTransactionStatus`, `HandleMpesaCallback` (reconcile → order/invoice), `Cancel` (state machine), `CheckSTK`.

Workers: `PaymentEventArgs.Kind()` / `InsertOpts()`; `paymentWorker.Work` (settlement + notifications).
