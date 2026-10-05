package observability

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
)

// Config holds OpenTelemetry configuration following OTel env conventions
// plus BizSawa-specific knobs for load/spike testing visibility.
type Config struct {
	Enabled           bool
	ServiceName       string
	ServiceVersion    string
	Environment       string
	Endpoint          string // OTEL_EXPORTER_OTLP_ENDPOINT e.g. http://otel-collector:4318
	TracesEndpoint    string // OTEL_EXPORTER_OTLP_TRACES_ENDPOINT; falls back to Endpoint
	MetricsEndpoint   string // OTEL_EXPORTER_OTLP_METRICS_ENDPOINT; falls back to Endpoint
	Headers           map[string]string
	Insecure          bool
	SampleRatio       float64 // 0.0 - 1.0
	TracingEnabled    bool
	MetricsEnabled    bool
	PrometheusEnabled bool
	MetricsAddr       string // if Prometheus pull, separate addr or reuse main
	StdoutFallback    bool   // emit to stdout when no OTLP endpoint (dev mode)
}

// LoadConfig loads OTel config from env with sensible defaults.
func LoadConfig(serviceName, env string) Config {
	return Config{
		Enabled:           boolEnv("OTEL_ENABLED", true),
		ServiceName:       envOr("OTEL_SERVICE_NAME", serviceName),
		ServiceVersion:    envOr("OTEL_SERVICE_VERSION", envOr("APP_VERSION", "0.1.0")),
		Environment:       envOr("OTEL_ENVIRONMENT", env),
		Endpoint:          strings.TrimRight(strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")), "/"),
		Insecure:          boolEnv("OTEL_EXPORTER_OTLP_INSECURE", true),
		SampleRatio:       floatEnv("OTEL_TRACES_SAMPLER_ARG", floatEnv("OTEL_SAMPLE_RATIO", 1.0)),
		TracingEnabled:    boolEnv("OTEL_TRACES_ENABLED", true),
		MetricsEnabled:    boolEnv("OTEL_METRICS_ENABLED", true),
		PrometheusEnabled: boolEnv("OTEL_PROMETHEUS_ENABLED", true),
		MetricsAddr:       envOr("OTEL_PROMETHEUS_ADDR", ""),
		StdoutFallback:    boolEnv("OTEL_STDOUT_FALLBACK", boolEnv("OTEL_DEBUG", env == "development")),
		TracesEndpoint:    strings.TrimRight(strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")), "/"),
		MetricsEndpoint:   strings.TrimRight(strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT")), "/"),
		Headers:           config.ParseOTLPHeaders(os.Getenv("OTEL_EXPORTER_OTLP_HEADERS")),
	}
}

// TracesTarget returns the effective OTLP traces endpoint, preferring the
// signal-specific override over the generic one.
func (c Config) TracesTarget() string {
	if c.TracesEndpoint != "" {
		return c.TracesEndpoint
	}

	return c.Endpoint
}

// MetricsTarget returns the effective OTLP metrics endpoint, preferring the
// signal-specific override over the generic one.
func (c Config) MetricsTarget() string {
	if c.MetricsEndpoint != "" {
		return c.MetricsEndpoint
	}

	return c.Endpoint
}

func envOr(k, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}

	return fallback
}

func boolEnv(k string, fb bool) bool {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return fb
	}

	b, err := strconv.ParseBool(v)
	if err != nil {
		return fb
	}

	return b
}

func floatEnv(k string, fb float64) float64 {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return fb
	}

	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return fb
	}

	if f < 0 {
		return 0
	}

	if f > 1 {
		return 1
	}

	return f
}

func durationEnv(k string, fb time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return fb
	}

	d, err := time.ParseDuration(v)
	if err != nil {
		return fb
	}

	return d
}
