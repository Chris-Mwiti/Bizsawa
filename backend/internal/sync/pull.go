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
//
// Paging contract: a single call returns at most `perTable` rows per table.
// When any table hits that cap, HasMore is true and Cursors carries the
// highest updated_at (ms) emitted for each capped table. The client must call
// again with those cursors before advancing lastPulledAt; Timestamp is only
// safe to persist once HasMore is false.
func (s *Service) PullWithLimit(ctx context.Context, businessID uuid.UUID, since time.Time, perTable int) (*PullResult, error) {
	if perTable <= 0 {
		perTable = DefaultPullLimit
	}
	if perTable > MaxPullLimit {
		perTable = MaxPullLimit
	}
	changes := map[string]TableChanges{}
	cursors := map[string]int64{}
	hasMore := false

	for _, table := range syncableTables {
		tp, err := s.pullTable(ctx, businessID, table, since, perTable)
		if err != nil {
			// Do not silently skip: a failed table would advance lastPulledAt
			// past rows the client never received. Surface the error so the
			// handler returns non-2xx and Watermelon keeps lastPulledAt.
			return nil, fmt.Errorf("pull table %s: %w", table, err)
		}

		if len(tp.Changes.Created)+len(tp.Changes.Updated)+len(tp.Changes.Deleted) > 0 {
			changes[table] = tp.Changes
		}
		if tp.more {
			hasMore = true
			cursors[table] = tp.cursor
		}
	}
	// Timestamp is the max cursor actually emitted, not time.Now(): using wall
	// clock here would mark rows written mid-pull as "already pulled" and lose
	// them. When HasMore is true the client must not persist this value yet.
	timestamp := since.UnixMilli()
	for _, ms := range cursors {
		if ms > timestamp {
			timestamp = ms
		}
	}
	if !hasMore {
		// Fully drained up to now: safe for the client to store.
		timestamp = time.Now().UnixMilli()
	}
	// Ensure every syncable table present (Watermelon expects empty buckets, not missing keys) — but brief says only changed
	// Keep as is; Watermelon tolerates missing keys as empty.
	return &PullResult{Changes: changes, Timestamp: timestamp, HasMore: hasMore, Cursors: cursors}, nil
}

// tablePull is one table's page: the changes plus the paging cursor and a flag
// indicating the cap was hit (more rows remain beyond the cursor).
type tablePull struct {
	Changes TableChanges
	cursor  int64 // max updated_at/deleted_at (ms) emitted for this table
	more    bool
}

// tableCursor extracts the cursor value used for a table's ordering column.
// updated_at orders rows; deleted_at orders tombstones. Both are compared as
// "> since" on the next page, so the emitted max is the correct resume point.
func tableCursor(row map[string]any, col string) (int64, bool) {
	v, ok := row[col]
	if !ok {
		return 0, false
	}

	switch x := v.(type) {
	case time.Time:
		return x.UnixMilli(), true
	case int64:
		return x, true
	case int:
		return int64(x), true
	case float64:
		return int64(x), true
	case string:
		if t, err := time.Parse(time.RFC3339Nano, x); err == nil {
			return t.UnixMilli(), true
		}

		if t, err := time.Parse(time.RFC3339, x); err == nil {
			return t.UnixMilli(), true
		}
	}

	return 0, false
}

func (s *Service) pullTable(ctx context.Context, businessID uuid.UUID, table string, since time.Time, limit int) (tablePull, error) {
	var tp tablePull
	tc := tp.Changes

	rows := []map[string]any{}
	q := fmt.Sprintf(`SELECT * FROM %s WHERE business_id = ? AND updated_at > ? AND deleted_at IS NULL ORDER BY updated_at ASC LIMIT %d`, table, limit)

	if err := s.db.WithContext(ctx).Raw(q, businessID, since).Scan(&rows).Error; err != nil {
		return tp, err
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
		// Capture this row's cursor (max updated_at emitted) before the column is
		// stripped below — paging resumes strictly after it.
		if ms, ok := tableCursor(row, "updated_at"); ok && ms > tp.cursor {
			tp.cursor = ms
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

	// Cap hit => a full page means more rows may exist. The cursor is the max
	// updated_at emitted across live rows and tombstones; paging re-queries
	// both streams with `> cursor`, so a full page on either is authoritative.
	if len(rows) >= limit {
		tp.more = true
	}

	var deleted []string

	qdel := fmt.Sprintf(`SELECT id::text, deleted_at FROM %s WHERE business_id = ? AND deleted_at IS NOT NULL AND deleted_at > ? ORDER BY deleted_at ASC LIMIT %d`, table, limit)

	delRows := []map[string]any{}
	if err := s.db.WithContext(ctx).Raw(qdel, businessID, since).Scan(&delRows).Error; err != nil {
		return tp, err
	}
	for _, dr := range delRows {
		if id, ok := dr["id"].(string); ok {
			deleted = append(deleted, id)
		}
		// Advance the cursor for tombstones too, so capped deletes page correctly.
		if ms, ok := tableCursor(dr, "deleted_at"); ok && ms > tp.cursor {
			tp.cursor = ms
		}
	}
	if len(delRows) >= limit {
		tp.more = true
	}
	tc.Deleted = deleted

	if tc.Created == nil {
		tc.Created = []map[string]any{}
	}

	if tc.Updated == nil {
		tc.Updated = []map[string]any{}
	}

	if tc.Deleted == nil {
		tc.Deleted = []string{}
	}

	tp.Changes = tc

	return tp, nil
}
