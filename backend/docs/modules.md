# Backend — Domain Modules (low-level reference)

One section per domain under `internal/`. Conventions: `module.go` owns `RegisterRoutes` and is mounted under `/api/v1`; services expose `WithTx` for callers that need to join a transaction; `Service()` accessors exist where another domain needs synchronous calls (customers, taxes via `TaxRecorder`, inventory ledger).

## auth — `domain.go errors.go google.go handler.go module.go otp.go repository.go service.go token.go`

- **Types:** `User`, `Account` (`auth_accounts`), `RefreshToken`, `RegisterRequest/LoginRequest/RefreshRequest/AuthResponse`, `GoogleIDToken/GoogleLoginRequest`, `OTP`, `SendOTPRequest/CheckOTPRequest/SignInOTPRequest/VerifyEmailOTPRequest/RequestPasswordResetOTPRequest/ResetPasswordOTPRequest`, `Claims`, `TokenService`, `Config`, `Service{repo, tokens, memberships, subscriptions, emailSender}`. Two injected seams: `MembershipResolver` and `SubscriptionProvisioner` (satisfied by users/tenancy).
- **Routes** (public, `/api/v1/auth`): `POST /register /login /refresh /google /google/callback /email-otp/send-verification-otp /email-otp/check-verification-otp /email-otp/verify-email /sign-in/email-otp /email-otp/request-password-reset /email-otp/reset-password /otp/send /otp/verify /forgot-password /reset-password-otp`, `GET /google /google/callback /check-email`, `POST /check-email`. `Middleware` verifies the Bearer JWT → `WithUserID/TenantID/BusinessID`.
- **Service:** `Register, Login, Refresh, LoginWithGoogle (+verifyGoogleIDToken), CheckEmailExists, SendVerificationOTP, CheckVerificationOTP (+verifyOTPAtomic), SignInEmailOTP, VerifyEmailOTP, RequestPasswordResetWithOTP, ResetPasswordWithOTP, issue`. `token.go`: `IssueAccessToken, Verify, NewRefreshToken, HashRefreshToken`.
- **Repository:** `CreateUser, FindByEmail/ByID/ByProviderAccountID, FindAccount, UpsertAccount, CreateRefreshToken, FindRefreshToken, RevokeRefreshToken`.
- **Workers/state machine/events:** none. Side effect: `EnsureDefaultSubscription` on register/login through the tenancy provisioner.

## business — `domain.go errors.go handler.go module.go repository.go service.go`

- **Types:** `Business` (M-Pesa settings fields encrypted via `crypto.Manager`), `CreateBusinessRequest/UpdateBusinessRequest`, `Service{repo, guard, members, crypto}`, seams `BusinessLimitEnforcer/MemberWriter/SubscriptionGuard`.
- **Routes** (`/api/v1/businesses`, auth-only, no authz): `GET /`, `POST /`, `GET|PUT|DELETE /{businessID}` → `ListBusinesses, CreateBusiness, GetBusiness, UpdateBusiness, DeleteBusiness`.
- **Service:** `CreateBusiness` (`EnforceBusinessLimit → repo.Create → AddOwner → EnsureDefaultSubscription`), `ListBusinesses, GetBusiness, UpdateBusiness, DeleteBusiness, applyMpesaSettings`.
- **Repository:** `Create, ListByUser, FindForUser, Update, DeleteForOwner`.

## products — `domain.go errors.go handler.go module.go repository.go service.go`

- **Types:** `Product, ProductVariant, ProductRequest{+Variants []VariantRequest}, VariantRequest`.
- **Routes** (`/products`, auth+authz): `GET /`, `POST /`, `GET|PUT|DELETE /{id}`, `POST /{id}/generate-description`, `GET /variant/{id}` → `List, Create, Get, Update, Delete, GenerateDescription, GetVariant`.
- **Service/Repo:** `Create, List(page), Get, FindProductVariant, Update, Delete, GenerateDescription` / `Create, List, Find, FindProductVariant, Update, ReplaceVariants, Delete` (both `WithTx`).

## inventory — `domain.go errors.go handler.go ledger.go module.go repository.go service.go`

