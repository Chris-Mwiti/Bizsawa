# BizSawa backend — env-aware compose aliases
# Usage: make dev-up / make prod-up / make dev-config
# dev-up / prod-up start PowerSync automatically (the `powersync` profile is always enabled).
# Shell helpers (functions so --profile args pass): dc-dev, dc-prod
#   dc-dev --profile observability up otel-collector jaeger

ENV_FILE ?= .env.development
# PowerSync is a core service, so the `powersync` profile is always enabled.
COMPOSE = ENV_FILE=$(ENV_FILE) docker compose --env-file $(ENV_FILE) --profile powersync

.PHONY: dev dev-up dev-down dev-config prod prod-up prod-down prod-config logs ps clean dev-observability prod-observability \
	dev-powersync-up dev-powersync-down dev-powersync-restart dev-powersync-init dev-powersync-logs dev-powersync-config \
	prod-powersync-up prod-powersync-down prod-powersync-restart prod-powersync-init prod-powersync-logs prod-powersync-config

dev: dev-up
prod: prod-up

# Development (default) — uses .env.development
dev-up:
	ENV_FILE=.env.development POWERSYNC_CONFIG_FILE=service.dev.yaml docker compose --env-file .env.development --profile powersync build --no-cache
	ENV_FILE=.env.development POWERSYNC_CONFIG_FILE=service.dev.yaml docker compose --env-file .env.development --profile powersync up -d

dev-down:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile powersync down

dev-config:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile powersync config | grep -E "APP_ENV|POSTGRES|DATABASE_DSN|POWERSYNC" | head -n 30

dev-logs:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile powersync logs -f

dev-observability:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile powersync --profile observability up -d

dev-migration:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile migrate build migrate
	ENV_FILE=.env.development docker compose --env-file .env.development --profile migrate up migrate

dev-migration-down:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile migrate down migrate

dev-observability-down:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile powersync --profile observability down

# Production — uses .env.production (never commit real secrets)
prod-up:
	@grep -Eq '^POWERSYNC_JWKS_URI=.+' .env.production || (echo "Set POWERSYNC_JWKS_URI in .env.production (Clerk JWKS URL)"; exit 1)
	@grep -Eq '^POWERSYNC_API_TOKEN=.+' .env.production || (echo "Set POWERSYNC_API_TOKEN in .env.production"; exit 1)
	@grep -Eq '^POWERSYNC_DB_PASSWORD=.+' .env.production || (echo "Set POWERSYNC_DB_PASSWORD in .env.production"; exit 1)
	ENV_FILE=.env.production POWERSYNC_CONFIG_FILE=service.prod.yaml docker compose --env-file .env.production --profile powersync build --no-cache
	ENV_FILE=.env.production POWERSYNC_CONFIG_FILE=service.prod.yaml docker compose --env-file .env.production --profile powersync up -d

prod-migration:
	ENV_FILE=.env.production docker compose --env-file .env.production --profile migrate up migrate

prod-migration-down:
	ENV_FILE=.env.production docker compose --env-file .env.production --profile migrate down migrate

prod-down:
	ENV_FILE=.env.production docker compose --env-file .env.production --profile powersync down

prod-config:
	ENV_FILE=.env.production docker compose --env-file .env.production --profile powersync config | grep -E "APP_ENV|POSTGRES|DATABASE_DSN|POWERSYNC" | head -n 30

prod-logs:
	ENV_FILE=.env.production docker compose --env-file .env.production --profile powersync logs -f

prod-observability:
	ENV_FILE=.env.production docker compose --env-file .env.production --profile powersync --profile observability up -d

# PowerSync (self-hosted) — development
# Uses .env.development + powersync/service.dev.yaml (static HS256 dev key).
dev-powersync-up:
	ENV_FILE=.env.development POWERSYNC_CONFIG_FILE=service.dev.yaml docker compose --env-file .env.development --profile powersync up -d postgres powersync-init powersync

dev-powersync-down:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile powersync stop powersync

dev-powersync-restart:
	ENV_FILE=.env.development POWERSYNC_CONFIG_FILE=service.dev.yaml docker compose --env-file .env.development --profile powersync restart powersync

dev-powersync-init:
	ENV_FILE=.env.development docker compose --env-file .env.development --profile powersync up -d --force-recreate powersync-init

dev-powersync-logs:
	ENV_FILE=.env.development docker compose --env-file .env.development logs -f powersync

dev-powersync-config:
	ENV_FILE=.env.development POWERSYNC_CONFIG_FILE=service.dev.yaml docker compose --env-file .env.development --profile powersync config

# PowerSync (self-hosted) — production
# Uses .env.production + powersync/service.prod.yaml (Clerk JWKS via POWERSYNC_JWKS_URI).
prod-powersync-up:
	@grep -Eq '^POWERSYNC_JWKS_URI=.+' .env.production || (echo "Set POWERSYNC_JWKS_URI in .env.production (Clerk JWKS URL)"; exit 1)
	@grep -Eq '^POWERSYNC_API_TOKEN=.+' .env.production || (echo "Set POWERSYNC_API_TOKEN in .env.production"; exit 1)
	@grep -Eq '^POWERSYNC_DB_PASSWORD=.+' .env.production || (echo "Set POWERSYNC_DB_PASSWORD in .env.production"; exit 1)
	ENV_FILE=.env.production POWERSYNC_CONFIG_FILE=service.prod.yaml docker compose --env-file .env.production --profile powersync up -d postgres powersync-init powersync

prod-powersync-down:
	ENV_FILE=.env.production docker compose --env-file .env.production --profile powersync stop powersync

prod-powersync-restart:
	ENV_FILE=.env.production POWERSYNC_CONFIG_FILE=service.prod.yaml docker compose --env-file .env.production --profile powersync restart powersync

prod-powersync-init:
	ENV_FILE=.env.production docker compose --env-file .env.production --profile powersync up -d --force-recreate powersync-init

prod-powersync-logs:
	ENV_FILE=.env.production docker compose --env-file .env.production logs -f powersync

prod-powersync-config:
	ENV_FILE=.env.production POWERSYNC_CONFIG_FILE=service.prod.yaml docker compose --env-file .env.production --profile powersync config

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
