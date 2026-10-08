package http

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
)

type Envelope map[string]any

func JSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if payload == nil {
		return
	}

	_ = json.NewEncoder(w).Encode(payload)
}

func Error(w http.ResponseWriter, err error) {
	log.Printf("error while making request: %v", err)

	// Safety net (F1): a duplicate-key/unique violation that escaped service
	// mapping must surface as 409 + Retry-After, never a raw 500/SQLSTATE.
	if err != nil && isDuplicateKeyMessage(err.Error()) {
		if appErr := apperrors.FromError(err); appErr == nil || appErr.StatusCode == 500 {
			w.Header().Set("Retry-After", "1")
			JSON(w, 409, Envelope{
				"error": Envelope{
					"code":    "CONFLICT",
					"message": "document number contention — retry",
				},
			})
			return
		}
	}

	appErr := apperrors.FromError(err)
	message := appErr.Message

	if message == "" {
		message = http.StatusText(appErr.StatusCode)
	}

	if appErr.StatusCode == http.StatusConflict || appErr.StatusCode == http.StatusTooManyRequests {
		w.Header().Set("Retry-After", "1")
	}

	JSON(w, appErr.StatusCode, Envelope{
		"error": Envelope{
			"code":    appErr.Code,
			"message": message,
		},
	})
}

func Decode(r *http.Request, dst any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dst)
}

func isDuplicateKeyMessage(msg string) bool {
	lower := strings.ToLower(msg)
	return strings.Contains(lower, "23505") ||
		strings.Contains(lower, "duplicate key") ||
		strings.Contains(lower, "unique constraint") ||
		strings.Contains(lower, "duplicated key")
}