- **Types:** `InventoryItem, StockMovement, Valuation, AdjustmentRequest, DecrementLine{ProductID, VariantID, Quantity}`.
- **Routes** (`/inventory`): `GET /`, `POST /adjustments`, `GET /low-stock /movements /valuation` → `List, Adjust, LowStock, Movements, Valuation`.
- **Service:** `Adjust, DecrementForOrder, DeductForSale, RestoreForSale, RestoreForOrder, List, GetLowStockItems, GetStockMovements, GetInventoryValuation` (`WithTx`). `ledger.go` exposes package func `ApplyLedger(db, businessID, refType, refID, lines, sign, movementType, notes)` — the primitive orders/sales/sync all build on.
- **Repository:** `Adjust` (item+movement in one tx), `List, LowStock, Movements, Valuation`.
- Called **synchronously** by orders/sales/sync; no workers or events of its own.

## customers — `domain.go errors.go handler.go module.go repository.go service.go`

- **Types:** `Customer, CustomerRequest, PurchaseHistoryEntry`.
- **Routes** (`/customers`): `GET /`, `POST /`, `GET /top`, `GET|PUT|DELETE /{id}`, `GET /{id}/purchase-history` → `List, Create, TopCustomers, Get, Update, Delete, PurchaseHistory`.
- **Service/Repo:** `Create, List, Get, Update, Delete, GetTopCustomers/TopCustomers, GetCustomerPurchaseHistory` (`WithTx`). `Service()` accessor feeds orders and the MCP registry.

## orders — `domain.go errors.go handler.go helper_functions.go module.go repository.go service.go state_machine.go workers.go`

- **Types:** `Order{Status, PaymentStatus}, OrderLine, CreateOrderRequest{Lines []OrderLineRequest}, ConfirmOrderRequest`, `OrderEventType` (`order.confirmed/cancelled/refund/fulfilled/payment.init`), `OrderEventArgs{Kind()="order.event"}`, `OrderPaymentInterface, OrderPayInitReq, CommandType`.
- **Routes** (`/orders`): `GET /`, `POST /`, `GET /{id}`, `POST /{id}/confirm|/fulfill|/cancel|/refund` → `List, Create, Get, Confirm, FulfillOrder, Cancel, Refund`.
- **Service:** `Create, List, Get, FindOrderByUpdate, PaymentUpdate, Confirm` (machine `Fire TriggerConfirm` → `inventory.DecrementForOrder` → invoice payload → payment payload → emit `OrderPaymentInit` + `OrderConfirmed` in-tx), `FulfillOrder` (`TriggerFullfill` → `sales.CreateFromOrder` via `buildSalesPayload` → emit `OrderFulfilled`), `Cancel, Refund`, `emit`, `WithTx`.
- **Repository:** `FindByIdempotency, Create` (order+lines), `Find, FindOrderByUpdate, List, Update, SetStatus`.
- **State machine** (`qmuntal/stateless`): `draft --order_confirm--> confirmed --order_fullfiled--> fulfilled --order_refund--> refunded`; `draft/confirmed --order_cancel/order_failed--> cancelled`. Triggers: `TriggerConfirm/Failed/Fullfill/RequestRefund/Cancel`.
- **Worker** `orderWorker{service, paymentService}` on `order.event`: `OrderPaymentInit → paymentService.InitiateOrder(payload InitiateRequest)`; other events logged.
- **Helpers** (`helper_functions.go`): `buildInvoicePayload, buildPaymentPayload (→ shared/models.InitiateRequest), buildSalesPayload (→ []sales.OrderLineInput)`.

## sales — `domain.go errors.go handler.go module.go repository.go service.go workers.go`

- **Types:** `Sale, SaleLine, CreateSaleRequest, SaleLineRequest, OrderLineInput, Summary, Breakdown`, `SaleEventType/SaleEventArgs{Kind()="sale.event"}`, `TaxRecorder` seam (satisfied by taxes).
- **Routes** (`/sales`): `GET /`, `POST /`, `GET /summary /by-payment-method /by-staff /by-product`, `GET /{id}`, `POST /{id}/void` → `List, Create, Summary, ByPayment, ByStaff, ByProduct, Get, Void`.
- **Service:** `Create` (→ `taxes.RecordSaleTax` → `inventory.DeductForSale` → emit `SaleCreated`), `CreateFromOrder`, shared `create` (idempotency via `FindByIdempotency`/`FindByOrder`), `List, Get, Void` (→ `inventory.RestoreForSale`), `GetSalesSummary/ByPaymentMethod/ByStaff/ByProduct`, `emit`, `WithTx`.
- **Repository:** `FindByIdempotency, FindByOrder, NextReceipt, Create, Find, List, Void, Summary, Breakdown, ProductBreakdown`, `DB()`.
- **Worker** `saleWorker`: `Work` only logs today (no-op).

## invoices — `domain.go errors.go handler.go module.go repository.go service.go service_test.go state_machine.go workers.go`

