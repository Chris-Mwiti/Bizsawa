package chat

import "github.com/Codecx-Org/FinAI/backend/internal/mcp"

type Module struct {
	svc      *Service
	handler  *Handler
	registry *mcp.Registry
}

func NewModule(registry *mcp.Registry) *Module {
	svc := NewService(registry)
	h := NewHandler(svc, registry)

	return &Module{svc: svc, handler: h, registry: registry}
}

func (m *Module) Handler() *Handler { return m.handler }
func (m *Module) Service() *Service { return m.svc }
