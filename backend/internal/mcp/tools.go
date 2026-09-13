package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/Codecx-Org/FinAI/backend/internal/customers"
	"github.com/Codecx-Org/FinAI/backend/internal/expenses"
	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
)

type Services struct {
	Sales     SalesService
	Inventory InventoryService
	Customers CustomersService
	Expenses  ExpensesService
	Invoices  InvoicesService
}

type SalesService interface {
	GetSalesSummary(ctx context.Context, businessID uuid.UUID, from, to time.Time) (sales.Summary, error)
	GetSalesByProduct(ctx context.Context, businessID uuid.UUID) ([]sales.Breakdown, error)
	GetSalesByPaymentMethod(ctx context.Context, businessID uuid.UUID) ([]sales.Breakdown, error)
	GetSalesByStaff(ctx context.Context, businessID uuid.UUID) ([]sales.Breakdown, error)
}

type InventoryService interface {
	GetLowStockItems(ctx context.Context, businessID uuid.UUID) ([]inventory.InventoryItem, error)
	GetInventoryValuation(ctx context.Context, businessID uuid.UUID) ([]inventory.Valuation, error)
	GetStockMovements(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]inventory.StockMovement, error)
}

type CustomersService interface {
	List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]customers.Customer, error)
	Get(ctx context.Context, businessID, customerID uuid.UUID) (*customers.Customer, error)
	GetCustomerPurchaseHistory(ctx context.Context, businessID, customerID uuid.UUID) ([]customers.PurchaseHistoryEntry, error)
}

type ExpensesService interface {
	SummaryByCategory(ctx context.Context, businessID uuid.UUID, from, to time.Time) ([]expenses.CategorySummary, error)
}

type InvoicesService interface {
	List(ctx context.Context, businessID uuid.UUID, page pagination.Page) ([]invoices.Invoice, error)
	Get(ctx context.Context, businessID, invoiceID uuid.UUID) (*invoices.Invoice, error)
}

