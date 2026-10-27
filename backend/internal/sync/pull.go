package sync

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
)

// Pull returns the first page of changes since `since` (ms). since==0 is a full pull.
func (s *Service) Pull(ctx context.Context, businessID uuid.UUID, since time.Time) (*PullResult, error) {
	return s.PullWithLimit(ctx, businessID, since, DefaultPullLimit)
}

// PullWithLimit is Pull with an explicit per-table row cap (clamped): the
// first page of a pull session.
func (s *Service) PullWithLimit(ctx context.Context, businessID uuid.UUID, since time.Time, perTable int) (*PullResult, error) {
	return s.PullPage(ctx, businessID, since, perTable, "")
}

// PullPage returns one page of a pull session. Paging contract:
//
//   - The first page (cursor "") snapshots two database instants: hi = NOW(),
//     the upper bound every page of the session reads up to, and lo = the
//     start of the oldest transaction still open (or hi). Rows are stamped
//     updated_at = NOW() = their transaction's START, so a push still
//     committing during this pull carries a timestamp >= lo but may be
//     invisible now; lo is therefore the only safe value for lastPulledAt.
//   - Each table is read in (updated_at, id) order — rows written by one push
//     share an updated_at, so a time-only cursor would skip the rest of a tie.
//     Tables that hit the cap get a keyset position in the opaque Cursor;
//     tables that drained are not queried again.
//   - While HasMore, the client re-pulls with the same `since` and the
//     returned Cursor. Timestamp is always lo; it is safe to persist once
//     HasMore is false. Rows between lo and hi are re-sent next session
//     (duplicates are harmless; a gap would lose data).
func (s *Service) PullPage(ctx context.Context, businessID uuid.UUID, since time.Time, perTable int, cursor string) (*PullResult, error) {
	if perTable <= 0 {
		perTable = DefaultPullLimit
	}
	if perTable > MaxPullLimit {
		perTable = MaxPullLimit
	}

	cur, err := decodePullCursor(cursor)
	if err != nil {
		return nil, err
	}
	if cur == nil {
		lo, hi, err := s.pullSnapshot(ctx)
		if err != nil {
			return nil, fmt.Errorf("pull snapshot: %w", err)
		}
		cur = &pullCursor{Lo: lo.UnixMilli(), Hi: hi.Format(time.RFC3339Nano)}
	}
	hi, err := time.Parse(time.RFC3339Nano, cur.Hi)
	if err != nil {
		return nil, apperrors.ErrBadRequest.WithMessage("invalid pull cursor")
	}

	changes := map[string]TableChanges{}
	next := &pullCursor{Lo: cur.Lo, Hi: cur.Hi, Tables: map[string]*tableKeyset{}}

	for _, table := range syncableTables {
		pos := cur.Tables[table]
		if cursor != "" && pos == nil {
			continue // drained on an earlier page of this session
		}
		if pos == nil {
			pos = &tableKeyset{Rows: true, Dels: true}
		}

		tp, err := s.pullTable(ctx, businessID, table, since, hi, pos, perTable)
		if err != nil {
			// Do not silently skip: a failed table would advance lastPulledAt
			// past rows the client never received. Surface the error so the
			// handler returns non-2xx and Watermelon keeps lastPulledAt.
			return nil, fmt.Errorf("pull table %s: %w", table, err)
		}

		if len(tp.Changes.Created)+len(tp.Changes.Updated)+len(tp.Changes.Deleted) > 0 {
			changes[table] = tp.Changes
		}
		if tp.next.Rows || tp.next.Dels {
			next.Tables[table] = tp.next
		}
	}

	res := &PullResult{Changes: changes, Timestamp: cur.Lo}
	if len(next.Tables) > 0 {
		res.HasMore = true
		res.Cursor = next.encode()
	}
	// Ensure every syncable table present (Watermelon expects empty buckets, not missing keys) — but brief says only changed
	// Keep as is; Watermelon tolerates missing keys as empty.
	return res, nil
}

// pullSnapshot reads hi = NOW() and lo = min(hi, start of the oldest other
// open transaction) from the database clock — the same clock that stamps
// updated_at/deleted_at.
func (s *Service) pullSnapshot(ctx context.Context) (lo, hi time.Time, err error) {
	var snap struct {
		Lo time.Time `gorm:"column:lo"`
		Hi time.Time `gorm:"column:hi"`
	}
	err = s.db.WithContext(ctx).Raw(`
		SELECT NOW() AS hi,
		       LEAST(NOW(), COALESCE(MIN(xact_start), NOW())) AS lo
		  FROM pg_stat_activity
		 WHERE datname = current_database()
		   AND pid <> pg_backend_pid()
		   AND xact_start IS NOT NULL
		   AND state <> 'idle'`).Scan(&snap).Error
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return snap.Lo, snap.Hi, nil
}

