package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/mcp"
)

type ChatMessage struct {
	Role    string `json:"role"` // user | assistant | system | tool
	Content string `json:"content"`
	// ToolCallID links a tool result to the assistant turn that requested it.
	// Providers (OpenAI/OpenRouter) reject tool messages without it (400), so
	// every tool result appended in the agentic loop must carry the id.
	ToolCallID string `json:"tool_call_id,omitempty"`
	// ToolCalls echoes structured calls on the assistant turn, required by
	// strict providers alongside the tool result messages.
	ToolCalls []WireToolCall `json:"tool_calls,omitempty"`
}

// WireToolCall mirrors OpenAI's {id, type:function, function:{name,arguments}}.
type WireToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

func wireToolCall(id, name, args string) WireToolCall {
	if id == "" {
		id = fmt.Sprintf("call_%d", time.Now().UnixNano())
	}
	w := WireToolCall{ID: id, Type: "function"}
	w.Function.Name = name
	w.Function.Arguments = args
	return w
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
	fallbacks  []string
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

	// Extra models to try when the primary is throttled (free-tier 429),
	// unknown (404), or erroring (5xx). Comma-separated, e.g.
	// LLM_FALLBACK_MODELS="meta-llama/llama-3.3-70b-instruct:free,google/gemini-2.0-flash-exp:free"
	var fallbacks []string
	for _, f := range strings.Split(os.Getenv("LLM_FALLBACK_MODELS"), ",") {
		if f = strings.TrimSpace(f); f != "" {
			fallbacks = append(fallbacks, f)
		}
	}

	if key == "" {
		slog.Info("chat LLM not configured — heuristic fallback only (set OPENAI_API_KEY or OPENROUTER_API_KEY for smart replies)", "model", model, "base", base)
	} else {
		slog.Info("chat LLM configured", "model", model, "fallbacks", fallbacks, "base", base)
	}

	return &Service{
		registry:   registry,
		openAIKey:  key,
		openAIBase: strings.TrimRight(base, "/"),
		model:      model,
		fallbacks:  fallbacks,
		httpClient: &http.Client{Timeout: 45 * time.Second},
	}
}

// candidateModels returns primary + configured fallbacks (LLM_FALLBACK_MODELS,
// comma-separated) for transient-failure failover.
func candidateModels(primary string, fallbacks []string) []string {
	models := []string{primary}
	seen := map[string]bool{primary: true}
	for _, f := range fallbacks {
		f = strings.TrimSpace(f)
		if f != "" && !seen[f] {
			seen[f] = true
			models = append(models, f)
		}
	}
	return models
}

// postCompletion POSTs a chat-completions body, failing over across models on
// transient errors (429 free-tier throttle, 404 unknown model, 5xx, network).
// 400/401/403 fail fast: those are auth/shape bugs, not capacity. Returns the
// raw body and the model that answered.
func (s *Service) postCompletion(ctx context.Context, body map[string]any) ([]byte, string, error) {
	models := candidateModels(s.model, s.fallbacks)
	var lastErr error
	for i, model := range models {
		body["model"] = model
		b, _ := json.Marshal(body)
		// Per-attempt deadline: free-tier providers can stall for the full
		// client timeout. 20s × attempts keeps total under the mobile chat
		// timeout (90s) with room for the heuristic fallback.
		attemptCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		req, _ := http.NewRequestWithContext(attemptCtx, "POST", s.openAIBase+"/chat/completions", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+s.openAIKey)
		req.Header.Set("HTTP-Referer", "https://api.bizsawa.chrismwiti.me")
		req.Header.Set("X-Title", "BizSawa")

		resp, err := s.httpClient.Do(req)
		cancel()
		if err != nil {
			lastErr = fmt.Errorf("model %s: %w", model, err)
			slog.WarnContext(ctx, "chat LLM request failed, trying fallback", "model", model, "err", truncate(err.Error(), 150))
			continue
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if len(bytes.TrimSpace(raw)) == 0 {
			// Flaky free providers sometimes answer 200 with an empty body —
			// fail over instead of crashing the JSON parse downstream.
			lastErr = fmt.Errorf("model %s: empty response body", model)
			slog.WarnContext(ctx, "chat LLM empty body, trying fallback", "model", model, "status", resp.StatusCode)
			continue
		}
		if resp.StatusCode == 429 || resp.StatusCode == 404 || resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("model %s: llm %d: %s", model, resp.StatusCode, truncate(string(raw), 300))
			slog.WarnContext(ctx, "chat LLM transient error, trying fallback", "model", model, "status", resp.StatusCode)
			if i < len(models)-1 {
				select {
				case <-ctx.Done():
					return nil, "", ctx.Err()
				case <-time.After(1500 * time.Millisecond):
				}
			}
			continue
		}
		if resp.StatusCode >= 300 {
			return nil, "", fmt.Errorf("model %s: llm %d: %s", model, resp.StatusCode, truncate(string(raw), 400))
		}
		return raw, model, nil
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no LLM models configured")
	}
	return nil, "", lastErr
}

