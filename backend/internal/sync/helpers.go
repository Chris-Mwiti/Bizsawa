package sync

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

func isSyncable(t string) bool {
	for _, s := range syncableTables {
		if s == t {
			return true
		}
	}

	return false
}

func intFromAny(v any) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	case string:
		var i int

		fmt.Sscan(x, &i)

		return i
	default:
		return 0
	}
}

func isTimestampColumn(k string) bool {
	// All timestamp columns in syncable tables end with _at or are created_at/updated_at/deleted_at
	return k == "created_at" || k == "updated_at" || k == "deleted_at" || k == "spent_at" || k == "sold_at" || k == "due_at" || k == "sent_at" || k == "viewed_at" || k == "paid_at" || k == "occurred_at" || k == "last_purchase_at" || k == "confirmed_at" || k == "fulfilled_at" || k == "last_restocked_at"
}

func isNumericColumn(k string) bool {
	switch k {
	case "price", "cost", "quantity", "low_stock_threshold", "quantity_delta", "subtotal", "tax_amount", "total", "amount", "amount_paid", "amount_due", "line_total", "unit_price", "total_spend", "rate":
		return true
	}

	return false
}

func sanitizeNumeric(v any) (string, bool) {
	if v == nil {
		return "", false
	}

	switch x := v.(type) {
	case []uint8:
		s := strings.TrimSpace(string(x))
		if s == "" || strings.EqualFold(s, "nan") || strings.EqualFold(s, "local") {
			return "", false
		}

		if _, err := fmt.Sscanf(s, "%f", new(float64)); err == nil {
			return s, true
		}

		return s, true
	case string:
		s := strings.TrimSpace(x)
		if s == "" || strings.EqualFold(s, "nan") || strings.EqualFold(s, "local") {
			return "", false
		}

		return s, true
	case float64:
		if x != x || x == 0 && fmt.Sprint(x) == "NaN" { // NaN check
			return "", false
		}

		return fmt.Sprintf("%v", x), true
	case int, int64, int32:
		return fmt.Sprintf("%v", x), true
	}

	s := strings.TrimSpace(fmt.Sprint(v))
	if s == "" || strings.EqualFold(s, "nan") || strings.EqualFold(s, "local") {
		return "", false
	}

	return s, true
}

func asTime(v any) *time.Time {
	if v == nil {
		return nil
	}

	switch x := v.(type) {
	case time.Time:
		if x.UnixMilli() == 0 {
			return nil
		}

		return &x
	case float64:
		if x == 0 || x == 1 {
			return nil
		}

		if x > 1e12 {
			t := time.UnixMilli(int64(x))
			return &t
		}

		if x > 1e10 {
			t := time.Unix(int64(x), 0)
			return &t
		}

		if x == 0 {
			return nil
		}

		if x < 1000 {
			return nil
		}

		t := time.UnixMilli(int64(x))
		if t.UnixMilli() == 0 {
			return nil
		}

		return &t
	case int64:
		if x == 0 || x == 1 {
			return nil
		}

		if x > 1e12 {
			t := time.UnixMilli(x)
			return &t
		}

		if x < 1000 {
			return nil
		}

		t := time.Unix(x, 0)
		if t.UnixMilli() == 0 {
			return nil
		}

		return &t
	case int:
		if x == 0 {
			return nil
		}

		return asTime(float64(x))
	case string:
		trimmed := strings.TrimSpace(x)
		if trimmed == "" || trimmed == "0" || trimmed == "local" || strings.ToLower(trimmed) == "nan" {
			return nil
		}

		if t, err := time.Parse(time.RFC3339, trimmed); err == nil {
			if t.UnixMilli() != 0 {
				return &t
			}

			return nil
		}

		if t, err := time.Parse(time.RFC3339Nano, trimmed); err == nil {
			if t.UnixMilli() != 0 {
				return &t
			}

			return nil
		}

		var ms int64
		if _, err := fmt.Sscan(trimmed, &ms); err == nil {
			if ms == 0 {
				return nil
			}

			return asTime(float64(ms))
		}
	}

	return nil
}

func isUUIDColumn(k string) bool {
	return k == "id" || strings.HasSuffix(k, "_id") || k == "staffId" || k == "businessId" || k == "tenantId"
}

func isValidUUID(v any) bool {
	s, ok := v.(string)
	if !ok || s == "" || s == "local" || s == "null" {
		return false
	}

	_, err := uuid.Parse(s)

	return err == nil
}

var allowedUpdateColumns = map[string]map[string]bool{
	"products":         {"name": true, "description": true, "sku": true, "category": true, "barcode": true, "image_url": true, "tax_rule_id": true, "price": true, "cost": true, "is_active": true, "sync_version": true, "deleted_at": true},
	"product_variants": {"business_id": true, "product_id": true, "name": true, "sku": true, "barcode": true, "price": true, "cost": true, "is_active": true, "sync_version": true, "deleted_at": true},
	"customers":        {"name": true, "phone": true, "email": true, "address": true, "tags": true, "notes": true, "loyalty_points": true, "total_spend": true, "last_purchase_at": true, "sync_version": true, "deleted_at": true},
	"inventory_items":  {"product_id": true, "quantity": true, "low_stock_threshold": true, "sync_version": true, "deleted_at": true},
	"stock_movements":  {"product_id": true, "quantity_delta": true, "movement_type": true, "reference_type": true, "reference_id": true, "notes": true, "occurred_at": true, "sync_version": true, "deleted_at": true},
	"orders":           {"customer_id": true, "status": true, "subtotal": true, "tax_amount": true, "total": true, "payment_method": true, "payment_status": true, "idempotency_key": true, "confirmed_at": true, "fulfilled_at": true, "sync_version": true, "deleted_at": true},
	"order_lines":      {"order_id": true, "product_id": true, "product_variant_id": true, "quantity": true, "unit_price": true, "line_total": true, "sync_version": true, "deleted_at": true},
	"sales":            {"order_id": true, "customer_id": true, "receipt_number": true, "staff_id": true, "payment_method": true, "subtotal": true, "tax_amount": true, "total": true, "status": true, "sold_at": true, "idempotency_key": true, "sync_version": true, "deleted_at": true},
	"sale_lines":       {"sale_id": true, "product_id": true, "product_variant_id": true, "quantity": true, "unit_price": true, "line_total": true, "sync_version": true, "deleted_at": true},
	"expenses":         {"category": true, "description": true, "vendor": true, "amount": true, "tax_amount": true, "is_recurring": true, "recurring_interval": true, "spent_at": true, "created_by": true, "sync_version": true, "deleted_at": true},
	"invoices":         {"customer_id": true, "invoice_number": true, "order_id": true, "status": true, "subtotal": true, "tax_amount": true, "total": true, "amount_paid": true, "amount_due": true, "currency": true, "notes": true, "due_at": true, "sent_at": true, "sync_version": true, "deleted_at": true},
	"invoice_lines":    {"invoice_id": true, "product_id": true, "description": true, "quantity": true, "unit_price": true, "line_total": true, "sync_version": true, "deleted_at": true},
	"payments":         {"invoice_id": true, "order_id": true, "amount": true, "currency": true, "phone": true, "status": true, "provider": true, "sync_version": true, "deleted_at": true},
	"payment_commands": {"order_id": true, "amount": true, "currency": true, "phone": true, "status": true, "provider": true, "type": true, "idempotency_key": true, "sync_version": true, "deleted_at": true},
	"tax_rules":        {"name": true, "rate": true, "country": true, "is_default": true, "is_active": true, "sync_version": true, "deleted_at": true},
}
