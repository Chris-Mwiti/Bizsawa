package sync

import (
	"context"
	"encoding/json"
	"fmt"
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

// PullResult matches WatermelonDB synchronize pullChanges contract + brief's {created,updated,deleted}
type PullResult struct {
	Changes   map[string]TableChanges `json:"changes"`
	Timestamp int64                   `json:"timestamp"` // Watermelon expects lastPulledAt as number (ms)
}

type TableChanges struct {
	Created []map[string]any `json:"created"`
	Updated []map[string]any `json:"updated"`
	Deleted []string         `json:"deleted"`
}

// PushRequest mirrors Watermelon pushChanges: {changes: {table: {created, updated, deleted}}, lastPulledAt}
type PushRequest struct {
	Changes      map[string]TableChanges `json:"changes"`
	LastPulledAt *int64                  `json:"lastPulledAt"`
}

type PushResult struct {
	Applied   map[string][]string            `json:"applied"`   // per table ids applied
	Conflicts []Conflict                     `json:"conflicts"`
	Errors    map[string][]string            `json:"errors,omitempty"`
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
				}
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
				// Insert — respect client-generated UUID, set business_id, sync_version=1
				// Build dynamic insert from rec map: we insert as JSONB? Simpler: use raw insert with json
				if err := s.insertRecord(tx, businessID, table, rec); err != nil {
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

func asTime(v any) *time.Time {
	if v == nil {
		return nil
	}
	switch x := v.(type) {
	case time.Time:
		return &x
	case float64:
		// Watermelon sends ms; handle both ms and seconds (seconds < 1e12)
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
		t := time.UnixMilli(int64(x))
		return &t
	case int64:
		if x > 1e12 {
			t := time.UnixMilli(x)
			return &t
		}
		t := time.Unix(x, 0)
		return &t
	case int:
		return asTime(float64(x))
	case string:
		if x == "" {
			return nil
		}
		// Try RFC3339 first, then ms string, then seconds string
		if t, err := time.Parse(time.RFC3339, x); err == nil {
			return &t
		}
		if t, err := time.Parse(time.RFC3339Nano, x); err == nil {
			return &t
		}
		var ms int64
		if _, err := fmt.Sscan(x, &ms); err == nil {
			return asTime(float64(ms))
		}
	}
	return nil
}

func (s *Service) insertRecord(tx *gorm.DB, businessID uuid.UUID, table string, rec map[string]any) error {
	if _, ok := rec["business_id"]; !ok {
		rec["business_id"] = businessID.String()
	}
	if _, ok := rec["tenant_id"]; !ok {
		rec["tenant_id"] = businessID.String()
	}
	rec["sync_version"] = 1
	// Normalize timestamp fields from Watermelon (numbers ms) to Go time.Time for Postgres timestamptz
	// Watermelon sends dates as numbers (ms since epoch), backend expects time.Time
	for k, v := range rec {
		if isTimestampColumn(k) {
			if t := asTime(v); t != nil {
				rec[k] = *t
			} else if v == nil {
				delete(rec, k) // let DB default handle null
			}
		}
	}
	return tx.Table(table).Create(rec).Error
}

func (s *Service) updateRecord(tx *gorm.DB, businessID uuid.UUID, table string, rec map[string]any) error {
	id, _ := rec["id"].(string)
	update := map[string]any{}
	for k, v := range rec {
		if k == "id" || k == "sync_version" || k == "syncVersion" || k == "_status" || k == "_changed" {
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
			if k == "id" || k == "sync_version" || k == "syncVersion" || k == "_status" || k == "_changed" || k == "business_id" || k == "tenant_id" {
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
