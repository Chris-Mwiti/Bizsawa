package waha

import (
	"log/slog"

	"github.com/go-chi/chi/v5"
)

type Module struct {
	svc    *Service
	logger *slog.Logger
}

func New(baseURL, session, apiKey string, logger *slog.Logger) *Module {
	if logger == nil {
		logger = slog.Default()
	}
	client := NewClient(baseURL, session, apiKey)
	return &Module{svc: NewService(client, logger), logger: logger}
}

func (m *Module) RegisterRoutes(r chi.Router) {
	h := Handler{svc: m.svc}
	r.Post("/send", h.Send)
	r.Post("/notify", h.Notify)
}

func (m *Module) Service() *Service { return m.svc }