import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type {
  InitiatePaymentRequest,
  PaymentCommand,
  UUID,
} from '../../lib/api-dtos'
import { toDecimalString } from '../../lib/api-dtos'
import {
  generateIdempotencyKey,
  clearIdempotencyKey,
  OperationId,
} from '../../lib/idempotency'

export interface PaymentInitiationRequest {
  orderId?: UUID
  invoiceId?: UUID | null
  phone: string
  amount: number | string
  currency?: string
  accountReference?: string
}

export type PaymentInitiationResponse = PaymentCommand

function toInitiateRequest(
  data: PaymentInitiationRequest,
): InitiatePaymentRequest {
  return {
    type: 'stk_push',
    invoiceId: data.invoiceId || null,
    amount: toDecimalString(data.amount),
    currency: data.currency || 'KES',
    phone: data.phone,
    accountReference: data.accountReference || data.orderId,
    orderID: data.orderId,
    payload: data.orderId ? { orderId: data.orderId } : undefined,
  }
}

export const useInitiatePayment = () => {
  return useMutation({
    mutationFn: async (data: PaymentInitiationRequest) => {
      // Generate operation ID and idempotency key ONCE when user initiates payment
      const operationId = OperationId.initiatePayment(
        data.orderId || data.invoiceId || 'unknown',
        toDecimalString(data.amount),
      )
      const idempotencyKey = await generateIdempotencyKey(operationId)

      try {
        const response = await api.post<PaymentCommand>(
          '/payments',
          toInitiateRequest(data),
          {
            headers: { 'X-Idempotency-Key': idempotencyKey },
          },
        )

        // Clear key only on successful HTTP response (2xx)
        await clearIdempotencyKey(operationId)

        return response.data
      } catch (error: any) {
        // Don't clear key on error - allow retry with same key
        // 4xx = client error (don't retry same request)
        // 5xx = server error (can retry with same key)
        throw error
      }
    },
  })
}

export const usePaymentStatus = (
  paymentId: UUID | number | undefined,
  enabled = false,
) => {
  const normalizedId =
    typeof paymentId === 'number' ? String(paymentId) : paymentId
  const shouldRun = enabled && !!normalizedId
  return useQuery({
    queryKey: ['paymentStatus', normalizedId],
    queryFn: async () => {
      const response = await api.get<PaymentCommand>(
        `/payments/${normalizedId}`,
      )
      // Don't clear idempotency key here - let the mutation handle it
      // or clear when payment reaches terminal state
      if (
        response.data.status === 'succeeded' ||
        response.data.status === 'failed'
      ) {
        // Note: We don't have the operationId here, so we can't clear it
        // The mutation that initiated the payment should clear it
      }
      return response.data
    },
    enabled: shouldRun,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'succeeded' || status === 'failed') return false
      return 3000
    },
  })
}
