package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/mcp"
)

type ChatMessage struct {
	Role    string `json:"role"` // user | assistant | system | tool
	Content string `json:"content"`
}

type ChatRequest struct {
	Message  string        `json:"message"`
	History  []ChatMessage `json:"history"`
	Language string        `json:"language"`
}

type ChatResponse struct {
	Response   string        `json:"response"`
	History    []ChatMessage `json:"history"`
	Success    bool          `json:"success"`
	BusinessID string        `json:"businessId,omitempty"`
}

type Service struct {
	registry *mcp.Registry
	// LLM config — env driven, no hard dependency
	openAIKey  string
	openAIBase string
	model      string
	httpClient *http.Client
}

func NewService(registry *mcp.Registry) *Service {
	key := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	if key == "" {
		key = strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
	}
	base := strings.TrimSpace(os.Getenv("OPENAI_BASE_URL"))
	if base == "" {
		base = strings.TrimSpace(os.Getenv("OPENROUTER_BASE_URL"))
	}
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	model := strings.TrimSpace(os.Getenv("LLM_MODEL"))
	if model == "" {
		// cheap tool-capable default; Works with OpenRouter
		model = "openai/gpt-4o-mini"
		// if using direct OpenAI, fallback
		if strings.Contains(base, "openai.com") && !strings.Contains(model, "/") {
			model = "gpt-4o-mini"
		}
	}
	return &Service{
		registry:   registry,
		openAIKey:  key,
		openAIBase: strings.TrimRight(base, "/"),
		model:      model,
		httpClient: &http.Client{Timeout: 45 * time.Second},
	}
}

// Chat orchestrates single-agent tool-using loop (Architecture.md:46) with MCP registry.
// If OPENAI_API_KEY missing, falls back to heuristic router that still exercises MCP tools, filter, and monitoring.
func (s *Service) Chat(ctx context.Context, session mcp.Session, req ChatRequest) (ChatResponse, error) {
	// sanitize
	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		return ChatResponse{}, fmt.Errorf("message is required")
	}
	lang := req.Language
	if lang != "sw" {
		lang = "en"
	}

	// 1. Build history + system
	history := append([]ChatMessage{}, req.History...)
	messages := []ChatMessage{{Role: "system", Content: systemPrompt(lang)}}
	messages = append(messages, history...)
	messages = append(messages, ChatMessage{Role: "user", Content: msg})

	// 2. List curated tools for this profile (<15, Why_Less_Is_More) — dynamic discovery
	descriptors := s.registry.List(session)
	// Filter to isError safe?

	// If no LLM key — heuristic path that still proves MCP wiring, filtering, and monitoring
	if s.openAIKey == "" {
		return s.heuristicChat(ctx, session, msg, messages, descriptors, lang)
	}

	// 3. LLM loop — up to 5 tool calls (single-agent planning)
	const maxIters = 5
	var toolCallsLog []string
	for i := 0; i < maxIters; i++ {
		resp, err := s.callLLM(ctx, messages, descriptors)
		if err != nil {
			// fallback to heuristic on LLM failure
			return s.heuristicChat(ctx, session, msg, messages, descriptors, lang)
		}
		if resp.ToolCall == nil {
			// final answer
			final := resp.Content
			if final == "" {
				final = s.fallbackAnswer(session, msg, lang, toolCallsLog)
			}
			history = append(history, ChatMessage{Role: "user", Content: msg}, ChatMessage{Role: "assistant", Content: final})
			return ChatResponse{Response: final, History: history, Success: true, BusinessID: session.BusinessID.String()}, nil
		}
		// tool call
		name := resp.ToolCall.Name
		args := resp.ToolCall.Arguments
		toolCallsLog = append(toolCallsLog, name)
		// Dynamic optional jq_filter injection (Filtering_tool.md) — LLM may pass jq_filter, registry supports limit
		envelope, err := s.registry.Call(session, name, args)
		var resultStr string
		if err != nil {
			b, _ := json.Marshal(map[string]any{"error": err.Error()})
			resultStr = string(b)
		} else {
			b, _ := json.Marshal(envelope)
			resultStr = string(b)
		}
		// append tool result as tool role for LLM
		messages = append(messages, ChatMessage{Role: "assistant", Content: resp.Content}, ChatMessage{Role: "tool", Content: fmt.Sprintf("Tool %s result: %s", name, truncate(resultStr, 6000))})
		// continue loop
	}
	// max iters reached
	return ChatResponse{Response: s.fallbackAnswer(session, msg, lang, toolCallsLog), History: history, Success: true, BusinessID: session.BusinessID.String()}, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "...[truncated]"
}

