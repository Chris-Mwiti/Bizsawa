package middleware

import (
	"context"

	"github.com/google/uuid"
)

type contextKey string

const (
	ContextKeyUserID     contextKey = "userID"
	ContextKeyTenantID   contextKey = "tenantID"
	ContextKeyBusinessID contextKey = "businessID"
	ContextKeyRequestID  contextKey = "requestID"
	ContextKeyIdemKey    contextKey = "idempotencyKey"
	ContextKeyDeviceID   contextKey = "deviceID"
)

func WithUserID(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, ContextKeyUserID, id)
}

func UserIDFromCtx(ctx context.Context) (uuid.UUID, bool) {
	return uuidFromCtx(ctx, ContextKeyUserID)
}

func WithTenantID(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, ContextKeyTenantID, id)
}

func TenantIDFromCtx(ctx context.Context) (uuid.UUID, bool) {
	return uuidFromCtx(ctx, ContextKeyTenantID)
}

func WithBusinessID(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, ContextKeyBusinessID, id)
}

func BusinessIDFromCtx(ctx context.Context) (uuid.UUID, bool) {
	return uuidFromCtx(ctx, ContextKeyBusinessID)
}

func WithIdempotencyKey(ctx context.Context, key string) context.Context {
	return context.WithValue(ctx, ContextKeyIdemKey, key)
}

func IdempotencyKeyFromCtx(ctx context.Context) (string, bool) {
	value, ok := ctx.Value(ContextKeyIdemKey).(string)
	return value, ok && value != ""
}

// DeviceIDFromCtx returns the caller's stable install UUID sent as
// X-Device-Id (mobile/lib/deviceId). Empty when the client is old, web,
// or otherwise unattributed — callers must treat that as "unknown writer",
// never as a match.
func WithDeviceID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ContextKeyDeviceID, id)
}

func DeviceIDFromCtx(ctx context.Context) (string, bool) {
	value, ok := ctx.Value(ContextKeyDeviceID).(string)
	return value, ok && value != ""
}

func uuidFromCtx(ctx context.Context, key contextKey) (uuid.UUID, bool) {
	value, ok := ctx.Value(key).(uuid.UUID)
	return value, ok && value != uuid.Nil
}
