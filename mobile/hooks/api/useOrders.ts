import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import type { CreateOrderRequest, Order, UUID } from "../../lib/api-dtos";
import { toDecimalString, toNumber } from "../../lib/api-dtos";
import { database } from "../../db/database";
import { v4 as uuidv4 } from "uuid";
import { Q } from "@nozbe/watermelondb";
import { useBusinessContext } from "../../contexts/BusinessContext";

export enum OrderStatus { draft = "draft", confirmed = "confirmed", fulfilled = "fulfilled", cancelled = "cancelled", refunded = "refunded", drafted = "draft", created = "confirmed", pending = "draft", paid = "fulfilled", canceled = "cancelled", failed = "cancelled" }
export interface CreateOrderInput { customerId?: UUID | null; paymentMethod?: string; orderItems?: { productId: UUID; quantity: number | string; unitPrice?: number | string }[]; lines?: CreateOrderRequest["lines"]; }
export interface UpdateOrderInput { status?: OrderStatus; customerPhone?: string; }
export interface UseOrdersOptions { limit?: number; status?: OrderStatus[]; }

function toCreateOrderRequest(data: CreateOrderInput): CreateOrderRequest {
  return { customerId: data.customerId || null, paymentMethod: data.paymentMethod, lines: data.lines || (data.orderItems || []).map((item) => ({ productId: item.productId, quantity: toDecimalString(item.quantity), unitPrice: toDecimalString(item.unitPrice) })) };
}
function mapRaw(raw: any): Order {
  return { id: raw.id, businessId: raw.business_id, customerId: raw.customer_id, status: raw.status, subtotal: raw.subtotal, taxAmount: raw.tax_amount, total: raw.total, paymentMethod: raw.payment_method, createdAt: new Date(raw.created_at * 1000).toISOString(), updatedAt: new Date(raw.updated_at * 1000).toISOString() } as any;
}

export const useOrders = (options: UseOrdersOptions = {}) => {
  const queryClient = useQueryClient();
  const { activeBusinessId } = (() => { try { return useBusinessContext() as any; } catch { return { activeBusinessId: null }; } })();
  const bid = activeBusinessId || "";
  const limit = options.limit ?? 25;
  const [offset, setOffset] = useState(0);
  const [local, setLocal] = useState<Order[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(true);
  useEffect(() => {
    if (!bid) { setLocal([]); setIsLocalLoading(false); return; }
    const col: any = (database as any).get("orders");
    const sub = col.query(Q.where("business_id", bid)).observe().subscribe((rows: any[]) => {
      setLocal(rows.map(mapRaw));
      setIsLocalLoading(false);
    });
    return () => sub.unsubscribe();
  }, [bid]);

  const getOrders = useQuery({
    queryKey: ["orders", { limit, offset, status: options.status, bid }],
    queryFn: async () => {
      if (local.length) return { orders: local, total: local.length } as any;
      const res = await api.get<{ orders: Order[]; total?: number }>("/orders", { params: { limit, offset } });
      return res.data;
    },
    enabled: !!bid,
    placeholderData: (prev: any) => prev,
  });

  const orders = local.length ? local.slice(offset, offset + limit) : (getOrders.data?.orders ?? []);
  const total = local.length ? local.length : (getOrders.data?.total ?? orders.length);
  const hasNextPage = offset + orders.length < total;
  const hasPreviousPage = offset > 0;
  const nextPage = () => { if (hasNextPage) setOffset((p) => p + limit); };
  const previousPage = () => setOffset((p) => Math.max(0, p - limit));
  const resetPagination = () => setOffset(0);

  const createOrder = useMutation({
    mutationFn: async (data: CreateOrderInput) => {
      const req = toCreateOrderRequest(data);
      const id = uuidv4();
      const total = req.lines.reduce((s, l) => s + toNumber(l.unitPrice) * toNumber(l.quantity), 0);
      const now = Date.now() / 1000;
      await (database as any).write(async () => {
        const col: any = (database as any).get("orders");
        await col.create((rec: any) => {
          rec._raw.id = id;
          rec.businessId = bid;
          rec.customerId = req.customerId || null;
          rec.status = "draft";
          rec.subtotal = toDecimalString(total);
          rec.taxAmount = toDecimalString(0);
          rec.total = toDecimalString(total);
          rec.paymentMethod = req.paymentMethod || "cash";
          rec.syncVersion = 1;
        });
        const lineCol: any = (database as any).get("order_lines");
        for (const line of req.lines) {
          await lineCol.create((rec: any) => {
            rec._raw.id = uuidv4();
            rec.businessId = bid;
            rec.orderId = id;
            rec.productId = line.productId;
            rec.quantity = toDecimalString(line.quantity);
            rec.unitPrice = toDecimalString(line.unitPrice);
            rec.lineTotal = toDecimalString(toNumber(line.quantity) * toNumber(line.unitPrice));
            rec.syncVersion = 1;
          });
        }
      });
      import("../../sync/client").then(m => m.syncNow().catch(()=>{}));
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      return { id, status: "draft", total: toDecimalString(total) } as any;
    },
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, data }: { id: UUID; data: UpdateOrderInput }) => {
      await (database as any).write(async () => {
        const rec: any = await (database as any).get("orders").find(id);
        await rec.update((r: any) => {
          if (data.status) r.status = data.status;
          r.syncVersion = (r.syncVersion || 1) + 1;
        });
      });
      import("../../sync/client").then(m => m.syncNow().catch(()=>{}));
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      return { id } as any;
    },
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: UUID) => {
      await (database as any).write(async () => {
        const rec: any = await (database as any).get("orders").find(id);
        await rec.update((r: any) => { r.deletedAt = Date.now() / 1000; });
        await rec.markAsDeleted();
      });
      import("../../sync/client").then(m => m.syncNow().catch(()=>{}));
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  return {
    orders, total, limit, offset, hasNextPage, hasPreviousPage, nextPage, previousPage, resetPagination,
    isLoading: isLocalLoading || (getOrders.isLoading as any),
    isFetching: getOrders.isFetching as any,
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
