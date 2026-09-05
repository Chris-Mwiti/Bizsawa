package waha

import (
	"fmt"
	"strings"

	apperrors "github.com/Codecx-Org/FinAI/backend/internal/shared/errors"
)

func errBusinessRequired() error {
	return apperrors.ErrForbidden.WithMessage("business context is required")
}

func errNotConfigured() error {
	return apperrors.ErrServiceUnavailable.WithMessage("whatsapp channel is not configured")
}

func errPhoneRequired() error {
	return apperrors.ErrUnprocessable.WithMessage("recipient phone is required")
}

func errUnknownType(kind string) error {
	return apperrors.ErrUnprocessable.WithMessage("unknown notification type: " + kind)
}

func newTemplateError(name, missing string) error {
	return apperrors.ErrInternal.WithMessage(fmt.Sprintf("message template %q is missing variable: %s", name, missing))
}

// Template is a named message template with named variable placeholders in
// the form {{.VariableName}}.
type Template struct {
	Name string
	Body string
}

// Render substitutes {{.X}} placeholders with the provided variables.
func (t Template) Render(vars map[string]any) (string, error) {
	out := t.Body

	for key, val := range vars {
		placeholder := "{{." + key + "}}"

		if out == "" {
			continue
		}

		out = strings.ReplaceAll(out, placeholder, fmt.Sprintf("%v", val))
	}

	if strings.Contains(out, "{{.") {
		return "", newTemplateError(t.Name, "unknown placeholder remains")
	}

	return out, nil
}

// InvoiceTemplate renders an invoice notification message.
func InvoiceTemplate(customerName, invoiceNumber, total, currency, dueAt string) string {
	lines := []string{
		fmt.Sprintf("Hello %s,", customerName),
		fmt.Sprintf("Your invoice %s of %s %s is ready.", invoiceNumber, total, currency),
	}

	if dueAt != "" {
		lines = append(lines, fmt.Sprintf("Due date: %s", dueAt))
	}

	lines = append(lines, "Thank you for your business.")

	return strings.Join(lines, "\n")
}

// OrderStatusTemplate renders an order status update message.
func OrderStatusTemplate(customerName, orderID, status string) string {
	return fmt.Sprintf("Hello %s, your order %s is now %s.", customerName, orderID, status)
}

// PaymentReminderTemplate renders an overdue invoice reminder.
func PaymentReminderTemplate(customerName, invoiceNumber, amountDue, currency string) string {
	return fmt.Sprintf("Hello %s, a friendly reminder that invoice %s has an outstanding balance of %s %s.", customerName, invoiceNumber, amountDue, currency)
}

// MarketingTemplate renders a generic marketing broadcast message.
func MarketingTemplate(message string) string {
	return message
}

// RenderNotification renders a typed notification message from a kind.
func RenderNotification(kind string, data map[string]any) (string, error) {
	str := func(key string) string {
		if v, ok := data[key].(string); ok {
			return v
		}

		return ""
	}

	switch kind {
	case "invoice":
		return InvoiceTemplate(str("customerName"), str("invoiceNumber"), str("total"), str("currency"), str("dueAt")), nil
	case "order_status":
		return OrderStatusTemplate(str("customerName"), str("orderID"), str("status")), nil
	case "payment_reminder":
		return PaymentReminderTemplate(str("customerName"), str("invoiceNumber"), str("amountDue"), str("currency")), nil
	case "marketing":
		return MarketingTemplate(str("message")), nil
	default:
		return "", errUnknownType(kind)
	}
}
