package observability

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/stdout/stdoutmetric"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	promexporter "go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Provider holds shutdown funcs for OTel SDK.
type Provider struct {
	tp *sdktrace.TracerProvider
	mp *sdkmetric.MeterProvider
	cfg Config
}

// Setup initializes global OTel tracer/meter providers and propagators.
// Returns shutdown func that should be called on app exit.
func Setup(ctx context.Context, cfg Config) (*Provider, error) {
	if !cfg.Enabled {
		slog.Info("observability disabled via OTEL_ENABLED=false")
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
		if cfg.Endpoint != "" {
			opts := []otlptracehttp.Option{}
			if cfg.Insecure {
				opts = append(opts, otlptracehttp.WithInsecure())
			}
			// endpoint is like http://collector:4318 -> client expects "collector:4318"
			// otlptracehttp.WithEndpoint expects host:port without scheme
			endpoint := stripScheme(cfg.Endpoint)
			opts = append(opts, otlptracehttp.WithEndpoint(endpoint))
			exp, err = otlptracehttp.New(ctx, opts...)
			if err != nil {
				return nil, fmt.Errorf("otlp trace exporter: %w", err)
			}
			slog.Info("otel tracing via OTLP", "endpoint", cfg.Endpoint, "service", cfg.ServiceName)
		} else if cfg.StdoutFallback {
			exp, err = stdouttrace.New(stdouttrace.WithPrettyPrint())
			if err != nil {
				return nil, fmt.Errorf("stdout trace exporter: %w", err)
			}
			slog.Info("otel tracing via stdout (no OTEL_EXPORTER_OTLP_ENDPOINT)")
		} else {
			slog.Info("otel tracing disabled: no endpoint and stdout fallback off")
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
				slog.Warn("prometheus exporter failed, continuing without it", "err", err)
			} else {
				readers = append(readers, sdkmetric.WithReader(promExp))
				slog.Info("otel prometheus metrics enabled", "service", cfg.ServiceName)
			}
		}

		if cfg.Endpoint != "" {
			metricOpts := []otlpmetrichttp.Option{}
			if cfg.Insecure {
				metricOpts = append(metricOpts, otlpmetrichttp.WithInsecure())
			}
			metricOpts = append(metricOpts, otlpmetrichttp.WithEndpoint(stripScheme(cfg.Endpoint)))
			otlpExp, err := otlpmetrichttp.New(ctx, metricOpts...)
			if err != nil {
				slog.Warn("otlp metric exporter failed", "err", err)
			} else {
				readers = append(readers, sdkmetric.WithReader(sdkmetric.NewPeriodicReader(otlpExp, sdkmetric.WithInterval(15*time.Second))))
				slog.Info("otel metrics via OTLP", "endpoint", cfg.Endpoint)
			}
		} else if cfg.StdoutFallback {
			stdExp, err := stdoutmetric.New()
			if err == nil {
				readers = append(readers, sdkmetric.WithReader(sdkmetric.NewPeriodicReader(stdExp, sdkmetric.WithInterval(30*time.Second))))
				slog.Info("otel metrics via stdout")
			}
		}

		if len(readers) == 0 {
			// fallback noop reader to avoid nil meter provider
			slog.Info("otel metrics disabled: no exporter configured")
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

func stripScheme(endpoint string) string {
	// otlptracehttp.WithEndpoint expects host:port, not https://...
	// handle http://host:4318 and https://host:4318 and host:4318
	s := endpoint
	if len(s) > 7 && s[:7] == "http://" {
		s = s[7:]
	} else if len(s) > 8 && s[:8] == "https://" {
		s = s[8:]
	}
	// strip trailing /v1/traces etc if user passed full path
	if idx := indexOf(s, "/"); idx != -1 {
		s = s[:idx]
	}
	return s
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
