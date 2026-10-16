package sync

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

func (s *Service) insertRecord(tx *gorm.DB, businessID uuid.UUID, userID uuid.UUID, table string, rec map[string]any) error {
	clean := map[string]any{}

	for k, v := range rec {
		if len(k) > 0 && k[0] == '_' {
			continue
		}

		clean[k] = v
	}

	rec = clean
	// Sanitize UUID columns — frontend historically sent "local" or "" for business_id/staff_id when offline before auth
	for k, v := range rec {
		if isUUIDColumn(k) && !isValidUUID(v) {
			if vStr, ok := v.(string); ok && (vStr == "local" || vStr == "" || vStr == "null") {
				// Replace known placeholders with correct context IDs
				switch k {
				case "business_id", "tenant_id":
					rec[k] = businessID.String()
				case "staff_id", "staffId", "created_by":
					if userID != uuid.Nil {
						rec[k] = userID.String()
					} else {
						delete(rec, k)
					}
				case "customer_id", "product_id", "sale_id", "order_id", "invoice_id", "orderId", "productId":
					// nullable FKs — drop invalid placeholder, let DB handle NULL
					delete(rec, k)
				default:
					delete(rec, k)
				}

				continue
			}
			// Also drop any other invalid UUID string to avoid 22P02
			if sStr, ok := v.(string); ok {
				if _, err := uuid.Parse(sStr); err != nil {
					delete(rec, k)
				}
			}
		}
	}

	if _, ok := rec["business_id"]; !ok {
		rec["business_id"] = businessID.String()
	}

	if _, ok := rec["tenant_id"]; !ok {
		rec["tenant_id"] = businessID.String()
	}
	// Ensure required staff_id for sales — fallback to authenticated user
	if table == "sales" {
		if _, ok := rec["staff_id"]; !ok {
			if userID != uuid.Nil {
				rec["staff_id"] = userID.String()
			} else {
				rec["staff_id"] = businessID.String()
			}
		}
	}
	// Ensure required NOT NULL columns for orders (schema drift: mobile sends NULL for payment_status)
	if table == "orders" {
		if v, ok := rec["status"]; !ok || v == nil || strings.TrimSpace(fmt.Sprint(v)) == "" || strings.EqualFold(fmt.Sprint(v), "null") {
			rec["status"] = "draft"
		}

		if v, ok := rec["payment_status"]; !ok || v == nil || strings.TrimSpace(fmt.Sprint(v)) == "" || strings.EqualFold(fmt.Sprint(v), "null") || strings.EqualFold(fmt.Sprint(v), "undefined") {
			rec["payment_status"] = "pending"
		}

		if v, ok := rec["payment_method"]; !ok || v == nil || strings.TrimSpace(fmt.Sprint(v)) == "" {
			rec["payment_method"] = "cash"
		}

		for _, col := range []string{"subtotal", "tax_amount", "total"} {
			if _, ok := rec[col]; !ok || rec[col] == nil {
				rec[col] = "0"
			}
		}
	}
	// Ensure idempotency_key for payment_commands (NOT NULL in DB)
	if table == "payment_commands" {
		if _, ok := rec["idempotency_key"]; !ok {
			// use record id as idempotency key if provided, else generate
			if idStr, ok := rec["id"].(string); ok && idStr != "" {
				rec["idempotency_key"] = idStr
			} else {
				rec["idempotency_key"] = uuid.New().String()
			}
		}

		if v, ok := rec["idempotency_key"].(string); !ok || strings.TrimSpace(v) == "" {
			if idStr, ok := rec["id"].(string); ok && idStr != "" {
				rec["idempotency_key"] = idStr
			} else {
				rec["idempotency_key"] = uuid.New().String()
			}
		}
		// defaults for offline payment_commands
		if _, ok := rec["status"]; !ok {
			rec["status"] = "pending"
		}

		if _, ok := rec["provider"]; !ok {
			rec["provider"] = "mpesa"
		}

		if _, ok := rec["type"]; !ok {
			rec["type"] = "stk_push"
		}

		if _, ok := rec["currency"]; !ok {
			rec["currency"] = "KES"
		}
	}

	rec["sync_version"] = 1
	for k, v := range rec {
		if isTimestampColumn(k) {
			if t := asTime(v); t != nil {
				rec[k] = *t
			} else {
				delete(rec, k)
			}

			continue
		}

		if isNumericColumn(k) {
			if sanitized, ok := sanitizeNumeric(v); ok {
				rec[k] = sanitized
			} else {
				rec[k] = "0"
			}
		}
	}

	// FK guard: avoid SQLSTATE 23503. If a required FK parent is missing in this tx,
	// return a controlled error (surfaced in PushResult.Errors) instead of letting
	// Postgres emit ERROR ... violates foreign key constraint.
	if err := s.validateFKs(tx, businessID, table, rec); err != nil {
		return err
	}

	return tx.Table(table).Create(rec).Error
}

