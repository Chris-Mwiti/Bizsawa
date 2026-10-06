package observability

import (
	"context"
	"sync"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

var (
	once sync.Once
	m    *Metrics
)

// Metrics holds all custom instruments.
// Compliant with OTEL semantic conventions + BizSawa domain extensions for MCP workflows.
type Metrics struct {
	// HTTP server
	httpRequests metric.Int64Counter
	httpDuration metric.Float64Histogram
	httpErrors   metric.Int64Counter
	httpActive   metric.Int64UpDownCounter

	// MCP workflow / tool layer
	mcpToolCalls     metric.Int64Counter
	mcpToolDuration  metric.Float64Histogram
	mcpToolErrors    metric.Int64Counter
	mcpActiveCalls   metric.Int64UpDownCounter
	workflowCalls    metric.Int64Counter
	workflowDuration metric.Float64Histogram
	workflowErrors   metric.Int64Counter

	// Domain / infrastructure auxiliary
	dbDuration  metric.Float64Histogram
	cacheOps    metric.Int64Counter
	queueJobs   metric.Int64Counter
	queueErrors metric.Int64Counter
}

func InitMetrics() (*Metrics, error) {
	var initErr error

	once.Do(func() {
		mp := otel.GetMeterProvider()
		meter := mp.Meter("bizsawa.observability")

		var err error

		m = &Metrics{}

		m.httpRequests, err = meter.Int64Counter("http.server.requests",
			metric.WithDescription("Total HTTP requests"),
			metric.WithUnit("{request}"))

		if err != nil {
			initErr = err
			return
		}

		m.httpDuration, err = meter.Float64Histogram("http.server.duration",
			metric.WithDescription("HTTP request duration"),
			metric.WithUnit("ms"),
			metric.WithExplicitBucketBoundaries(5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000))

		if err != nil {
			initErr = err
			return
		}

		m.httpErrors, err = meter.Int64Counter("http.server.errors",
			metric.WithDescription("HTTP error responses (4xx/5xx)"),
			metric.WithUnit("{error}"))

		if err != nil {
			initErr = err
			return
		}

		m.httpActive, err = meter.Int64UpDownCounter("http.server.active_requests",
			metric.WithDescription("Active HTTP requests"))

		if err != nil {
			initErr = err
			return
		}

		m.mcpToolCalls, err = meter.Int64Counter("mcp.tool.calls",
			metric.WithDescription("Total MCP tool invocations"),
			metric.WithUnit("{call}"))

		if err != nil {
			initErr = err
			return
		}

		m.mcpToolDuration, err = meter.Float64Histogram("mcp.tool.duration",
			metric.WithDescription("MCP tool execution duration"),
			metric.WithUnit("ms"),
			metric.WithExplicitBucketBoundaries(1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000))

		if err != nil {
			initErr = err
			return
		}

		m.mcpToolErrors, err = meter.Int64Counter("mcp.tool.errors",
			metric.WithDescription("MCP tool errors"),
			metric.WithUnit("{error}"))

		if err != nil {
			initErr = err
			return
		}

		m.mcpActiveCalls, err = meter.Int64UpDownCounter("mcp.tool.active",
			metric.WithDescription("Active MCP tool calls"))

		if err != nil {
			initErr = err
			return
		}

		m.workflowCalls, err = meter.Int64Counter("mcp.workflow.calls",
			metric.WithDescription("MCP workflow RPC calls (tools/list, tools/call, initialize)"),
			metric.WithUnit("{call}"))

		if err != nil {
			initErr = err
			return
		}

		m.workflowDuration, err = meter.Float64Histogram("mcp.workflow.duration",
			metric.WithDescription("MCP workflow RPC duration"),
			metric.WithUnit("ms"),
			metric.WithExplicitBucketBoundaries(1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000))

		if err != nil {
			initErr = err
			return
		}

		m.workflowErrors, err = meter.Int64Counter("mcp.workflow.errors",
			metric.WithDescription("MCP workflow RPC errors"),
			metric.WithUnit("{error}"))

		if err != nil {
			initErr = err
			return
		}

		m.dbDuration, err = meter.Float64Histogram("db.query.duration",
			metric.WithDescription("DB query duration"), metric.WithUnit("ms"))

		if err != nil {
			initErr = err
			return
		}

		m.cacheOps, err = meter.Int64Counter("cache.operations",
			metric.WithDescription("Cache operations"), metric.WithUnit("{op}"))

		if err != nil {
			initErr = err
			return
		}

		m.queueJobs, err = meter.Int64Counter("queue.jobs",
			metric.WithDescription("Background queue jobs processed"), metric.WithUnit("{job}"))

		if err != nil {
			initErr = err
			return
		}

		m.queueErrors, err = meter.Int64Counter("queue.errors",
			metric.WithDescription("Background queue job errors"), metric.WithUnit("{error}"))

		if err != nil {
			initErr = err
			return
		}
	})

	return m, initErr
}

// Get lazily initialises if needed.
func GetMetrics() *Metrics {
	if m == nil {
		_, _ = InitMetrics()
	}

	return m
}

// ---------- HTTP helpers ----------

func (mm *Metrics) RecordHTTP(ctx context.Context, method, route string, status int, durationMs float64) {
	if mm == nil {
		return
	}

	attrs := []attribute.KeyValue{
		attribute.String("http.method", method),
		attribute.String("http.route", route),
		semconv.HTTPResponseStatusCode(status),
	}
	mm.httpRequests.Add(ctx, 1, metric.WithAttributes(attrs...))
	mm.httpDuration.Record(ctx, durationMs, metric.WithAttributes(attrs...))

	if status >= 400 {
		// extra error class attribute
		errAttrs := append(attrs, attribute.String("error.type", httpStatusClass(status)))
		mm.httpErrors.Add(ctx, 1, metric.WithAttributes(errAttrs...))
	}
}

func (mm *Metrics) IncActiveHTTP(ctx context.Context, method, route string, delta int64) {
	if mm == nil {
		return
	}

	mm.httpActive.Add(ctx, delta, metric.WithAttributes(attribute.String("http.method", method), attribute.String("http.route", route)))
}

// ---------- MCP helpers ----------

func (mm *Metrics) RecordMCPTool(ctx context.Context, tool, profile, status string, durationMs float64, errType string) {
	if mm == nil {
		return
	}

	attrs := []attribute.KeyValue{
		attribute.String("mcp.tool.name", tool),
		attribute.String("mcp.profile", profile),
		attribute.String("mcp.status", status), // ok | error
	}
	mm.mcpToolCalls.Add(ctx, 1, metric.WithAttributes(attrs...))
	mm.mcpToolDuration.Record(ctx, durationMs, metric.WithAttributes(attrs...))

	if status == "error" {
		eAttrs := append(attrs, attribute.String("error.type", errType))
		mm.mcpToolErrors.Add(ctx, 1, metric.WithAttributes(eAttrs...))
	}
}

func (mm *Metrics) IncActiveMCP(ctx context.Context, tool, profile string, delta int64) {
	if mm == nil {
		return
	}

	mm.mcpActiveCalls.Add(ctx, delta, metric.WithAttributes(attribute.String("mcp.tool.name", tool), attribute.String("mcp.profile", profile)))
}

func (mm *Metrics) RecordMCPWorkflow(ctx context.Context, method, profile string, status string, durationMs float64) {
	if mm == nil {
		return
	}

	attrs := []attribute.KeyValue{
		attribute.String("mcp.workflow.method", method), // initialize | tools/list | tools/call
		attribute.String("mcp.profile", profile),
		attribute.String("mcp.status", status),
	}
	mm.workflowCalls.Add(ctx, 1, metric.WithAttributes(attrs...))
	mm.workflowDuration.Record(ctx, durationMs, metric.WithAttributes(attrs...))

	if status == "error" {
		mm.workflowErrors.Add(ctx, 1, metric.WithAttributes(attrs...))
	}
}

func httpStatusClass(code int) string {
	switch {
	case code >= 500:
		return "5xx"
	case code >= 400:
		return "4xx"
	case code >= 300:
		return "3xx"
	case code >= 200:
		return "2xx"
	default:
		return "1xx"
	}
}
