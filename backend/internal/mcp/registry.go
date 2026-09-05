package mcp

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/authz"
)

var (
	ErrToolNotFound     = errors.New("tool not found")
	ErrPermissionDenied = errors.New("permission denied")
	ErrBusinessRequired = errors.New("business context required")
)

type Registry struct {
	tools    map[string]Tool
	enforcer *authz.Enforcer
}

func NewRegistry(enforcer *authz.Enforcer, tools ...Tool) *Registry {
	r := &Registry{tools: map[string]Tool{}, enforcer: enforcer}
	for _, tool := range tools {
		r.tools[tool.Name] = tool
	}

	return r
}

func (r *Registry) List(session Session) []ToolDescriptor {
	out := []ToolDescriptor{}

	for _, tool := range r.tools {
		if r.available(session, tool) {
			out = append(out, ToolDescriptor{Name: tool.Name, Description: tool.Description, InputSchema: tool.InputSchema})
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })

	return out
}

func (r *Registry) Call(session Session, name string, args json.RawMessage) (Envelope, error) {
	tool, ok := r.tools[name]
	if !ok {
		return Envelope{}, ErrToolNotFound
	}

	if !r.available(session, tool) {
		return Envelope{}, ErrPermissionDenied
	}

	if session.BusinessID == uuid.Nil {
		return Envelope{}, ErrBusinessRequired
	}

	data, meta, err := tool.Handler(ToolContext{Session: session, Now: time.Now().UTC()}, args)
	if err != nil {
		return Envelope{}, err
	}

	if meta == nil {
		meta = map[string]any{}
	}

	meta["business_id"] = session.BusinessID.String()

	return Envelope{Status: "ok", Data: data, Meta: meta}, nil
}

func (r *Registry) available(session Session, tool Tool) bool {
	if tool.Profile != session.Profile {
		return false
	}

	if session.BusinessID == uuid.Nil {
		return false
	}

	if r.enforcer == nil {
		return true
	}

	return r.enforcer.Allowed(authz.Role(session.Role), tool.Resource, tool.Action)
}

func ErrorPayload(err error) (int, ErrorEnvelope) {
	switch {
	case errors.Is(err, ErrToolNotFound):
		return -32601, ErrorEnvelope{Status: "error", Error: "tool_not_found", Message: "The requested MCP tool is not available.", Retryable: false}
	case errors.Is(err, ErrPermissionDenied):
		return -32003, ErrorEnvelope{Status: "error", Error: "permission_denied", Message: "This role cannot access the requested tool.", Retryable: false}
	case errors.Is(err, ErrBusinessRequired):
		return -32004, ErrorEnvelope{Status: "error", Error: "business_required", Message: "A valid business context is required.", Retryable: false}
	default:
		return -32000, ErrorEnvelope{Status: "error", Error: "tool_failed", Message: fmt.Sprintf("%v", err), Retryable: false}
	}
}