// insertPushedMovement records a client-pushed stock_movements row and applies its
// quantity_delta to inventory_items — the mirror of ApplyLedger for the offline path.
//
// Reference-less rows (manual adjustments) always apply; their PK guarantees re-push
// idempotency. Reference-bound rows (sales/orders) dedupe against the same rules the
// server-side ledger uses, so a mirrored movement can never double-apply an adjustment
// the REST API already made:
//   - negative (out): apply only if this reference+product has not deducted yet; if the
//     deduction already exists elsewhere, report as applied without re-applying.
//   - positive (in): apply only if a deduction exists AND no restore has been applied;
//     a phantom restore with no prior deduction is recorded without changing quantity.
func (s *Service) insertPushedMovement(tx *gorm.DB, businessID uuid.UUID, rec map[string]any) error {
	productStr := strings.TrimSpace(fmt.Sprint(rec["product_id"]))

	productID, err := uuid.Parse(productStr)
	if err != nil {
		// no product → record-only row, nothing to apply
		return s.insertRecord(tx, businessID, uuid.Nil, "stock_movements", rec)
	}

	deltaStr := strings.TrimSpace(fmt.Sprint(rec["quantity_delta"]))
	delta, err := decimal.NewFromString(deltaStr)

	if err != nil {
		return fmt.Errorf("invalid quantity_delta %q", deltaStr)
	}

	refType := strings.TrimSpace(fmt.Sprint(rec["reference_type"]))
	refIDStr := strings.TrimSpace(fmt.Sprint(rec["reference_id"]))

	var refID uuid.UUID

	if refIDStr != "" && refIDStr != "<nil>" {
		refID, _ = uuid.Parse(refIDStr)
	}

	hasRef := refType != "" && refIDStr != "" && refIDStr != "<nil>" && refID != uuid.Nil

	if hasRef {
		var applied int64
		if delta.Sign() < 0 {
			tx.Raw(`SELECT COUNT(*) FROM stock_movements WHERE business_id = ? AND reference_type = ? AND reference_id = ? AND product_id = ? AND quantity_delta < 0`,
				businessID, refType, refID, productID).Scan(&applied)

			if applied > 0 {
				// already deducted by a prior ledger entry (e.g. REST confirm applied it)
				return nil
			}
		} else {
			tx.Raw(`SELECT COUNT(*) FROM stock_movements WHERE business_id = ? AND reference_type = ? AND reference_id = ? AND product_id = ? AND quantity_delta > 0`,
				businessID, refType, refID, productID).Scan(&applied)

			if applied > 0 {
				// restore already applied — treat as no-op
				return nil
			}

			var deducted int64

			tx.Raw(`SELECT COUNT(*) FROM stock_movements WHERE business_id = ? AND reference_type = ? AND reference_id = ? AND product_id = ? AND quantity_delta < 0`,
				businessID, refType, refID, productID).Scan(&deducted)

			if deducted == 0 {
				// phantom restore (never deducted server-side) — record, do not change qty
				return s.insertRecord(tx, businessID, uuid.Nil, "stock_movements", rec)
			}
		}
	}

	if err := s.insertRecord(tx, businessID, uuid.Nil, "stock_movements", rec); err != nil {
		return err
	}

	return tx.Exec(`UPDATE inventory_items SET quantity = quantity + ?::numeric, updated_at = NOW() WHERE business_id = ? AND product_id = ? AND deleted_at IS NULL`,
		delta.String(), businessID, productID).Error
}

