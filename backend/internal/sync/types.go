package sync

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Service is the sync boundary: pull deltas for WatermelonDB and apply
// pushed creates/updates/deletes with version-counter conflict detection.
// Heavy lifting lives in focused files: pull.go, push.go, records.go,
// derive.go, ledger.go, conflicts.go, writers.go.
type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

// syncableTables is the canonical FK-safe push order
// (products → product_variants → inventory_items → …).
// Push iterates this order — never the request map — so a child can never
// be attempted before its parent (SQLSTATE 23503).
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

// Pull caps: full pulls are the mobile cold-start bottleneck (F5).
// Default 1000 rows/table, max 5000; ordered by updated_at so cursors page
// deterministically when callers pass the returned timestamp back as ?since=.
const (
	DefaultPullLimit = 1000
	MaxPullLimit     = 5000
)

// PullResult matches WatermelonDB synchronize pullChanges contract + brief's {created,updated,deleted}.
type PullResult struct {
	Changes   map[string]TableChanges `json:"changes"`
	Timestamp int64                   `json:"timestamp"` // Watermelon expects lastPulledAt as number (ms)
	// HasMore is true when at least one table hit the per-table row cap. The
	// client must re-pull with the same `since` plus Cursor until HasMore is
	// false, and only then persist Timestamp (see Service.PullPage).
	HasMore bool `json:"hasMore"`
	// Cursor is the opaque resume position for the next page of this pull
	// session (per-table (updated_at, id) keysets + the session snapshot).
	Cursor string `json:"cursor,omitempty"`
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
	// DeviceID is the caller's stable install UUID (mobile/lib/deviceId).
	// It drives same-device last-write-wins: a version mismatch raised by
	// the device that wrote last applies instead of raising a conflict.
	DeviceID *string `json:"device_id"`
}

type PushResult struct {
	Applied   map[string][]string `json:"applied"` // per table ids applied
	Conflicts []Conflict          `json:"conflicts"`
	Errors    map[string][]string `json:"errors,omitempty"`
	// Rejected lists the record ids that failed to apply, per table. Clients use this to
	// keep those records pending for retry; without it they cannot tell which of the
	// pushed records actually failed and would mark all of them as synced (data loss).
	Rejected map[string][]string `json:"rejected,omitempty"`
	// LWWApplied lists record ids applied via silent same-device
	// last-write-wins (version mismatch, same writer). Each is also
	// recorded in lww_applications for forensics.
	LWWApplied map[string][]string `json:"lww_applied,omitempty"`

	// stockWritten holds product ids whose inventory_items row this push
	// wrote (created, or an applied update). The client computes that row's
	// quantity with its local ledger already applied, so stock_movements for
	// the same product in the same push are recorded but not re-applied.
	stockWritten map[string]bool
}

// markStockWritten notes that this push set productID's inventory quantity.
func (r *PushResult) markStockWritten(productID string) {
	if productID == "" {
		return
	}
	if r.stockWritten == nil {
		r.stockWritten = map[string]bool{}
	}
	r.stockWritten[productID] = true
}

// reject records a per-record failure and remembers the record id so the client keeps
// the record pending for retry rather than silently marking it synced.
func (r *PushResult) reject(table, id, msg string) {
	r.Errors[table] = append(r.Errors[table], msg)
	if id != "" {
		r.Rejected[table] = append(r.Rejected[table], id)
	}
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
	// Device attribution for the conflict UI ("this device" vs "another
	// device"). Nullable: rows predating 000023 and device-less pushes.
	ClientDeviceID *string    `json:"client_device_id" gorm:"column:client_device_id"`
	ServerDeviceID *string    `json:"server_device_id" gorm:"column:server_device_id"`
	CreatedAt      time.Time  `json:"created_at"`
	ResolvedAt     *time.Time `json:"resolved_at"`
	Resolution     *string    `json:"resolution"`
}

func (Conflict) TableName() string { return "conflicts" }
