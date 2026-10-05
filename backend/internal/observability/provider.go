package observability

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	promexporter "go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/exporters/stdout/stdoutmetric"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Provider holds shutdown funcs for OTel SDK.
type Provider struct {
	tp  *sdktrace.TracerProvider
	mp  *sdkmetric.MeterProvider
	cfg Config
}

// Setup initializes global OTel tracer/meter providers and propagators.
// Returns shutdown func that should be called on app exit.
func Setup(ctx context.Context, cfg Config) (*Provider, error) {
	if !cfg.Enabled {
		slog.InfoContext(ctx, "observability disabled via OTEL_ENABLED=false")
		// set noop propagator and providers
		otel.SetTracerProvider(sdktrace.NewTracerProvider())
		otel.SetMeterProvider(sdkmetric.NewMeterProvider())
		otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

		return &Provider{cfg: cfg}, nil
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(cfg.ServiceVersion),
			attribute.String("deployment.environment", cfg.Environment),
		),
		resource.WithTelemetrySDK(),
		resource.WithHost(),
		resource.WithOS(),
	)

	if err != nil {
		return nil, fmt.Errorf("otel resource: %w", err)
	}

	// Propagator W3C TraceContext + Baggage
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	var tp *sdktrace.TracerProvider

	if cfg.TracingEnabled {
		var exp sdktrace.SpanExporter

		tracesTarget := cfg.TracesTarget()
		if tracesTarget != "" {
			opts := []otlptracehttp.Option{}
			host, path, plainHTTP := splitEndpoint(tracesTarget)

			if plainHTTP || cfg.Insecure {
				opts = append(opts, otlptracehttp.WithInsecure())
			}

			opts = append(opts, otlptracehttp.WithEndpoint(host))
			// Vendors like Honeycomb ingest on a signal-specific path (/v1/traces).
			// Dropping it silently 404s every export.
			if path != "" {
				opts = append(opts, otlptracehttp.WithURLPath(path))
			}

			if len(cfg.Headers) > 0 {
				opts = append(opts, otlptracehttp.WithHeaders(cfg.Headers))
			}

			exp, err = otlptracehttp.New(ctx, opts...)
			if err != nil {
				return nil, fmt.Errorf("otlp trace exporter: %w", err)
			}

			slog.InfoContext(ctx, "otel tracing via OTLP", "endpoint", tracesTarget, "path", path, "headers", len(cfg.Headers), "service", cfg.ServiceName)
		} else if cfg.StdoutFallback {
			exp, err = stdouttrace.New(stdouttrace.WithPrettyPrint())
			if err != nil {
				return nil, fmt.Errorf("stdout trace exporter: %w", err)
			}

			slog.InfoContext(ctx, "otel tracing via stdout (no OTEL_EXPORTER_OTLP_ENDPOINT)")
		} else {
			slog.InfoContext(ctx, "otel tracing disabled: no endpoint and stdout fallback off")
		}

		var opts []sdktrace.TracerProviderOption

		opts = append(opts, sdktrace.WithResource(res))
		if exp != nil {
			opts = append(opts, sdktrace.WithBatcher(exp, sdktrace.WithBatchTimeout(2*time.Second)))
		}
		// sampling
		if cfg.SampleRatio >= 1 {
			opts = append(opts, sdktrace.WithSampler(sdktrace.AlwaysSample()))
		} else if cfg.SampleRatio <= 0 {
			opts = append(opts, sdktrace.WithSampler(sdktrace.NeverSample()))
		} else {
			opts = append(opts, sdktrace.WithSampler(sdktrace.TraceIDRatioBased(cfg.SampleRatio)))
		}

		tp = sdktrace.NewTracerProvider(opts...)
		otel.SetTracerProvider(tp)
	} else {
		tp = sdktrace.NewTracerProvider(sdktrace.WithResource(res))
		otel.SetTracerProvider(tp)
	}

	var mp *sdkmetric.MeterProvider

	if cfg.MetricsEnabled {
		var readers []sdkmetric.Option

		if cfg.PrometheusEnabled {
			promExp, err := promexporter.New()
			if err != nil {
				slog.WarnContext(ctx, "prometheus exporter failed, continuing without it", "err", err)
			} else {
				readers = append(readers, sdkmetric.WithReader(promExp))

				slog.InfoContext(ctx, "otel prometheus metrics enabled", "service", cfg.ServiceName)
			}
		}

		metricsTarget := cfg.MetricsTarget()
		if metricsTarget != "" {
			metricOpts := []otlpmetrichttp.Option{}
			host, path, plainHTTP := splitEndpoint(metricsTarget)

			if plainHTTP || cfg.Insecure {
				metricOpts = append(metricOpts, otlpmetrichttp.WithInsecure())
			}

			metricOpts = append(metricOpts, otlpmetrichttp.WithEndpoint(host))
			if path != "" {
				metricOpts = append(metricOpts, otlpmetrichttp.WithURLPath(path))
			}

			if len(cfg.Headers) > 0 {
				metricOpts = append(metricOpts, otlpmetrichttp.WithHeaders(cfg.Headers))
			}

			otlpExp, err := otlpmetrichttp.New(ctx, metricOpts...)
			if err != nil {
				slog.WarnContext(ctx, "otlp metric exporter failed", "err", err)
			} else {
				readers = append(readers, sdkmetric.WithReader(sdkmetric.NewPeriodicReader(otlpExp, sdkmetric.WithInterval(15*time.Second))))

				slog.InfoContext(ctx, "otel metrics via OTLP", "endpoint", metricsTarget, "path", path, "headers", len(cfg.Headers))
			}
		} else if cfg.StdoutFallback {
			stdExp, err := stdoutmetric.New()
			if err == nil {
				readers = append(readers, sdkmetric.WithReader(sdkmetric.NewPeriodicReader(stdExp, sdkmetric.WithInterval(30*time.Second))))

				slog.InfoContext(ctx, "otel metrics via stdout")
			}
		}

		if len(readers) == 0 {
			// fallback noop reader to avoid nil meter provider
			slog.InfoContext(ctx, "otel metrics disabled: no exporter configured")
		}

		mOpts := []sdkmetric.Option{sdkmetric.WithResource(res)}
		mOpts = append(mOpts, readers...)
		// add exemplar filter etc if needed
		mp = sdkmetric.NewMeterProvider(mOpts...)
		otel.SetMeterProvider(mp)
	} else {
		mp = sdkmetric.NewMeterProvider(sdkmetric.WithResource(res))
		otel.SetMeterProvider(mp)
	}

	return &Provider{tp: tp, mp: mp, cfg: cfg}, nil
}

