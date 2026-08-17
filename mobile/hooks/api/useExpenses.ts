import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Expense as BackendExpense, ExpenseRequest, UUID } from "../../lib/api-dtos";
import { toDecimalString, toNumber } from "../../lib/api-dtos";

export interface Expense extends BackendExpense {
  type: string;
  frequency?: string;
  nextDueDate?: string;
}

export interface CreateExpenseInput {
  type?: string;
  category?: string;
  description?: string;
  vendor?: string;
  amount: number | string;
  taxAmount?: number | string;
  isRecurring?: boolean;
  frequency?: string;
  recurringInterval?: string;
  spentAt?: string | null;
  nextDueDate?: string;
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

function mapExpense(expense: BackendExpense): Expense {
  return {
    ...expense,
    type: expense.category,
    frequency: expense.recurringInterval,
  };
}

function toExpenseRequest(input: CreateExpenseInput): ExpenseRequest {
  return {
    category: input.category || input.type || "",
    description: input.description,
    vendor: input.vendor,
    amount: toDecimalString(input.amount),
    taxAmount: toDecimalString(input.taxAmount, "0"),
    isRecurring: input.isRecurring ?? false,
    recurringInterval: input.recurringInterval || input.frequency,
    spentAt: input.spentAt || new Date().toISOString(),
  };
}

export const useExpenses = () => {
  const queryClient = useQueryClient();

  const getExpenses = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const response = await api.get<{ expenses: BackendExpense[] }>("/expenses");
      return (response.data.expenses || []).map(mapExpense);
    },
  });

  const createExpense = useMutation({
    mutationFn: async (data: CreateExpenseInput) => {
      const response = await api.post<BackendExpense>("/expenses", toExpenseRequest(data));
      return mapExpense(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: UUID) => {
      await api.delete(`/expenses/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });

  return {
    expenses: getExpenses.data || [],
    totalExpenseAmount: (getExpenses.data || []).reduce((sum, expense) => sum + toNumber(expense.amount), 0),
    isLoading: getExpenses.isLoading,
    error: (getExpenses.error as ApiError)?.friendlyMessage || null,
    refetch: getExpenses.refetch,
    createExpense: createExpense.mutateAsync,
    isCreating: createExpense.isPending,
    updateExpense: async () => {
      throw new Error("Updating expenses is not supported by the backend contract.");
    },
    isUpdating: false,
    deleteExpense: deleteExpense.mutateAsync,
    isDeleting: deleteExpense.isPending,
  };
};
