# BizSawa Observability — OpenTelemetry

Instrumented with **OpenTelemetry SDK** (tracing, metrics, structured logging) for both **API** (`:5504`) and **MCP server** (`:5574`). Designed for load-test, spike-test and error-rate analysis, especially **MCP workflow tool-call error rates**.

## Architecture

```
API (:5504) ──┐
               ├──> OTLP HTTP :4318 ──> otel-collector ──┬──> Jaeger  :16686 (traces)
MCP (:5574) ──┘                                          ├──> Prometheus :9090 (metrics)
                                                         └──> stdout / debug (fallback)
metrics pull: GET /metrics (Prometheus exposition on each service)
health:       GET /otel/health
```

- **Tracing**: `go.opentelemetry.io/otel/sdk/trace` with BatchSpanProcessor -> OTLP HTTP (`otlptracehttp`). Falls back to stdout when no endpoint and `OTEL_STDOUT_FALLBACK=true`.
- **Metrics**: `sdk/metric` with Prometheus exporter + OTLP HTTP periodic reader (15s). Histograms for latency, counters for request/error rates.
- **Logging**: `log/slog` JSON handler enriched with `trace_id`/`span_id` via `observability.TraceHandler` for correlation in Jaeger/Grafana.
- **Propagators**: W3C `TraceContext` + `Baggage` so load generators can inject `traceparent` headers.

## Env

| Variable | Default | Description |
|---|---|---|
| `OTEL_ENABLED` | `true` | master switch |
| `OTEL_SERVICE_NAME` | `bizsawa-api` | service.name resource attr |
| `OTEL_SERVICE_VERSION` | `0.1.0` | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(empty = stdout)_ | e.g. `http://otel-collector:4318` (no `/v1/traces` suffix) |
| `OTEL_EXPORTER_OTLP_INSECURE` | `true` | allow http |
| `OTEL_SAMPLE_RATIO` | `1.0` | 0-1; use 0.1 in prod high-traffic |
| `OTEL_TRACES_ENABLED` | `true` | |
| `OTEL_METRICS_ENABLED` | `true` | |
| `OTEL_PROMETHEUS_ENABLED` | `true` | expose `/metrics` |
| `OTEL_STDOUT_FALLBACK` | `true` in dev | pretty-print traces to stdout when no collector |
| `OTEL_ENVIRONMENT` | `development` | `deployment.environment` attr |

## HTTP observability

Middleware: `observability.HTTPMiddleware("bizsawa-api")` (early in chi chain)

Metrics:

- `http.server.requests` (counter) `{http.method, http.route, http.response.status_code}`
- `http.server.duration` (histogram ms) — buckets 5ms-10s, use for p50/p95/p99
- `http.server.errors` (counter) `{error.type=4xx|5xx}`
- `http.server.active_requests` (updown)

Spans: `GET /api/v1/products` with attrs `http.method, http.route, http.status_code, user_agent, deployment.environment`. Error status (>=400) marks span `Error`.

## MCP workflow & tool metrics (key for your request)

Every `tools/call` creates a **parent workflow span** (`mcp.workflow/<method>`) + **child tool span** (`mcp.tool/<name>`) :

Metrics:

- `mcp.workflow.calls` / `mcp.workflow.duration` / `mcp.workflow.errors` `{mcp.workflow.method=initialize|tools/list|tools/call, mcp.profile=business-owner|customer-service}`
- `mcp.tool.calls` / `mcp.tool.duration` / `mcp.tool.errors` / `mcp.tool.active` `{mcp.tool.name=summarize_sales|list_low_stock_items|... , mcp.profile, mcp.status=ok|error, error.type=tool_not_found|permission_denied|...}`
- Latency `trace_id` injected into `envelope.meta.trace_id` for log↔trace join during load tests.

Spans:

```
http.server POST /mcp/business-owner
└── mcp.workflow/tools/call {mcp.profile=business-owner}
    └── mcp.tool/summarize_sales {mcp.tool.name=summarize_sales, business_id=...}
```

**Error-rate queries (PromQL / Grafana)**

```promql
# Overall MCP tool error rate (spike visible)
sum(rate(mcp_tool_errors_total[1m])) / sum(rate(mcp_tool_calls_total[1m]))

# Per-tool error rate — discover which workflow step breaks under load
sum by (mcp_tool_name) (rate(mcp_tool_errors_total[5m]))
/ sum by (mcp_tool_name) (rate(mcp_tool_calls_total[5m]))

# p95 latency per tool (compare load vs spike)
histogram_quantile(0.95, sum by (le, mcp_tool_name) (rate(mcp_tool_duration_bucket[5m])))

# HTTP error rate for load test (4xx/5xx)
sum(rate(http_server_errors_total[1m])) / sum(rate(http_server_requests_total[1m]))

# Jaeger: filter by `mcp.tool.name` or `error.type` tags; sort by duration.
```

## Running locally

```bash
# without collector — traces/metrics to stdout
go run ./cmd/api              # OTEL_STDOUT_FALLBACK=true logs JSON traces

# with full stack (collector + jaeger + prometheus + grafana)
docker compose --profile observability up -d otel-collector jaeger prometheus grafana
docker compose up -d api mcp   # api waits for otel-collector healthy

# verify
curl http://localhost:5504/metrics | head
curl http://localhost:5574/metrics | head
curl http://localhost:5504/otel/health
open http://localhost:16686   # Jaeger UI
open http://localhost:9090    # Prometheus
open http://localhost:3001    # Grafana (admin/admin)
```

### Load / spike test example (k6)

```js
import http from 'k6/http';
export const options = { stages: [{duration:'30s', target:100}, {duration:'1m', target:500}, {duration:'30s', target:0}] };
export default function(){
  const res = http.post('http://localhost:5504/api/v1/products', JSON.stringify({name:'loadtest'}), {headers:{Authorization:`Bearer ${TOKEN}`}});
  // traceparent propagates automatically; for custom, add header: 'traceparent: 00-...-01'
}
```

Observe in Grafana: `mcp_tool_errors_total` will spike for the failing tool; Jaeger will show slow `mcp.tool/*` spans under spike.

## Log correlation

Every `slog.InfoContext(ctx, ...)` automatically adds `trace_id`/`span_id`:

```json
{"level":"INFO","msg":"mcp tool call","tool":"summarize_sales","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","span_id":"00f067aa0ba902b7", "duration_ms":42}
```

Filter logs by `trace_id` to jump to trace in Jaeger.

## Performance overhead

- Sampling: `OTEL_SAMPLE_RATIO=0.1` for prod load tests (>10k rps) to limit collector pressure.
- Batch timeout 2s, periodic metric 15s — tuned for spike visibility without head-of-line blocking.
- Prometheus pull is cheap; OTLP push is async. No blocking on request path.
```