// heuristicChat maintains UX without API key, still exercises MCP tool filtering and monitoring (Monitoring_MCP.md)
func (s *Service) heuristicChat(ctx context.Context, session mcp.Session, msg string, messages []ChatMessage, descriptors []mcp.ToolDescriptor, lang string) (ChatResponse, error) {
	lower := strings.ToLower(msg)
	var called []string
	var parts []string

	call := func(name string, args json.RawMessage) {
		env, err := s.registry.Call(session, name, args)
		called = append(called, name)
		if err != nil {
			parts = append(parts, fmt.Sprintf("- %s: error %v", name, err))
			return
		}
		b, _ := json.MarshalIndent(env.Data, "", "  ")
		parts = append(parts, fmt.Sprintf("- %s:\n```json\n%s\n```", name, truncate(string(b), 1200)))
	}

	switch {
	case containsAny(lower, "sales", "revenue", "mauzo"):
		from := time.Now().AddDate(0, -1, 0).Format(time.RFC3339)
		to := time.Now().Format(time.RFC3339)
		call("summarize_sales", json.RawMessage(fmt.Sprintf(`{"from":"%s","to":"%s"}`, from, to)))
		if containsAny(lower, "product", "bidhaa") {
			call("list_sales_by_product", json.RawMessage(`{"limit":5}`))
		}
	case containsAny(lower, "stock", "inventory", "hifadhi", "low"):
		call("list_low_stock_items", json.RawMessage(`{"limit":8}`))
		call("get_inventory_valuation", json.RawMessage(`{"limit":5}`))
	case containsAny(lower, "expense", "gharama", "matumizi"):
		from := time.Now().AddDate(0, -1, 0).Format(time.RFC3339)
		to := time.Now().Format(time.RFC3339)
		call("summarize_expenses_by_category", json.RawMessage(fmt.Sprintf(`{"from":"%s","to":"%s"}`, from, to)))
	case containsAny(lower, "customer", "mteja", "wateja"):
		// try to extract query
		q := extractQuery(msg)
		if q == "" {
			q = "a"
		}
		call("search_customers", json.RawMessage(fmt.Sprintf(`{"query":%q,"limit":5}`, q)))
	case containsAny(lower, "invoice", "ankara", "deni"):
		call("list_invoices", json.RawMessage(`{"limit":5}`))
	default:
		// RAG + general: keep empty but show available tools hint
	}

	if len(parts) == 0 {
		// fallback to knowledge RAG
		env, _ := s.registry.Call(session, "search_business_knowledge", json.RawMessage(fmt.Sprintf(`{"query":%q,"max_results":3}`, msg)))
		if env.Data != nil {
			b, _ := json.Marshal(env.Data)
			parts = append(parts, fmt.Sprintf("Knowledge: %s", truncate(string(b), 800)))
		}
		if len(parts) == 0 {
			avail := make([]string, 0, len(descriptors))
			for _, d := range descriptors {
				avail = append(avail, d.Name)
			}
			return ChatResponse{
				Response: fmt.Sprintf(langMsg(lang, "no_tool"), strings.Join(avail, ", ")),
				History:  append(messages[1:], ChatMessage{Role: "assistant", Content: "No tool matched"}),
				Success:  true, BusinessID: session.BusinessID.String(),
			}, nil
		}
	}

	intro := langMsg(lang, "intro")
	body := strings.Join(parts, "\n\n")
	answer := fmt.Sprintf("%s\n\n%s\n\n%s", intro, body, langMsg(lang, "outro"))
	return ChatResponse{Response: answer, History: append(append([]ChatMessage{}, messages[1:]...), ChatMessage{Role: "assistant", Content: answer}), Success: true, BusinessID: session.BusinessID.String()}, nil
}

