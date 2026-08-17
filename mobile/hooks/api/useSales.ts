import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { CreateSaleRequest, Sale, UUID } from "../../lib/api-dtos";
import { toDecimalString } from "../../lib/api-dtos";

export interface CreateSaleInput {
  orderId?: UUID | null;
  customerId?: UUID | null;
  paymentMethod?: string;
  productId?: UUID;
  quantity?: number | string;
  totalAmount?: number | string;
  lines?: CreateSaleRequest["lines"];
}

function toCreateSaleRequest(data: CreateSaleInput): CreateSaleRequest {
  return {
    orderId: data.orderId || null,
    customerId: data.customerId || null,
    paymentMethod: data.paymentMethod,
    lines:
      data.lines ||
      (data.productId
        ? [
            {
              productId: data.productId,
              quantity: toDecimalString(data.quantity ?? 1),
              unitPrice: toDecimalString(data.totalAmount ?? 0),
            },
          ]
        : []),
  };
}

export const useSales = () => {
  const queryClient = useQueryClient();

  const getSales = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const response = await api.get<{ sales: Sale[] }>("/sales");
      return response.data.sales || [];
    },
  });

  const createSale = useMutation({
    mutationFn: async (data: CreateSaleInput) => {
      const response = await api.post<Sale>("/sales", toCreateSaleRequest(data));
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const voidSale = useMutation({
    mutationFn: async (id: UUID) => {
      await api.post(`/sales/${id}/void`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales"] }),
  });

  return {
    sales: getSales.data || [],
    isLoading: getSales.isLoading,
    error: (getSales.error as ApiError)?.friendlyMessage || null,
    refetch: getSales.refetch,
    createSale: createSale.mutateAsync,
    isCreating: createSale.isPending,
    updateSale: async () => {
      throw new Error("Updating sales is not supported by the backend. Void the sale instead.");
    },
    isUpdating: false,
    deleteSale: voidSale.mutateAsync,
    isDeleting: voidSale.isPending,
  };
};
