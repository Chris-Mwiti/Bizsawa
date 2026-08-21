import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { InitiatePaymentRequest, PaymentCommand, UUID } from "../../lib/api-dtos";
import { toDecimalString } from "../../lib/api-dtos";
import { clearPaymentIdempotencyKey, getPaymentIdempotencyKey } from "../../lib/idempotency";

export interface PaymentInitiationRequest {
  orderId?: UUID;
  invoiceId?: UUID | null;
  phone: string;
  amount: number | string;
  currency?: string;
  accountReference?: string;
}

export type PaymentInitiationResponse = PaymentCommand;

function toInitiateRequest(data: PaymentInitiationRequest): InitiatePaymentRequest {
  return {
    type: "stk_push",
    invoiceId: data.invoiceId || null,
    amount: toDecimalString(data.amount),
    currency: data.currency || "KES",
    phone: data.phone,
    accountReference: data.accountReference || data.orderId,
    payload: data.orderId ? { orderId: data.orderId } : undefined,
  };
}

export const useInitiatePayment = () => {
  return useMutation({
    mutationFn: async (data: PaymentInitiationRequest) => {
      const operationId = data.invoiceId || data.orderId || `${data.phone}:${data.amount}`;
      await clearPaymentIdempotencyKey(operationId)
      const idempotencyKey = await getPaymentIdempotencyKey(operationId);
      console.log(idempotencyKey)
      const response = await api.post<PaymentCommand>("/payments", toInitiateRequest(data), {
        headers: { "X-Idempotency-Key": idempotencyKey },
      });
      return response.data;
    },
  });
};

export const usePaymentStatus = (paymentId: UUID | number | undefined, enabled = false) => {
  const normalizedId = typeof paymentId === "number" ? String(paymentId) : paymentId;
  const shouldRun = enabled && !!normalizedId;
  return useQuery({
    queryKey: ["paymentStatus", normalizedId],
    queryFn: async () => {
      const response = await api.get<PaymentCommand>(`/payments/${normalizedId}`);
      if (response.data.status === "succeeded" || response.data.status === "failed") {
        await clearPaymentIdempotencyKey(normalizedId || "");
      }
      return response.data;
    },
    enabled: shouldRun,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "succeeded" || status === "failed") return false;
      return 3000;
    },
  });
};