func langMsg(lang, key string) string {
	en := map[string]string{
		"intro":    "Here is what I found from your business data (via MCP tools):",
		"outro":    "Need a deeper dive? Ask e.g. 'Show top products last week' or 'Which customers owe invoices?'",
		"no_tool": "I can help with sales, stock, expenses, customers, invoices. Available tools: %s",
	}
	sw := map[string]string{
		"intro":    "Hapa ni muhtasari kutoka data ya biashara yako (kupitia zana za MCP):",
		"outro":    "Unahitaji uchambuzi zaidi? Uliza 'Onyesha bidhaa zinazouza sana wiki iliyopita'",
		"no_tool": "Naweza kusaidia na mauzo, akiba, gharama, wateja, ankara. Zana: %s",
	}
	if lang == "sw" {
		return sw[key]
	}
	return en[key]
}

func (s *Service) fallbackAnswer(session mcp.Session, msg, lang string, calls []string) string {
	if len(calls) == 0 {
		return langMsg(lang, "intro") + "\nNo tool was needed for this query."
	}
	return fmt.Sprintf("%s\nCalled: %s", langMsg(lang, "intro"), strings.Join(calls, ", "))
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func extractQuery(msg string) string {
	words := strings.Fields(msg)
	if len(words) <= 4 {
		return strings.Join(words, " ")
	}
	return strings.Join(words[len(words)-3:], " ")
}

// OpenAI/ OpenRouter compatible chat completions with tools
type llmToolCall struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type llmResponse struct {
	Content  string       `json:"content"`
	ToolCall *llmToolCall `json:"tool_call,omitempty"`
}

func (s *Service) callLLM(ctx context.Context, messages []ChatMessage, tools []mcp.ToolDescriptor) (*llmResponse, error) {
	// Convert MCP descriptors to OpenAI function tools
	type funcDef struct {
		Name        string         `json:"name"`
		Description string         `json:"description"`
		Parameters  map[string]any `json:"parameters"`
	}
	type toolDef struct {
		Type     string  `json:"type"`
		Function funcDef `json:"function"`
	}
	var toolDefs []toolDef
	for _, t := range tools {
		schema := t.InputSchema
		if schema == nil {
			schema = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		toolDefs = append(toolDefs, toolDef{Type: "function", Function: funcDef{Name: t.Name, Description: t.Description, Parameters: schema}})
	}

	// Build OpenAI messages
	type oaMsg struct {
		Role       string `json:"role"`
		Content    string `json:"content"`
		ToolCallID string `json:"tool_call_id,omitempty"`
	}
	var oaMsgs []oaMsg
	for _, m := range messages {
		// tool role maps to "tool" for OpenAI, but some providers expect "tool"
		oaMsgs = append(oaMsgs, oaMsg{Role: m.Role, Content: m.Content})
	}

	body := map[string]any{
		"model":    s.model,
		"messages": oaMsgs,
		"tools":    toolDefs,
		"tool_choice": "auto",
		"temperature": 0.2,
	}
	if len(toolDefs) == 0 {
		delete(body, "tools")
		delete(body, "tool_choice")
	}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequestWithContext(ctx, "POST", s.openAIBase+"/chat/completions", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.openAIKey)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("llm %d: %s", resp.StatusCode, truncate(string(raw), 400))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content   string `json:"content"`
				ToolCalls []struct {
					Function struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					} `json:"function"`
					ID string `json:"id"`
				} `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("empty LLM choices")
	}
	choice := parsed.Choices[0].Message
	if len(choice.ToolCalls) > 0 {
		tc := choice.ToolCalls[0]
		return &llmResponse{Content: choice.Content, ToolCall: &llmToolCall{Name: tc.Function.Name, Arguments: json.RawMessage(tc.Function.Arguments)}}, nil
	}
	return &llmResponse{Content: choice.Content}, nil
}
