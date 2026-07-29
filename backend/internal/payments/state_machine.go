package payments

import (
	"github.com/google/uuid"
	"github.com/qmuntal/stateless"
)

type PaymentTrigger string

const (
	TriggerProcessing PaymentTrigger = "payment_processing"
	TriggerSuccess    PaymentTrigger = "payment_success"
	TriggerFailed     PaymentTrigger = "payment_failed"
	TriggerRetry      PaymentTrigger = "payment_retry"
)

func (s *Service) buildPaymentMachine(businessID uuid.UUID, command *PaymentCommand) *stateless.StateMachine {
	sm := stateless.NewStateMachine(command.Status)

	sm.Configure(StatusPending).Permit(TriggerProcessing, StatusProcessing).Permit(TriggerFailed, StatusFailed)
	sm.Configure(StatusProcessing).Permit(TriggerSuccess, StatusSucceeded).Permit(TriggerFailed, StatusFailed)
	sm.Configure(StatusFailed).Permit(TriggerRetry, StatusProcessing)

	return sm
}
