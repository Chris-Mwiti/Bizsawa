# BizSawa Go Backend

This backend is being built from `Agents_Documents/bizsawa_go_module_execution_plan.md`.

Current milestone:
- Go scaffold.
- Shared foundation packages.
- API health/readiness endpoints.
- Outbox relay worker.
- Placeholder payment worker process.
- OpenAPI contract for the backend is available at [`backend/docs/openapi.yaml`](/home/madrigal/Projects/Mini-Projects/FinAI_Golang/backend/docs/openapi.yaml) for learning, mocking, and test fixture generation.

Run locally after dependencies are available:

```bash
docker compose up -d postgres redis
go run ./cmd/api
go run ./cmd/worker
go run ./cmd/payment-worker
```
