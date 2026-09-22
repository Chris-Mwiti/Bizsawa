# BizSawa backend — env-aware compose aliases
# Usage: make dev-up / make prod-up / make dev-config
# Shell helpers (functions so --profile args pass): dc-dev, dc-prod
#   dc-dev --profile observability up otel-collector jaeger

ENV_FILE ?= .env.development
COMPOSE = ENV_FILE=$(ENV_FILE) docker compose --env-file $(ENV_FILE)

.PHONY: dev dev-up dev-down dev-config prod prod-up prod-down prod-config logs ps clean dev-observability prod-observability

dev: dev-up
prod: prod-up

# Development (default) — uses .env.development
dev-up:
	ENV_FILE=.env.development docker compose --env-file .env.development up -d

dev-down:
	ENV_FILE=.env.development docker compose --env-file .env.development down

dev-config:
	ENV_FILE=.env.development docker compose --env-file .env.development config | grep -E "APP_ENV|POSTGRES|DATABASE_DSN" | head -n 20

dev-logs:
	ENV_FILE=.env.development docker compose --env-file .env.development logs -f

dev-observability:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile observability up -d

dev-observability-down:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile observability down

# Production — uses .env.production (never commit real secrets)
prod-up:
	ENV_FILE=.env.production docker compose --env-file .env.production up -d

prod-down:
	ENV_FILE=.env.production docker compose --env-file .env.production down

prod-config:
	ENV_FILE=.env.production docker compose --env-file .env.production config | grep -E "APP_ENV|POSTGRES|DATABASE_DSN" | head -n 20

prod-logs:
	ENV_FILE=.env.production docker compose --env-file .env.production logs -f

prod-observability:
	ENV_FILE=.env.production docker compose --env-file .env.production --profile observability up -d

# Generic — respects ENV_FILE var: e.g. ENV_FILE=.env.production make up
up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

config:
	$(COMPOSE) config | head -n 80

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

clean:
	$(COMPOSE) down -v