- **Types:** `Invoice{Status}, InvoiceLine, CreateInvoiceRequest{Lines []LineRequest}, RecordPaymentRequest, Allocation, SettleResult`, `InvoiceEventType` (`invoice.overdue/sent/viewed/paid/cancelled`), `InvoiceEventArgs{Kind()="invoice.event"}`, `InvoiceTrigger`.
- **Routes** (`/invoices`): `GET /`, `POST /`, `GET /{id}`, `POST /{id}/send|/send-whatsapp|/record-payment`, `POST /customer/{customerId}/settle`, `GET /{id}/pdf` → `List, Create(→CreateInvoice), Get, Send, SendWhatsApp, RecordPayment, SettleCustomer, PDF`.
- **Service:** `CreateInvoice, List, Get, GetInvoiceByOrderID, Send` (machine `Fire TriggerSent` + emit `InvoiceSent`), `RecordPayment` (FIFO allocate → emit `InvoicePaid`), `SettleCustomerPayment` (loop `FindUnpaidByCustomer`), `Cancel` (`TriggerCanceled` + emit), `MarkOverdue` (emit `InvoiceOverdue`), `PDF`, `emit`, `WithTx`.
- **Repository:** `NextNumber, Create, List, Find` (+`enrichInvoices`), `FindByOrderId, Update, FindUnpaidByCustomer, MarkOverdue, Delete`.
- **State machine:** `draft --sent--> sent --viewed--> viewed --partial--> partial --paid--> paid`; `sent/viewed --due--> overdue`; cancel arcs `draft/sent/viewed → cancelled`.
- **Worker** `invoiceWorker`: `InvoicePaid → PDF()` (build doc for WhatsApp channel); `InvoiceCancelled → notify owner` (stub).

## payments — `domain.go errors.go handler.go module.go mpesa.go repository.go service.go service_test.go state_machine.go workers.go`

- **Types:** `PaymentCommand{Status, provider_request_id/receipt, order_id, idempotency key}`, `Provider/ProviderResult{RequestID, Receipt, Raw}`, `MpesaClient/MpesaOperation`, `STKPushRequest/B2CRequest/C2BRegisterRequest/C2BSimulateRequest/TransactionStatusRequest`, `PaymentEventType` (`payment.created/confirmed/processing/failed/retry`), `PaymentEventArgs{Kind()="payment.event"}`, `PaymentTrigger`, `OrderPayment/InvoicePayment` seams.
- **Routes:** protected `/payments`: `GET /`, `POST /` (`Initiate`, **`X-Idempotency-Key` required**), `POST /{id}/cancel|/check`, `GET /{id}`, `POST /mpesa/c2b/register|/mpesa/transaction-status`; public `/api/v1/mpesa`: `POST /stk/callback /c2b/confirmation /c2b/validation /b2c/result /timeout` → `MpesaCallback/MpesaValidation`.
- **Service:** `Initiate` (+emit `PaymentCreated`), `InitiateOrder, ExecuteProvider` (machine→Processing → `MpesaClient.ProcessPayment` → `MarkProviderAccepted/Succeeded/Failed` + emit), `Get, List, ClaimPayment/ClaimPending, MarkProviderAccepted/MarkSucceeded/MarkFailed, RegisterMpesaC2BURLs, QueryMpesaTransactionStatus`, `HandleMpesaCallback` (match by `provider_request_id`/`accountReference` → `MarkSucceeded` + emit `PaymentConfirmed` / `MarkFailed` + emit), `Cancel, CheckSTK` (STKQuery), `emitCommand/emit`, `WithTx`.
- **`mpesa.go`:** `NewMpesaClient, STKPush, B2C, RegisterC2BURLs, SimulateC2B, TransactionStatus, STKQuery, token, post, providerResult, normalizePhone`.
- **Repository:** `FindByIdempotency/ProviderRequestID/AccountReference, Create, Find, List, ClaimPending/ClaimSinglePayment, MarkProviderAccepted/MarkSucceeded/MarkFailed/MarkStatus`.
- **State machine:** `pending --processing--> processing --success--> succeeded | --failed--> failed --retry--> processing`.
- **Worker** `paymentWorker{service, orderService, invoiceService}`: `PaymentCreated/Retry → ExecuteProvider`; `PaymentConfirmed →` parse amount → `orderService.PaymentUpdate` + `invoiceService.RecordPayment/SettleCustomerPayment` (customer resolved by `findCustomerByPhone`, last-9-digits fallback).

## expenses — `domain.go errors.go handler.go module.go repository.go service.go`

