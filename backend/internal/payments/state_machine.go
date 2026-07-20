package payments

import (
	"context"

	"github.com/google/uuid"
	"github.com/qmuntal/stateless"
)

 type PaymentTrigger string 

 const (
	 TriggerProcessing  PaymentTrigger = "payment_processing"
	 TriggerSuccess			PaymentTrigger = "payment_success"
	 TriggerFailed 			PaymentTrigger = 	"payment_failed"
	 TriggerRetry				PaymentTrigger = 	"payement_retry"
 )

 func (s *Service) buildPaymentMachine(businessID uuid.UUID, command *PaymentCommand) *stateless.StateMachine {

	 sm := stateless.NewStateMachine(command.Status)

	 sm.Configure(StatusPending).Permit(TriggerProcessing, StatusProcessing).Permit(TriggerFailed, StatusFailed)
	 sm.Configure(StatusProcessing).Permit(TriggerSuccess, StatusSucceeded).Permit(TriggerFailed, StatusFailed)
   sm.Configure(StatusFailed).Permit(TriggerRetry, StatusProcessing)

	 sm.Configure(StatusProcessing).OnEntry(func(ctx context.Context, args ...interface{}) error {
		 err := s.emitProcessingCmd(ctx, command)

		 if err != nil {
			 return err 
		 }
		 return nil
	 })

	 sm.Configure(StatusFailed).OnEntryFrom(TriggerRetry, func(ctx context.Context, args ...interface{}) error {
		 err := s.emitRetryCommand(ctx, command)

		 if err != nil {
			 return err
		 }

		 return nil
	 })
	 return sm
 }

 
  
