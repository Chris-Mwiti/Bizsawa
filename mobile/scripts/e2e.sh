#!/usr/bin/env bash
set -euo pipefail
# Phase C3: starts docker postgres/redis, migrates, starts api on 5504, runs vitest api flows
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/../backend"
API_PORT="${API_PORT:-5504}"
API_URL="http://localhost:${API_PORT}/api/v1"

echo "[e2e] docker compose up postgres redis"
( cd "$BACKEND" && docker compose up -d postgres redis )

echo "[e2e] wait for postgres"
for i in $(seq 1 20); do pg_isready -h localhost -p 5432 -U postgres && break || sleep 2; done

echo "[e2e] migrate up"
( cd "$BACKEND" && DATABASE_DSN="postgres://postgres:f9fa4c04@localhost:5432/bizsawa_test?sslmode=disable" go run ./cmd/migrate up )

echo "[e2e] start api on :${API_PORT}"
(
  cd "$BACKEND"
  APP_ADDR=":${API_PORT}" DATABASE_DSN="postgres://postgres:f9fa4c04@localhost:5432/bizsawa_test?sslmode=disable" \
  REDIS_ADDR="localhost:6379" JWT_SIGNING_KEY="test-signing-key-for-ci-must-be-32+chars" \
  CRYPTO_MASTER_KEY="0123456789abcdef0123456789abcdef" CRYPTO_INDEX_SECRET="fedcba9876543210fedcba9876543210" \
  go run ./cmd/api &
  echo $! > /tmp/bizsawa-e2e-api.pid
)
for i in $(seq 1 30); do curl -f "http://localhost:${API_PORT}/ready" && break || sleep 2; done
curl -f "http://localhost:${API_PORT}/health"

echo "[e2e] run vitest api flows"
( cd "$ROOT" && E2E_API_URL="$API_URL" bunx vitest run e2e/api --reporter=verbose )

echo "[e2e] done"
kill "$(cat /tmp/bizsawa-e2e-api.pid)" || true
