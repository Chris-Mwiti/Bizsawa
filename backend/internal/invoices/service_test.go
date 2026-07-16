package invoices

import (
	"bytes"
	"testing"

	shareddb "github.com/Codecx-Org/FinAI/backend/internal/shared/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

func TestDeterministicPDF(t *testing.T) {
	invoice := &Invoice{InvoiceNumber: "INV-TEST-000001", Status: StatusPaid, Subtotal: decimal.NewFromInt(100), TaxAmount: decimal.NewFromInt(16), Total: decimal.NewFromInt(116), AmountPaid: decimal.NewFromInt(116), AmountDue: decimal.Zero}
	invoice.Lines = []InvoiceLine{{BaseModel: shareddb.BaseModel{ID: uuid.MustParse("00000000-0000-0000-0000-000000000002")}, Description: "B", Quantity: decimal.NewFromInt(1), UnitPrice: decimal.NewFromInt(50), LineTotal: decimal.NewFromInt(50)}, {BaseModel: shareddb.BaseModel{ID: uuid.MustParse("00000000-0000-0000-0000-000000000001")}, Description: "A", Quantity: decimal.NewFromInt(1), UnitPrice: decimal.NewFromInt(50), LineTotal: decimal.NewFromInt(50)}}

	first := deterministicPDF(invoice)
	second := deterministicPDF(invoice)
	if !bytes.Equal(first, second) {
		t.Fatal("pdf output should be deterministic")
	}
	if !bytes.Contains(first, []byte("Invoice: INV-TEST-000001")) || !bytes.Contains(first, []byte("Line: A")) {
		t.Fatalf("pdf output missing expected invoice content: %s", string(first))
	}
}
