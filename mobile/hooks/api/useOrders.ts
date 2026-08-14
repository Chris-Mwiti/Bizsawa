import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { CreateOrderRequest, Order, UUID } from "../../lib/api-dtos";
import { toDecimalString } from "../../lib/api-dtos";

export enum OrderStatus {
  draft = "draft",
  confirmed = "confirmed",
  fulfilled = "fulfilled",
  cancelled = "cancelled",
  refunded = "refunded",
  drafted = "draft",
  created = "confirmed",
  pending = "draft",
  paid = "fulfilled",
  canceled = "cancelled",
  failed = "cancelled",
}

export interface CreateOrderInput {
  customerId?: UUID | null;
  paymentMethod?: string;
  orderItems?: { productId: UUID; quantity: number | string; unitPrice?: number | string }[];
  lines?: CreateOrderRequest["lines"];
}

export interface UpdateOrderInput {
  status?: OrderStatus;
}

function toCreateOrderRequest(data: CreateOrderInput): CreateOrderRequest {
  return {
    customerId: data.customerId || null,
    paymentMethod: data.paymentMethod,
    lines:
      data.lines ||
      (data.orderItems || []).map((item) => ({
        productId: item.productId,
        quantity: toDecimalString(item.quantity),
        unitPrice: toDecimalString(item.unitPrice),
      })),
  };
}

export const useOrders = () => {
  const queryClient = useQueryClient();

  const getOrders = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const response = await api.get<{ orders: Order[] }>("/orders");
      return response.data.orders || [];
    },
  });

  const createOrder = useMutation({
    mutationFn: async (data: CreateOrderInput) => {
      const response = await api.post<Order>("/orders", toCreateOrderRequest(data));
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, data }: { id: UUID; data: UpdateOrderInput }) => {
      const status = data.status;
      const action =
        status === OrderStatus.confirmed
          ? "confirm"
          : status === OrderStatus.fulfilled
            ? "fulfill"
            : status === OrderStatus.refunded
              ? "refund"
              : "cancel";
      const response = await api.post<Order>(`/orders/${id}/${action}`);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: UUID) => {
      await api.post(`/orders/${id}/cancel`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  return {
    orders: getOrders.data || [],
    isLoading: getOrders.isLoading,
    error: getOrders.error,
    refetch: getOrders.refetch,
    createOrder: createOrder.mutateAsync,
    isCreating: createOrder.isPending,
    updateOrder: updateOrder.mutateAsync,
    isUpdating: updateOrder.isPending,
    deleteOrder: deleteOrder.mutateAsync,
    isDeleting: deleteOrder.isPending,
  };
};
