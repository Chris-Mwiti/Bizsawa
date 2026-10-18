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

		if businessID == "" {
			businessID = r.Header.Get("x-business-id")
		}

		if businessID == "" {
			businessID = r.URL.Query().Get("businessId")
		}

		if businessID == "" {
			businessID = r.URL.Query().Get("business_id")
		}

		ctx := r.Context()
		if parsed, err := uuid.Parse(businessID); err == nil {
			ctx = WithBusinessID(ctx, parsed)
			// Phase 2 replaces this placeholder with a membership lookup.
			ctx = WithTenantID(ctx, parsed)
		}

		// Stable install identity for sync writer attribution. Any client
		// may send it; absence simply means "unknown writer" downstream.
		if deviceID := r.Header.Get("X-Device-Id"); deviceID != "" {
			ctx = WithDeviceID(ctx, deviceID)
		} else if deviceID := r.Header.Get("x-device-id"); deviceID != "" {
			ctx = WithDeviceID(ctx, deviceID)
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
