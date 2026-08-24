import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { UUID } from "../../lib/api-dtos";
import { toNumber, toDecimalString } from "../../lib/api-dtos";

export interface InventoryItem {
  id: UUID;
  businessId: UUID;
  productId: UUID;
  quantity: number;
  lowStockThreshold: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StockMovement {
  id: UUID;
  businessId: UUID;
  productId: UUID;
  quantityDelta: number;
  movementType: string;
  referenceType?: string | null;
  referenceId?: UUID | null;
  notes?: string;
  occurredAt: string;
}

export interface InventoryValuation {
  productId: UUID;
  quantity: number;
}

export interface AdjustStockInput {
  productId: UUID;
  quantityDelta: number | string;
  lowStockThreshold?: number | string;
  notes?: string;
}

// Helper to safely parse decimal API fields to JS numbers
function mapInventoryItem(item: any): InventoryItem {
  return {
    ...item,
    quantity: toNumber(item.quantity),
    lowStockThreshold: toNumber(item.lowStockThreshold),
  };
}

function mapStockMovement(mv: any): StockMovement {
  return {
    ...mv,
    quantityDelta: toNumber(mv.quantityDelta),
  };
}

function mapValuation(v: any): InventoryValuation {
  return {
    ...v,
    quantity: toNumber(v.quantity),
  };
}

export const useInventory = () => {
  const queryClient = useQueryClient();

  // GET /inventory - Fetch full inventory list
  const getInventory = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const response = await api.get<{ inventory: any[] }>("/inventory");
      return (response.data.inventory || []).map(mapInventoryItem);
    },
  });

  // GET /inventory/low-stock - Fetch items below threshold
  const getLowStockItems = useQuery({
    queryKey: ["inventory", "low-stock"],
    queryFn: async () => {
      const response = await api.get<{ items: any[] }>("/inventory/low-stock");
      return (response.data.items || []).map(mapInventoryItem);
    },
  });

  // GET /inventory/movements - Fetch stock movement history
  const getStockMovements = useQuery({
    queryKey: ["inventory", "movements"],
    queryFn: async () => {
      const response = await api.get<{ movements: any[] }>("/inventory/movements");
      return (response.data.movements || []).map(mapStockMovement);
    },
  });

  // GET /inventory/valuation - Fetch inventory valuations
  const getValuation = useQuery({
    queryKey: ["inventory", "valuation"],
    queryFn: async () => {
      const response = await api.get<{ valuation: any[] }>("/inventory/valuation");
      return (response.data.valuation || []).map(mapValuation);
    },
  });

  // POST /inventory/adjustments - Record stock movements / threshold changes
  const adjustStock = useMutation({
    mutationFn: async (input: AdjustStockInput) => {
      const payload = {
        productId: input.productId,
        quantityDelta: toDecimalString(input.quantityDelta),
        lowStockThreshold: toDecimalString(input.lowStockThreshold ?? 0),
        notes: input.notes || "",
      };
      const response = await api.post<any>("/inventory/adjustments", payload);
      return mapStockMovement(response.data);
    },
    onSuccess: () => {
      // Refresh inventory, low stock, movements, and product queries across the UI
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  return {
    inventory: getInventory.data || [],
    isLoadingInventory: getInventory.isLoading,
    inventoryError: (getInventory.error as ApiError)?.friendlyMessage || null,

    lowStockItems: getLowStockItems.data || [],
    isLoadingLowStock: getLowStockItems.isLoading,

    movements: getStockMovements.data || [],
    isLoadingMovements: getStockMovements.isLoading,

    valuation: getValuation.data || [],
    isLoadingValuation: getValuation.isLoading,

    adjustStock: adjustStock.mutateAsync,
    isAdjustingStock: adjustStock.isPending,

    refetchInventory: getInventory.refetch,
  };
};
