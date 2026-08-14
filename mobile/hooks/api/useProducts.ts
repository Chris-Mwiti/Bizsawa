import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Product as BackendProduct, ProductRequest, UUID } from "../../lib/api-dtos";
import { toDecimalString, toNumber } from "../../lib/api-dtos";

export interface Product extends Omit<BackendProduct, "price" | "cost"> {
  price: number;
  cost: number;
  stockQuantity: number;
  buyingPrice: number;
  supplier?: string | null;
  minStockLevel?: number | null;
  maxStockLevel?: number | null;
  lastRestockedAt?: string | null;
}

export interface CreateProductInput {
  name: string;
  category?: string;
  imageUrl?: string;
  stockQuantity?: number;
  price: number | string;
  buyingPrice?: number | string;
  cost?: number | string;
  supplier?: string | null;
  minStockLevel?: number | null;
  maxStockLevel?: number | null;
  lastRestockedAt?: string | null;
}

export type UpdateProductInput = Partial<CreateProductInput>;

function mapProduct(product: BackendProduct): Product {
  return {
    ...product,
    price: toNumber(product.price),
    cost: toNumber(product.cost),
    stockQuantity: 0,
    buyingPrice: toNumber(product.cost),
    supplier: null,
    minStockLevel: null,
    maxStockLevel: null,
    lastRestockedAt: null,
  };
}

function toProductRequest(input: CreateProductInput | UpdateProductInput): ProductRequest {
  return {
    name: input.name || "",
    category: input.category,
    imageUrl: input.imageUrl,
    price: toDecimalString(input.price),
    cost: toDecimalString(input.cost ?? input.buyingPrice ?? 0),
    isActive: true,
  };
}

export const useProducts = () => {
  const queryClient = useQueryClient();

  const getProducts = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const response = await api.get<{ products: BackendProduct[] }>("/products");
      return (response.data.products || []).map(mapProduct);
    },
  });

  const createProduct = useMutation({
    mutationFn: async (data: CreateProductInput) => {
      const response = await api.post<BackendProduct>("/products", toProductRequest(data));
      return mapProduct(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, data }: { id: UUID; data: UpdateProductInput }) => {
      const response = await api.put<BackendProduct>(`/products/${id}`, toProductRequest(data));
      return mapProduct(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: UUID) => {
      await api.delete(`/products/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  return {
    products: getProducts.data || [],
    isLoading: getProducts.isLoading,
    error: (getProducts.error as ApiError)?.friendlyMessage || null,
    refetch: getProducts.refetch,
    createProduct: createProduct.mutateAsync,
    isCreating: createProduct.isPending,
    updateProduct: updateProduct.mutateAsync,
    isUpdating: updateProduct.isPending,
    deleteProduct: deleteProduct.mutateAsync,
    isDeleting: deleteProduct.isPending,
  };
};
