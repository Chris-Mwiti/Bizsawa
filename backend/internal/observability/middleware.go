package observability

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/felixge/httpsnoop"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

// HTTPMiddleware instruments every HTTP request with:
// - distributed trace (W3C TraceContext)
// - metrics (requests, duration, errors, active)
// - structured logging correlation (trace_id in logs)
// Works for both API and MCP server. Place early in chi chain.
func HTTPMiddleware(serviceName string) func(http.Handler) http.Handler {
	metrics := GetMetrics()
	tracer := Tracer("http.server")
	propagator := otel.GetTextMapPropagator()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract remote context (handles load-tester injection via traceparent)
			ctx := propagator.Extract(r.Context(), propagation.HeaderCarrier(r.Header))

			// fallback route before handling
			route := r.URL.Path
			if rc := chi.RouteContext(r.Context()); rc != nil && rc.RoutePattern() != "" {
				route = rc.RoutePattern()
			}

			spanName := fmt.Sprintf("%s %s", r.Method, route)
			attrs := []attribute.KeyValue{
				semconv.HTTPRequestMethodKey.String(r.Method),
				semconv.URLPath(route),
				semconv.URLScheme(r.URL.Scheme),
				semconv.NetworkProtocolVersion(r.Proto),
				semconv.HTTPRoute(route),
				attribute.String("service.name", serviceName),
			}
			if ua := r.UserAgent(); ua != "" {
				attrs = append(attrs, semconv.UserAgentOriginal(ua))
			}
			if host := r.Host; host != "" {
				attrs = append(attrs, semconv.ServerAddress(host))
			}
			// add client IP
			if ip := r.RemoteAddr; ip != "" {
				attrs = append(attrs, semconv.ClientAddress(ip))
			}

			ctx, span := tracer.Start(ctx, spanName,
				trace.WithSpanKind(trace.SpanKindServer),
				trace.WithAttributes(attrs...),
			)
			defer span.End()

			// inject context so downstream handlers see span
			r = r.WithContext(ctx)

			if metrics != nil {
				metrics.IncActiveHTTP(ctx, r.Method, route, 1)
				defer metrics.IncActiveHTTP(ctx, r.Method, route, -1)
			}

			// Capture status & duration via httpsnoop
			start := time.Now()
			m := httpsnoop.CaptureMetrics(next, w, r)
			durationMs := float64(time.Since(start).Microseconds()) / 1000.0
			if m.Code == 0 {
				m.Code = http.StatusOK
			}

			// Re-resolve route after handler (chi populates RoutePattern during dispatch)
			finalRoute := route
			if rc := chi.RouteContext(r.Context()); rc != nil && rc.RoutePattern() != "" {
				finalRoute = rc.RoutePattern()
			}

			// enrich span
			span.SetAttributes(
				semconv.HTTPResponseStatusCode(m.Code),
				attribute.Int64("http.request.body.size", r.ContentLength),
				attribute.Int64("http.response.body.size", m.Written),
				attribute.Float64("http.server.duration_ms", durationMs),
				semconv.HTTPRoute(finalRoute),
			)
			if m.Code >= 500 {
				span.SetStatus(codes.Error, fmt.Sprintf("http %d", m.Code))
			} else if m.Code >= 400 {
				span.SetStatus(codes.Error, fmt.Sprintf("http %d", m.Code))
				// don't mark 4xx as exception, but set error status for visibility
			} else {
				span.SetStatus(codes.Ok, "")
			}

			if metrics != nil {
				metrics.RecordHTTP(ctx, r.Method, finalRoute, m.Code, durationMs)
			}
		})
	}
}

// MetricsHandler exposes Prometheus exposition at /metrics using OTel prometheus exporter.
// The otel prometheus exporter registers with default global meter; it writes to the ResponseWriter when called via promhttp.
// Since otel's prom exporter doesn't expose handler directly, we bridge via otel's prom HTTP handler.
// If prometheus exporter not enabled, this returns a no-op (still responds 200 with empty).
func MetricsHandler() http.HandlerFunc {
	// The prometheus exporter registers itself as an HTTP handler via the global prometheus registry.
	// Importing prom exporter side-effect registers default Gatherer. We lazily try to get it.
	return func(w http.ResponseWriter, r *http.Request) {
		// Use otel prometheus handler if available, else fallback to basic text.
		// The otel prometheus exporter internally uses prometheus/client_golang default registry.
		// We delegate to promhttp if present; import guard avoids hard dependency.
		if promHandler := prometheusHandler(); promHandler != nil {
			promHandler.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("# metrics: prometheus exporter not enabled (set OTEL_PROMETHEUS_ENABLED=true)\n"))
	}
}

func prometheusHandler() http.Handler {
	// lazy load to avoid import cycle if prometheus client not present
	// we check if metrics were initialized with prometheus exporter
	// If init, the global prometheus registry already has metrics.
	// We use the promhttp handler dynamically via reflection fallback.
	// Simpler: import promhttp in separate file with build tag — here we do direct import check.
	// To keep dependencies minimal, we attempt to load promhttp via interface.
	return getPromHTTPHandler()
}
