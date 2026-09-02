import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Expense as BackendExpense, UUID } from "../../lib/api-dtos";
import { toDecimalString, toNumber } from "../../lib/api-dtos";
import { database } from "../../db/database";
import { v4 as uuidv4 } from "uuid";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useState } from "react";
import { useBusinessContext } from "../../contexts/BusinessContext";

export interface Expense extends BackendExpense { type: string; frequency?: string; nextDueDate?: string; }
export interface CreateExpenseInput { type?: string; category?: string; description?: string; vendor?: string; amount: number | string; taxAmount?: number | string; isRecurring?: boolean; frequency?: string; recurringInterval?: string; spentAt?: string | null; nextDueDate?: string; }
export type UpdateExpenseInput = Partial<CreateExpenseInput>;

function mapExpense(e: BackendExpense): Expense { return { ...e, type: e.category, frequency: e.recurringInterval } as any; }
function mapRaw(raw: any): Expense {
  return {
    id: raw.id,
    businessId: raw.business_id,
    category: raw.category,
    description: raw.description,
    vendor: raw.vendor,
    amount: raw.amount,
    taxAmount: raw.tax_amount,
    isRecurring: !!raw.is_recurring,
    recurringInterval: raw.recurring_interval,
    spentAt: raw.spent_at ? new Date(raw.spent_at * 1000).toISOString() : new Date().toISOString(),
    createdAt: new Date(raw.created_at * 1000).toISOString(),
    updatedAt: new Date(raw.updated_at * 1000).toISOString(),
    type: raw.category,
    frequency: raw.recurring_interval,
  } as any;
}

export const useExpenses = () => {
  const queryClient = useQueryClient();
  const { activeBusinessId } = (() => { try { return useBusinessContext() as any; } catch { return { activeBusinessId: null }; } })();
  const bid = activeBusinessId || "";
  const [local, setLocal] = useState<Expense[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(true);
  useEffect(() => {
    if (!bid) { setLocal([]); setIsLocalLoading(false); return; }
    const col: any = (database as any).get("expenses");
    const sub = col.query(Q.where("business_id", bid)).observe().subscribe((rows: any[]) => {
      setLocal(rows.map(mapRaw));
      setIsLocalLoading(false);
    });
    return () => sub.unsubscribe();
  }, [bid]);

  const getExpenses = useQuery({
    queryKey: ["expenses", bid],
    queryFn: async () => {
      if (local.length) return local;
      const res = await api.get<{ expenses: BackendExpense[] }>("/expenses");
      return (res.data.expenses || []).map(mapExpense);
    },
    enabled: !!bid,
  });

  const createExpense = useMutation({
    mutationFn: async (data: CreateExpenseInput) => {
      const category = (data.category || data.type || "").trim();
      if (!category) throw new Error("Category required");
      const id = uuidv4();
      const spentAt = data.spentAt ? new Date(data.spentAt).getTime() / 1000 : Date.now() / 1000;
      await (database as any).write(async () => {
        const col: any = (database as any).get("expenses");
        await col.create((rec: any) => {
          rec._raw.id = id;
          rec.businessId = bid;
          rec.category = category;
          rec.description = data.description?.trim() || null;
          rec.vendor = data.vendor?.trim() || null;
          rec.amount = toDecimalString(data.amount);
          rec.taxAmount = toDecimalString(data.taxAmount ?? 0);
          rec.isRecurring = !!data.isRecurring;
          rec.recurringInterval = data.recurringInterval || data.frequency || null;
          rec.spentAt = spentAt;
          rec.syncVersion = 1;
        });
      });
      import("../../sync/client").then(m => m.syncNow().catch(()=>{}));
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      return { id, category, amount: toDecimalString(data.amount) } as any;
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: UUID) => {
      await (database as any).write(async () => {
        const rec: any = await (database as any).get("expenses").find(id);
        await rec.update((r: any) => { r.deletedAt = Date.now() / 1000; });
        await rec.markAsDeleted();
      });
      import("../../sync/client").then(m => m.syncNow().catch(()=>{}));
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });

  const expenses = local.length ? local : (getExpenses.data || []);
  return {
    expenses,
    totalExpenseAmount: expenses.reduce((s: number, e: any) => s + toNumber(e.amount), 0),
    isLoading: isLocalLoading || getExpenses.isLoading,
    error: (getExpenses.error as ApiError)?.friendlyMessage || null,
    refetch: getExpenses.refetch,
    createExpense: createExpense.mutateAsync,
    isCreating: createExpense.isPending,
    updateExpense: async () => { throw new Error("Updating expenses is not supported by the backend contract."); },
    isUpdating: false,
    deleteExpense: deleteExpense.mutateAsync,
    isDeleting: deleteExpense.isPending,
  };
};
