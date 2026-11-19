# syntax=docker/dockerfile:1
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api && \
    CGO_ENABLED=0 go build -o /out/migrate ./cmd/migrate

FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl
WORKDIR /app
COPY --from=builder /out/api /app/api
COPY --from=builder /out/migrate /app/migrate
COPY migrations /app/migrations
# .env files are not copied; env injected at runtime
EXPOSE 5504 5564
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 CMD curl -fsS http://127.0.0.1:5504/health || exit 1
# Single replica: migrate, then start. Fails closed if a migration fails.
CMD ["/bin/sh", "-c", "/app/migrate up && exec /app/api"]
