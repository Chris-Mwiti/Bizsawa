package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var syncableTables = []string{
	"products",
	"product_variants",
	"customers",
	"inventory_items",
	"stock_movements",
	"orders",
	"order_lines",
	"sales",
	"sale_lines",
	"expenses",
	"invoices",
	"invoice_lines",
	"payment_commands",
	"tax_rules",
}

// PullResult matches WatermelonDB synchronize pullChanges contract + brief's {created,updated,deleted}.
type PullResult struct {
	Changes   map[string]TableChanges `json:"changes"`
	Timestamp int64                   `json:"timestamp"` // Watermelon expects lastPulledAt as number (ms)
}

type TableChanges struct {
	Created []map[string]any `json:"created"`
	Updated []map[string]any `json:"updated"`
	Deleted []string         `json:"deleted"`
}

// PushRequest mirrors Watermelon pushChanges: {changes: {table: {created, updated, deleted}}, lastPulledAt}.
type PushRequest struct {
	Changes      map[string]TableChanges `json:"changes"`
	LastPulledAt *int64                  `json:"lastPulledAt"`
}

type PushResult struct {
	Applied   map[string][]string `json:"applied"` // per table ids applied
	Conflicts []Conflict          `json:"conflicts"`
	Errors    map[string][]string `json:"errors,omitempty"`
}

type Conflict struct {
	ID            uuid.UUID       `json:"id" gorm:"type:uuid;primaryKey"`
	BusinessID    uuid.UUID       `json:"business_id"`
	Table         string          `json:"table_name" gorm:"column:table_name"`
	RecordID      uuid.UUID       `json:"record_id"`
	ClientPayload json.RawMessage `json:"client_payload" gorm:"type:jsonb"`
	ServerPayload json.RawMessage `json:"server_payload" gorm:"type:jsonb"`
	ClientVersion int             `json:"client_version"`
	ServerVersion int             `json:"server_version"`
	CreatedAt     time.Time       `json:"created_at"`
	ResolvedAt    *time.Time      `json:"resolved_at"`
	Resolution    *string         `json:"resolution"`
}

func (Conflict) TableName() string { return "conflicts" }

type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

// Pull returns delta since cursor (ms timestamp). If since==0, returns full dataset for business.
func (s *Service) Pull(ctx context.Context, businessID uuid.UUID, since time.Time) (*PullResult, error) {
	changes := map[string]TableChanges{}

	for _, table := range syncableTables {
		tc, err := s.pullTable(ctx, businessID, table, since)
		if err != nil {
			// table may not exist in some envs — skip
			continue
		}

		if len(tc.Created)+len(tc.Updated)+len(tc.Deleted) > 0 {
			changes[table] = tc
		}
	}
	// Ensure every syncable table present (Watermelon expects empty buckets, not missing keys) — but brief says only changed
	// Keep as is; Watermelon tolerates missing keys as empty.
	return &PullResult{Changes: changes, Timestamp: time.Now().UnixMilli()}, nil
}

func (s *Service) pullTable(ctx context.Context, businessID uuid.UUID, table string, since time.Time) (TableChanges, error) {
	var tc TableChanges

	rows := []map[string]any{}
	q := fmt.Sprintf(`SELECT * FROM %s WHERE business_id = ? AND updated_at > ? AND deleted_at IS NULL`, table)

	if err := s.db.WithContext(ctx).Raw(q, businessID, since).Scan(&rows).Error; err != nil {
		// Don't log as ERROR for missing table — syncableTables is now correct, but keep graceful
		return tc, err
	}

	for _, row := range rows {
		for k, v := range row {
			// Handle []uint8 from pg driver (numeric/uuid as bytes) -> string
			if b, ok := v.([]uint8); ok {
				row[k] = string(b)
				v = string(b)
			}
			// Normalize numeric columns to string for Watermelon (schema type string) — prevents NaN/0 float issues
			if isNumericColumn(k) {
				if sanitized, ok := sanitizeNumeric(v); ok {
					row[k] = sanitized
				} else {
					row[k] = "0"
				}

				continue
			}

			if t, ok := v.(time.Time); ok {
				row[k] = t.UnixMilli()
				continue
			}

			if s, ok := v.(string); ok && isTimestampColumn(k) {
				if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
					row[k] = t.UnixMilli()
				} else if t, err := time.Parse(time.RFC3339, s); err == nil {
					row[k] = t.UnixMilli()
				} else if ms, err := time.Parse("2006-01-02 15:04:05.999999999 -0700 MST", s); err == nil {
					row[k] = ms.UnixMilli()
				} else if s == "" || s == "0" {
					row[k] = time.Now().UnixMilli()
				}

				continue
			}
			// Ensure Decimal numerics that arrived as []uint8 are now strings for Watermelon (which expects string for price/total)
			if vStr, ok := row[k].(string); ok {
				// keep as string for Watermelon string columns (amount/total/price)
				row[k] = vStr
			}
		}
		// Determine created vs updated by created_at (now number)
		var createdAt time.Time

		if v, ok := row["created_at"]; ok {
			if ms, ok := v.(int64); ok {
				createdAt = time.UnixMilli(ms)
			} else if t, ok := v.(time.Time); ok {
				createdAt = t
			}
		}

		if createdAt.After(since) {
			tc.Created = append(tc.Created, row)
		} else {
			tc.Updated = append(tc.Updated, row)
		}
	}

	var deleted []string

	qdel := fmt.Sprintf(`SELECT id::text FROM %s WHERE business_id = ? AND deleted_at IS NOT NULL AND deleted_at > ?`, table)
	if err := s.db.WithContext(ctx).Raw(qdel, businessID, since).Scan(&deleted).Error; err == nil {
		tc.Deleted = deleted
	}

	if tc.Created == nil {
		tc.Created = []map[string]any{}
	}

	if tc.Updated == nil {
		tc.Updated = []map[string]any{}
	}

	if tc.Deleted == nil {
		tc.Deleted = []string{}
	}

	return tc, nil
}