- **Types:** `Expense, ExpenseRequest, CategorySummary`, `TaxRecorder` seam.
- **Routes** (`/expenses`): `GET /`, `POST /`, `GET /summary`, `GET|DELETE /{id}` → `List, Create, Summary, Get, Delete`.
- **Service:** `Create` (→ `taxes.RecordExpenseTax`), `List, Get, Delete, SummaryByCategory`; **Repo:** `Create, List, Find, Delete, Summary`, `DB()`.

## taxes — `domain.go errors.go handler.go module.go repository.go service.go`

- **Types:** `TaxRule, RuleRequest, TaxEntry, PeriodSummary`.
- **Routes** (`/taxes`): `GET /rules`, `POST /rules`, `POST /kenya-vat-default`, `GET /summary` → `ListRules, CreateRule, EnsureVAT, Summary`.
- **Service:** `EnsureKenyaVAT, CreateRule, ListRules, RecordSaleTax, RecordExpenseTax, Summary` — also satisfies the `TaxRecorder` seams of sales/expenses. **Repo:** `CreateRule, ListRules, DefaultRule, InsertEntry, Summary`.

## analytics — `domain.go errors.go handler.go module.go repository.go service.go workers.go`

- **Types:** `Snapshot/StoredSnapshot`, `Timeframe` (`day/week/month/year`), `RevenueDataPoint/ProfitDataPoint/CashFlowDataPoint/CategoryDataPoint/ExpenseBreakdownDataPoint/CustomerSegmentDataPoint/SalesVelocityDataPoint`, `RevenueSummary/ProfitSummary/CustomerSummary`, `TopProduct`, `TaxSummary{ByCategory, ByProduct}`, `AIInsights{Trends, Recommendations}`, `ComputeArgs{Kind()="analytics.compute"}/ComputeAllArgs{Kind()="analytics.compute.all"}`.
- **Routes** (`/analytics`): `GET /?timeframe=` (lazily enqueues `ComputeArgs` via the River ingester), `GET /tax`, `GET /ai-insights` → `Get, TaxSummary, AIInsights`.
- **Service:** `Compute` (repo series → `UpsertSnapshot`), `Get` (`FindSnapshot` or `Compute`), `GetAIInsights` (heuristic trends), `TaxSummary`. **Repo:** `RevenueSeries, ProfitSeries, CategorySeries, TopProducts, ExpenseBreakdown, CashFlowSeries, CustomerSegments, CustomerLTV, SalesVelocity, TaxSummary, UpsertSnapshot, FindSnapshot`.
- **Workers** `worker/computeAllWorker`: `Compute` for one/all timeframes.

## chat — `handler.go module.go prompt.go service.go`

- **Types:** `ChatRequest{Message, History []ChatMessage, Lang}, ChatMessage{Role, Content}, ChatResponse{Reply, ToolCalls, Lang}`, `Service{registry}`, `Handler{svc, registry}`.
- **Routes:** `POST /api/v1/chatbot/chat` (mobile) + `POST /api/v1/chat/business-owner` → `Chat`. Builds `mcp.Session{UserID, BusinessID, Role}` from middleware ctx + authz role, calls `svc.Chat`.
- **Service:** `Chat` (registry descriptors → `callLLM` → `execHeuristicTools` fallback → `callLLMSynthesis`/`fallbackAnswer`), `heuristicChat, execHeuristicTools, callLLM, callLLMSynthesis, fallbackAnswer`. `prompt.go`: `systemPrompt(lang)` (en/sw), keyword routing (`needsTool, inferArgs, extractToolMention`).

## mcp — `auth.go auth_test.go registry.go registry_test.go schema.go server.go tools.go types.go`

