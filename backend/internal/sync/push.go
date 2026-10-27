package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
)

// Push applies version-counter check per record (§4). Mismatches go to conflicts, not applied. Whole batch in tx.
func (s *Service) Push(ctx context.Context, businessID uuid.UUID, req PushRequest) (*PushResult, error) {
	return s.PushWithUser(ctx, businessID, uuid.Nil, req)
}

func (s *Service) PushWithUser(ctx context.Context, businessID uuid.UUID, userID uuid.UUID, req PushRequest) (*PushResult, error) {
	result := &PushResult{Applied: map[string][]string{}, Conflicts: []Conflict{}, Errors: map[string][]string{}, Rejected: map[string][]string{}, LWWApplied: map[string][]string{}}
	deviceID := ""
	if req.DeviceID != nil {
		deviceID = strings.TrimSpace(*req.DeviceID)
	}
	// Device-carrying ctx for ledger/side-effect helpers so writer
	// attribution flows through ApplyLedger without signature sprawl.
	pctx := ctx
	if deviceID != "" {
		pctx = middleware.WithDeviceID(ctx, deviceID)
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Process in syncableTables order to respect FKs (products → product_variants → inventory_items → ...).
		// Go map iteration is random, so inventory_items could be attempted before its product and hit
		// ERROR 23503 violates foreign key constraint "inventory_items_product_id_fkey".
		processed := map[string]bool{}

		for _, table := range syncableTables {
			changes, ok := req.Changes[table]
			if !ok {
				continue
			}

			processed[table] = true
			// Validate table is syncable
			if !isSyncable(table) {
				result.Errors[table] = append(result.Errors[table], "table not syncable")
				continue
			}
			s.pushCreated(pctx, tx, businessID, userID, deviceID, table, changes.Created, result)
			s.pushUpdated(pctx, tx, businessID, userID, deviceID, table, changes.Updated, result)
			s.pushDeleted(pctx, tx, businessID, table, changes.Deleted, result)
		}
		// Any tables not in canonical syncableTables order (should be none) — surface as errors
		for table := range req.Changes {
			if processed[table] {
				continue
			}

			result.Errors[table] = append(result.Errors[table], "table not syncable")
		}
		// Post-pass: newly pushed standalone (walk-in) sales must remove stock. Their own
		// positive/negative movement row may already be part of this batch (the client
		// mirrors the ledger locally), so ensureSaleDeducted is idempotent.
		for _, idStr := range result.Applied["sales"] {
			sid, err := uuid.Parse(idStr)
			if err != nil {
				continue
			}

			if err := s.ensureSaleDeducted(pctx, tx, businessID, sid); err != nil {
				result.Errors["sales"] = append(result.Errors["sales"], fmt.Sprintf("ensureSaleDeducted %s: %v", idStr, err))
			}
		}

		return nil
	})

	// Invalidate analytics snapshots if we applied any sales/expenses mutation — next GET will recompute synchronously (TTL fast path).
	if err == nil {
		needsInvalidate := false

		for tbl := range result.Applied {
			if tbl == "sales" || tbl == "sale_lines" || tbl == "expenses" {
				if len(result.Applied[tbl]) > 0 {
					needsInvalidate = true
					break
				}
			}
		}

		if needsInvalidate {
			_ = s.db.WithContext(ctx).Exec(`DELETE FROM analytics_snapshots WHERE business_id = ?`, businessID).Error
		}
	}

	return result, err
}

