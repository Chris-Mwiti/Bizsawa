package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/Codecx-Org/FinAI/backend/internal/observability"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
)

type Server struct {
	cfg      config.Config
	auth     *Authenticator
	registry *Registry
	ready    func(*http.Request) error
}

func NewServer(cfg config.Config, auth *Authenticator, registry *Registry, ready func(*http.Request) error) *Server {
	return &Server{cfg: cfg, auth: auth, registry: registry, ready: ready}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	// Observability must be first to capture full request including auth & workflow latency for load/spike tests
	r.Use(observability.HTTPMiddleware("bizsawa-mcp"))
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(60 * time.Second))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "ok", "service": "bizsawa-mcp"})
	})
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		if s.ready != nil {
			if err := s.ready(r); err != nil {
				sharedhttp.JSON(w, http.StatusServiceUnavailable, sharedhttp.Envelope{"status": "not_ready"})
				return
			}
		}

		sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "ready"})
	})
	r.Handle("/metrics", observability.MetricsHandler())
	r.Get("/otel/health", func(w http.ResponseWriter, r *http.Request) {
		sharedhttp.JSON(w, http.StatusOK, sharedhttp.Envelope{"status": "ok", "service": "bizsawa-mcp", "otel": s.cfg.Observability.Enabled})
	})
	r.Get("/.well-known/oauth-protected-resource", s.protectedResourceMetadata)

	if s.cfg.MCP.EnableBusinessOwner {
		r.Post("/mcp/business-owner", s.handleProfile(ProfileBusinessOwner))
	}

	if s.cfg.MCP.EnableCustomerService {
		r.Post("/mcp/customer-service", s.handleProfile(ProfileCustomerService))
	}

	return r
}

func (s *Server) protectedResourceMetadata(w http.ResponseWriter, r *http.Request) {
	resource := strings.TrimRight(s.cfg.MCP.PublicURL, "/")
	sharedhttp.JSON(w, http.StatusOK, map[string]any{
		"resource":                              resource,
		"authorization_servers":                 []string{s.cfg.MCP.AuthIssuer},
		"bearer_methods_supported":              []string{"header"},
		"scopes_supported":                      []string{"mcp:business-owner", "mcp:customer-service"},
		"resource_documentation":                resource + "/docs/mcp",
		"mcp_business_owner_endpoint":           resource + "/mcp/business-owner",
		"mcp_customer_service_endpoint":         resource + "/mcp/customer-service",
		"tool_payload_limit_bytes":              s.cfg.MCP.ToolPayloadLimitBytes,
		"audience":                              s.cfg.MCP.AuthAudience,
		"code_challenge_methods_supported":      []string{"S256"},
		"token_endpoint_auth_methods_supported": []string{"none", "client_secret_post"},
	})
}

func (s *Server) handleProfile(profile Profile) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		workflowStart := time.Now()

		session, err := s.auth.Authenticate(r, profile)
		if err != nil {
			// Auth failure is a workflow error — trace it
			aCtx, authSpan := observability.StartWorkflowSpan(ctx, "auth", string(profile))
			_ = aCtx
			w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer resource_metadata="%s/.well-known/oauth-protected-resource", error="invalid_token"`, strings.TrimRight(s.cfg.MCP.PublicURL, "/")))
			sharedhttp.JSON(w, http.StatusUnauthorized, ErrorEnvelope{Status: "error", Error: "unauthorized", Message: "A valid bearer token for the MCP resource is required.", Retryable: false})
			observability.EndWorkflowSpan(aCtx, authSpan, "auth", string(profile), workflowStart, err)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MCP.ToolPayloadLimitBytes)

		var req RPCRequest

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			aCtx, span := observability.StartWorkflowSpan(ctx, "invalid_jsonrpc", string(profile))
			sharedhttp.JSON(w, http.StatusBadRequest, RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32700, Message: "invalid JSON-RPC request"}})
			observability.EndWorkflowSpan(aCtx, span, "invalid_jsonrpc", string(profile), workflowStart, err)
			return
		}

		// Per-method workflow span (parent of any tool span)
		wCtx, methodSpan := observability.StartWorkflowSpan(ctx, req.Method, string(profile))
		resp := s.dispatch(r.WithContext(wCtx), session, req)
		var wfErr error
		if resp.Error != nil {
			wfErr = fmt.Errorf("rpc error %d: %s", resp.Error.Code, resp.Error.Message)
		}
		observability.EndWorkflowSpan(wCtx, methodSpan, req.Method, string(profile), workflowStart, wfErr)

		sharedhttp.JSON(w, http.StatusOK, resp)
		_ = context.Background // silence import if tracing disabled
	}
}

func (s *Server) dispatch(r *http.Request, session Session, req RPCRequest) RPCResponse {
	ctx := r.Context()
	slog.InfoContext(ctx, "mcp dispatch", "method", req.Method, "profile", session.Profile, "business", session.BusinessID.String(), "user", session.UserID.String(), "id", req.ID)
	resp := RPCResponse{JSONRPC: "2.0", ID: req.ID}

	switch req.Method {
	case "initialize":
		resp.Result = map[string]any{
			"protocolVersion": "2025-06-18",
			"serverInfo":      map[string]any{"name": "bizsawa-mcp", "version": "0.1.0"},
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": true}},
		}
	case "tools/list":
		resp.Result = map[string]any{"tools": s.registry.List(session)}
	case "tools/call":
		var call CallRequest
		if err := json.Unmarshal(req.Params, &call); err != nil {
			resp.Error = &RPCError{Code: -32602, Message: "invalid tool call params"}
			return resp
		}

		// Tool-level tracing + metrics: critical for discovering error rates between workflow tool calls
		toolCtx, toolSpan := observability.StartToolSpan(ctx, call.Name, string(session.Profile))
		start := time.Now()
		// Pass traced context into registry so downstream service spans are children
		envelope, err := s.registry.CallWithContext(toolCtx, session, call.Name, call.Arguments)
		latency := time.Since(start).Milliseconds()

		if envelope.Meta == nil {
			envelope.Meta = map[string]any{}
		}

		envelope.Meta["latency_ms"] = latency
		// inject trace_id into meta for log correlation in load tests
		if sc := toolSpan.SpanContext(); sc.IsValid() {
			envelope.Meta["trace_id"] = sc.TraceID().String()
		}

		if err != nil {
			observability.EndToolSpan(toolCtx, toolSpan, call.Name, string(session.Profile), start, err)
			code, payload := ErrorPayload(err)
			if errors.Is(err, ErrToolNotFound) {
				payload.Message = "Not found: " + payload.Message
			} else if errors.Is(err, ErrPermissionDenied) {
				payload.Message = "Forbidden: " + payload.Message
			}

			body, _ := json.Marshal(payload)
			resp.Result = CallResponse{IsError: true, Content: []ContentBlock{{Type: "text", Text: string(body)}}}
			resp.Error = &RPCError{Code: code, Message: payload.Error}

			return resp
		}

		observability.EndToolSpan(toolCtx, toolSpan, call.Name, string(session.Profile), start, nil)
		body, _ := json.Marshal(envelope)
		resp.Result = CallResponse{Content: []ContentBlock{{Type: "text", Text: string(body)}}}
	default:
		resp.Error = &RPCError{Code: -32601, Message: "method not found"}
	}

	return resp
}