func (p *Provider) Shutdown(ctx context.Context) error {
	var firstErr error
	if p.tp != nil {
		if err := p.tp.Shutdown(ctx); err != nil && firstErr == nil {
			firstErr = err
		}
	}

	if p.mp != nil {
		if err := p.mp.Shutdown(ctx); err != nil && firstErr == nil {
			firstErr = err
		}
	}

	return firstErr
}

// splitEndpoint breaks an OTLP endpoint into the "host:port" the exporter wants,
// the URL path which must be preserved separately, and whether the scheme was
// explicit plain HTTP. Honeycomb, for example, only ingests traces on /v1/traces
// and metrics on /v1/metrics, so collapsing the endpoint to host:port alone makes
// every export 404. The scheme is honoured so that an http:// target is never
// dialled over TLS (which the collector, and any local collector, would reject).
func splitEndpoint(raw string) (hostPort string, urlPath string, plainHTTP bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "", false
	}

	scheme := ""
	if idx := strings.Index(raw, "://"); idx != -1 {
		scheme = strings.ToLower(raw[:idx])
		raw = raw[idx+3:]
	}

	u, err := url.Parse("https://" + raw)
	if err != nil || u.Host == "" {
		return strings.TrimSuffix(strings.TrimSpace(raw), "/"), "", scheme == "http"
	}

	return u.Host, strings.TrimSuffix(u.Path, "/"), scheme == "http"
}
