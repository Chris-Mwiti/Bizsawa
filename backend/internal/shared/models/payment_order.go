package models

import "github.com/shopspring/decimal"

type CommandType string

const (
	CommandSTKPush CommandType = "stk_push"
	CommandB2C     CommandType = "b2c"
	CommandC2B     CommandType = "c2b"
	CommandCash    CommandType = "cash"
)

type InitiateRequest struct {
	Type             CommandType     `json:"type"`
	Amount           decimal.Decimal `json:"amount"`
	OrderID          string          `json:"orderID"`
	Currency         string          `json:"currency"`
	Phone            string          `json:"phone"`
	AccountReference string          `json:"accountReference"`
	Provider         string          `json:"provider"`
	Payload          map[string]any  `json:"payload"`
}
