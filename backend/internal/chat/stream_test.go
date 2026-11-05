package chat

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"github.com/Codecx-Org/FinAI/backend/internal/mcp"
)

func newStreamTestService(t *testing.T) *Service {
	t.Helper()
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("OPENROUTER_API_KEY", "")

	registry := mcp.NewRegistry(nil, mcp.Tool{
		Name:        "summarize_sales",
		Profile:     mcp.ProfileBusinessOwner,
		Resource:    "sales",
		Action:      "read",
		InputSchema: mcp.ObjectSchema(nil),
		Handler: func(ctx mcp.ToolContext, args json.RawMessage) (any, map[string]any, error) {
			return map[string]any{
				"count":      3,
				"subtotal":   "2700.00",
				"tax_amount": "300.00",
				"total":      "3000.00",
				"currency":   "KES",
				"from":       "2026-10-01T00:00:00Z",
				"to":         "2026-11-01T00:00:00Z",
			}, map[string]any{"result_count": 3}, nil
		},
	})

	return NewService(registry)
}

func streamSession() mcp.Session {
	return mcp.Session{
		UserID:     uuid.New(),
		TenantID:   uuid.New(),
		BusinessID: uuid.New(),
		Role:       "OWNER",
		Profile:    mcp.ProfileBusinessOwner,
	}
}

func collectStream(t *testing.T, svc *Service, session mcp.Session, req StreamRequest) []StreamEvent {
	t.Helper()

	var events []StreamEvent
	err := svc.StreamChat(t.Context(), session, req, func(event StreamEvent) error {
		events = append(events, event)
		return nil
	})
	if err != nil {
		t.Fatalf("stream failed: %v", err)
	}

	return events
}

func TestStreamChatEmitsToolAndTextEvents(t *testing.T) {
	svc := newStreamTestService(t)
	session := streamSession()
	req := StreamRequest{
		ThreadID: "thread-1",
		RunID:    "run-1",
		Messages: []StreamRequestMessage{{
			Role:    "user",
			Content: json.RawMessage(`"show my sales"`),
		}},
	}

	events := collectStream(t, svc, session, req)
	if len(events) < 7 {
		t.Fatalf("expected a full AG-UI event sequence, got %d: %#v", len(events), events)
	}

	first := events[0]
	if first.Type != "RUN_STARTED" || first.ThreadID != "thread-1" || first.RunID != "run-1" {
		t.Fatalf("unexpected start event: %#v", first)
	}

	var sawToolStart, sawToolArgs, sawToolResult bool

	for _, event := range events {
		switch event.Type {
		case "TOOL_CALL_START":
			if event.ToolCallName != "summarize_sales" || event.ToolCallID == "" {
				t.Fatalf("unexpected tool start: %#v", event)
			}
			sawToolStart = true
		case "TOOL_CALL_ARGS":
			var args map[string]any
			if err := json.Unmarshal([]byte(event.Delta), &args); err != nil {
				t.Fatalf("tool args are not JSON: %v (%q)", err, event.Delta)
			}
			if _, ok := args["from"]; !ok {
				t.Fatalf("expected period args, got %#v", args)
			}
			sawToolArgs = true
		case "TOOL_CALL_RESULT":
			var data map[string]any
			if err := json.Unmarshal([]byte(event.Content), &data); err != nil {
				t.Fatalf("tool result is not JSON: %v (%q)", err, event.Content)
			}
			if data["total"] != "3000.00" {
				t.Fatalf("expected unwrapped business data, got %#v", data)
			}
			sawToolResult = true
		case "TEXT_MESSAGE_CONTENT":
			if event.Delta == "" {
				t.Fatal("expected assistant text")
			}
		}
	}

	if !sawToolStart || !sawToolArgs || !sawToolResult {
		t.Fatalf("missing tool events: start=%v args=%v result=%v", sawToolStart, sawToolArgs, sawToolResult)
	}

	last := events[len(events)-1]
	if last.Type != "RUN_FINISHED" || last.ThreadID != "thread-1" || last.RunID != "run-1" {
		t.Fatalf("unexpected terminal event: %#v", last)
	}
}

func TestStreamChatGreetingSkipsTools(t *testing.T) {
	svc := newStreamTestService(t)
	req := StreamRequest{
		Messages: []StreamRequestMessage{{
			Role:    "user",
			Content: json.RawMessage(`"hello"`),
		}},
	}

	events := collectStream(t, svc, streamSession(), req)
	for _, event := range events {
		if event.Type == "TOOL_CALL_START" {
			t.Fatalf("greeting should not call tools: %#v", event)
		}
	}

	if events[len(events)-1].Type != "RUN_FINISHED" {
		t.Fatalf("expected RUN_FINISHED, got %#v", events[len(events)-1])
	}
}

func TestStreamChatRejectsEmptyMessage(t *testing.T) {
	svc := newStreamTestService(t)
	req := StreamRequest{
		Messages: []StreamRequestMessage{{Role: "user", Content: json.RawMessage(`"   "`)}},
	}

	var events []StreamEvent
	err := svc.StreamChat(t.Context(), streamSession(), req, func(event StreamEvent) error {
		events = append(events, event)
		return nil
	})
	if err == nil {
		t.Fatal("expected validation error")
	}
	if len(events) != 0 {
		t.Fatalf("expected no events before validation, got %#v", events)
	}
}

func TestStreamRequestExtractsPartsAndHistory(t *testing.T) {
	req := StreamRequest{
		Messages: []StreamRequestMessage{
			{Role: "user", Parts: []StreamRequestPart{{Type: "text", Content: "first"}}},
			{Role: "assistant", Parts: []StreamRequestPart{{Type: "text", Content: "reply"}}},
			{Role: "user", Content: json.RawMessage(`[{"type":"text","content":"second"}]`)},
		},
	}

	if got := req.messageText(); got != "second" {
		t.Fatalf("unexpected current message: %q", got)
	}

	history := req.history()
	if len(history) != 2 || history[0].Content != "first" || history[1].Content != "reply" {
		t.Fatalf("unexpected history: %#v", history)
	}
}
