package observability

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

const (
	InstrumentationName = "bizsawa.backend"
)

// Tracer returns a tracer for the given workload area.
// name examples: "http.server", "mcp.server", "mcp.tool", "db", "cache"
func Tracer(name string) trace.Tracer {
	if name == "" {
		name = InstrumentationName
	}
	return otel.Tracer(name)
}

// Start creates a span with useful default attributes.
func Start(ctx context.Context, tracerName, spanName string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	tr := Tracer(tracerName)
	return tr.Start(ctx, spanName, trace.WithAttributes(attrs...))
}

// RecordError marks span as error and records exception.
func RecordError(span trace.Span, err error, extraAttrs ...attribute.KeyValue) {
	if err == nil || span == nil {
		return
	}
	span.RecordError(err)
	span.SetStatus(codes.Error, err.Error())
	if len(extraAttrs) > 0 {
		span.SetAttributes(extraAttrs...)
	}
}

// End helpers guarantee status set.

func EndWithStatus(span trace.Span, err error) {
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		span.RecordError(err)
	} else {
		span.SetStatus(codes.Ok, "")
	}
	span.End()
}