- **Types:** `Session{UserID, BusinessID, Role/Profile}, Profile`, `Tool{Handler, Resource/Action}, ToolDescriptor`, `Envelope/ErrorEnvelope, RPCRequest/RPCResponse`, `Services{Sales, Inventory, Customers, Expenses, Invoices}` + per-service ifaces, `Authenticator`.
- `NewDefaultRegistry(enforcer, services)` curates ~13 business-owner read tools + a customer-service subset: `summarize_sales`, `list_sales_by_product|by_payment_method|by_staff`, `list_low_stock_items`, `get_inventory_valuation`, `list_stock_movements`, `summarize_expenses_by_category`, `search_customers`, `get_customer_purchase_history`, `get_customer`, `list_customer_invoices`, `list_invoices`, `get_invoice`, `search_business_knowledge`, `compare_revenue`, `detect_anomalies`, `list_pending_invoices`, `list_pending_payments`, `get_upcoming_tax_deadlines`. `Registry{List` (authz-filtered via `available`), `Call/CallWithContext` (+`enrichMeta`, `ErrorPayload})`. `Server{Router (POST /mcp, GET /health, OTel spans), dispatch, protectedResourceMetadata}`.

## waha — `client.go handler.go module.go service.go templates.go`

- **Types:** `Client{baseURL, session, apiKey}`, `Message/Response`, `Service{client}`, `SendRequest`, `Template{Name, Body}`, `Handler{svc}`.
- **Routes** (`/waha`): `POST /send`, `POST /notify` → `Send (SendText/SendMedia), Notify (RenderNotification→SendNotification)`.
- `templates.go`: `InvoiceTemplate, OrderStatusTemplate, PaymentReminderTemplate, MarketingTemplate`, `RenderNotification(kind, data)` for `invoice|order_status|payment_reminder|marketing`. `client.go`: `SendText, SendMedia, send, normalizeChatID` (E.164 → `@c.us`).

## sync — `handler.go helpers.go module.go service.go service_test.go`

- **Types:** `Service{db}`, `PullResult{Changes map[table]TableChanges}, TableChanges{Upserted, Deleted}, PushRequest{Changes}, PushResult, Conflict`.
- **Routes** (`/sync`): `GET /pull?since=`, `POST /push`, `GET /conflicts`, `POST /conflicts/{id}/resolve` → `Pull, Push(+PushWithUser), ListConflicts, ResolveConflict/ForceApplyClientPayload`.
- **Syncable tables:** products, product_variants, customers, inventory_items, stock_movements, orders, order_lines, sales, sale_lines, expenses, invoices, invoice_lines, payment_commands, tax_rules, tax_entries, business_members, user_profiles (+more). Push respects FK order, `validateFKs`, `insertRecord/updateRecord`, `ensureInvoiceForOrder/ensureSaleForOrder`, inventory repair (`saleLedgerLines/orderLedgerLines`, `restoreInventoryForOrder/ForSale`, `ensureSaleDeducted`).

## users — `domain.go errors.go handler.go invite.go module.go repository.go service.go`

- **Types:** `BusinessMember{Role}, BusinessInvite{OTP hash}, UserProfile`, `InviteMemberRequest/InviteByEmailRequest/AcceptInviteRequest/UpdateRoleRequest/CreateProfileRequest/UpdateProfileRequest`, `Service`, `InviteService{db, repo, emailSender, businessNameFn}`.
- **Routes:** `/businesses/{businessID}/members` (authz): `GET /`, `POST /invite`, `POST /invite-email`, `GET /invites`, `POST /accept-invite`, `PUT /{memberID}/role`, `DELETE /{memberID}`; `/profile` (auth-only): `GET|POST|PUT /`; public `/invites`: `AcceptInvitePublic`.
- **Service:** `AddOwner` (OWNER; also the `MembershipResolver` for auth/authz), `InviteMember, ListMembers, UpdateRole, Deactivate, GetOrCreateProfile, CreateProfile, UpdateProfile`; `RoleForUser` backs `authz.Enforcer`. `InviteService`: `InviteByEmail` (OTP email), `ListInvites`, `AcceptInvite` (OTP verify → member create).

## tenancy — `domain.go errors.go handler.go module.go repository.go service.go stk_adapter.go`

- **Types:** `Plan{Code PlanCode, Name, MaxBusinesses, Price}`, `PlanCode` (`free/premium`), `Subscription{user_id, plan, status}`, `SubscriptionPayment{plan, amount, checkout_request_id, status}`, `InitiateUpgradeRequest{Plan, Phone}`, `SubscriptionSTKProvider` seam, `mpesaAdapter`.
- **Routes:** public `GET /public/plans`; `/subscriptions`: public `POST /callback` (`SubscriptionCallback`) + protected `GET /subscription, POST /upgrade/initiate, GET /payments/{id}`.
- **Service:** `EnsureDefaultSubscription` (free), `EnforceBusinessLimit` (count vs plan), `IsPremium`, `InitiateUpgrade` (idempotency via `FindSubscriptionPaymentByIdempotency` → STK push via adapter), `MarkSubscriptionPaymentProcessing, GetSubscriptionPayment, HandleSubscriptionCallback` (checkout match → `UpsertActiveSubscription`), `TriggerSTKIfConfigured, SetSTKProvider`. `stk_adapter.go`: `NewMpesaAdapter(fn)` bridges Daraja STK into tenancy, isolated from the business-payments path.
