package observability

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// MCPTelemetry wraps Registry/server dispatch to emit traces + metrics for workflow tool calls.
// Goal: during load/spike tests, you can query:
// - mcp.tool.calls / mcp.tool.errors grouped by mcp.tool.name & mcp.profile
// - mcp.tool.duration p50/p95/p99 per tool
// - mcp.workflow.calls grouped by workflow method
// - error rates per tool: sum(mcp.tool.errors)/sum(mcp.tool.calls) by tool

type MCPToolLabels struct {
	Tool    string
	Profile string
	Method  string // for workflow level
}

// StartToolSpan starts a span for a single MCP tool execution.
// Caller must call EndToolSpan.
func StartToolSpan(ctx context.Context, tool, profile string) (context.Context, trace.Span) {
	tracer := Tracer("mcp.tool")
	attrs := []attribute.KeyValue{
		attribute.String("mcp.tool.name", tool),
		attribute.String("mcp.profile", string(profile)),
		attribute.String("component", "mcp.tool"),
	}
	return tracer.Start(ctx, fmt.Sprintf("mcp.tool/%s", tool), trace.WithAttributes(attrs...))
}

// EndToolSpan records metrics, logs, and span status for a tool call.
func EndToolSpan(ctx context.Context, span trace.Span, tool, profile string, start time.Time, err error) {
	durationMs := float64(time.Since(start).Microseconds()) / 1000.0
	status := "ok"
	errType := ""
	if err != nil {
		status = "error"
		errType = errorType(err)
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		span.SetAttributes(attribute.String("error.type", errType))
		slog.ErrorContext(ctx, "mcp tool call failed", "tool", tool, "profile", profile, "err", err, "duration_ms", durationMs, "trace_id", span.SpanContext().TraceID().String())
	} else {
		span.SetStatus(codes.Ok, "")
		slog.InfoContext(ctx, "mcp tool call", "tool", tool, "profile", profile, "duration_ms", durationMs, "trace_id", span.SpanContext().TraceID().String())
	}
	span.SetAttributes(
		attribute.Float64("mcp.tool.duration_ms", durationMs),
		attribute.String("mcp.status", status),
	)
	span.End()

	if mm := GetMetrics(); mm != nil {
		mm.RecordMCPTool(ctx, tool, profile, status, durationMs, errType)
	}
}

// StartWorkflowSpan is for the HTTP RPC layer: initialize | tools/list | tools/call
func StartWorkflowSpan(ctx context.Context, method, profile string) (context.Context, trace.Span) {
	tracer := Tracer("mcp.workflow")
	attrs := []attribute.KeyValue{
		attribute.String("mcp.workflow.method", method),
		attribute.String("mcp.profile", profile),
		attribute.String("component", "mcp.workflow"),
	}
	return tracer.Start(ctx, fmt.Sprintf("mcp.workflow/%s", method), trace.WithAttributes(attrs...))
}

func EndWorkflowSpan(ctx context.Context, span trace.Span, method, profile string, start time.Time, err error) {
	durationMs := float64(time.Since(start).Microseconds()) / 1000.0
	status := "ok"
	if err != nil {
		status = "error"
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	} else {
		span.SetStatus(codes.Ok, "")
	}
	span.SetAttributes(
		attribute.Float64("mcp.workflow.duration_ms", durationMs),
		attribute.String("mcp.status", status),
	)
	span.End()
	if mm := GetMetrics(); mm != nil {
		mm.RecordMCPWorkflow(ctx, method, profile, status, durationMs)
	}
}

func errorType(err error) string {
	if err == nil {
		return ""
	}
	// map known sentinel errors to stable types for metrics cardinality control
	msg := err.Error()
	switch {
	case contains(msg, "tool not found"):
		return "tool_not_found"
	case contains(msg, "permission denied"):
		return "permission_denied"
	case contains(msg, "business context required"):
		return "business_required"
	case contains(msg, "unauthorized"):
		return "unauthorized"
	case contains(msg, "invalid"):
		return "validation_error"
	default:
		return "tool_failed"
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i <= len(s)-len(sub); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
