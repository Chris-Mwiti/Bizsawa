package authz

import (
	"context"
	"net/http"
	"strings"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
	"github.com/Codecx-Org/FinAI/backend/internal/shared/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Role string

const (
	RoleOwner   Role = "OWNER"
	RoleManager Role = "MANAGER"
	RoleCashier Role = "CASHIER"
	RoleViewer  Role = "VIEWER"
)

type MembershipResolver interface {
	RoleForUser(ctx context.Context, businessID uuid.UUID, userID uuid.UUID) (Role, error)
}

type Enforcer struct {
	members MembershipResolver
	policy  map[Role]map[string]map[string]bool
}

func NewEnforcer(members MembershipResolver) *Enforcer {
	e := &Enforcer{members: members, policy: map[Role]map[string]map[string]bool{}}
	e.seedDefaults()
	return e
}

func (e *Enforcer) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := middleware.UserIDFromCtx(r.Context())
		if !ok {
			sharedhttp.Error(w, ErrForbidden())
			return
		}

		businessID, ok := middleware.BusinessIDFromCtx(r.Context())
		if !ok {
			sharedhttp.Error(w, ErrBusinessRequired())
			return
		}

		resource, action := ResourceAction(r)
		role, err := e.members.RoleForUser(r.Context(), businessID, userID)
		if err != nil || !e.Allowed(role, resource, action) {
			sharedhttp.Error(w, ErrForbidden())
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (e *Enforcer) Allowed(role Role, resource, action string) bool {
	resources, ok := e.policy[role]
	if !ok {
		return false
	}
	actions, ok := resources[resource]
	if !ok {
		return false
	}
	return actions[action] || actions["*"]
}

func ResourceAction(r *http.Request) (string, string) {
	pattern := chi.RouteContext(r.Context()).RoutePattern()
	parts := strings.Split(strings.Trim(pattern, "/"), "/")
	resource := "unknown"
	for i, part := range parts {
		if part == "v1" && i+1 < len(parts) {
			resource = parts[i+1]
			break
		}
	}
	if resource == "businesses" && strings.Contains(pattern, "/members") {
		resource = "members"
	}

	switch r.Method {
	case http.MethodGet:
		return resource, "read"
	case http.MethodPost:
		return resource, "write"
	case http.MethodPut, http.MethodPatch:
		return resource, "write"
	case http.MethodDelete:
		return resource, "delete"
	default:
		return resource, "read"
	}
}

func (e *Enforcer) allow(role Role, resource string, actions ...string) {
	if e.policy[role] == nil {
		e.policy[role] = map[string]map[string]bool{}
	}
	if e.policy[role][resource] == nil {
		e.policy[role][resource] = map[string]bool{}
	}
	for _, action := range actions {
		e.policy[role][resource][action] = true
	}
}

func (e *Enforcer) seedDefaults() {
	for _, resource := range []string{"businesses", "members", "products", "customers", "orders", "sales", "inventory", "expenses", "taxes", "invoices", "payments", "reports", "visualizations", "insights", "ai", "whatsapp"} {
		e.allow(RoleOwner, resource, "read", "write", "delete", "generate", "configure")
	}
	for _, resource := range []string{"businesses", "members", "products", "customers", "orders", "sales", "inventory", "expenses", "taxes", "invoices", "reports", "visualizations", "insights", "ai", "whatsapp"} {
		e.allow(RoleManager, resource, "read", "write", "generate", "configure")
	}
	e.allow(RoleCashier, "products", "read")
	e.allow(RoleCashier, "customers", "read", "write")
	e.allow(RoleCashier, "orders", "read", "write")
	e.allow(RoleCashier, "sales", "read", "write")
	e.allow(RoleCashier, "inventory", "read")
	e.allow(RoleCashier, "expenses", "read", "write")
	e.allow(RoleCashier, "invoices", "read")
	e.allow(RoleCashier, "insights", "read")
	e.allow(RoleCashier, "visualizations", "read")
	for _, resource := range []string{"products", "customers", "orders", "sales", "inventory", "reports", "visualizations", "insights"} {
		e.allow(RoleViewer, resource, "read")
	}
}
