package mcp

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Profile string

const (
	ProfileBusinessOwner   Profile = "business-owner"
	ProfileCustomerService Profile = "customer-service"
)

type Session struct {
	UserID           uuid.UUID `json:"user_id"`
	TenantID         uuid.UUID `json:"tenant_id"`
	BusinessID       uuid.UUID `json:"business_id"`
	Role             string    `json:"role"`
	SubscriptionPlan string    `json:"subscription_plan"`
	Profile          Profile   `json:"tool_profile"`
	RequestID        string    `json:"request_id"`
}

type Envelope struct {
	Status string         `json:"status"`
	Data   any            `json:"data,omitempty"`
	Meta   map[string]any `json:"meta,omitempty"`
}

type ErrorEnvelope struct {
	Status    string `json:"status"`
	Error     string `json:"error"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

type Tool struct {
	Name        string
	Description string
	Profile     Profile
	Resource    string
	Action      string
	ReadOnly    bool
	InputSchema map[string]any
	Handler     ToolHandler
}

type ToolHandler func(ctx ToolContext, args json.RawMessage) (any, map[string]any, error)

type ToolContext struct {
	Session Session
	Now     time.Time
}

type ToolDescriptor struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

type CallRequest struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type CallResponse struct {
	Content []ContentBlock `json:"content"`
	IsError bool           `json:"isError,omitempty"`
}

type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type RPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type RPCResponse struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id,omitempty"`
	Result  any       `json:"result,omitempty"`
	Error   *RPCError `json:"error,omitempty"`
}

type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}
