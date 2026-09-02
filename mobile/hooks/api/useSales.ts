import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { CreateSaleRequest, Sale, UUID } from "../../lib/api-dtos";
import { toDecimalString, toNumber } from "../../lib/api-dtos";
import { database } from "../../db/database";
import { v4 as uuidv4 } from "uuid";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useState } from "react";
import { useBusinessContext } from "../../contexts/BusinessContext";
import { shortId } from "../../lib/ids";

export interface CreateSaleInput { orderId?: UUID | null; customerId?: UUID | null; paymentMethod?: string; productId?: UUID; quantity?: number | string; totalAmount?: number | string; lines?: CreateSaleRequest["lines"]; }
function toCreateSaleRequest(data: CreateSaleInput): CreateSaleRequest {
  return {
    orderId: data.orderId || null,
    customerId: data.customerId || null,
    paymentMethod: data.paymentMethod,
    lines: data.lines || (data.productId ? [{ productId: data.productId, quantity: toDecimalString(data.quantity ?? 1), unitPrice: toDecimalString(data.totalAmount ?? 0) }] : []),
  };
}
function mapRaw(raw: any): Sale {
  return {
    id: raw.id,
    businessId: raw.business_id,
    orderId: raw.order_id,
    customerId: raw.customer_id,
    receiptNumber: raw.receipt_number,
    staffId: raw.staff_id || "local",
    paymentMethod: raw.payment_method,
    subtotal: raw.subtotal,
    taxAmount: raw.tax_amount,
    total: raw.total,
    status: raw.status,
    soldAt: new Date(raw.sold_at * 1000).toISOString(),
    createdAt: new Date(raw.created_at * 1000).toISOString(),
    updatedAt: new Date(raw.updated_at * 1000).toISOString(),
  } as any;
}

export const useSales = () => {
  const queryClient = useQueryClient();
  const { activeBusinessId } = (() => { try { return useBusinessContext() as any; } catch { return { activeBusinessId: null }; } })();
  const bid = activeBusinessId || "";
  const [local, setLocal] = useState<Sale[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(true);
  useEffect(() => {
    if (!bid) { setLocal([]); setIsLocalLoading(false); return; }
    const col: any = (database as any).get("sales");
    const sub = col.query(Q.where("business_id", bid)).observe().subscribe((rows: any[]) => {
      setLocal(rows.map(mapRaw));
      setIsLocalLoading(false);
    });
    return () => sub.unsubscribe();
  }, [bid]);

  const getSales = useQuery({
    queryKey: ["sales", bid],
    queryFn: async () => {
      if (local.length) return local;
      const res = await api.get<{ sales: Sale[] }>("/sales");
      return res.data.sales || [];
    },
    enabled: !!bid,
  });

  const createSale = useMutation({
    mutationFn: async (data: CreateSaleInput) => {
      const req = toCreateSaleRequest(data);
      if (!req.lines?.length) throw new Error("Add at least one product");
      const id = uuidv4();
      const receipt = `RCPT-${shortId(id, 6)}`;
      const total = req.lines.reduce((s, l) => s + toNumber(l.unitPrice) * toNumber(l.quantity), 0);
      const now = Date.now() / 1000;
      await (database as any).write(async () => {
        const col: any = (database as any).get("sales");
        await col.create((rec: any) => {
          rec._raw.id = id;
          rec.businessId = bid;
          rec.orderId = req.orderId || null;
          rec.customerId = req.customerId || null;
          rec.receiptNumber = receipt;
          rec.staffId = "local";
          rec.paymentMethod = req.paymentMethod || "cash";
          rec.subtotal = toDecimalString(total);
          rec.taxAmount = toDecimalString(0);
          rec.total = toDecimalString(total);
          rec.status = "completed";
          rec.soldAt = now;
          rec.syncVersion = 1;
        });
        const lineCol: any = (database as any).get("sale_lines");
        for (const line of req.lines) {
          await lineCol.create((rec: any) => {
            rec._raw.id = uuidv4();
            rec.businessId = bid;
            rec.saleId = id;
            rec.productId = line.productId;
            rec.quantity = toDecimalString(line.quantity);
            rec.unitPrice = toDecimalString(line.unitPrice);
            rec.lineTotal = toDecimalString(toNumber(line.quantity) * toNumber(line.unitPrice));
            rec.syncVersion = 1;
          });
        }
      });
      import("../../sync/client").then(m => m.syncNow().catch(()=>{}));
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      return { id, receiptNumber: receipt, total: toDecimalString(total) } as any;
    },
  });

  const voidSale = useMutation({
    mutationFn: async (id: UUID) => {
      await (database as any).write(async () => {
        const rec: any = await (database as any).get("sales").find(id);
        await rec.update((r: any) => { r.deletedAt = Date.now() / 1000; });
        await rec.markAsDeleted();
      });
      import("../../sync/client").then(m => m.syncNow().catch(()=>{}));
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
  });

  const sales = local.length ? local : (getSales.data || []);
  return {
    sales,
    isLoading: isLocalLoading || getSales.isLoading,
    error: (getSales.error as ApiError)?.friendlyMessage || null,
    refetch: getSales.refetch,
    createSale: createSale.mutateAsync,
    isCreating: createSale.isPending,
    updateSale: async () => { throw new Error("Updating sales is not supported. Void the sale instead."); },
    isUpdating: false,
    deleteSale: voidSale.mutateAsync,
    isDeleting: voidSale.isPending,
  };
};
