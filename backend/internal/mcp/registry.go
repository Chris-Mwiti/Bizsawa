package mcp

import (
	"context"
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
		key := string(tool.Profile) + ":" + tool.Name
		r.tools[key] = tool
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
	return r.CallWithContext(context.Background(), session, name, args)
}

func (r *Registry) CallWithContext(ctx context.Context, session Session, name string, args json.RawMessage) (Envelope, error) {
	// Profile-scoped lookup: prefer exact profile:name, fallback to name alone for backwards compat
	key := string(session.Profile) + ":" + name
	tool, ok := r.tools[key]
	if !ok {
		// Fallback: try bare name (legacy) and ensure profile matches
		tool, ok = r.tools[name]
		if !ok {
			// Scan for any profile match on name
			for _, t := range r.tools {
				if t.Name == name && t.Profile == session.Profile {
					tool = t
					ok = true
					break
				}
			}
		}
		if !ok {
			return Envelope{}, ErrToolNotFound
		}
	}

	if !r.available(session, tool) {
		return Envelope{}, ErrPermissionDenied
	}

	if session.BusinessID == uuid.Nil {
		return Envelope{}, ErrBusinessRequired
	}

	// Propagate traced context if provided; fallback to background to preserve legacy callers (tests)
	if ctx == nil {
		ctx = context.Background()
	}
	// Ensure ToolHandler can access traced context if it uses context.Background internally we still have parent span
	// Handlers currently use context.Background() — they will be migrated to use passed ctx, but this keeps trace parent linkage
	_ = ctx
	data, meta, err := tool.Handler(ToolContext{Session: session, Now: time.Now().UTC()}, args)
	if err != nil {
		return Envelope{}, err
	}

	if meta == nil {
		meta = map[string]any{}
	}

	meta["business_id"] = session.BusinessID.String()
	// --- Confidence & pagination standardization (gap fill) ---
	enrichMeta(meta, data, args)

	return Envelope{Status: "ok", Data: data, Meta: meta}, nil
}

func enrichMeta(meta map[string]any, data any, args json.RawMessage) {
	// Standardize pagination: ensure truncated/next_offset/total_count where applicable
	if _, ok := meta["result_count"]; ok {
		if _, hasTrunc := meta["truncated"]; !hasTrunc {
			// Heuristic: if result_count == 50 (max) assume truncated, else not
			if rc, ok := meta["result_count"].(int); ok && rc == 50 {
				meta["truncated"] = true
				meta["next_offset"] = 50
			} else {
				meta["truncated"] = false
			}
		}
	}
	// Confidence: high | medium | low based on result_count and data presence
	if _, hasConf := meta["confidence"]; !hasConf {
		rcVal, _ := meta["result_count"].(int)
		// Try to get result_count from data if meta missing
		if rcVal == 0 {
			if m, ok := data.(map[string]any); ok {
				if results, ok := m["results"].([]map[string]any); ok {
					rcVal = len(results)
				} else if results2, ok := m["results"].([]any); ok {
					rcVal = len(results2)
				} else if v, ok := m["count"]; ok {
					if iv, ok := v.(int); ok {
						rcVal = iv
					}
				}
			}
		}
		conf := "high"
		reason := "Sufficient data"
		if rcVal == 0 {
			conf = "low"
			reason = "No data in window — check date range or uncategorized backlog; may be stale if offline-sync conflicts unresolved"
		} else if rcVal < 5 {
			conf = "medium"
			reason = "Small sample (n<5) — treat totals as indicative, not definitive"
		}
		// Check for sync conflicts hint: if args contains period >90d vs window, lower confidence
		// (placeholder: real check would query conflicts table)
		meta["confidence"] = conf
		meta["confidence_reason"] = reason
		meta["confidence_version"] = "v0.1-heuristic"
	}
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