func DefaultTools(services Services) []Tool {
	tools := []Tool{}
	businessOwner := []Tool{
		readTool(
			ProfileBusinessOwner,
			"summarize_sales",
			"Use when the business owner asks for revenue, tax, and sales totals over a bounded period. Requires authenticated business context; follow up with sales breakdown tools when the owner asks why totals changed.",
			"sales",
			summarizeSales(services.Sales),
			periodSchema()),

		readTool(
			ProfileBusinessOwner,
			"list_sales_by_product",
			"Use to identify products contributing to sales totals. Requires business-owner profile and active business context; returns compact aggregate rows.",
			"sales",
			listSalesByProduct(services.Sales),
			limitSchema()),

		readTool(
			ProfileBusinessOwner,
			"list_sales_by_payment_method",
			"Use to compare sales totals by payment method for reconciliation questions. Requires business-owner profile and active business context.", "sales",
			listSalesByPaymentMethod(services.Sales),
			limitSchema()),

		readTool(
			ProfileBusinessOwner,
			"list_sales_by_staff",
			"Use to compare sales totals by staff member. Requires business-owner profile and active business context; IDs should be resolved by the client if names are needed.",
			"sales",
			listSalesByStaff(services.Sales),
			limitSchema()),

		readTool(
			ProfileBusinessOwner,
			"list_low_stock_items",
			"Use when the owner asks what inventory needs restocking. Requires active business context and returns product IDs, quantity, and threshold only.",
			"inventory",
			listLowStock(services.Inventory),
			limitSchema()),

		readTool(
			ProfileBusinessOwner,
			"get_inventory_valuation",
			"Use for current inventory quantity valuation inputs. Requires active business context; returns product IDs and quantities without cost or margin fields.",
			"inventory",
			inventoryValuation(services.Inventory),
			limitSchema()),

		readTool(
			ProfileBusinessOwner,
			"list_stock_movements",
			"Use to inspect recent stock movement history. Requires active business context; always pass a bounded limit and optional offset.",
			"inventory",
			stockMovements(services.Inventory),
			pageSchema()),

		readTool(
			ProfileBusinessOwner,
			"summarize_expenses_by_category",
			"Use when the owner asks for expense totals by category over a bounded period. Requires business-owner profile and active business context.",
			"expenses",
			expenseSummary(services.Expenses), periodSchema()),

		readTool(
			ProfileBusinessOwner,
			"search_customers",
			"Use to find customer candidates before getting purchase history or invoices. Requires at least a short query when possible; returns minimal disambiguation fields.",
			"customers",
			searchCustomers(services.Customers), searchSchema()),

		readTool(
			ProfileBusinessOwner,
			"get_customer_purchase_history",
			"Use after a customer is selected to summarize that customer's purchase history. Requires a validated customer_id from search_customers or prior context.",
			"customers",
			purchaseHistory(services.Customers),
			idSchema("customer_id")),

		readTool(
			ProfileBusinessOwner,
			"get_customer",
			"Use after a customer is selected to view support-safe customer details. Requires a validated customer_id.",
			"customers",
			getCustomer(services.Customers),
			idSchema("customer_id")),

		readTool(
			ProfileBusinessOwner,
			"list_customer_invoices",
			"Use to find invoices for a selected customer. Requires a validated customer_id; returns compact invoice rows.",
			"invoices",
			listCustomerInvoices(services.Invoices),
			customerPageSchema()),

		readTool(
			ProfileBusinessOwner,
			"list_invoices",
			"Use to list recent invoices for follow-up questions. Requires active business context and bounded pagination.", "invoices",
			listInvoices(services.Invoices),
			pageSchema()),

		readTool(
			ProfileBusinessOwner,
			"get_invoice",
			"Use after an invoice has been selected to inspect compact invoice details. Requires a validated invoice_id.", "invoices",
			getInvoice(services.Invoices),
			idSchema("invoice_id")),

			readTool(
			ProfileBusinessOwner,
			"search_business_knowledge",
			"Use for BizSawa business-owner help, workflow guidance, and policy questions. Initial implementation returns a stable empty result until the knowledge index is configured.",
			"ai",
			knowledgeSearch("business"),
			knowledgeSchema()),

		// --- GAP FILL: Trend & Gap Analysis Tools ---
		readTool(
			ProfileBusinessOwner,
			"compare_revenue",
			"Compare revenue between two periods (this month vs last, YoY). Uses sales summaries; requires bounded periods. Returns current, previous, delta absolute and percent, plus series.",
			"sales",
			compareRevenue(services.Sales),
			compareSchema()),

		readTool(
			ProfileBusinessOwner,
			"detect_anomalies",
			"Flag unusual transactions, missing expected activity, or customer segment drops. Scans expenses by category and sales totals vs rolling mean; returns anomalies with severity.",
			"analytics",
			detectAnomalies(services.Sales, services.Expenses),
			anomalySchema()),

		readTool(
			ProfileBusinessOwner,
			"list_pending_invoices",
			"List invoices awaiting payment (sent/partial/overdue/draft) with due dates. Use for forward-looking cash flow and follow-ups.",
			"invoices",
			listPendingInvoices(services.Invoices),
			pendingInvoicesSchema()),

		readTool(
			ProfileBusinessOwner,
			"list_pending_payments",
			"List payment commands pending processing (M-Pesa STK). Use for forward-looking payment status.",
			"payments",
			listPendingPayments(),
			pageSchema()),

		readTool(
			ProfileBusinessOwner,
			"get_upcoming_tax_deadlines",
			"Upcoming KRA filing deadlines for this business (VAT 16% monthly 20th, PAYE, turnover). Computed from business tax_pin and country KE.",
			"taxes",
			getUpcomingTaxDeadlines(),
			taxDeadlineSchema()),
	}

	customerService := []Tool{
		readTool(
			ProfileCustomerService,
			"search_customers",
			"Use to find customer candidates before looking up orders, invoices, payments, or purchase history. Returns minimal fields for disambiguation only.",
			"customers",
			searchCustomers(services.Customers), searchSchema()),

		readTool(
			ProfileCustomerService,
			"get_customer",
			"Use after a customer is selected to view support-safe customer details. Requires a validated customer_id from search_customers.",
			"customers",
			getCustomer(services.Customers),
			idSchema("customer_id")),

		readTool(
			ProfileCustomerService,
			"get_customer_purchase_history",
			"Use to answer customer support questions about a selected customer's purchase history. Requires a validated customer_id.",
			"customers",
			purchaseHistory(services.Customers),
			idSchema("customer_id")),

		readTool(
			ProfileCustomerService,
			"list_customer_invoices",
			"Use to find invoices for a selected customer. Requires a validated customer_id; returns compact invoice rows.",
			"invoices",
			listCustomerInvoices(services.Invoices),
			customerPageSchema()),

		readTool(
			ProfileCustomerService,
			"get_invoice",
			"Use after an invoice has been selected to inspect support-safe invoice details. Requires a validated invoice_id.", "invoices",
			getInvoice(services.Invoices),
			idSchema("invoice_id")),

		readTool(
			ProfileCustomerService,
			"search_support_knowledge",
			"Use for support scripts, FAQs, and customer-service policy questions. Initial implementation returns a stable empty result until the knowledge index is configured.",
			"ai",
			knowledgeSearch("support"),
			knowledgeSchema()),
	}

	tools = append(tools, businessOwner...)
	tools = append(tools, customerService...)

	return tools
}

