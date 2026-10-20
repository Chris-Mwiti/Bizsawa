package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// preflight sends a CORS preflight for the given origin/method/headers.
func preflight(t *testing.T, origin, method, reqHeaders string) *httptest.ResponseRecorder {
	t.Helper()

	handler := corsHandler([]string{"http://localhost:*", "http://127.0.0.1:*", "http://192.168.*"})(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }),
	)

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/businesses", nil)
	req.Header.Set("Origin", origin)
	req.Header.Set("Access-Control-Request-Method", method)
	if reqHeaders != "" {
		req.Header.Set("Access-Control-Request-Headers", reqHeaders)
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	return rec
}

// The web build sends X-Device-Id on every request. go-chi/cors aborts the
// preflight — replying without Access-Control-Allow-Origin — when a requested
// header is missing from the allowlist, and the browser then reports the
// request as "blocked by CORS policy". Native clients are exempt from CORS, so
// a header missing here breaks only the web build.
func TestCORSPreflightAllowsClientHeaders(t *testing.T) {
	// Every header the clients set: mobile/lib/api.ts + mobile/sync/client.ts.
	headers := "authorization,content-type,x-device-id,x-business-id,x-idempotency-key"

	for _, origin := range []string{
		"http://localhost:8081",
		"http://127.0.0.1:8081",
		"http://192.168.100.35:8081",
	} {
		for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
			rec := preflight(t, origin, method, headers)

			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != origin {
				t.Fatalf("%s %s: Access-Control-Allow-Origin = %q, want %q", method, origin, got, origin)
			}

			allowed := rec.Header().Get("Access-Control-Allow-Headers")
			for _, want := range []string{"authorization", "content-type", "x-device-id", "x-business-id", "x-idempotency-key"} {
				if !containsHeader(allowed, want) {
					t.Fatalf("%s %s: Access-Control-Allow-Headers = %q, missing %q", method, origin, allowed, want)
				}
			}
		}
	}
}

// Every custom header the clients send must be allowlisted, so a new client
// header cannot silently break the web build.
func TestCORSAllowedHeadersCoverClientHeaders(t *testing.T) {
	for _, want := range []string{
		"Accept",
		"Authorization",
		"Content-Type",
		"X-Business-ID",
		"X-Device-Id",
		"X-Idempotency-Key",
		"X-Request-ID",
	} {
		found := false
		for _, h := range corsAllowedHeaders {
			if h == want {
				found = true
				break
			}
		}

		if !found {
			t.Fatalf("corsAllowedHeaders is missing %q (have %v)", want, corsAllowedHeaders)
		}
	}
}

// A disallowed origin must still be rejected — the wildcard matching must not
// have been loosened into "allow everything".
func TestCORSRejectsUnknownOrigin(t *testing.T) {
	rec := preflight(t, "https://evil.example.com", "GET", "authorization")

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no Access-Control-Allow-Origin for a disallowed origin, got %q", got)
	}
}

// containsHeader reports whether the comma-separated header list contains want
// (case-insensitively).
func containsHeader(list, want string) bool {
	for _, part := range splitAndTrim(list) {
		if equalFold(part, want) {
			return true
		}
	}

	return false
}

func splitAndTrim(s string) []string {
	out := []string{}
	cur := ""

	for _, r := range s {
		if r == ',' {
			out = append(out, trimSpace(cur))
			cur = ""
			continue
		}

		cur += string(r)
	}

	return append(out, trimSpace(cur))
}

func trimSpace(s string) string {
	start := 0
	end := len(s)

	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}

	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}

	return s[start:end]
}

func equalFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}

	for i := 0; i < len(a); i++ {
		ca, cb := a[i], b[i]
		if 'A' <= ca && ca <= 'Z' {
			ca += 'a' - 'A'
		}

		if 'A' <= cb && cb <= 'Z' {
			cb += 'a' - 'A'
		}

		if ca != cb {
			return false
		}
	}

	return true
}
