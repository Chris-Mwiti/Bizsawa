package authz

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type fakeMembershipResolver struct {
	role Role
}

func (f fakeMembershipResolver) RoleForUser(context.Context, uuid.UUID, uuid.UUID) (Role, error) {
	return f.role, nil
}

func TestDefaultPolicyCashier(t *testing.T) {
	enforcer := NewEnforcer(fakeMembershipResolver{role: RoleCashier})

	if !enforcer.Allowed(RoleCashier, "sales", "write") {
		t.Fatal("cashier should be allowed to create sales")
	}
	if enforcer.Allowed(RoleCashier, "reports", "generate") {
		t.Fatal("cashier should not be allowed to generate reports")
	}
}

func TestResourceActionMapsNestedMembersRoute(t *testing.T) {
	r := chi.NewRouter()
	r.Route("/api/v1/businesses/{businessID}/members", func(r chi.Router) {
		r.Post("/invite", func(w http.ResponseWriter, r *http.Request) {
			resource, action := ResourceAction(r)
			if resource != "members" {
				t.Fatalf("resource = %q, want members", resource)
			}
			if action != "write" {
				t.Fatalf("action = %q, want write", action)
			}
		})
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/businesses/"+uuid.NewString()+"/members/invite", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
}