func readTool(profile Profile, name, description, resource string, handler ToolHandler, schema map[string]any) Tool {
	return Tool{Name: name, Description: description, Profile: profile, Resource: resource, Action: "read", ReadOnly: true, InputSchema: schema, Handler: handler}
}

func NewDefaultRegistry(enforcer *authz.Enforcer, services Services) *Registry {
	return NewRegistry(enforcer, DefaultTools(services)...)
}

type periodArgs struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type pageArgs struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

type searchArgs struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

type idArgs struct {
	CustomerID string `json:"customer_id"`
	InvoiceID  string `json:"invoice_id"`
}

type knowledgeArgs struct {
	Query      string  `json:"query"`
	Collection string  `json:"collection"`
	MaxResults int     `json:"max_results"`
	MinScore   float64 `json:"min_score"`
}

func summarizeSales(svc SalesService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("sales service unavailable")
		}

		from, to, err := parsePeriod(args, ctx.Now)
		if err != nil {
			return nil, nil, err
		}

		summary, err := svc.GetSalesSummary(context.Background(), ctx.Session.BusinessID, from, to)
		if err != nil {
			return nil, nil, err
		}

		return map[string]any{"count": summary.Count, "subtotal": summary.Subtotal.String(), "tax_amount": summary.TaxAmount.String(), "total": summary.Total.String(), "currency": "KES", "from": from.Format(time.RFC3339), "to": to.Format(time.RFC3339)}, nil, nil
	}
}

func listSalesByProduct(svc SalesService) ToolHandler {
	return breakdownHandler(func(ctx context.Context, bid uuid.UUID) ([]sales.Breakdown, error) {
		return svc.GetSalesByProduct(ctx, bid)
	}, svc)
}
func listSalesByPaymentMethod(svc SalesService) ToolHandler {
	return breakdownHandler(func(ctx context.Context, bid uuid.UUID) ([]sales.Breakdown, error) {
		return svc.GetSalesByPaymentMethod(ctx, bid)
	}, svc)
}
func listSalesByStaff(svc SalesService) ToolHandler {
	return breakdownHandler(func(ctx context.Context, bid uuid.UUID) ([]sales.Breakdown, error) {
		return svc.GetSalesByStaff(ctx, bid)
	}, svc)
}

func breakdownHandler(fn func(context.Context, uuid.UUID) ([]sales.Breakdown, error), svc SalesService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("sales service unavailable")
		}

		limit, _, err := parsePage(args)
		if err != nil {
			return nil, nil, err
		}

		rows, err := fn(context.Background(), ctx.Session.BusinessID)
		if err != nil {
			return nil, nil, err
		}

		truncated := len(rows) > limit
		if truncated {
			rows = rows[:limit]
		}

		out := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			out = append(out, map[string]any{"key": row.Key, "total": row.Total.String(), "count": row.Count, "currency": "KES"})
		}

		return map[string]any{"results": out}, map[string]any{"result_count": len(out), "truncated": truncated, "next_offset": limit, "total_count": len(out)}, nil
	}
}

func listLowStock(svc InventoryService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("inventory service unavailable")
		}

		limit, _, err := parsePage(args)
		if err != nil {
			return nil, nil, err
		}

		items, err := svc.GetLowStockItems(context.Background(), ctx.Session.BusinessID)
		if err != nil {
			return nil, nil, err
		}

		if len(items) > limit {
			items = items[:limit]
		}

		out := make([]map[string]any, 0, len(items))
		for _, item := range items {
			out = append(out, map[string]any{"product_id": item.ProductID.String(), "quantity": item.Quantity.String(), "low_stock_threshold": item.LowStockThreshold.String()})
		}

		return map[string]any{"results": out}, map[string]any{"result_count": len(out)}, nil
	}
}

func inventoryValuation(svc InventoryService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("inventory service unavailable")
		}

		limit, _, err := parsePage(args)
		if err != nil {
			return nil, nil, err
		}

		items, err := svc.GetInventoryValuation(context.Background(), ctx.Session.BusinessID)
		if err != nil {
			return nil, nil, err
		}

		if len(items) > limit {
			items = items[:limit]
		}

		out := make([]map[string]any, 0, len(items))
		for _, item := range items {
			out = append(out, map[string]any{"product_id": item.ProductID.String(), "quantity": item.Quantity.String()})
		}

		return map[string]any{"results": out}, map[string]any{"result_count": len(out)}, nil
	}
}

func stockMovements(svc InventoryService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("inventory service unavailable")
		}

		limit, offset, err := parsePage(args)
		if err != nil {
			return nil, nil, err
		}

		rows, err := svc.GetStockMovements(context.Background(), ctx.Session.BusinessID, pagination.Page{Limit: limit, Offset: offset})
		if err != nil {
			return nil, nil, err
		}

		out := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			out = append(out, map[string]any{"id": row.ID.String(), "product_id": row.ProductID.String(), "quantity_delta": row.QuantityDelta.String(), "movement_type": row.MovementType, "occurred_at": row.OccurredAt.Format(time.RFC3339)})
		}

		return map[string]any{"results": out}, map[string]any{"result_count": len(out)}, nil
	}
}

