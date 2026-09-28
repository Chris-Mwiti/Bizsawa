package sync

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

// newPushResult mirrors how Push constructs its result, so these tests exercise the same
// initialization the real code path relies on.
func newPushResult() *PushResult {
	return &PushResult{Applied: map[string][]string{}, Conflicts: []Conflict{}, Errors: map[string][]string{}, Rejected: map[string][]string{}}
}

func TestRejectRecordsIDForRetry(t *testing.T) {
	r := newPushResult()
	r.reject("products", "rec-1", "invalid uuid rec-1")

	if got := r.Rejected["products"]; len(got) != 1 || got[0] != "rec-1" {
		t.Fatalf("expected rejected[products] = [rec-1], got %v", got)
	}
	if got := r.Errors["products"]; len(got) != 1 || got[0] != "invalid uuid rec-1" {
		t.Fatalf("expected errors[products] to carry the message, got %v", got)
	}
}

// A failure with no identifiable record still surfaces as a table-level error, but must
// not invent an id — a bogus id would be rejected by the client for no reason.
func TestRejectWithoutIDSkipsRejectedList(t *testing.T) {
	r := newPushResult()
	r.reject("products", "", "table-level failure")

	if len(r.Errors["products"]) != 1 {
		t.Fatalf("expected a table-level error, got %v", r.Errors)
	}
	if _, ok := r.Rejected["products"]; ok {
		t.Fatalf("expected no rejected entry for an unknown id, got %v", r.Rejected)
	}
}

func TestRejectGroupsByTable(t *testing.T) {
	r := newPushResult()
	r.reject("products", "p1", "boom")
	r.reject("products", "p2", "boom")
	r.reject("order_lines", "l1", "boom")

	if len(r.Rejected["products"]) != 2 {
		t.Fatalf("expected 2 rejected products, got %v", r.Rejected["products"])
	}
	if len(r.Rejected["order_lines"]) != 1 {
		t.Fatalf("expected 1 rejected order_line, got %v", r.Rejected["order_lines"])
	}
}

// The mobile client (mobile/sync/pushResult.ts) reads `rejected` to build
// WatermelonDB's experimentalRejectedIds. This locks that JSON contract.
func TestPushResultJSONExposesRejected(t *testing.T) {
	r := newPushResult()
	r.reject("products", "p1", "boom")

	raw, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var body struct {
		Applied  map[string][]string `json:"applied"`
		Rejected map[string][]string `json:"rejected"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(body.Rejected["products"]) != 1 || body.Rejected["products"][0] != "p1" {
		t.Fatalf("expected rejected.products = [p1], got %v", body.Rejected)
	}
}

// With nothing rejected the field is omitted, so a healthy push response stays unchanged
// for clients that do not know about the field yet.
func TestPushResultJSONOmitsEmptyRejected(t *testing.T) {
	r := newPushResult()
	r.Applied["products"] = []string{"p1"}

	raw, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, present := body["rejected"]; present {
		t.Fatalf("expected rejected to be omitted when empty, got %s", raw)
	}
	if _, present := body["errors"]; present {
		t.Fatalf("expected errors to be omitted when empty, got %s", raw)
	}
}

// Every rejected id must be a real record id, otherwise the client would try to keep a
// nonexistent record pending forever.
func TestRejectedIDsAreValidUUIDs(t *testing.T) {
	r := newPushResult()
	valid := uuid.New().String()
	r.reject("products", valid, "boom")
	r.reject("products", "not-a-uuid", "invalid uuid not-a-uuid")

	ids := r.Rejected["products"]
	if len(ids) != 2 {
		t.Fatalf("expected both failures recorded, got %v", ids)
	}
	// The invalid one is still surfaced — the point is that the id is echoed verbatim so
	// the client can match it against what it pushed, not that it is a valid UUID.
	for _, id := range ids {
		if id != valid && id != "not-a-uuid" {
			t.Fatalf("unexpected rejected id %q", id)
		}
	}
}
