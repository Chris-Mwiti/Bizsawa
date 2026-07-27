package orders

import (
	"fmt"

	"github.com/Codecx-Org/FinAI/backend/internal/invoices"
	"github.com/Codecx-Org/FinAI/backend/internal/sales"
)

// buildInvoicePayload maps an Order struct to a CreateInvoiceRequest payload
func buildInvoicePayload(order *Order) invoices.CreateInvoiceRequest {
	invoiceLines := make([]invoices.LineRequest, 0, len(order.Lines))

	for _, line := range order.Lines {
		// Create a local variable so we can safely take its memory address (&productID)
		productID := line.ProductID
		
		desc := fmt.Sprintf("Product ID: %s | Unit Price: %v | Quantity: %d", 
			line.ProductID.String(), 
			line.UnitPrice, 
			line.Quantity,
		)

		invoiceLines = append(invoiceLines, invoices.LineRequest{
			ProductID:   &productID,
			Quantity:    line.Quantity,
			UnitPrice:   line.UnitPrice,
			Description: desc,
		})
	}

	// Calculate due date (5 days from now). 
	// Assuming order.ConfirmedAt was set right before calling this.
	dueAt := order.ConfirmedAt.AddDate(0, 0, 5)
	orderId := order.ID

	return invoices.CreateInvoiceRequest{
		CustomerID: order.CustomerID,
		OrderID: &orderId,
		DueAt:      &dueAt,
		Currency:   "KES", // Hardcoded per your original logic, can be parameterized
		Lines:      invoiceLines,
		Notes:      fmt.Sprintf("Invoice for order ID: %s", order.ID.String()),
	}
}

// buildPaymentPayload maps the Order and Invoice into a payment InitiateRequest
func buildPaymentPayload(order *Order,customerPhone string) OrderPayInitReq{
	var commandType CommandType
	var provider string

	// Map the business domain payment method to the technical payment provider/command
	switch order.PaymentMethod {
	case "cash":
		commandType = CommandCash
		provider = "cash"
	case "mpesa":
		commandType = CommandSTKPush
		provider = "mpesa"
	default:
		// Fallback for unknown/generic methods
		commandType = CommandType(order.PaymentMethod)
		provider = order.PaymentMethod
	}

		return OrderPayInitReq{
		Provider:         provider,
		Type:             commandType,
		AccountReference: fmt.Sprintf("OrderID:%s|IdempotencyKey:%s", order.ID.String(), order.IdempotencyKey),
		Amount:           order.Total,
		Currency:         "KES",
		Phone:            customerPhone,
	}
}

// buildSalesPayload maps the internal order lines to the sales module input type
func buildSalesPayload(order *Order) []sales.OrderLineInput {
	saleLines := make([]sales.OrderLineInput, 0, len(order.Lines))
	
	for _, line := range order.Lines {
		saleLines = append(saleLines, sales.OrderLineInput{
			ProductID: line.ProductID,
			Quantity:  line.Quantity,
			UnitPrice: line.UnitPrice,
		})
	}
	
	return saleLines
}
