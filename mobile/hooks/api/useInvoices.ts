import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { InvoiceListItem, InvoiceDetail, UUID, DecimalString } from "../../lib/api-dtos";
import { toDecimalString, toNumber } from "../../lib/api-dtos";
import { database } from "../../db/database";
import { v4 as uuidv4 } from "uuid";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useState } from "react";
import { useBusinessContext } from "../../contexts/BusinessContext";
import { toISO } from "../../lib/syncDates";

export interface CreateInvoiceInput { customerId: UUID; dueAt: string; lines: Array<{ description: string; quantity: number | string; unitPrice: number | string; taxRuleId?: UUID | null }>; notes?: string; }
function toInvoiceRequest(input: CreateInvoiceInput) {
  return { customerId: input.customerId, dueAt: input.dueAt, lines: input.lines.map((l) => ({ description: l.description, quantity: toDecimalString(l.quantity), unitPrice: toDecimalString(l.unitPrice), taxRuleId: l.taxRuleId })), notes: input.notes };
}
function mapRaw(raw: any): InvoiceListItem {
  return { id: raw.id, invoiceNumber: raw.invoice_number, customerName: raw.customer_id || "Customer", status: raw.status, total: raw.total, amountDue: raw.amount_due, currency: raw.currency, dueAt: raw.due_at ? toISO(raw.due_at) : new Date().toISOString(), createdAt: toISO(raw.created_at) } as any;
}

export const useInvoices = () => {
  const queryClient = useQueryClient();
  const { activeBusinessId } = (() => { try { return useBusinessContext() as any; } catch { return { activeBusinessId: null }; } })();
  const bid = activeBusinessId || "";
  const [local, setLocal] = useState<InvoiceListItem[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(true);
  useEffect(() => {
    if (!bid) { setLocal([]); setIsLocalLoading(false); return; }
    const col: any = (database as any).get("invoices");
    const sub = col.query(Q.where("business_id", bid)).observe().subscribe((rows: any[]) => {
      setLocal(rows.map(mapRaw));
      setIsLocalLoading(false);
    });
    return () => sub.unsubscribe();
  }, [bid]);

  const getInvoices = useQuery({
    queryKey: ["invoices", bid],
    queryFn: async () => {
      if (local.length) return local;
      const res = await api.get<{ invoices: InvoiceListItem[] }>("/invoices");
      return res.data.invoices || [];
    },
    enabled: !!bid,
  });

  const getInvoice = (id: UUID) =>
    useQuery<InvoiceDetail>({
      queryKey: ["invoices", id],
      queryFn: async () => {
        // Prefer local
        try {
          const rec: any = await (database as any).get("invoices").find(id);
          const raw = rec._raw;
          const linesCol: any = (database as any).get("invoice_lines");
          const lines = await linesCol.query(Q.where("invoice_id", id)).fetch() as any[];
          return {
            id: raw.id,
            invoiceNumber: raw.invoice_number,
            customerName: raw.customer_id,
            status: raw.status,
            total: raw.total,
            subtotal: raw.subtotal,
            taxAmount: raw.tax_amount,
            amountPaid: raw.amount_paid,
            amountDue: raw.amount_due,
            currency: raw.currency,
            dueAt: raw.due_at ? toISO(raw.due_at) : new Date().toISOString(),
            createdAt: toISO(raw.created_at),
            lines: lines.map((l: any) => ({ id: l.id, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
            payments: [],
          } as any;
        } catch {
          const res = await api.get<InvoiceDetail>(`/invoices/${id}`);
          return res.data;
        }
      },
      enabled: !!id,
    });

  const createInvoice = useMutation({
    mutationFn: async (data: CreateInvoiceInput) => {
      const id = uuidv4();
      const number = `INV-${id.slice(0, 6).toUpperCase()}`;
      const subtotal = data.lines.reduce((s, l) => s + toNumber(l.unitPrice) * toNumber(l.quantity), 0);
      const total = subtotal;
      const now = Date.now() / 1000;
      const dueAt = data.dueAt ? new Date(data.dueAt).getTime() / 1000 : now + 7 * 86400;
      await (database as any).write(async () => {
        const col: any = (database as any).get("invoices");
        await col.create((rec: any) => {
          rec._raw.id = id;
          rec.businessId = bid;
          rec.customerId = data.customerId;
          rec.invoiceNumber = number;
          rec.status = "draft";
          rec.subtotal = toDecimalString(subtotal);
          rec.taxAmount = toDecimalString(0);
          rec.total = toDecimalString(total);
          rec.amountPaid = toDecimalString(0);
          rec.amountDue = toDecimalString(total);
          rec.currency = "KES";
          rec.notes = data.notes || null;
          rec.dueAt = dueAt;
          rec.syncVersion = 1;
        });
        const lineCol: any = (database as any).get("invoice_lines");
        for (const line of data.lines) {
          await lineCol.create((rec: any) => {
            rec._raw.id = uuidv4();
            rec.businessId = bid;
            rec.invoiceId = id;
            rec.description = line.description;
            rec.quantity = toDecimalString(line.quantity);
            rec.unitPrice = toDecimalString(line.unitPrice);
            rec.lineTotal = toDecimalString(toNumber(line.quantity) * toNumber(line.unitPrice));
            rec.syncVersion = 1;
          });
        }
      });
      import("../../sync/client").then(m => m.syncNow().catch(()=>{}));
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      return { id, invoiceNumber: number } as any;
    },
  });

  const sendInvoice = useMutation({
    mutationFn: async (id: UUID) => { await api.post(`/invoices/${id}/send`); },
    onSuccess: (_, id) => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); queryClient.invalidateQueries({ queryKey: ["invoices", id] }); },
  });
  const sendWhatsApp = useMutation({
    mutationFn: async (id: UUID) => { await api.post(`/invoices/${id}/send-whatsapp`); },
    onSuccess: (_, id) => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); queryClient.invalidateQueries({ queryKey: ["invoices", id] }); },
  });
  const recordPayment = useMutation({
    mutationFn: async ({ id, amount, method, reference }: { id: UUID; amount: number | string; method: string; reference?: string }) => {
      await api.post(`/invoices/${id}/record-payment`, { amount: toDecimalString(amount), method, reference });
    },
    onSuccess: (_, { id }) => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); queryClient.invalidateQueries({ queryKey: ["invoices", id] }); },
  });

  const invoices = local.length ? local : (getInvoices.data || []);
  return {
    invoices,
    isLoading: isLocalLoading || getInvoices.isLoading,
    error: (getInvoices.error as ApiError)?.friendlyMessage || null,
    refetch: getInvoices.refetch,
    getInvoice,
    createInvoice: createInvoice.mutateAsync,
    isCreating: createInvoice.isPending,
    sendInvoice: sendInvoice.mutateAsync,
    isSending: sendInvoice.isPending,
    sendWhatsApp: sendWhatsApp.mutateAsync,
    isSendingWhatsApp: sendWhatsApp.isPending,
    recordPayment: recordPayment.mutateAsync,
    isRecordingPayment: recordPayment.isPending,
  };
};