func (s *Service) validateFKs(tx *gorm.DB, businessID uuid.UUID, table string, rec map[string]any) error {
	type fkCheck struct {
		col      string
		parent   string
		required bool
	}

	var checks []fkCheck
	switch table {
	case "product_variants":
		checks = []fkCheck{{"product_id", "products", true}}
	case "inventory_items":
		checks = []fkCheck{{"product_id", "products", true}}
	case "stock_movements":
		checks = []fkCheck{{"product_id", "products", true}}
	case "orders":
		checks = []fkCheck{{"customer_id", "customers", false}}
	case "order_lines":
		checks = []fkCheck{{"order_id", "orders", true}, {"product_id", "products", true}, {"product_variant_id", "product_variants", false}}
	case "sales":
		checks = []fkCheck{{"customer_id", "customers", false}, {"order_id", "orders", false}}
	case "sale_lines":
		checks = []fkCheck{{"sale_id", "sales", true}, {"product_id", "products", true}, {"product_variant_id", "product_variants", false}}
	case "invoices":
		checks = []fkCheck{{"customer_id", "customers", false}, {"order_id", "orders", false}}
	case "invoice_lines":
		checks = []fkCheck{{"invoice_id", "invoices", true}, {"product_id", "products", false}}
	case "payment_commands":
		checks = []fkCheck{{"order_id", "orders", true}}
	}

	for _, c := range checks {
		raw, ok := rec[c.col]
		if !ok || raw == nil {
			continue
		}

		idStr, ok := raw.(string)
		if !ok || idStr == "" {
			continue
		}

		if !isValidUUID(idStr) {
			if c.required {
				return fmt.Errorf("FK violation: %s=%s invalid UUID for %s — parent %s missing", c.col, idStr, table, c.parent)
			}

			delete(rec, c.col)

			continue
		}

		pid, _ := uuid.Parse(idStr)

		var exists int64
		// parent must exist for this business and not soft-deleted
		tx.Raw(fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE id = ? AND business_id = ? AND deleted_at IS NULL`, c.parent), pid, businessID).Scan(&exists)

		if exists == 0 {
			if c.required {
				return fmt.Errorf("FK violation: %s=%s references %s not found for %s — ensure parent synced before child (SQLSTATE 23503)", c.col, idStr, c.parent, table)
			}
			// nullable FK — null it out to allow insert (SET NULL semantics)
			delete(rec, c.col)
		}
	}

	return nil
}

func (s *Service) updateRecord(tx *gorm.DB, businessID uuid.UUID, table string, rec map[string]any) error {
	id, _ := rec["id"].(string)
	update := map[string]any{}

	for k, v := range rec {
		if k == "id" || k == "sync_version" || k == "syncVersion" || (len(k) > 0 && k[0] == '_') {
			continue
		}
		// Explicitly drop stray keys that don't map to DB columns (e.g. legacy `type`, `customerPhone`, `undefined`)
		if v == nil {
			continue
		}

		if s, ok := v.(string); ok {
			trim := strings.TrimSpace(s)
			if trim == "" && k != "notes" && k != "description" && k != "address" {
				// allow empty for nullable text but skip "undefined" sentinel
			}

			if strings.EqualFold(trim, "undefined") || strings.EqualFold(trim, "null") {
				continue
			}
		}

		if allowed, ok := allowedUpdateColumns[table]; ok {
			if !allowed[k] {
				continue
			}
		}

		if isTimestampColumn(k) {
			if t := asTime(v); t != nil {
				update[k] = *t
			} else if v != nil {
				update[k] = v
			}

			continue
		}

		if isNumericColumn(k) {
			if sanitized, ok := sanitizeNumeric(v); ok {
				update[k] = sanitized
			} else {
				continue // skip NaN/local — don't overwrite good server value with 0
			}

			continue
		}

		update[k] = v
	}

	update["sync_version"] = gorm.Expr("sync_version + 1")
	update["updated_at"] = time.Now()

	return tx.Table(table).Where("id = ? AND business_id = ?", id, businessID).Updates(update).Error
}
