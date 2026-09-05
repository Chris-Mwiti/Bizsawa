package mcp

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
)

func TestRegistryListFiltersByProfileRoleAndBusiness(t *testing.T) {
	registry := NewRegistry(nil,
		Tool{Name: "owner_tool", Profile: ProfileBusinessOwner, Resource: "sales", Action: "read", InputSchema: ObjectSchema(nil)},
		Tool{Name: "support_tool", Profile: ProfileCustomerService, Resource: "customers", Action: "read", InputSchema: ObjectSchema(nil)},
	)

	session := Session{Profile: ProfileBusinessOwner, Role: string(authz.RoleOwner), BusinessID: uuid.New()}

	tools := registry.List(session)
	if len(tools) != 1 || tools[0].Name != "owner_tool" {
		t.Fatalf("unexpected tools: %#v", tools)
	}

	session.BusinessID = uuid.Nil
	if got := registry.List(session); len(got) != 0 {
		t.Fatalf("expected no tools without business context, got %#v", got)
	}
}

func TestRegistryCallReturnsEnvelopeMetadata(t *testing.T) {
	businessID := uuid.New()
	registry := NewRegistry(nil, Tool{
		Name:        "test_tool",
		Profile:     ProfileBusinessOwner,
		Resource:    "sales",
		Action:      "read",
		InputSchema: ObjectSchema(nil),
		Handler: func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error) {
			return map[string]any{"ok": true}, map[string]any{"result_count": 1}, nil
		},
	})

	envelope, err := registry.Call(Session{Profile: ProfileBusinessOwner, BusinessID: businessID}, "test_tool", nil)
	if err != nil {
		t.Fatalf("call failed: %v", err)
	}

	if envelope.Status != "ok" || envelope.Meta["business_id"] != businessID.String() || envelope.Meta["result_count"] != 1 {
		t.Fatalf("unexpected envelope: %#v", envelope)
	}
}