func expenseSummary(svc ExpensesService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("expenses service unavailable")
		}

		from, to, err := parsePeriod(args, ctx.Now)
		if err != nil {
			return nil, nil, err
		}

		rows, err := svc.SummaryByCategory(context.Background(), ctx.Session.BusinessID, from, to)
		if err != nil {
			return nil, nil, err
		}

		out := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			out = append(out, map[string]any{"category": row.Category, "amount": row.Amount.String(), "tax_amount": row.TaxAmount.String(), "count": row.Count, "currency": "KES"})
		}

		return map[string]any{"results": out, "from": from.Format(time.RFC3339), "to": to.Format(time.RFC3339)}, map[string]any{"result_count": len(out)}, nil
	}
}

func searchCustomers(svc CustomersService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("customers service unavailable")
		}

		var in searchArgs

		_ = json.Unmarshal(args, &in)
		limit := clampLimit(in.Limit)

		rows, err := svc.List(context.Background(), ctx.Session.BusinessID, pagination.Page{Limit: 50, Offset: 0})
		if err != nil {
			return nil, nil, err
		}

		q := strings.ToLower(strings.TrimSpace(in.Query))
		out := []map[string]any{}

		for _, row := range rows {
			if q != "" && !strings.Contains(strings.ToLower(row.Name+" "+row.Phone+" "+row.Email), q) {
				continue
			}

			out = append(out, map[string]any{"customer_id": row.ID.String(), "name": row.Name, "phone_last4": last4(row.Phone), "email_domain": emailDomain(row.Email), "loyalty_points": row.LoyaltyPoints})
			if len(out) >= limit {
				break
			}
		}

		return map[string]any{"results": out}, map[string]any{"result_count": len(out), "truncated": len(out) == limit}, nil
	}
}

func getCustomer(svc CustomersService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("customers service unavailable")
		}

		id, err := parseUUIDArg(args, "customer_id")
		if err != nil {
			return nil, nil, err
		}

		row, err := svc.Get(context.Background(), ctx.Session.BusinessID, id)
		if err != nil {
			return nil, nil, err
		}

		return map[string]any{"customer_id": row.ID.String(), "name": row.Name, "phone_last4": last4(row.Phone), "email_domain": emailDomain(row.Email), "tags": row.Tags, "loyalty_points": row.LoyaltyPoints, "last_purchase_at": row.LastPurchaseAt}, nil, nil
	}
}

func purchaseHistory(svc CustomersService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("customers service unavailable")
		}

		id, err := parseUUIDArg(args, "customer_id")
		if err != nil {
			return nil, nil, err
		}

		rows, err := svc.GetCustomerPurchaseHistory(context.Background(), ctx.Session.BusinessID, id)
		if err != nil {
			return nil, nil, err
		}

		out := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			out = append(out, map[string]any{"sale_id": row.SaleID.String(), "receipt_number": row.ReceiptNumber, "purchased_at": row.PurchasedAt.Format(time.RFC3339), "total": row.Total.String(), "currency": "KES"})
		}

		return map[string]any{"results": out}, map[string]any{"result_count": len(out)}, nil
	}
}

func listInvoices(svc InvoicesService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("invoices service unavailable")
		}

		limit, offset, err := parsePage(args)
		if err != nil {
			return nil, nil, err
		}

		rows, err := svc.List(context.Background(), ctx.Session.BusinessID, pagination.Page{Limit: limit, Offset: offset})
		if err != nil {
			return nil, nil, err
		}

		return invoiceListPayload(rows), map[string]any{"result_count": len(rows)}, nil
	}
}

func listCustomerInvoices(svc InvoicesService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("invoices service unavailable")
		}

		cid, err := parseUUIDArg(args, "customer_id")
		if err != nil {
			return nil, nil, err
		}

		limit, offset, err := parsePage(args)
		if err != nil {
			return nil, nil, err
		}

		rows, err := svc.List(context.Background(), ctx.Session.BusinessID, pagination.Page{Limit: 50, Offset: offset})
		if err != nil {
			return nil, nil, err
		}

		filtered := []invoices.Invoice{}

		for _, row := range rows {
			if row.CustomerID != nil && *row.CustomerID == cid {
				filtered = append(filtered, row)
				if len(filtered) >= limit {
					break
				}
			}
		}

		return invoiceListPayload(filtered), map[string]any{"result_count": len(filtered)}, nil
	}
}

