import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

export interface UseOrdersOptions {
  limit?: number;
  status?: OrderStatus[];
}

interface OrdersResponse {
  orders: Order[];
  total?: number;
  limit?: number;
  offset?: number;
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

const DEFAULT_PAGE_SIZE = 25;

export const useOrders = (options: UseOrdersOptions = {}) => {
  const queryClient = useQueryClient();
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  const statusFilter = options.status;

  const [offset, setOffset] = useState(0);

  const getOrders = useQuery({
    queryKey: ["orders", { limit, offset, status: statusFilter }],
    queryFn: async () => {
      const response = await api.get<OrdersResponse>("/orders", {
        params: {
          limit,
          offset,
          ...(statusFilter?.length ? { status: statusFilter.join(",") } : {}),
        },
      });
      return response.data;
    },
    placeholderData: (previousData) => previousData,
  });

  const orders = getOrders.data?.orders ?? [];
  const total = getOrders.data?.total ?? orders.length;
  const hasNextPage = offset + orders.length < total;
  const hasPreviousPage = offset > 0;

  const nextPage = () => {
    if (hasNextPage) setOffset((prev) => prev + limit);
  };

  const previousPage = () => {
    setOffset((prev) => Math.max(0, prev - limit));
  };

  const resetPagination = () => setOffset(0);

  const createOrder = useMutation({
    mutationFn: async (data: CreateOrderInput) => {
      const response = await api.post<Order>("/orders", toCreateOrderRequest(data));
      return response.data;
    },
    onSuccess: () => {
      resetPagination();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
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
    orders,
    total,
    limit,
    offset,
    hasNextPage,
    hasPreviousPage,
    nextPage,
    previousPage,
    resetPagination,
    isLoading: getOrders.isLoading,
    isFetching: getOrders.isFetching,
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
