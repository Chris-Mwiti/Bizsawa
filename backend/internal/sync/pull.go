package sync

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Pull returns delta since cursor (ms timestamp). If since==0, returns full dataset for business.
func (s *Service) Pull(ctx context.Context, businessID uuid.UUID, since time.Time) (*PullResult, error) {
	return s.PullWithLimit(ctx, businessID, since, DefaultPullLimit)
}

// PullWithLimit is Pull with an explicit per-table row cap (clamped).
func (s *Service) PullWithLimit(ctx context.Context, businessID uuid.UUID, since time.Time, perTable int) (*PullResult, error) {
	if perTable <= 0 {
		perTable = DefaultPullLimit
	}
	if perTable > MaxPullLimit {
		perTable = MaxPullLimit
	}
	changes := map[string]TableChanges{}

	for _, table := range syncableTables {
		tc, err := s.pullTable(ctx, businessID, table, since, perTable)
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

func (s *Service) pullTable(ctx context.Context, businessID uuid.UUID, table string, since time.Time, limit int) (TableChanges, error) {
	var tc TableChanges

	rows := []map[string]any{}
	q := fmt.Sprintf(`SELECT * FROM %s WHERE business_id = ? AND updated_at > ? AND deleted_at IS NULL ORDER BY updated_at ASC LIMIT %d`, table, limit)

	if err := s.db.WithContext(ctx).Raw(q, businessID, since).Scan(&rows).Error; err != nil {
		// Don't log as ERROR for missing table — syncableTables is now correct, but keep graceful
		return tc, err
	}

	for _, row := range rows {
		// Strip server-only columns not present in mobile Watermelon schema (tenant_id, payload, provider ids etc) — prevents `schema.columns[col].type` crash on client
		for k := range row {
			if k == "tenant_id" || k == "payload" || k == "result_payload" || k == "provider_request_id" || k == "provider_receipt" || k == "failure_code" || k == "failure_message" || k == "account_reference" || k == "processed_at" {
				delete(row, k)
			}
		}

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
		// Determine created vs updated by created_at (now number UnixMilli) before stripping system fields
		var createdAt time.Time

		if v, ok := row["created_at"]; ok {
			if ms, ok := v.(int64); ok {
				createdAt = time.UnixMilli(ms)
			} else if t, ok := v.(time.Time); ok {
				createdAt = t
			}
		}
		// Strip server-only/system fields not in client Watermelon schema
		delete(row, "created_at")
		delete(row, "updated_at")
		delete(row, "tenant_id")

		if createdAt.After(since) {
			tc.Created = append(tc.Created, row)
		} else {
			tc.Updated = append(tc.Updated, row)
		}
	}

	var deleted []string

	qdel := fmt.Sprintf(`SELECT id::text FROM %s WHERE business_id = ? AND deleted_at IS NOT NULL AND deleted_at > ? ORDER BY deleted_at ASC LIMIT %d`, table, limit)
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