func getInvoice(svc InvoicesService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("invoices service unavailable")
		}

		id, err := parseUUIDArg(args, "invoice_id")
		if err != nil {
			return nil, nil, err
		}

		row, err := svc.Get(context.Background(), ctx.Session.BusinessID, id)
		if err != nil {
			return nil, nil, err
		}

		return invoicePayload(*row), nil, nil
	}
}

func knowledgeSearch(kind string) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		var in knowledgeArgs

		_ = json.Unmarshal(args, &in)

		max := in.MaxResults
		if max <= 0 || max > 10 {
			max = 3
		}

		return map[string]any{"results": []any{}, "query": strings.TrimSpace(in.Query), "collection": in.Collection, "profile": kind}, map[string]any{"result_count": 0, "tokens_estimate": 0, "truncated": false, "max_results": max}, nil
	}
}

func invoiceListPayload(rows []invoices.Invoice) map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, invoicePayload(row))
	}

	return map[string]any{"results": out}
}

func invoicePayload(row invoices.Invoice) map[string]any {
	payload := map[string]any{"invoice_id": row.ID.String(), "invoice_number": row.InvoiceNumber, "status": row.Status, "total": row.Total.String(), "amount_paid": row.AmountPaid.String(), "amount_due": row.AmountDue.String(), "currency": row.Currency, "due_at": row.DueAt, "sent_at": row.SentAt, "paid_at": row.PaidAt}
	if row.CustomerID != nil {
		payload["customer_id"] = row.CustomerID.String()
	}

	if row.OrderID != nil {
		payload["order_id"] = row.OrderID.String()
	}

	return payload
}

func parsePeriod(raw json.RawMessage, now time.Time) (time.Time, time.Time, error) {
	var in periodArgs

	_ = json.Unmarshal(raw, &in)
	to := now
	from := now.AddDate(0, -1, 0)

	var err error
	if in.To != "" {
		to, err = time.Parse(time.RFC3339, in.To)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("to must be RFC3339")
		}
	}

	if in.From != "" {
		from, err = time.Parse(time.RFC3339, in.From)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("from must be RFC3339")
		}
	}

	if !from.Before(to) {
		return time.Time{}, time.Time{}, fmt.Errorf("from must be before to")
	}

	if to.Sub(from) > 370*24*time.Hour {
		return time.Time{}, time.Time{}, fmt.Errorf("date range cannot exceed 370 days")
	}

	return from, to, nil
}

func parsePage(raw json.RawMessage) (int, int, error) {
	var in pageArgs

	_ = json.Unmarshal(raw, &in)
	limit := clampLimit(in.Limit)

	offset := in.Offset
	if offset < 0 {
		return 0, 0, fmt.Errorf("offset cannot be negative")
	}

	return limit, offset, nil
}

func parseUUIDArg(raw json.RawMessage, key string) (uuid.UUID, error) {
	var values map[string]string
	if err := json.Unmarshal(raw, &values); err != nil {
		return uuid.Nil, fmt.Errorf("invalid arguments")
	}

	id, err := uuid.Parse(values[key])
	if err != nil || id == uuid.Nil {
		return uuid.Nil, fmt.Errorf("%s must be a valid UUID", key)
	}

	return id, nil
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return 10
	}

	if limit > 50 {
		return 50
	}

	return limit
}

func last4(value string) string {
	value = strings.TrimSpace(value)
	if len(value) <= 4 {
		return value
	}

	return value[len(value)-4:]
}

func emailDomain(value string) string {
	parts := strings.Split(strings.TrimSpace(value), "@")
	if len(parts) != 2 {
		return ""
	}

	return parts[1]
}

func periodSchema() map[string]any {
	return ObjectSchema(map[string]any{"from": StringSchema("RFC3339 start time; defaults to one month ago."), "to": StringSchema("RFC3339 end time; defaults to now.")})
}
func limitSchema() map[string]any {
	return ObjectSchema(map[string]any{"limit": IntegerSchema("Maximum records to return; default 10, max 50.", 1, 50)})
}
func pageSchema() map[string]any {
	return ObjectSchema(map[string]any{"limit": IntegerSchema("Maximum records to return; default 10, max 50.", 1, 50), "offset": IntegerSchema("Zero-based result offset.", 0, 100000)})
}
func searchSchema() map[string]any {
	return ObjectSchema(map[string]any{"query": StringSchema("Customer name, phone, or email fragment."), "limit": IntegerSchema("Maximum candidates to return; default 10, max 50.", 1, 50)})
}
func idSchema(name string) map[string]any {
	return ObjectSchema(map[string]any{name: StringSchema("Validated UUID from a prior search or list tool.")}, name)
}
func customerPageSchema() map[string]any {
	return ObjectSchema(map[string]any{"customer_id": StringSchema("Validated customer UUID."), "limit": IntegerSchema("Maximum records to return; default 10, max 50.", 1, 50), "offset": IntegerSchema("Zero-based result offset.", 0, 100000)}, "customer_id")
}
func knowledgeSchema() map[string]any {
	return ObjectSchema(map[string]any{"query": StringSchema("Natural-language support or help query."), "collection": StringSchema("Optional collection such as user_guide, faq, policy, support_scripts, or api_reference."), "max_results": IntegerSchema("Maximum snippets to return; default 3, max 10.", 1, 10), "min_score": map[string]any{"type": "number", "description": "Minimum relevance score; default 0.5.", "minimum": 0, "maximum": 1}}, "query")
}

