package powersync

import (
	"github.com/go-chi/chi/v5"

	"github.com/Codecx-Org/FinAI/backend/internal/shared/config"
)

type Module struct {
	svc *TokenService
	h   *Handler
}

func New(cfg config.PowerSyncConfig) *Module {
	svc := NewTokenService(cfg)
	return &Module{svc: svc, h: NewHandler(svc)}
}

func (m *Module) Service() *TokenService { return m.svc }

func (m *Module) RegisterRoutes(r chi.Router) {
	r.Post("/token", m.h.Token)
}