// Chat orchestrates single-agent tool-using loop (Architecture.md:46) with MCP registry.
// If OPENAI_API_KEY missing, falls back to heuristic router that still exercises MCP tools, filter, and monitoring.
func (s *Service) Chat(ctx context.Context, session mcp.Session, req ChatRequest) (ChatResponse, error) {
	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		return ChatResponse{}, fmt.Errorf("message is required")
	}

	lang := req.Language
	if lang != "sw" {
		lang = "en"
	}

	history := append([]ChatMessage{}, req.History...)
	messages := []ChatMessage{{Role: "system", Content: systemPrompt(lang)}}
	messages = append(messages, history...)
	messages = append(messages, ChatMessage{Role: "user", Content: msg})

	descriptors := s.registry.List(session)

	if s.openAIKey == "" {
		return s.heuristicChat(ctx, session, msg, messages, descriptors, lang)
	}

	// Hybrid: heuristic decides tools (reliable), LLM synthesizes (prevents "I should call X" without calling)
	// This fixes free models (e.g. ling-3.0-flash) that narrate tool calls instead of emitting tool_calls.
	if needsTool(msg) {
		hr := s.execHeuristicTools(ctx, session, msg)
		if len(hr.called) > 0 {
			messages = appendToolTurns(messages, hr.called, hr.args, hr.results, nil)
			// Try LLM synthesis with tool results (no tools needed, just generation)
			if synth, err := s.callLLMSynthesis(ctx, messages); err == nil && strings.TrimSpace(synth) != "" {
				// ensure we don't just echo tool mention without data
				if !isToolMentionOnly(synth) {
					history = append(history, ChatMessage{Role: "user", Content: msg}, ChatMessage{Role: "assistant", Content: synth})
					return ChatResponse{Response: synth, History: history, Success: true, BusinessID: session.BusinessID.String()}, nil
				}
			}
			// LLM synthesis failed or still just mentions tool → return heuristic formatted answer (guaranteed to contain actual data)
			return s.heuristicChat(ctx, session, msg, messages, descriptors, lang)
		}
	}

	const maxIters = 5

	var toolCallsLog []string

	for i := 0; i < maxIters; i++ {
		resp, err := s.callLLM(ctx, messages, descriptors)
		if err != nil {
			// A dead/expired key surfaces here (e.g. OpenRouter 401) — log it
			// loudly; otherwise the silent heuristic fallback looks like the
			// service "returns hardcoded templates" with no backend trace.
			slog.WarnContext(ctx, "chat LLM call failed — heuristic fallback", "err", truncate(err.Error(), 200), "model", s.model)
			return s.heuristicChat(ctx, session, msg, messages, descriptors, lang)
		}

		if resp.ToolCall == nil {
			// Detect model narrating tool call instead of emitting structured tool_calls
			if mentioned := extractToolMention(resp.Content, descriptors); mentioned != "" && len(toolCallsLog) == 0 && needsTool(msg) {
				args := inferArgs(mentioned, msg)
				env, err := s.registry.Call(session, mentioned, args)

				var resultStr string

				if err != nil {
					b, _ := json.Marshal(map[string]any{"error": err.Error()})
					resultStr = string(b)
				} else {
					b, _ := json.Marshal(env)
					resultStr = string(b)
				}

			toolCallsLog = append(toolCallsLog, mentioned)
			messages = appendToolTurns(messages,
				[]string{mentioned}, []string{string(args)},
				[]string{resultStr}, nil)

			continue
			}
			// Also if query clearly needs data but LLM gave generic answer without tool, force heuristic tools
			if len(toolCallsLog) == 0 && needsTool(msg) {
				hr := s.execHeuristicTools(ctx, session, msg)
				if len(hr.called) > 0 {
					messages = appendToolTurns(messages, hr.called, hr.args, hr.results, nil)
					// one more LLM synthesis attempt
					if synth, err := s.callLLMSynthesis(ctx, messages); err == nil && synth != "" && !isToolMentionOnly(synth) {
						history = append(history, ChatMessage{Role: "user", Content: msg}, ChatMessage{Role: "assistant", Content: synth})
						return ChatResponse{Response: synth, History: history, Success: true, BusinessID: session.BusinessID.String()}, nil
					}
				}
			}

			final := resp.Content
			if final == "" {
				final = s.fallbackAnswer(session, msg, lang, toolCallsLog)
			}

			history = append(history, ChatMessage{Role: "user", Content: msg}, ChatMessage{Role: "assistant", Content: final})

			return ChatResponse{Response: final, History: history, Success: true, BusinessID: session.BusinessID.String()}, nil
		}

		name := resp.ToolCall.Name
		args := resp.ToolCall.Arguments

		toolCallsLog = append(toolCallsLog, name)
		envelope, err := s.registry.Call(session, name, args)

		var resultStr string

		if err != nil {
			b, _ := json.Marshal(map[string]any{"error": err.Error()})
			resultStr = string(b)
		} else {
			b, _ := json.Marshal(envelope)
			resultStr = string(b)
		}

		messages = appendToolTurns(messages,
			[]string{name}, []string{string(args)},
			[]string{resultStr}, []string{resp.ToolCall.ID})
	}

	return ChatResponse{Response: s.fallbackAnswer(session, msg, lang, toolCallsLog), History: history, Success: true, BusinessID: session.BusinessID.String()}, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}

	return s[:max] + "...[truncated]"
}