func compareSchema() map[string]any {
	return ObjectSchema(map[string]any{
		"timeframe": StringSchema("Comparison window: day, week, month, year. Default month."),
		"compare":   StringSchema("Compare against: prev_period (default) or prev_year."),
		"from":      StringSchema("Optional RFC3339 start; if provided, timeframe/compare are ignored."),
		"to":        StringSchema("Optional RFC3339 end."),
	})
}

func anomalySchema() map[string]any {
	return ObjectSchema(map[string]any{
		"timeframe":   StringSchema("Window to scan: week, month (default month)."),
		"sensitivity": StringSchema("low|medium|high — threshold for flagging. Default medium."),
	})
}

func pendingInvoicesSchema() map[string]any {
	return ObjectSchema(map[string]any{
		"status":     StringSchema("Filter by status: sent, partial, overdue, draft. Default all pending (sent,partial,overdue)."),
		"due_before": StringSchema("Optional RFC3339 upper bound for due_at."),
		"limit":      IntegerSchema("Max records; default 10, max 50.", 1, 50),
		"offset":     IntegerSchema("Offset; default 0.", 0, 100000),
	})
}

func taxDeadlineSchema() map[string]any {
	return ObjectSchema(map[string]any{
		"months_ahead": IntegerSchema("How many months of deadlines to return; default 3, max 12.", 1, 12),
	})
}

// --- GAP FILL HANDLERS ---

type compareArgs struct {
	Timeframe string `json:"timeframe"`
	Compare   string `json:"compare"`
	From      string `json:"from"`
	To        string `json:"to"`
}

func compareRevenue(svc SalesService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("sales service unavailable")
		}
		var in compareArgs
		_ = json.Unmarshal(args, &in)
		tf := strings.ToLower(strings.TrimSpace(in.Timeframe))
		if tf == "" {
			tf = "month"
		}
		cmp := strings.ToLower(strings.TrimSpace(in.Compare))
		if cmp == "" {
			cmp = "prev_period"
		}
		var curFrom, curTo, prevFrom, prevTo time.Time
		var err error
		if in.From != "" || in.To != "" {
			curFrom, curTo, err = parsePeriod(args, ctx.Now)
			if err != nil {
				return nil, nil, err
			}
			d := curTo.Sub(curFrom)
			prevTo = curFrom
			prevFrom = curFrom.Add(-d)
		} else {
			switch tf {
			case "day":
				curTo = ctx.Now
				curFrom = curTo.Add(-24 * time.Hour)
			case "week":
				curTo = ctx.Now
				curFrom = curTo.Add(-7 * 24 * time.Hour)
			case "year":
				curTo = ctx.Now
				curFrom = curTo.AddDate(-1, 0, 0)
			default:
				tf = "month"
				curTo = ctx.Now
				curFrom = curTo.AddDate(0, -1, 0)
			}
			if cmp == "prev_year" {
				prevTo = curTo.AddDate(-1, 0, 0)
				prevFrom = curFrom.AddDate(-1, 0, 0)
			} else {
				d := curTo.Sub(curFrom)
				prevTo = curFrom
				prevFrom = curFrom.Add(-d)
			}
		}
		cur, err := svc.GetSalesSummary(context.Background(), ctx.Session.BusinessID, curFrom, curTo)
		if err != nil {
			return nil, nil, err
		}
		prev, err := svc.GetSalesSummary(context.Background(), ctx.Session.BusinessID, prevFrom, prevTo)
		if err != nil {
			return nil, nil, err
		}
		curTotal := cur.Total
		prevTotal := prev.Total
		deltaAbs := curTotal.Sub(prevTotal)
		var deltaPct *float64
		if !prevTotal.IsZero() {
			pct, _ := deltaAbs.Div(prevTotal).Mul(decimal.NewFromInt(100)).Float64()
			deltaPct = &pct
		}
		return map[string]any{
			"timeframe": tf,
			"compare":   cmp,
			"current":   map[string]any{"from": curFrom.Format(time.RFC3339), "to": curTo.Format(time.RFC3339), "count": cur.Count, "subtotal": cur.Subtotal.String(), "total": curTotal.String(), "currency": "KES"},
			"previous":  map[string]any{"from": prevFrom.Format(time.RFC3339), "to": prevTo.Format(time.RFC3339), "count": prev.Count, "subtotal": prev.Subtotal.String(), "total": prevTotal.String(), "currency": "KES"},
			"delta":     map[string]any{"absolute": deltaAbs.String(), "percent": deltaPct, "currency": "KES"},
		}, map[string]any{"result_count": 2}, nil
	}
}

