package observability

import "testing"

func TestSplitEndpointPreservesPath(t *testing.T) {
	cases := []struct {
		name         string
		in           string
		wantHostPort string
		wantPath     string
		wantPlain    bool
	}{
		{
			name:         "honeycomb traces keeps signal path",
			in:           "https://api.honeycomb.io/v1/traces",
			wantHostPort: "api.honeycomb.io",
			wantPath:     "/v1/traces",
		},
		{
			name:         "honeycomb with explicit port",
			in:           "https://api.honeycomb.io:443/v1/metrics",
			wantHostPort: "api.honeycomb.io:443",
			wantPath:     "/v1/metrics",
		},
		{
			name:         "trailing slash trimmed from path",
			in:           "https://api.honeycomb.io/v1/traces/",
			wantHostPort: "api.honeycomb.io",
			wantPath:     "/v1/traces",
		},
		{
			name:         "collector has no path and is plain http",
			in:           "http://otel-collector:4318",
			wantHostPort: "otel-collector:4318",
			wantPath:     "",
			wantPlain:    true,
		},
		{
			name:         "root path collapses to empty",
			in:           "https://api.honeycomb.io/",
			wantHostPort: "api.honeycomb.io",
			wantPath:     "",
		},
		{
			name:         "bare host without scheme defaults to tls",
			in:           "otel-collector:4318",
			wantHostPort: "otel-collector:4318",
			wantPath:     "",
		},
		{
			name:         "uppercase scheme still detected as plain http",
			in:           "HTTP://otel-collector:4318",
			wantHostPort: "otel-collector:4318",
			wantPath:     "",
			wantPlain:    true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			host, path, plain := splitEndpoint(tc.in)
			if host != tc.wantHostPort {
				t.Errorf("host = %q, want %q", host, tc.wantHostPort)
			}
			if path != tc.wantPath {
				t.Errorf("path = %q, want %q", path, tc.wantPath)
			}
			if plain != tc.wantPlain {
				t.Errorf("plainHTTP = %v, want %v", plain, tc.wantPlain)
			}
		})
	}
}

func TestSplitEndpointEmpty(t *testing.T) {
	host, path, plain := splitEndpoint("   ")
	if host != "" || path != "" || plain {
		t.Errorf("blank endpoint = (%q, %q, %v), want empty", host, path, plain)
	}
}

func TestConfigSignalEndpointFallback(t *testing.T) {
	generic := Config{Endpoint: "http://otel-collector:4318"}
	if got := generic.TracesTarget(); got != "http://otel-collector:4318" {
		t.Errorf("traces fallback = %q", got)
	}
	if got := generic.MetricsTarget(); got != "http://otel-collector:4318" {
		t.Errorf("metrics fallback = %q", got)
	}

	split := Config{
		Endpoint:        "http://otel-collector:4318",
		TracesEndpoint:  "https://api.honeycomb.io/v1/traces",
		MetricsEndpoint: "https://api.honeycomb.io/v1/metrics",
	}
	if got := split.TracesTarget(); got != "https://api.honeycomb.io/v1/traces" {
		t.Errorf("traces override = %q", got)
	}
	if got := split.MetricsTarget(); got != "https://api.honeycomb.io/v1/metrics" {
		t.Errorf("metrics override = %q", got)
	}
}
