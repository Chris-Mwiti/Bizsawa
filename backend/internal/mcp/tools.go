package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/customers"
	"github.com/Codecx-Org/FinAI/backend/internal/expenses"
	"github.com/Codecx-Org/FinAI/backend/internal/inventory"
	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/pagination"
	"github.com/google/uuid"
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
		if len(rows) > limit {
			rows = rows[:limit]
		}
		out := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			out = append(out, map[string]any{"key": row.Key, "total": row.Total.String(), "count": row.Count, "currency": "KES"})
		}
		return map[string]any{"results": out}, map[string]any{"result_count": len(out)}, nil
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
