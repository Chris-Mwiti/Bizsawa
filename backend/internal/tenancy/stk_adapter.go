package tenancy

import (
	"context"
	"encoding/json"

	"github.com/shopspring/decimal"
)

// mpesaAdapter adapts payments.MpesaClient to SubscriptionSTKProvider without import cycle via duck typing.
// The actual mpesa client is passed as interface in main.go.
type mpesaAdapter struct {
	stkPush func(ctx context.Context, phone string, amount decimal.Decimal, accountRef string) (string, json.RawMessage, error)
}

func (a *mpesaAdapter) STKPush(ctx context.Context, phone string, amount decimal.Decimal, accountRef string) (string, json.RawMessage, error) {
	return a.stkPush(ctx, phone, amount, accountRef)
}

// NewMpesaAdapter creates an adapter from a function closure.
func NewMpesaAdapter(fn func(ctx context.Context, phone string, amount decimal.Decimal, accountRef string) (string, json.RawMessage, error)) SubscriptionSTKProvider {
	return &mpesaAdapter{stkPush: fn}
}
