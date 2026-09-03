import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Product as BackendProduct, ProductRequest, UUID } from "../../lib/api-dtos";
import { toDecimalString, toNumber } from "../../lib/api-dtos";
import { database } from "../../db/database";
import { v4 as uuidv4 } from "uuid";
import { useBusinessContext } from "../../contexts/BusinessContext";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useState } from "react";

// Offline-first wrapper — Phase 2.2 (§3.6): all local writes go through WatermelonDB writers
// Reads remain TanStack Query for now, but writes are local-first and sync via synchronize()

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

function mapProduct(p: BackendProduct): Product {
  return { ...p, price: toNumber(p.price), cost: toNumber(p.cost), stockQuantity: 0, buyingPrice: toNumber(p.cost), supplier: null, minStockLevel: null, maxStockLevel: null, lastRestockedAt: null };
}
function toProductRequest(input: CreateProductInput | UpdateProductInput): ProductRequest {
  return { name: input.name || "", category: input.category, imageUrl: input.imageUrl, price: toDecimalString(input.price), cost: toDecimalString(input.cost ?? input.buyingPrice ?? 0), isActive: true };
}

export const useProducts = () => {
  const queryClient = useQueryClient();
  const { activeBusinessId } = (() => { try { return useBusinessContext() as any; } catch { return { activeBusinessId: null }; } })();
  const bid = activeBusinessId || "";

  // Local observe fallback — example for offline-first reads (kept alongside API for migration)
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  useEffect(() => {
    if (!bid) { setLocalProducts([]); return; }
    const col: any = (database as any).get("products");
    const sub = col.query(Q.where("business_id", bid)).observe().subscribe((rows: any[]) => {
      setLocalProducts(rows.map((r: any) => ({ id: r.id, businessId: r.businessId, name: r.name, category: r.category, price: toNumber(r.price), cost: toNumber(r.cost) } as any)));
    });
    return () => sub.unsubscribe();
  }, [bid]);

  const getProducts = useQuery({
    queryKey: ["products", bid],
    queryFn: async () => {
      // Prefer local if we have synced data, else pull from API (first sync will populate local)
      if (localProducts.length) return localProducts as any;
      const res = await api.get<{ products: BackendProduct[] }>("/products");
      return (res.data.products || []).map(mapProduct);
    },
    enabled: !!bid,
  });

  const createProduct = useMutation({
    mutationFn: async (data: CreateProductInput) => {
      if (!bid) throw new Error("Select a business first");
      // §3.6: never call API directly — write to Watermelon first, sync pushes
      const id = uuidv4();
      await (database as any).write(async () => {
        const col: any = (database as any).get("products");
        await col.create((rec: any) => {
          rec._raw.id = id;
          rec.businessId = bid;
          rec.tenantId = bid;
          rec.name = data.name.trim();
          rec.category = data.category?.trim() || "Other";
          rec.price = toDecimalString(data.price);
          rec.cost = toDecimalString(data.cost ?? data.buyingPrice ?? 0);
          rec.isActive = true;
          rec.syncVersion = 1;
        });
      });
      // trigger background sync (NetInfo + interval will also push)
      import("../../sync/client").then((m) => m.syncNow().catch(() => {}));
      return mapProduct({ id, businessId: bid as any, name: data.name, price: toDecimalString(data.price), cost: toDecimalString(data.cost ?? data.buyingPrice ?? 0) } as any);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, data }: { id: UUID; data: UpdateProductInput }) => {
      await (database as any).write(async () => {
        const col: any = (database as any).get("products");
        const rec: any = await col.find(id);
        await rec.update((r: any) => {
          if (data.name) r.name = data.name.trim();
          if (data.category) r.category = data.category.trim();
          if (data.price !== undefined) r.price = toDecimalString(data.price);
          if (data.cost !== undefined || data.buyingPrice !== undefined) r.cost = toDecimalString((data.cost ?? data.buyingPrice) as any);
          r.syncVersion = (r.syncVersion || 1) + 1;
        });
      });
      import("../../sync/client").then((m) => m.syncNow().catch(() => {}));
      return mapProduct({ id } as any);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: UUID) => {
      await (database as any).write(async () => {
        const rec: any = await (database as any).get("products").find(id);
        await rec.update((r: any) => { r.deletedAt = Date.now(); });
        await rec.markAsDeleted();
      });
      import("../../sync/client").then((m) => m.syncNow().catch(() => {}));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  return {
    products: localProducts.length ? (localProducts as any) : (getProducts.data || []),
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