// appendToolTurns appends one assistant echo (with structured tool_calls) plus
// one tool result per call — the shape strict OpenAI-compatible providers
// require. Every tool message carries a non-empty tool_call_id; without it
// providers reject the request (400) and the whole turn silently degrades to
// the heuristic template.
func appendToolTurns(messages []ChatMessage, calls, args, results, ids []string) []ChatMessage {
	for i, name := range calls {
		arg := ""
		if i < len(args) {
			arg = args[i]
		}
		res := ""
		if i < len(results) {
			res = results[i]
		}
		id := ""
		if i < len(ids) {
			id = ids[i]
		}
		wire := wireToolCall(id, name, arg)
		messages = append(messages,
			ChatMessage{Role: "assistant", Content: "", ToolCalls: []WireToolCall{wire}},
			ChatMessage{Role: "tool", Content: fmt.Sprintf("Tool %s result: %s", name, truncate(res, 6000)), ToolCallID: wire.ID},
		)
	}
	return messages
}

// heuristicChat maintains UX without API key, still exercises MCP tool filtering and monitoring (Monitoring_MCP.md).
// Now renders plain-language, layered answer (headline → driving data → next step) per systemPrompt guidelines,
// never dumps raw JSON to the end user.
func (s *Service) heuristicChat(ctx context.Context, session mcp.Session, msg string, messages []ChatMessage, descriptors []mcp.ToolDescriptor, lang string) (ChatResponse, error) {
	lower := strings.ToLower(msg)

	var called []string

	var parts []string

	// Greetings ("hello", "habari", …) match no tool — answer directly instead
	// of falling through to the knowledge-base template.
	if isGreeting(lower) {
		greeting := langMsg(lang, "greeting")
		hist := append(append([]ChatMessage{}, messages[1:]...), ChatMessage{Role: "assistant", Content: greeting})
		return ChatResponse{Response: greeting, History: hist, Success: true, BusinessID: session.BusinessID.String()}, nil
	}

	call := func(name string, args json.RawMessage) {
		env, err := s.registry.Call(session, name, args)
		called = append(called, name)

		if err != nil {
			parts = append(parts, formatHeuristicError(name, err, lang))
			return
		}

		parts = append(parts, formatHeuristicData(name, env.Data, lang))
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
		// fallback to knowledge RAG — render as plain sentence, no JSON
		env, _ := s.registry.Call(session, "search_business_knowledge", json.RawMessage(fmt.Sprintf(`{"query":%q,"max_results":3}`, msg)))
		if env.Data != nil {
			if m, ok := env.Data.(map[string]any); ok {
				if results, ok := m["results"].([]any); ok && len(results) > 0 {
					parts = append(parts, langMsg(lang, "knowledge_found"))
				} else {
					parts = append(parts, langMsg(lang, "knowledge_empty"))
				}
			}
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

	// Layered structure per systemPromptEN: headline → driving data → next step + caveat.
	// Headline is always the intro line — the old code derived it from parts[0],
	// which printed the first data sentence twice (headline + body).
	headline := langMsg(lang, "intro")
	body := strings.Join(parts, "\n\n")
	caveat := ""
	if len(called) > 0 {
		caveat = langMsg(lang, "caveat")
	}
	answer := fmt.Sprintf("%s\n\n%s\n\n%s", headline, body, caveat)
	if strings.TrimSpace(caveat) == "" {
		answer = fmt.Sprintf("%s\n\n%s\n\n%s", headline, body, langMsg(lang, "outro"))
	} else {
		answer = fmt.Sprintf("%s\n\n%s\n\n%s\n\n%s", headline, body, langMsg(lang, "outro"), caveat)
	}

	return ChatResponse{Response: answer, History: append(append([]ChatMessage{}, messages[1:]...), ChatMessage{Role: "assistant", Content: answer}), Success: true, BusinessID: session.BusinessID.String()}, nil
}

func isGreeting(lower string) bool {
	// Space-padded so short words don't match substrings ("hi" vs "this").
	padded := " " + lower + " "
	for _, w := range []string{"hello", "hi", "hey", "habari", "mambo", "sasa", "hujambo", "niaje", "yo", "sup"} {
		if strings.Contains(padded, " "+w+" ") || strings.Contains(padded, " "+w+"!") || strings.Contains(padded, " "+w+",") {
			return true
		}
	}
	return containsAny(lower, "good morning", "good afternoon", "good evening", "how are you", "habari yako", "hujambo")
}

func langMsg(lang, key string) string {
	en := map[string]string{
		"greeting":        "Hello! I'm your BizSawa business coach. I can look into your sales, stock, expenses, customers, and invoices — try 'Show top products last week' or 'Which invoices are overdue?'",
		"intro":           "Here is what I found from your business data (via MCP tools):",
		"outro":           "Need a deeper dive? Ask e.g. 'Show top products last week' or 'Which customers owe invoices?'",
		"no_tool":         "I can help with sales, stock, expenses, customers, invoices. Available tools: %s",
		"knowledge_found": "I checked your business knowledge base and found relevant guidance for your question.",
		"knowledge_empty": "I didn't find a direct knowledge article for this, but I can still help with your sales, stock, or invoice data.",
		"caveat":          "Note: This summary is based on the data returned right now. If the period is short, treat it as a snapshot, not a trend — confirm any tax decision with KRA/your accountant.",
	}
	sw := map[string]string{
		"greeting":        "Habari! Mimi ni kocha wako wa biashara wa BizSawa. Naweza kuchambua mauzo, akiba, gharama, wateja na ankara zako — jaribu 'Onyesha bidhaa zinazouza sana wiki iliyopita'.",
		"intro":           "Hapa ni muhtasari kutoka data ya biashara yako (kupitia zana za MCP):",
		"outro":           "Unahitaji uchambuzi zaidi? Uliza 'Onyesha bidhaa zinazouza sana wiki iliyopita'",
		"no_tool":         "Naweza kusaidia na mauzo, akiba, gharama, wateja, ankara. Zana: %s",
		"knowledge_found": "Nimeangalia maktaba ya maarifa ya biashara yako na nimepata mwongozo unaohusiana.",
		"knowledge_empty": "Sikupata makala ya moja kwa moja, lakini naweza kusaidia na data ya mauzo, akiba, au ankara.",
		"caveat":          "Kumbuka: Muhtasari huu unatokana na data ya sasa. Ikiwa kipindi ni kifupi, chukulia kama picha ya muda, si mwenendo — thibitisha maamuzi ya kodi na KRA/mhasibu wako.",
	}

	if lang == "sw" {
		if v, ok := sw[key]; ok {
			return v
		}
		return en[key]
	}

	return en[key]
}

func formatHeuristicError(name string, err error, lang string) string {
	if lang == "sw" {
		return fmt.Sprintf("Kwa %s, data haikupatikana: %v. Jaribu tena baadae.", name, err)
	}
	return fmt.Sprintf("For %s, I couldn't fetch data: %v. Try again shortly.", name, err)
}

func formatHeuristicData(name string, data any, lang string) string {
	m, ok := data.(map[string]any)
	if !ok {
		return truncate(fmt.Sprintf("%v", data), 600)
	}

	switch name {
	case "summarize_sales":
		count := toInt(m["count"])
		total := toStr(m["total"])
		subtotal := toStr(m["subtotal"])
		currency := toStr(m["currency"])
		if currency == "" {
			currency = "KES"
		}
		if count == 0 {
			if lang == "sw" {
				return fmt.Sprintf("Mauzo: Hakuna mauzo katika kipindi hiki. Jumla ni %s 0.", currency)
			}
			return fmt.Sprintf("Sales: No sales in this period. Total is %s 0.", currency)
		}
		if lang == "sw" {
			return fmt.Sprintf("Mauzo: Miamala %d yenye jumla ya %s %s (bila ushuru %s %s). Hii ndiyo chanzo kikuu cha kipato chako kwa kipindi hiki.", count, currency, total, currency, subtotal)
		}
		return fmt.Sprintf("Sales: %d transactions totaling about %s %s (subtotal %s %s before tax). This is your revenue for the selected period, rounded for quick reading.", count, currency, total, currency, subtotal)
	case "list_sales_by_product":
		results, _ := m["results"].([]any)
		if len(results) == 0 {
			return langMsg(lang, "knowledge_empty")
		}
		lines := []string{}
		for i, r := range results {
			if i >= 3 {
				break
			}
			if rm, ok := r.(map[string]any); ok {
				lines = append(lines, fmt.Sprintf("%v — %s %v (%v sales)", rm["key"], toStr(rm["currency"]), toStr(rm["total"]), toInt(rm["count"])))
			}
		}
		if lang == "sw" {
			return "Bidhaa zinazoongoza: " + strings.Join(lines, "; ")
		}
		return "Top products: " + strings.Join(lines, "; ")
	case "summarize_expenses_by_category":
		results, _ := m["results"].([]any)
		if len(results) == 0 {
			if lang == "sw" {
				return "Gharama: Hakuna gharama zilizorekodiwa katika kipindi hiki."
			}
			return "Expenses: No expenses recorded in this period."
		}
		lines := []string{}
		var top string
		for i, r := range results {
			if rm, ok := r.(map[string]any); ok {
				if i == 0 {
					top = fmt.Sprintf("%v (%s %v)", rm["category"], toStr(rm["currency"]), toStr(rm["amount"]))
				}
				lines = append(lines, fmt.Sprintf("%v: %s %v", rm["category"], toStr(rm["currency"]), toStr(rm["amount"])))
				if i >= 2 {
					break
				}
			}
		}
		if lang == "sw" {
			return fmt.Sprintf("Gharama kwa kategoria: %s. Kubwa zaidi ni %s.", strings.Join(lines, ", "), top)
		}
		return fmt.Sprintf("Expenses by category: %s. Largest is %s.", strings.Join(lines, ", "), top)
	case "list_low_stock_items":
		results, _ := m["results"].([]any)
		if len(results) == 0 {
			if lang == "sw" {
				return "Akiba: Hakuna bidhaa iliyo chini ya kiwango cha tahadhari. Hali ni nzuri."
			}
			return "Stock: No items are below the low-stock threshold. You're well stocked."
		}
		if lang == "sw" {
			return fmt.Sprintf("Akiba ya chini: Bidhaa %d ziko chini ya kiwango. Jaza mapema ili usikose mauzo.", len(results))
		}
		return fmt.Sprintf("Low stock: %d items are below threshold. Consider restocking soon to avoid missed sales.", len(results))
	case "get_inventory_valuation":
		results, _ := m["results"].([]any)
		if lang == "sw" {
			return fmt.Sprintf("Thamani ya akiba: Bidhaa %d zimehesabiwa. Hii inakusaidia kujua mtaji uliopo stokini.", len(results))
		}
		return fmt.Sprintf("Inventory: %d products counted. This reflects the quantity currently on hand.", len(results))
	case "search_customers":
		results, _ := m["results"].([]any)
		if len(results) == 0 {
			if lang == "sw" {
				return "Wateja: Hakuna mteja aliyepatikana na utafutaji huu."
			}
			return "Customers: No matches for that search. Try a different name or phone fragment."
		}
		names := []string{}
		for i, r := range results {
			if i >= 3 {
				break
			}
			if rm, ok := r.(map[string]any); ok {
				names = append(names, toStr(rm["name"]))
			}
		}
		if lang == "sw" {
			return "Wateja waliopatikana: " + strings.Join(names, ", ")
		}
		return "Found customers: " + strings.Join(names, ", ")
	case "list_invoices":
		results, _ := m["results"].([]any)
		if len(results) == 0 {
			if lang == "sw" {
				return "Ankara: Hakuna ankara katika kipindi hiki."
			}
			return "Invoices: No invoices in this period."
		}
		if lang == "sw" {
			return fmt.Sprintf("Ankara: %d zimepatikana. Angalia ankara zinazodaiwa kwa ufuatiliaji.", len(results))
		}
		return fmt.Sprintf("Invoices: Found %d invoices. Check overdue ones for follow-up.", len(results))
	default:
		// Fallback: short, no JSON dump
		return truncate(fmt.Sprintf("%s: %d records found.", name, toInt(m["result_count"])), 400)
	}
}

func toStr(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%v", v)
}

func toInt(v any) int {
	switch x := v.(type) {
	case int:
		return x
	case int64:
		return int(x)
	case float64:
		return int(x)
	case string:
		var i int
		fmt.Sscanf(x, "%d", &i)
		return i
	default:
		return 0
	}
}

func needsTool(msg string) bool {
	lower := strings.ToLower(msg)
	return containsAny(lower, "sales", "revenue", "mauzo", "stock", "inventory", "hifadhi", "low", "expense", "gharama", "matumizi", "customer", "mteja", "wateja", "invoice", "ankara", "deni", "product", "bidhaa", "profit", "margin", "customer", "order")
}

func extractToolMention(content string, descriptors []mcp.ToolDescriptor) string {
	lower := strings.ToLower(content)
	for _, d := range descriptors {
		if strings.Contains(lower, strings.ToLower(d.Name)) {
			return d.Name
		}
	}
	// also check narration patterns
	if strings.Contains(lower, "summarize_sales") {
		return "summarize_sales"
	}

	if strings.Contains(lower, "list_low_stock") {
		return "list_low_stock_items"
	}

	return ""
}

func inferArgs(toolName, msg string) json.RawMessage {
	lower := strings.ToLower(msg)

	switch toolName {
	case "summarize_sales", "summarize_expenses_by_category":
		from := time.Now().AddDate(0, -1, 0).Format(time.RFC3339)
		to := time.Now().Format(time.RFC3339)

		return json.RawMessage(fmt.Sprintf(`{"from":"%s","to":"%s"}`, from, to))
	case "list_sales_by_product", "list_sales_by_payment_method", "list_sales_by_staff", "list_low_stock_items", "get_inventory_valuation", "list_invoices":
		return json.RawMessage(`{"limit":5}`)
	case "search_customers":
		q := extractQuery(msg)
		if q == "" {
			q = "a"
		}

		return json.RawMessage(fmt.Sprintf(`{"query":%q,"limit":5}`, q))
	default:
		if strings.Contains(lower, "customer") {
			q := extractQuery(msg)
			return json.RawMessage(fmt.Sprintf(`{"query":%q,"limit":5}`, q))
		}

		return json.RawMessage(`{"limit":5}`)
	}
}

type heuristicResult struct {
	called  []string
	args    []string
	results []string
}

func (s *Service) execHeuristicTools(ctx context.Context, session mcp.Session, msg string) heuristicResult {
	lower := strings.ToLower(msg)

	var called []string

	var argStrs []string

	var results []string

	call := func(name string, raw json.RawMessage) {
		env, err := s.registry.Call(session, name, raw)
		called = append(called, name)
		argStrs = append(argStrs, string(raw))

		if err != nil {
			b, _ := json.Marshal(map[string]any{"error": err.Error()})
			results = append(results, string(b))

			return
		}

		b, _ := json.Marshal(env)
		results = append(results, string(b))
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
		q := extractQuery(msg)
		if q == "" {
			q = "a"
		}

		call("search_customers", json.RawMessage(fmt.Sprintf(`{"query":%q,"limit":5}`, q)))
	case containsAny(lower, "invoice", "ankara", "deni"):
		call("list_invoices", json.RawMessage(`{"limit":5}`))
	default:
		// no heuristic match
	}

	return heuristicResult{called: called, args: argStrs, results: results}
}

func (s *Service) callLLMSynthesis(ctx context.Context, messages []ChatMessage) (string, error) {
	// Synthesis without tools — just generate natural language from tool results already in messages
	type oaMsg struct {
		Role       string         `json:"role"`
		Content    string         `json:"content"`
		ToolCallID string         `json:"tool_call_id,omitempty"`
		ToolCalls  []WireToolCall `json:"tool_calls,omitempty"`
	}

	var oaMsgs []oaMsg
	for _, m := range messages {
		oaMsgs = append(oaMsgs, oaMsg{Role: m.Role, Content: m.Content, ToolCallID: m.ToolCallID, ToolCalls: m.ToolCalls})
	}

	body := map[string]any{
		"messages":    oaMsgs,
		"temperature": 0.2,
	}
	raw, usedModel, err := s.postCompletion(ctx, body)
	if err != nil {
		return "", err
	}
	slog.InfoContext(ctx, "chat LLM synthesis answered", "model", usedModel)

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", err
	}

	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("empty LLM choices")
	}

	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}

