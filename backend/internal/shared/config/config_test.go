package config

import "testing"

func TestParseOTLPHeaders(t *testing.T) {
	t.Run("single honeycomb team header", func(t *testing.T) {
		got := ParseOTLPHeaders("x-honeycomb-team=abc123")
		if len(got) != 1 || got["x-honeycomb-team"] != "abc123" {
			t.Fatalf("got %#v", got)
		}
	})

	t.Run("multiple headers", func(t *testing.T) {
		got := ParseOTLPHeaders("x-honeycomb-team=abc123,x-honeycomb-dataset=bizsawa-api")
		if len(got) != 2 {
			t.Fatalf("len = %d, want 2: %#v", len(got), got)
		}

		if got["x-honeycomb-dataset"] != "bizsawa-api" {
			t.Errorf("dataset = %q", got["x-honeycomb-dataset"])
		}
	})

	t.Run("value containing base64 padding keeps only first separator", func(t *testing.T) {
		got := ParseOTLPHeaders("authorization=Basic dXNlcjpwYXNz==")
		if got["authorization"] != "Basic dXNlcjpwYXNz==" {
			t.Fatalf("got %q", got["authorization"])
		}
	})

	t.Run("percent encoded value is decoded", func(t *testing.T) {
		got := ParseOTLPHeaders("x-team=a%2Bb%2Fc")
		if got["x-team"] != "a+b/c" {
			t.Fatalf("got %q", got["x-team"])
		}
	})

	t.Run("empty and malformed input yields nil", func(t *testing.T) {
		for _, raw := range []string{"", "   ", "no-equals-sign", ",,", "=novalue"} {
			if got := ParseOTLPHeaders(raw); got != nil {
				t.Errorf("ParseOTLPHeaders(%q) = %#v, want nil", raw, got)
			}
		}
	})

	t.Run("trims surrounding whitespace", func(t *testing.T) {
		got := ParseOTLPHeaders(" x-honeycomb-team = abc123 ")
		if got["x-honeycomb-team"] != "abc123" {
			t.Fatalf("got %#v", got)
		}
	})
}

func TestObservabilitySignalTargetFallback(t *testing.T) {
	generic := ObservabilityConfig{Endpoint: "http://otel-collector:4318"}
	if got := generic.TracesTarget(); got != "http://otel-collector:4318" {
		t.Errorf("traces fallback = %q", got)
	}

	if got := generic.MetricsTarget(); got != "http://otel-collector:4318" {
		t.Errorf("metrics fallback = %q", got)
	}

	override := ObservabilityConfig{
		Endpoint:        "http://otel-collector:4318",
		TracesEndpoint:  "https://api.honeycomb.io/v1/traces",
		MetricsEndpoint: "https://api.honeycomb.io/v1/metrics",
	}

	if got := override.TracesTarget(); got != "https://api.honeycomb.io/v1/traces" {
		t.Errorf("traces override = %q", got)
	}

	if got := override.MetricsTarget(); got != "https://api.honeycomb.io/v1/metrics" {
		t.Errorf("metrics override = %q", got)
	}
}