// pushCreated inserts client-created rows idempotently (re-push = applied).
func (s *Service) pushCreated(ctx context.Context, tx *gorm.DB, businessID, userID uuid.UUID, deviceID, table string, recs []map[string]any, result *PushResult) {
	for _, rec := range recs {
		idStr, _ := rec["id"].(string)
		if idStr == "" {
			result.Errors[table] = append(result.Errors[table], "created missing id")
			continue
		}

		id, err := uuid.Parse(idStr)
		if err != nil {
			result.reject(table, idStr, fmt.Sprintf("invalid uuid %s", idStr))
			continue
		}
		// Idempotent: if exists, skip
		var exists int64

		tx.Raw(fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE id = ? AND business_id = ?`, table), id, businessID).Scan(&exists)

		if exists > 0 {
			// already created via previous push — treat as applied (idempotent)
			result.Applied[table] = append(result.Applied[table], idStr)
			continue
		}

		if table == "stock_movements" {
			// Pushed ledger rows ARE the ledger: recording one applies its delta
			// to inventory_items. Guarded by the same reference-based rules as
			// ApplyLedger so a mirrored movement can never double-apply a change
			// the server already made (REST confirm/sale) and re-pushes stay no-ops.
			if err := s.insertPushedMovement(ctx, tx, businessID, rec, result); err != nil {
				result.reject(table, idStr, err.Error())
			} else {
				result.Applied[table] = append(result.Applied[table], idStr)
				s.setWriter(tx, businessID, table, id, deviceID)
			}

			continue
		}

		if err := s.insertRecord(tx, businessID, userID, table, rec); err != nil {
			result.reject(table, idStr, err.Error())
		} else {
			result.Applied[table] = append(result.Applied[table], idStr)
			s.setWriter(tx, businessID, table, id, deviceID)
			if table == "inventory_items" {
				result.markStockWritten(fmt.Sprint(rec["product_id"]))
			}
		}
	}
}

// pushUpdated applies version-matched edits; mismatches become same-device
// LWW (silent) or explicit conflicts — never silent overwrites across devices.
func (s *Service) pushUpdated(ctx context.Context, tx *gorm.DB, businessID, userID uuid.UUID, deviceID, table string, recs []map[string]any, result *PushResult) {
	for _, rec := range recs {
		idStr, _ := rec["id"].(string)
		if idStr == "" {
			result.Errors[table] = append(result.Errors[table], "updated missing id")
			continue
		}

		id, _ := uuid.Parse(idStr)

		clientVersion := intFromAny(rec["sync_version"])
		if clientVersion == 0 {
			// Watermelon may send _changed etc, try syncVersion
			clientVersion = intFromAny(rec["syncVersion"])
		}

		if clientVersion == 0 {
			clientVersion = intFromAny(rec["_status"]) // fallback
		}

		var sv int
		if err2 := tx.Raw(fmt.Sprintf(`SELECT sync_version FROM %s WHERE id = ? AND business_id = ?`, table), id, businessID).Scan(&sv).Error; err2 != nil {
			result.reject(table, idStr, fmt.Sprintf("record %s not found", idStr))
			continue
		}

		serverVersion := sv
		// Version mismatch: same device that wrote last wins silently
		// (last-write-wins); anything else becomes an explicit conflict.
		if clientVersion != serverVersion && DecideVersionMismatch(deviceID, s.recordWriter(tx, businessID, table, id)) == MismatchApply {
			var prevStatus string
			if table == "orders" {
				_ = tx.Raw(`SELECT status FROM orders WHERE id = ? AND business_id = ?`, id, businessID).Scan(&prevStatus).Error
			}
			if s.applyUpdateWithSideEffects(ctx, tx, businessID, userID, table, rec, idStr, id, prevStatus, result) {
				s.setWriter(tx, businessID, table, id, deviceID)
				result.LWWApplied[table] = append(result.LWWApplied[table], idStr)
				// Audit the silent overwrite: versions + device, for forensics.
				_ = tx.Exec(`INSERT INTO lww_applications (business_id, table_name, record_id, device_id, client_version, server_version) VALUES (?, ?, ?, ?, ?, ?)`, businessID, table, id, deviceID, clientVersion, serverVersion).Error
			}
			continue
		}
		// If versions match → apply, else conflict
		if clientVersion != serverVersion {
			s.recordConflict(tx, businessID, deviceID, table, rec, idStr, id, clientVersion, serverVersion, result)
			continue
		}
		// capture prev status for order side-effects before update
		var prevStatus string
		if table == "orders" {
			_ = tx.Raw(`SELECT status FROM orders WHERE id = ? AND business_id = ?`, id, businessID).Scan(&prevStatus).Error
		}
		// versions match → apply update, increment sync_version
		if s.applyUpdateWithSideEffects(ctx, tx, businessID, userID, table, rec, idStr, id, prevStatus, result) {
			s.setWriter(tx, businessID, table, id, deviceID)
		}
	}
}

// recordConflict persists the version-mismatch row the user resolves on /sync-conflicts.
func (s *Service) recordConflict(tx *gorm.DB, businessID uuid.UUID, deviceID, table string, rec map[string]any, idStr string, id uuid.UUID, clientVersion, serverVersion int, result *PushResult) {
	clientBytes, _ := json.Marshal(rec)
	// Sanitize client payload: remove NUL bytes that would break UTF8 jsonb insert
	clientBytes = json.RawMessage(strings.ReplaceAll(string(clientBytes), "\x00", ""))

	var srvJSONString string

	var srvJSON json.RawMessage
	// Use ::text to avoid driver jsonb -> []uint8 scan mismatch (was: Scan error converting []uint8 to uint8)
	if err := tx.Raw(fmt.Sprintf(`SELECT to_jsonb(t)::text FROM %s t WHERE id = ?`, table), id).Scan(&srvJSONString).Error; err != nil {
		// fallback: empty object if scan fails
		srvJSONString = "{}"
	}
	// Remove NUL bytes (0x00) that cause "invalid byte sequence for encoding UTF8: 0x00" on conflicts insert
	srvJSONString = strings.ReplaceAll(srvJSONString, "\x00", "")

	srvJSON = json.RawMessage(srvJSONString)
	if len(srvJSON) == 0 {
		srvJSON = json.RawMessage("{}")
	}

	conf := newConflict(businessID, table, id, clientBytes, srvJSON, clientVersion, serverVersion, deviceID, s.recordWriter(tx, businessID, table, id))
	conf.CreatedAt = time.Now()

	if err := tx.Create(&conf).Error; err != nil {
		result.Errors[table] = append(result.Errors[table], err.Error())
	} else {
		result.Conflicts = append(result.Conflicts, conf)
	}
}

// pushDeleted soft-deletes; sales void + restore stock, orders restore stock.
func (s *Service) pushDeleted(ctx context.Context, tx *gorm.DB, businessID uuid.UUID, table string, ids []string, result *PushResult) {
	for _, idStr := range ids {
		id, err := uuid.Parse(idStr)
		if err != nil {
			result.reject(table, idStr, fmt.Sprintf("invalid delete id %s", idStr))
			continue
		}

		switch table {
		case "sales":
			// Voided sale: flag as void (drops it from analytics summaries) and
			// put the stock back, all idempotently.
			if err := tx.Exec(`UPDATE sales SET status = 'void', deleted_at = NOW(), updated_at = NOW(), sync_version = sync_version + 1 WHERE id = ? AND business_id = ? AND deleted_at IS NULL`, id, businessID).Error; err != nil {
				result.reject(table, idStr, err.Error())
				continue
			}

			if err := s.restoreInventoryForSale(ctx, tx, businessID, id); err != nil {
				result.Errors[table] = append(result.Errors[table], fmt.Sprintf("restoreInventoryForSale %s: %v", idStr, err))
			}

			result.Applied[table] = append(result.Applied[table], idStr)
		case "orders":
			// Deleted order: soft-delete and return any stock it removed when
			// confirmed. Draft orders never deducted, so this is a no-op for them.
			if err := tx.Exec(`UPDATE orders SET deleted_at = NOW(), updated_at = NOW(), sync_version = sync_version + 1 WHERE id = ? AND business_id = ? AND deleted_at IS NULL`, id, businessID).Error; err != nil {
				result.reject(table, idStr, err.Error())
				continue
			}

			if err := s.restoreInventoryForOrder(ctx, tx, businessID, id); err != nil {
				result.Errors[table] = append(result.Errors[table], fmt.Sprintf("restoreInventoryForOrder %s: %v", idStr, err))
			}

			result.Applied[table] = append(result.Applied[table], idStr)
		default:
			// soft delete: set deleted_at, increment version if not already deleted
			if err := tx.Exec(fmt.Sprintf(`UPDATE %s SET deleted_at = NOW(), updated_at = NOW(), sync_version = sync_version + 1 WHERE id = ? AND business_id = ? AND deleted_at IS NULL`, table), id, businessID).Error; err != nil {
				result.reject(table, idStr, err.Error())
			} else {
				result.Applied[table] = append(result.Applied[table], idStr)
			}
		}
	}
}

// applyUpdateWithSideEffects runs updateRecord plus the offline order
// confirm/fulfill/cancel side-effects. Shared by the version-match path and
// the same-device last-write-wins path so both behave identically.
// Reports whether the record was applied.
func (s *Service) applyUpdateWithSideEffects(ctx context.Context, tx *gorm.DB, businessID, userID uuid.UUID, table string, rec map[string]any, idStr string, id uuid.UUID, prevStatus string, result *PushResult) bool {
	if err := s.updateRecord(tx, businessID, table, rec); err != nil {
		result.reject(table, idStr, err.Error())
		return false
	}
	result.Applied[table] = append(result.Applied[table], idStr)
	if table == "inventory_items" {
		var productID string
		_ = tx.Raw(`SELECT product_id::text FROM inventory_items WHERE id = ? AND business_id = ?`, id, businessID).Scan(&productID).Error
		result.markStockWritten(productID)
	}
	// Post-update side-effects for offline order confirm/fulfill (fixes sync bypass)
	if table == "orders" {
		newStatus, _ := rec["status"].(string)
		if newStatus == "" {
			newStatus, _ = rec["Status"].(string)
		}

		newStatus = strings.TrimSpace(strings.ToLower(newStatus))
		if prevStatus == "draft" && newStatus == "confirmed" {
			if err := s.ensureInvoiceForOrder(ctx, tx, businessID, id); err != nil {
				// do not fail the whole batch — record as error but keep order applied
				result.Errors[table] = append(result.Errors[table], fmt.Sprintf("ensureInvoiceForOrder %s: %v", idStr, err))
			}
		}

		if prevStatus != "fulfilled" && newStatus == "fulfilled" {
			if err := s.ensureSaleForOrder(ctx, tx, businessID, id, userID); err != nil {
				result.Errors[table] = append(result.Errors[table], fmt.Sprintf("ensureSaleForOrder %s: %v", idStr, err))
			}
		}
		// Offline cancel / refund: put the stock back that confirm removed.
		if newStatus == "cancelled" || newStatus == "refunded" {
			if err := s.restoreInventoryForOrder(ctx, tx, businessID, id); err != nil {
				result.Errors[table] = append(result.Errors[table], fmt.Sprintf("restoreInventoryForOrder %s: %v", idStr, err))
			}
		}
	}
	return true
}
