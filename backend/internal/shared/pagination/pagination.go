package pagination

import (
	"net/http"
	"strconv"
)

const (
	defaultLimit = 25
	maxLimit     = 100
)

type Page struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

func FromRequest(r *http.Request) Page {
	limit := parseInt(r.URL.Query().Get("limit"), defaultLimit)
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	offset := parseInt(r.URL.Query().Get("offset"), 0)
	if offset < 0 {
		offset = 0
	}

	return Page{Limit: limit, Offset: offset}
}

func parseInt(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
