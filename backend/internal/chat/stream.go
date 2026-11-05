package chat

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Codecx-Org/FinAI/backend/internal/mcp"
	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
)

// StreamEvent mirrors the subset of AG-UI events TanStack AI consumes over an
// NDJSON response. Field names are wire fields, not Go conventions.
type StreamEvent struct {
	Type         string `json:"type"`
	Timestamp    int64  `json:"timestamp,omitempty"`
	ThreadID     string `json:"threadId,omitempty"`
	RunID        string `json:"runId,omitempty"`
	MessageID    string `json:"messageId,omitempty"`
	Role         string `json:"role,omitempty"`
	Delta        string `json:"delta,omitempty"`
	ToolCallID   string `json:"toolCallId,omitempty"`
	ToolCallName string `json:"toolCallName,omitempty"`
	Content      string `json:"content,omitempty"`
	Message      string `json:"message,omitempty"`
	Code         string `json:"code,omitempty"`
}

type StreamRequest struct {
	ThreadID       string                 `json:"threadId"`
	RunID          string                 `json:"runId"`
	Messages       []StreamRequestMessage `json:"messages"`
	ForwardedProps map[string]any         `json:"forwardedProps"`
	Language       string                 `json:"language"`
}

type StreamRequestMessage struct {
	Role    string              `json:"role"`
	Content json.RawMessage     `json:"content"`
	Parts   []StreamRequestPart `json:"parts"`
}

type StreamRequestPart struct {
	Type    string `json:"type"`
	Content string `json:"content"`
	Text    string `json:"text"`
}

func (m StreamRequestMessage) text() string {
	if len(m.Content) > 0 {
		var plain string
		if err := json.Unmarshal(m.Content, &plain); err == nil {
			return strings.TrimSpace(plain)
		}

		var parts []StreamRequestPart
		if err := json.Unmarshal(m.Content, &parts); err == nil {
			return partsText(parts)
		}
	}

	return partsText(m.Parts)
}

func partsText(parts []StreamRequestPart) string {
	var out []string

	for _, part := range parts {
		if part.Type != "" && part.Type != "text" {
			continue
		}

		text := strings.TrimSpace(part.Content)
		if text == "" {
			text = strings.TrimSpace(part.Text)
		}
		if text != "" {
			out = append(out, text)
		}
	}

	return strings.TrimSpace(strings.Join(out, "\n"))
}

func (r StreamRequest) messageText() string {
	for i := len(r.Messages) - 1; i >= 0; i-- {
		if r.Messages[i].Role == "user" {
			return r.Messages[i].text()
		}
	}

	return ""
}

func (r StreamRequest) history() []ChatMessage {
	lastUser := -1
	for i := len(r.Messages) - 1; i >= 0; i-- {
		if r.Messages[i].Role == "user" && r.Messages[i].text() != "" {
			lastUser = i

			break
		}
	}

	history := make([]ChatMessage, 0, len(r.Messages))
	for i, msg := range r.Messages {
		if i == lastUser || (msg.Role != "user" && msg.Role != "assistant") {
			continue
		}

		text := msg.text()
		if text == "" {
			continue
		}

		history = append(history, ChatMessage{Role: msg.Role, Content: text})
	}

	return history
}

func (r StreamRequest) language() string {
	for _, candidate := range []any{
		r.ForwardedProps["language"],
		r.ForwardedProps["lang"],
		r.Language,
	} {
		if value, ok := candidate.(string); ok && value == "sw" {
			return "sw"
		}
	}

	return "en"
}

func streamEvent(eventType string) StreamEvent {
	return StreamEvent{Type: eventType, Timestamp: time.Now().UnixMilli()}
}

// StreamChat emits AG-UI events incrementally and returns only setup errors
// (bad request). LLM/tool failures are represented as RUN_ERROR events so the
// HTTP response itself stays a successful NDJSON stream.
func (s *Service) StreamChat(
	ctx context.Context,
	session mcp.Session,
	req StreamRequest,
	emit func(StreamEvent) error,
) error {
	msg := strings.TrimSpace(req.messageText())
	if msg == "" {
		return apperrors.ErrBadRequest.WithMessage("message must be non-empty")
	}

	threadID := strings.TrimSpace(req.ThreadID)
	if threadID == "" {
		threadID = uuid.NewString()
	}

	runID := strings.TrimSpace(req.RunID)
	if runID == "" {
		runID = uuid.NewString()
	}

	lang := req.language()

	started := streamEvent("RUN_STARTED")
	started.ThreadID = threadID
	started.RunID = runID
	if err := emit(started); err != nil {
		return err
	}

	failed := func(err error) error {
		event := streamEvent("RUN_ERROR")
		event.Message = err.Error()
		event.Code = "chat_failed"

		return emit(event)
	}

	if needsTool(msg) && !isGreeting(strings.ToLower(msg)) {
		result := s.execHeuristicTools(ctx, session, msg)
		for i, name := range result.called {
			args := "{}"
			if i < len(result.args) && strings.TrimSpace(result.args[i]) != "" {
				args = result.args[i]
			}

			callID := "call_" + uuid.NewString()
			resultID := "result_" + uuid.NewString()

			callStart := streamEvent("TOOL_CALL_START")
			callStart.ToolCallID = callID
			callStart.ToolCallName = name
			if err := emit(callStart); err != nil {
				return err
			}

			callArgs := streamEvent("TOOL_CALL_ARGS")
			callArgs.ToolCallID = callID
			callArgs.Delta = args
			if err := emit(callArgs); err != nil {
				return err
			}

			callEnd := streamEvent("TOOL_CALL_END")
			callEnd.ToolCallID = callID
			if err := emit(callEnd); err != nil {
				return err
			}

			content := `{"error":"tool returned no result"}`
			if i < len(result.results) && strings.TrimSpace(result.results[i]) != "" {
				content = streamToolResultContent(result.results[i])
			}

			toolResult := streamEvent("TOOL_CALL_RESULT")
			toolResult.MessageID = resultID
			toolResult.ToolCallID = callID
			toolResult.Role = "assistant"
			toolResult.Content = content
			if err := emit(toolResult); err != nil {
				return err
			}
		}
	}

	resp, err := s.Chat(ctx, session, ChatRequest{
		Message:  msg,
		History:  req.history(),
		Language: lang,
	})
	if err != nil {
		return failed(err)
	}

	messageID := "msg_" + uuid.NewString()

	textStart := streamEvent("TEXT_MESSAGE_START")
	textStart.MessageID = messageID
	textStart.Role = "assistant"
	if err := emit(textStart); err != nil {
		return err
	}

	textContent := streamEvent("TEXT_MESSAGE_CONTENT")
	textContent.MessageID = messageID
	textContent.Delta = resp.Response
	if err := emit(textContent); err != nil {
		return err
	}

	textEnd := streamEvent("TEXT_MESSAGE_END")
	textEnd.MessageID = messageID
	if err := emit(textEnd); err != nil {
		return err
	}

	finished := streamEvent("RUN_FINISHED")
	finished.ThreadID = threadID
	finished.RunID = runID

	return emit(finished)
}

// streamToolResultContent unwraps the MCP envelope so the client receives the
// business data itself (what the presenter renders) instead of transport
// metadata. Error payloads are passed through unchanged.
func streamToolResultContent(result string) string {
	var envelope mcp.Envelope
	if err := json.Unmarshal([]byte(result), &envelope); err == nil && envelope.Status != "" {
		if envelope.Data != nil {
			data, err := json.Marshal(envelope.Data)
			if err == nil {
				return string(data)
			}
		}

		if envelope.Status != "ok" {
			return result
		}
	}

	return result
}
