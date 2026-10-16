# Catalog & stock — products · customers · inventory · expenses · taxes

Master data plus the inventory ledger. `inventory.ApplyLedger` is the correctness core: reference-guarded stock movements so REST, sync-push and offline paths can never double-deduct or double-restore.

## products — `internal/products` · routes `GET/POST /products`, `GET/PUT/DELETE /products/{id}`, variants

Domain: `Product` → `products`, `ProductVariant` → `product_variants`.

Repository: `NewRepository`, `WithTx`, `Create` (conflict translation), `List` (with variants), `Find` (with variants), `FindProductVariant`, `Update`, `ReplaceVariants` (atomic swap), `Delete`.

Module: `New(db)`; `RegisterRoutes`.

Service: `NewService`, `WithTx`, `Create` (validates + variants), `List` (not-found on empty), `Get`, `FindProductVariant`, `Update` (merge + variant replace), `Delete`, `GenerateDescription` (name + category blurb).

Handlers: `List`, `Create`, `Get`, `GetVariant`, `Update`, `Delete`, `GenerateDescription`.

## customers — `internal/customers` · routes `/customers` CRUD + `/top`, `/{id}/purchase-history`

Domain: `Customer` → `customers`.

Repository: `NewRepository`, `WithTx`, `Create`, `List`, `Find`, `Update`, `Delete`, `TopCustomers` (by spend).

Module: `New(db)`; `RegisterRoutes`; `Service()` (shared with orders/invoices).

Service: `NewService`, `WithTx`, `Create`, `List`, `Get`, `Update`, `Delete`, `GetTopCustomers` (limit normalization), `GetCustomerPurchaseHistory` (stub returning empty after existence check).

Handlers: `List`, `Create`, `Get`, `Update`, `Delete`, `TopCustomers`, `PurchaseHistory`.

## inventory — `internal/inventory` · routes `GET /inventory`, `POST /inventory/adjustments`, `/low-stock`, `/movements`, `/valuation`

Domain: `InventoryItem` → `inventory_items`, `StockMovement` → `stock_movements`.

Repository: `NewRepository`, `WithTx`, `Adjust` (upsert item + movement in tx), `List`, `LowStock` (≤ threshold), `Movements` (newest first), `Valuation` (quantity snapshot).

Ledger (`ledger.go`): `ApplyLedger(db, businessID, refType, refID, lines, sign, movementType, notes)` — idempotent, reference-guarded deduct/restore for `sale`/`order` references; the single choke point all stock mutations flow through.

Module: `New(db)`; `RegisterRoutes`; `Service()` (shared with orders/sales/sync).

Service: `NewService`, `WithTx`, `Adjust` (manual), `DecrementForOrder` (confirm path), `DeductForSale` (walk-in path), `RestoreForSale` / `RestoreForOrder` (void/cancel, only what was deducted), `List`, `GetLowStockItems`, `GetStockMovements`, `GetInventoryValuation`.

Handlers: `List`, `Adjust`, `LowStock`, `Movements`, `Valuation`.

## expenses — `internal/expenses` · routes `/expenses` CRUD + `/summary`

Domain: `Expense` → `expenses`.

Repository: `NewRepository`, `DB()` (raw handle), `WithTx`, `Create`, `List` (spent-at DESC), `Find`, `Delete`, `Summary` (amount/tax/count by category).

Module: `New(db, taxes)`; `RegisterRoutes`; `Service()`.

Service: `NewService`, `WithTx`, `Create` (records VAT input, invalidates analytics snapshots), `List`, `Get`, `Delete` (invalidates snapshots), `SummaryByCategory`.

Handlers: `List`, `Create`, `Get`, `Delete`, `Summary`.

## taxes — `internal/taxes` · routes `/taxes/rules`, `/taxes/summary`, VAT ensure

Domain: `TaxRule` → `tax_rules`, `TaxEntry` → `tax_entries` (ledger of VAT in/out per source).

Repository: `NewRepository`, `WithTx`, `CreateRule`, `ListRules`, `DefaultRule`, `InsertEntry`, `Summary` (taxable + tax by type over period).

Module: `New(db)`; `RegisterRoutes`; `Service()` (shared with sales/expenses).

Service: `NewService`, `WithTx`, `EnsureKenyaVAT` (get-or-create 16%), `CreateRule`, `ListRules`, `RecordSaleTax` (VAT output per sale), `RecordExpenseTax` (VAT input per expense), `Summary`.

Handlers: `ListRules`, `CreateRule`, `EnsureVAT`, `Summary`.
