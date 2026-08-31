import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { InvoiceListItem, InvoiceDetail, UUID, DecimalString } from "../../lib/api-dtos";
import { toDecimalString } from "../../lib/api-dtos";

export interface CreateInvoiceInput {
  customerId: UUID;
  dueAt: string;
  lines: Array<{
    description: string;
    quantity: number | string;
    unitPrice: number | string;
    taxRuleId?: UUID | null;
  }>;
  notes?: string;
}

function toInvoiceRequest(input: CreateInvoiceInput) {
  return {
    customerId: input.customerId,
    dueAt: input.dueAt,
    lines: input.lines.map((l) => ({
      description: l.description,
      quantity: toDecimalString(l.quantity),
      unitPrice: toDecimalString(l.unitPrice),
      taxRuleId: l.taxRuleId,
    })),
    notes: input.notes,
  };
}

export const useInvoices = () => {
  const queryClient = useQueryClient();

  const getInvoices = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const response = await api.get<{ invoices: InvoiceListItem[] }>("/invoices");
      return response.data.invoices || [];
    },
  });

  const getInvoice = (id: UUID) =>
    useQuery<InvoiceDetail>({
      queryKey: ["invoices", id],
      queryFn: async () => {
        const response = await api.get<InvoiceDetail>(`/invoices/${id}`);
        return response.data;
      },
      enabled: !!id,
    });

  const createInvoice = useMutation({
    mutationFn: async (data: CreateInvoiceInput) => {
      const response = await api.post<InvoiceDetail>("/invoices", toInvoiceRequest(data));
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const sendInvoice = useMutation({
    mutationFn: async (id: UUID) => {
      await api.post(`/invoices/${id}/send`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
    },
  });

  const sendWhatsApp = useMutation({
    mutationFn: async (id: UUID) => {
      await api.post(`/invoices/${id}/send-whatsapp`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
    },
  });

  const recordPayment = useMutation({
    mutationFn: async ({ id, amount, method, reference }: { id: UUID; amount: number | string; method: string; reference?: string }) => {
      await api.post(`/invoices/${id}/record-payment`, { amount: toDecimalString(amount), method, reference });
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
    },
  });

  return {
    invoices: getInvoices.data || [],
    isLoading: getInvoices.isLoading,
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