func isToolMentionOnly(s string) bool {
	lower := strings.ToLower(s)
	// if it mentions tool name but contains no numbers or KES, likely just narration
	if containsAny(lower, "summarize_sales", "list_low_stock", "should call", "i will call", "need to call") {
		// check if it actually contains data (numbers, JSON, KES)
		if strings.Contains(s, "KES") || strings.Contains(s, "\"total\"") || strings.Contains(s, "\"count\"") {
			return false
		}

		return true
	}

	return false
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

// OpenAI/ OpenRouter compatible chat completions with tools.
type llmToolCall struct {
	ID        string          `json:"id"`
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
		Role       string         `json:"role"`
		Content    string         `json:"content"`
		ToolCallID string         `json:"tool_call_id,omitempty"`
		ToolCalls  []WireToolCall `json:"tool_calls,omitempty"`
	}

	var oaMsgs []oaMsg
	for _, m := range messages {
		// tool role maps to "tool" for OpenAI, but some providers expect "tool"
		oaMsgs = append(oaMsgs, oaMsg{Role: m.Role, Content: m.Content, ToolCallID: m.ToolCallID, ToolCalls: m.ToolCalls})
	}

	body := map[string]any{
		"messages":    oaMsgs,
		"tools":       toolDefs,
		"tool_choice": "auto",
		"temperature": 0.2,
	}

	if len(toolDefs) == 0 {
		delete(body, "tools")
		delete(body, "tool_choice")
	}

	raw, usedModel, err := s.postCompletion(ctx, body)
	if err != nil {
		return nil, err
	}
	slog.InfoContext(ctx, "chat LLM answered", "model", usedModel)

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
		return &llmResponse{Content: choice.Content, ToolCall: &llmToolCall{ID: tc.ID, Name: tc.Function.Name, Arguments: json.RawMessage(tc.Function.Arguments)}}, nil
	}

	return &llmResponse{Content: choice.Content}, nil
}
