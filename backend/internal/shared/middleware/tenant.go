package middleware

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func TenantResolution(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		businessID := chi.URLParam(r, "businessID")
		if businessID == "" {
			businessID = chi.URLParam(r, "bizID")
		}
		if businessID == "" {
			businessID = r.Header.Get("X-Business-ID")
		}

		ctx := r.Context()
		if parsed, err := uuid.Parse(businessID); err == nil {
			ctx = WithBusinessID(ctx, parsed)
			// Phase 2 replaces this placeholder with a membership lookup.
			ctx = WithTenantID(ctx, parsed)
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
