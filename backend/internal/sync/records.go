package sync

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// insertRecord sanitises a client-created row (offline placeholders, types,
// FKs) and inserts it with sync_version=1.
func (s *Service) insertRecord(tx *gorm.DB, businessID uuid.UUID, userID uuid.UUID, table string, rec map[string]any) error {
	clean := map[string]any{}

	for k, v := range rec {
		if len(k) > 0 && k[0] == '_' {
			continue
		}

		clean[k] = v
	}

	rec = clean
	// created_at/updated_at are server-owned: the pull cursor compares them
	// against the server clock. A device's own clock (often hours behind for
	// an offline sale) would stamp the row before other devices' cursors and
	// they would never pull it. Let the column defaults (NOW()) apply.
	delete(rec, "created_at")
	delete(rec, "updated_at")
	s.sanitizeUUIDPlaceholders(businessID, userID, rec)

	if _, ok := rec["business_id"]; !ok {
		rec["business_id"] = businessID.String()
	}

	if _, ok := rec["tenant_id"]; !ok {
		rec["tenant_id"] = businessID.String()
	}
	if err := s.ensureSaleStaff(tx, businessID, userID, table, rec); err != nil {
		return err
	}
	s.ensureOrderDefaults(table, rec)
	s.ensurePaymentCommandDefaults(table, rec)

	rec["sync_version"] = 1
	s.normalizeRecordTypes(rec)

	// FK guard: avoid SQLSTATE 23503. If a required FK parent is missing in this tx,
	// return a controlled error (surfaced in PushResult.Errors) instead of letting
	// Postgres emit ERROR ... violates foreign key constraint.
	if err := s.validateFKs(tx, businessID, table, rec); err != nil {
		return err
	}

	return tx.Table(table).Create(rec).Error
}

// sanitizeUUIDPlaceholders replaces offline sentinel UUIDs ("local", "", "null")
// with context IDs or drops them (nullable FKs → NULL, handled by validateFKs).
func (s *Service) sanitizeUUIDPlaceholders(businessID, userID uuid.UUID, rec map[string]any) {
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
}

// ensureSaleStaff guarantees sales.staff_id references auth_users(id).
// Never falls back to businessID (businesses.id is not in auth_users and
// always trips sales_staff_id_fkey / SQLSTATE 23503).
func (s *Service) ensureSaleStaff(tx *gorm.DB, businessID, userID uuid.UUID, table string, rec map[string]any) error {
	if table != "sales" {
		return nil
	}
	if raw, ok := rec["staff_id"]; ok {
		if sStr, ok := raw.(string); !ok || !s.staffExists(tx, sStr) {
			// Client sent a bogus/unknown staff (e.g. offline placeholder
			// that survived sanitising, or a staff row deleted server-side)
			// — replace with a valid actor instead of FK-violating.
			delete(rec, "staff_id")
		}
	}
	if _, ok := rec["staff_id"]; !ok {
		staffID, err := s.resolveSaleStaffID(tx, businessID, userID)
		if err != nil {
			return err
		}
		rec["staff_id"] = staffID.String()
	}
	return nil
}

// ensureOrderDefaults backfills NOT NULL order columns (schema drift: mobile sends NULLs).
func (s *Service) ensureOrderDefaults(table string, rec map[string]any) {
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
}

// ensurePaymentCommandDefaults backfills NOT NULL payment_commands columns for offline rows.
func (s *Service) ensurePaymentCommandDefaults(table string, rec map[string]any) {
	if table != "payment_commands" {
		return
	}
	// Ensure idempotency_key for payment_commands (NOT NULL in DB)
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

// normalizeRecordTypes coerces timestamps/numerics to driver-safe values.
func (s *Service) normalizeRecordTypes(rec map[string]any) {
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

		if k == "created_at" || k == "updated_at" {
			continue // server-owned, see insertRecord
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

		// sales.staff_id FKs to auth_users — never write a bogus UUID or the
		// update trips sales_staff_id_fkey (SQLSTATE 23503). Skip instead.
		if table == "sales" && k == "staff_id" {
			sStr, ok := v.(string)
			if !ok || !s.staffExists(tx, sStr) {
				continue
			}
		}

		update[k] = v
	}

	update["sync_version"] = gorm.Expr("sync_version + 1")
	// Database clock, like the column default on insert: mixing the API host's
	// clock with Postgres's would let skew between them hide rows from pulls.
	update["updated_at"] = gorm.Expr("NOW()")

	return tx.Table(table).Where("id = ? AND business_id = ?", id, businessID).Updates(update).Error
}

func (s *Service) staffExists(tx *gorm.DB, idStr string) bool {
	pid, err := uuid.Parse(idStr)
	if err != nil {
		return false
	}
	var n int64
	if err := tx.Raw(`SELECT COUNT(*) FROM auth_users WHERE id = ?`, pid).Scan(&n).Error; err != nil {
		return false
	}
	return n > 0
}

// resolveSaleStaffID picks a valid sales.staff_id (FK → auth_users.id):
// preferred actor (sync caller) → business owner → any active member.
// Returns an error instead of an FK-violating UUID so the push surfaces a
// controlled rejection rather than Postgres ERROR 23503.
func (s *Service) resolveSaleStaffID(tx *gorm.DB, businessID, userID uuid.UUID) (uuid.UUID, error) {
	if userID != uuid.Nil && s.staffExists(tx, userID.String()) {
		return userID, nil
	}
	var ownerID uuid.UUID
	if err := tx.Raw(`SELECT owner_id FROM businesses WHERE id = ?`, businessID).Scan(&ownerID).Error; err == nil && ownerID != uuid.Nil {
		if s.staffExists(tx, ownerID.String()) {
			return ownerID, nil
		}
	}
	var memberID uuid.UUID
	if err := tx.Raw(`SELECT user_id FROM business_members WHERE business_id = ? AND is_active = true AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`, businessID).Scan(&memberID).Error; err == nil && memberID != uuid.Nil {
		if s.staffExists(tx, memberID.String()) {
			return memberID, nil
		}
	}
	return uuid.Nil, fmt.Errorf("FK violation: sales.staff_id has no valid auth_users reference for business %s — sync with an authenticated staff user first (SQLSTATE 23503)", businessID)
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

	// sales.staff_id / expenses.created_by reference global auth_users(id),
	// not a business-scoped table — guard here so a stale client UUID becomes
	// a controlled rejection instead of Postgres ERROR 23503.
	if table == "sales" {
		if raw, ok := rec["staff_id"]; ok && raw != nil {
			if idStr, ok := raw.(string); ok && idStr != "" {
				if !s.staffExists(tx, idStr) {
					return fmt.Errorf("FK violation: staff_id=%s references auth_users not found for sales — sync with an authenticated staff user first (SQLSTATE 23503)", idStr)
				}
			}
		}
	}

	return nil
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
//
// If this same push already wrote the product's inventory_items row, the client sent
// that row's quantity with this movement already applied locally: record, don't apply.
func (s *Service) insertPushedMovement(ctx context.Context, tx *gorm.DB, businessID uuid.UUID, rec map[string]any, result *PushResult) error {
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

	if result != nil && result.stockWritten[productID.String()] {
		return nil
	}

	return tx.Exec(`UPDATE inventory_items SET quantity = quantity + ?::numeric, updated_at = NOW() WHERE business_id = ? AND product_id = ? AND deleted_at IS NULL`,
		delta.String(), businessID, productID).Error
}
