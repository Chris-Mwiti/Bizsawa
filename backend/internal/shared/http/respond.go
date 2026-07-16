package http

import (
	"encoding/json"
	"log"
	"net/http"

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
	appErr := apperrors.FromError(err)
	message := appErr.Message
	if message == "" {
		message = http.StatusText(appErr.StatusCode)
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
