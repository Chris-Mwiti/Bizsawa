package auth

import (
	"net/http"

	sharedhttp "github.com/Codecx-Org/FinAI/backend/internal/shared/http"
)

type Handler struct{ svc *Service }

func (h Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	resp, err := h.svc.Register(r.Context(), req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusCreated, resp)
}

func (h Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	resp, err := h.svc.Login(r.Context(), req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, resp)
}

func (h Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := sharedhttp.Decode(r, &req); err != nil {
		sharedhttp.Error(w, err)
		return
	}
	resp, err := h.svc.Refresh(r.Context(), req)
	if err != nil {
		sharedhttp.Error(w, err)
		return
	}
	sharedhttp.JSON(w, http.StatusOK, resp)
}