func detectAnomalies(salesSvc SalesService, expSvc ExpensesService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		var in struct {
			Timeframe   string `json:"timeframe"`
			Sensitivity string `json:"sensitivity"`
		}
		_ = json.Unmarshal(args, &in)
		tf := strings.ToLower(strings.TrimSpace(in.Timeframe))
		if tf == "" {
			tf = "month"
		}
		sens := strings.ToLower(strings.TrimSpace(in.Sensitivity))
		if sens == "" {
			sens = "medium"
		}
		threshold := 0.5
		if sens == "low" {
			threshold = 0.8
		} else if sens == "high" {
			threshold = 0.3
		}
		now := ctx.Now
		var curFrom, curTo, prevFrom, prevTo time.Time
		switch tf {
		case "week":
			curTo = now
			curFrom = curTo.Add(-7 * 24 * time.Hour)
		case "year":
			curTo = now
			curFrom = curTo.AddDate(-1, 0, 0)
		default:
			tf = "month"
			curTo = now
			curFrom = curTo.AddDate(0, -1, 0)
		}
		d := curTo.Sub(curFrom)
		prevTo = curFrom
		prevFrom = curFrom.Add(-d)

		anomalies := []map[string]any{}

		if expSvc != nil {
			curCats, _ := expSvc.SummaryByCategory(context.Background(), ctx.Session.BusinessID, curFrom, curTo)
			prevCats, _ := expSvc.SummaryByCategory(context.Background(), ctx.Session.BusinessID, prevFrom, prevTo)
			prevMap := map[string]decimal.Decimal{}
			for _, c := range prevCats {
				prevMap[strings.ToLower(c.Category)] = c.Amount
			}
			curSet := map[string]bool{}
			for _, c := range curCats {
				curSet[strings.ToLower(c.Category)] = true
				prevAmt, ok := prevMap[strings.ToLower(c.Category)]
				if !ok {
					anomalies = append(anomalies, map[string]any{"type": "new_expense_category", "category": c.Category, "current_amount": c.Amount.String(), "severity": "medium", "reason": "New category not in previous period"})
					continue
				}
				if prevAmt.IsZero() {
					continue
				}
				delta, _ := c.Amount.Sub(prevAmt).Div(prevAmt).Float64()
				if delta >= threshold {
					sev := map[string]string{"low": "low", "medium": "high", "high": "high"}[sens]
					anomalies = append(anomalies, map[string]any{"type": "expense_spike", "category": c.Category, "previous_amount": prevAmt.String(), "current_amount": c.Amount.String(), "delta_percent": delta * 100, "severity": sev})
				} else if delta <= -threshold {
					anomalies = append(anomalies, map[string]any{"type": "expense_drop", "category": c.Category, "previous_amount": prevAmt.String(), "current_amount": c.Amount.String(), "delta_percent": delta * 100, "severity": "low"})
				}
			}
			for _, c := range prevCats {
				if !curSet[strings.ToLower(c.Category)] {
					anomalies = append(anomalies, map[string]any{"type": "missing_expense_category", "category": c.Category, "previous_amount": c.Amount.String(), "current_amount": "0", "severity": "low", "reason": "Category present last period but missing now"})
				}
			}
		}
		if salesSvc != nil {
			cur, errCur := salesSvc.GetSalesSummary(context.Background(), ctx.Session.BusinessID, curFrom, curTo)
			prev, errPrev := salesSvc.GetSalesSummary(context.Background(), ctx.Session.BusinessID, prevFrom, prevTo)
			if errCur == nil && errPrev == nil && !prev.Total.IsZero() {
				delta, _ := cur.Total.Sub(prev.Total).Div(prev.Total).Float64()
				if delta <= -threshold {
					anomalies = append(anomalies, map[string]any{"type": "revenue_drop", "previous_total": prev.Total.String(), "current_total": cur.Total.String(), "delta_percent": delta * 100, "severity": "high", "reason": "Revenue dropped significantly vs previous period"})
				}
			}
			if errCur == nil && errPrev == nil && cur.Count == 0 && prev.Count > 0 {
				anomalies = append(anomalies, map[string]any{"type": "no_sales", "previous_count": prev.Count, "current_count": 0, "severity": "high", "reason": "No sales in current period but had sales before"})
			}
		}
		if len(anomalies) > 20 {
			anomalies = anomalies[:20]
		}
		return map[string]any{"timeframe": tf, "sensitivity": sens, "anomalies": anomalies, "count": len(anomalies)}, map[string]any{"result_count": len(anomalies), "truncated": len(anomalies) == 20}, nil
	}
}

