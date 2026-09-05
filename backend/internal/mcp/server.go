package mcp

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

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
		session, err := s.auth.Authenticate(r, profile)
		if err != nil {
			w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer resource_metadata="%s/.well-known/oauth-protected-resource", error="invalid_token"`, strings.TrimRight(s.cfg.MCP.PublicURL, "/")))
			sharedhttp.JSON(w, http.StatusUnauthorized, ErrorEnvelope{Status: "error", Error: "unauthorized", Message: "A valid bearer token for the MCP resource is required.", Retryable: false})

			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MCP.ToolPayloadLimitBytes)

		var req RPCRequest

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sharedhttp.JSON(w, http.StatusBadRequest, RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32700, Message: "invalid JSON-RPC request"}})
			return
		}

		sharedhttp.JSON(w, http.StatusOK, s.dispatch(r, session, req))
	}
}

func (s *Server) dispatch(r *http.Request, session Session, req RPCRequest) RPCResponse {
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

		start := time.Now()
		envelope, err := s.registry.Call(session, call.Name, call.Arguments)
		latency := time.Since(start).Milliseconds()

		if envelope.Meta == nil {
			envelope.Meta = map[string]any{}
		}

		envelope.Meta["latency_ms"] = latency

		if err != nil {
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

		body, _ := json.Marshal(envelope)
		resp.Result = CallResponse{Content: []ContentBlock{{Type: "text", Text: string(body)}}}
	default:
		resp.Error = &RPCError{Code: -32601, Message: "method not found"}
	}

	return resp
}
