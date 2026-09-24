package observability

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func getPromHTTPHandler() http.Handler {
	return promhttp.Handler()
}