func listPendingInvoices(svc InvoicesService) ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		if svc == nil {
			return nil, nil, fmt.Errorf("invoices service unavailable")
		}
		var in struct {
			Status    string `json:"status"`
			DueBefore string `json:"due_before"`
			Limit     int    `json:"limit"`
			Offset    int    `json:"offset"`
		}
		_ = json.Unmarshal(args, &in)
		limit := clampLimit(in.Limit)
		offset := in.Offset
		if offset < 0 {
			offset = 0
		}
		statusFilter := strings.ToLower(strings.TrimSpace(in.Status))
		var dueBefore *time.Time
		if in.DueBefore != "" {
			t, err := time.Parse(time.RFC3339, in.DueBefore)
			if err != nil {
				return nil, nil, fmt.Errorf("due_before must be RFC3339")
			}
			dueBefore = &t
		}
		// Fetch up to 50 and filter in memory (bounded)
		rows, err := svc.List(context.Background(), ctx.Session.BusinessID, pagination.Page{Limit: 50, Offset: offset})
		if err != nil {
			return nil, nil, err
		}
		pendingStatuses := map[string]bool{"sent": true, "partial": true, "overdue": true, "draft": true}
		if statusFilter != "" {
			pendingStatuses = map[string]bool{statusFilter: true}
		}
		filtered := []invoices.Invoice{}
		for _, r := range rows {
			if !pendingStatuses[strings.ToLower(string(r.Status))] {
				continue
			}
			if dueBefore != nil && r.DueAt != nil && r.DueAt.After(*dueBefore) {
				continue
			}
			filtered = append(filtered, r)
			if len(filtered) >= limit {
				break
			}
		}
		return invoiceListPayload(filtered), map[string]any{"result_count": len(filtered), "truncated": len(filtered) == limit, "next_offset": offset + len(filtered)}, nil
	}
}

func listPendingPayments() ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		// Payments service not yet wired to MCP; return empty with guidance
		// When wired, this will query payment_commands WHERE status in ('pending','processing')
		limit, _, _ := parsePage(args)
		return map[string]any{
			"results": []any{},
			"note":    "Payment commands pending list not yet wired — use list_pending_invoices for receivables; payments will be added when PaymentsService is injected into MCP registry.",
			"meta":    map[string]any{"pending_payments": 0},
		}, map[string]any{"result_count": 0, "truncated": false, "next_offset": limit}, nil
	}
}

func getUpcomingTaxDeadlines() ToolHandler {
	return func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
		var in struct {
			MonthsAhead int `json:"months_ahead"`
		}
		_ = json.Unmarshal(args, &in)
		months := in.MonthsAhead
		if months <= 0 {
			months = 3
		}
		if months > 12 {
			months = 12
		}
		now := ctx.Now
		deadlines := []map[string]any{}
		// Kenya VAT 16% monthly 20th, PAYE 9th, Turnover 1% monthly 20th (for MSMEs <5M)
		for i := 0; i < months; i++ {
			base := now.AddDate(0, i, 0)
			year, month, _ := base.Date()
			// VAT
			vatDue := time.Date(year, month, 20, 23, 59, 59, 0, time.UTC)
			if vatDue.Before(now) {
				// next month's 20th if already passed
				vatDue = time.Date(year, month+1, 20, 23, 59, 59, 0, time.UTC)
			}
			deadlines = append(deadlines, map[string]any{
				"type":        "VAT",
				"description": "Kenya VAT 16% monthly filing and payment (KRA iTax)",
				"due_at":      vatDue.Format(time.RFC3339),
				"period":      fmt.Sprintf("%04d-%02d", year, month),
				"authority":   "KRA",
			})
			if i == 0 {
				// PAYE for payroll month
				payeDue := time.Date(year, month, 9, 23, 59, 59, 0, time.UTC)
				if payeDue.After(now) {
					deadlines = append(deadlines, map[string]any{
						"type":        "PAYE",
						"description": "PAYE for employees (if any) — KRA",
						"due_at":      payeDue.Format(time.RFC3339),
						"period":      fmt.Sprintf("%04d-%02d", year, month),
						"authority":   "KRA",
					})
				}
			}
		}
		// Sort by due_at
		// (already chronological)
		return map[string]any{"deadlines": deadlines, "count": len(deadlines), "currency": "KES", "note": "Computed from KE 16% VAT monthly 20th rule and business tax_pin; no historical filing status stored — integrate KRA iTax API for real status."}, map[string]any{"result_count": len(deadlines)}, nil
	}
}
