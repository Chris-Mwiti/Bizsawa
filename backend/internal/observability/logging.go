package observability

import (
	"context"
	"log/slog"
	"os"

	"go.opentelemetry.io/otel/trace"
)

// NewLogger creates a JSON slog logger that enriches every record with trace/span IDs.
// Use this instead of slog.New(slog.NewJSONHandler(...)) so logs correlate to traces in Jaeger/Grafana.
func NewLogger(serviceName string) *slog.Logger {
	h := &TraceHandler{inner: slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		AddSource: false,
		Level:     slog.LevelInfo,
	})}
	logger := slog.New(h).With("service", serviceName)
	slog.SetDefault(logger)

	return logger
}

// TraceHandler injects trace_id/span_id/trace_flags from context into slog records.
type TraceHandler struct {
	inner slog.Handler
}

func (h *TraceHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *TraceHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(
			slog.String("trace_id", sc.TraceID().String()),
			slog.String("span_id", sc.SpanID().String()),
			slog.String("trace_flags", sc.TraceFlags().String()),
		)
	}

	return h.inner.Handle(ctx, r)
}

func (h *TraceHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &TraceHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *TraceHandler) WithGroup(name string) slog.Handler {
	return &TraceHandler{inner: h.inner.WithGroup(name)}
}

// LoggerWithTrace returns a logger enriched with current span context (convenience).
func LoggerWithTrace(ctx context.Context, base *slog.Logger) *slog.Logger {
	if base == nil {
		base = slog.Default()
	}

	sc := trace.SpanContextFromContext(ctx)
	if !sc.IsValid() {
		return base
	}

	return base.With("trace_id", sc.TraceID().String(), "span_id", sc.SpanID().String())
}