// pullCursor is the opaque paging state handed back to the client.
type pullCursor struct {
	Lo     int64                   `json:"lo"`          // ms; becomes lastPulledAt
	Hi     string                  `json:"hi"`          // RFC3339Nano upper bound
	Tables map[string]*tableKeyset `json:"t,omitempty"` // tables with rows left
}

// tableKeyset is a table's resume position: the last (timestamp, id) emitted
// for live rows and for tombstones, and which of the two streams has more.
type tableKeyset struct {
	At    string `json:"u,omitempty"`
	ID    string `json:"i,omitempty"`
	DelAt string `json:"du,omitempty"`
	DelID string `json:"di,omitempty"`
	Rows  bool   `json:"r,omitempty"`
	Dels  bool   `json:"d,omitempty"`
}

func (c *pullCursor) encode() string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodePullCursor(s string) (*pullCursor, error) {
	if s == "" {
		return nil, nil
	}
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, apperrors.ErrBadRequest.WithMessage("invalid pull cursor")
	}
	var c pullCursor
	if err := json.Unmarshal(b, &c); err != nil || c.Hi == "" {
		return nil, apperrors.ErrBadRequest.WithMessage("invalid pull cursor")
	}
	return &c, nil
}

// tablePull is one table's page: the changes plus where to resume.
type tablePull struct {
	Changes TableChanges
	next    *tableKeyset
}

func (s *Service) pullTable(ctx context.Context, businessID uuid.UUID, table string, since, hi time.Time, pos *tableKeyset, limit int) (tablePull, error) {
	tp := tablePull{next: &tableKeyset{}}
	tc := tp.Changes

	rows := []map[string]any{}
	if pos.Rows {
		q := fmt.Sprintf(`SELECT * FROM %s WHERE business_id = ? AND updated_at > ? AND updated_at <= ? AND deleted_at IS NULL`, table)
		args := []any{businessID, since, hi}
		if pos.At != "" {
			q += ` AND (updated_at, id) > (?::timestamptz, ?::uuid)`
			args = append(args, pos.At, pos.ID)
		}
		q += fmt.Sprintf(` ORDER BY updated_at ASC, id ASC LIMIT %d`, limit)

		if err := s.db.WithContext(ctx).Raw(q, args...).Scan(&rows).Error; err != nil {
			return tp, err
		}
	}

	for _, row := range rows {
		// Keyset position at full precision, before the row is normalised for
		// the client (updated_at is stripped, ids may arrive as []byte).
		if t, ok := row["updated_at"].(time.Time); ok {
			tp.next.At = t.Format(time.RFC3339Nano)
			tp.next.ID = fmt.Sprintf("%s", row["id"])
		}

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

	// A full page means more live rows may remain past the keyset position.
	tp.next.Rows = pos.Rows && len(rows) >= limit

	deleted := []string{}
	if pos.Dels {
		qdel := fmt.Sprintf(`SELECT id::text AS id, deleted_at FROM %s WHERE business_id = ? AND deleted_at IS NOT NULL AND deleted_at > ? AND deleted_at <= ?`, table)
		args := []any{businessID, since, hi}
		if pos.DelAt != "" {
			qdel += ` AND (deleted_at, id) > (?::timestamptz, ?::uuid)`
			args = append(args, pos.DelAt, pos.DelID)
		}
		qdel += fmt.Sprintf(` ORDER BY deleted_at ASC, id ASC LIMIT %d`, limit)

		delRows := []struct {
			ID        string    `gorm:"column:id"`
			DeletedAt time.Time `gorm:"column:deleted_at"`
		}{}
		if err := s.db.WithContext(ctx).Raw(qdel, args...).Scan(&delRows).Error; err != nil {
			return tp, err
		}
		for _, dr := range delRows {
			deleted = append(deleted, dr.ID)
			tp.next.DelAt = dr.DeletedAt.Format(time.RFC3339Nano)
			tp.next.DelID = dr.ID
		}
		tp.next.Dels = len(delRows) >= limit
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
