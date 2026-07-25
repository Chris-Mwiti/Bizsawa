package invoices

import (
	"github.com/qmuntal/stateless"
)

type InvoiceTrigger string

const (
	TriggerSent     InvoiceTrigger = "invoice_sent"
	TriggerViewed   InvoiceTrigger = "invoice_viewed"
	TriggerPartial  InvoiceTrigger = "invoice_partial"
	TriggerPaid     InvoiceTrigger = "invoice_paid"
	TriggerCanceled InvoiceTrigger = "invoice_canceled"
)

func (s *Service) buildInvoiceMachine(invoice Invoice) *stateless.StateMachine {

	sm := stateless.NewStateMachine(invoice.Status)

	sm.Configure(StatusDraft).Permit(TriggerSent, StatusSent).Permit(TriggerCanceled, StatusCancelled)
	sm.Configure(StatusSent).Permit(TriggerViewed, StatusViewed).Permit(TriggerCanceled, StatusCancelled)
	sm.Configure(StatusViewed).Permit(TriggerPartial, StatusPartial).Permit(TriggerPaid, StatusPaid).Permit(TriggerCanceled, StatusCancelled)

	sm.Configure(StatusPartial).Permit(TriggerPaid, StatusPaid)

	return sm
}
