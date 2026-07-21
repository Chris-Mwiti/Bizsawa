package orders

import (
	"github.com/google/uuid"
	"github.com/qmuntal/stateless"
)

type OrderTrigger string

const (
	TriggerConfirm  OrderTrigger = "order_confirm" // draft -> complete
	TriggerFailed OrderTrigger = "order_failed" //complete/draft -> canceled
	TriggerFullfill OrderTrigger = "order_fullfiled" //complete -> fullfilled
	TriggerRequestRefund OrderTrigger = "order_refund" //fullfiled -> refund
	TriggerCancel OrderTrigger = "order_cancel" //draft -> cancelled
)

func (s *Service) buildOrderMachine(businessId uuid.UUID, order *Order) (*stateless.StateMachine){
	sm := stateless.NewStateMachine(order.Status)	

	//configuration of the order state flow

	//[draft] -> [confirm/cancled]
	sm.Configure(StatusDraft).Permit(TriggerConfirm, StatusConfirmed).Permit(TriggerCancel, StatusCancelled)

	//[confirm] -> [fulfill/cancel]
	sm.Configure(StatusConfirmed).Permit(TriggerFullfill, StatusFulfilled)

	sm.Configure(StatusFulfilled).Permit(TriggerRequestRefund, StatusRefunded)

	return sm
}

  


