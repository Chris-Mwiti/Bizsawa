package middleware

import "net/http"

func Idempotency(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		key := r.Header.Get("X-Idempotency-Key")
		if key != "" {
			r = r.WithContext(WithIdempotencyKey(r.Context(), key))
		}

		next.ServeHTTP(w, r)
	})
}