// Push applies version-counter check per record (§4). Mismatches go to conflicts, not applied. Whole batch in tx.
func (s *Service) Push(ctx context.Context, businessID uuid.UUID, req PushRequest) (*PushResult, error) {
	return s.PushWithUser(ctx, businessID, uuid.Nil, req)
}

func (s *Service) PushWithUser(ctx context.Context, businessID uuid.UUID, userID uuid.UUID, req PushRequest) (*PushResult, error) {
	result := &PushResult{Applied: map[string][]string{}, Conflicts: []Conflict{}, Errors: map[string][]string{}}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for table, changes := range req.Changes {
			// Validate table is syncable
			if !isSyncable(table) {
				result.Errors[table] = append(result.Errors[table], "table not syncable")
				continue
			}
			// Created
			for _, rec := range changes.Created {
				idStr, _ := rec["id"].(string)
				if idStr == "" {
					result.Errors[table] = append(result.Errors[table], "created missing id")
					continue
				}

				id, err := uuid.Parse(idStr)
				if err != nil {
					result.Errors[table] = append(result.Errors[table], fmt.Sprintf("invalid uuid %s", idStr))
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

				if err := s.insertRecord(tx, businessID, userID, table, rec); err != nil {
					result.Errors[table] = append(result.Errors[table], err.Error())
				} else {
					result.Applied[table] = append(result.Applied[table], idStr)
				}
			}
			// Updated
			for _, rec := range changes.Updated {
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
					result.Errors[table] = append(result.Errors[table], fmt.Sprintf("record %s not found", idStr))
					continue
				}

				serverVersion := sv
				// If versions match → apply, else conflict
				if clientVersion != serverVersion {
					clientBytes, _ := json.Marshal(rec)

					var srvJSON json.RawMessage

					tx.Raw(fmt.Sprintf(`SELECT to_jsonb(t) FROM %s t WHERE id = ?`, table), id).Scan(&srvJSON)

					conf := Conflict{
						ID:            uuid.New(),
						BusinessID:    businessID,
						Table:         table,
						RecordID:      id,
						ClientPayload: clientBytes,
						ServerPayload: srvJSON,
						ClientVersion: clientVersion,
						ServerVersion: serverVersion,
						CreatedAt:     time.Now(),
					}

					if err := tx.Create(&conf).Error; err != nil {
						result.Errors[table] = append(result.Errors[table], err.Error())
					} else {
						result.Conflicts = append(result.Conflicts, conf)
					}

					continue
				}
				// versions match → apply update, increment sync_version
				if err := s.updateRecord(tx, businessID, table, rec); err != nil {
					result.Errors[table] = append(result.Errors[table], err.Error())
				} else {
					result.Applied[table] = append(result.Applied[table], idStr)
				}
			}
			// Deleted (ids)
			for _, idStr := range changes.Deleted {
				id, err := uuid.Parse(idStr)
				if err != nil {
					result.Errors[table] = append(result.Errors[table], fmt.Sprintf("invalid delete id %s", idStr))
					continue
				}
				// soft delete: set deleted_at, increment version if not already deleted
				if err := tx.Exec(fmt.Sprintf(`UPDATE %s SET deleted_at = NOW(), updated_at = NOW(), sync_version = sync_version + 1 WHERE id = ? AND business_id = ? AND deleted_at IS NULL`, table), id, businessID).Error; err != nil {
					result.Errors[table] = append(result.Errors[table], err.Error())
				} else {
					result.Applied[table] = append(result.Applied[table], idStr)
				}
			}
		}

		return nil
	})

	return result, err
}

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

	return tx.Table(table).Create(rec).Error
}

func (s *Service) updateRecord(tx *gorm.DB, businessID uuid.UUID, table string, rec map[string]any) error {
	id, _ := rec["id"].(string)
	update := map[string]any{}

	for k, v := range rec {
		if k == "id" || k == "sync_version" || k == "syncVersion" || (len(k) > 0 && k[0] == '_') {
			continue
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

func (s *Service) ForceApplyClientPayload(ctx context.Context, businessID uuid.UUID, table string, recordID uuid.UUID, payload map[string]any) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		update := map[string]any{}

		for k, v := range payload {
			if k == "id" || k == "sync_version" || k == "syncVersion" || k == "business_id" || k == "tenant_id" || (len(k) > 0 && k[0] == '_') {
				continue
			}

			if isTimestampColumn(k) {
				if t := asTime(v); t != nil {
					update[k] = *t
					continue
				}
			}

			update[k] = v
		}

		update["sync_version"] = gorm.Expr("sync_version + 1")
		update["updated_at"] = time.Now()

		return tx.Table(table).Where("id = ? AND business_id = ?", recordID, businessID).Updates(update).Error
	})
}
