import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import type { Expense as BackendExpense, UUID } from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { v4 as uuidv4 } from 'uuid'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { toISO, toMillis, nowMillis } from '../../lib/syncDates'

export interface Expense extends BackendExpense {
  type: string
  frequency?: string
  nextDueDate?: string
}
export interface CreateExpenseInput {
  type?: string
  category?: string
  description?: string
  vendor?: string
  amount: number | string
  taxAmount?: number | string
  isRecurring?: boolean
  frequency?: string
  recurringInterval?: string
  spentAt?: string | null
  nextDueDate?: string
}
export type UpdateExpenseInput = Partial<CreateExpenseInput>

function mapExpense(e: BackendExpense): Expense {
  return { ...e, type: e.category, frequency: e.recurringInterval } as any
}
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
    spentAt: toISO(raw.spent_at ?? raw.spentAt),
    createdAt: toISO(raw.created_at ?? raw.createdAt),
    updatedAt: toISO(raw.updated_at ?? raw.updatedAt),
    type: raw.category,
    frequency: raw.recurring_interval,
  } as any
}

export const useExpenses = () => {
  const queryClient = useQueryClient()
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const bid = activeBusinessId || ''
  const [local, setLocal] = useState<Expense[]>([])
  const [isLocalLoading, setIsLocalLoading] = useState(true)
  useEffect(() => {
    if (!bid) {
      setLocal([])
      setIsLocalLoading(false)
      return
    }
    const col: any = (database as any).get('expenses')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => {
        setLocal(rows.map(mapRaw))
        setIsLocalLoading(false)
      })
    return () => sub.unsubscribe()
  }, [bid])

  const getExpenses = useQuery({
    queryKey: ['expenses', bid],
    queryFn: async ({ signal }) => {
      const res = await api.get<{ expenses: BackendExpense[] }>('/expenses', { signal })
      return (res.data.expenses || []).map(mapExpense)
    },
    enabled: !!bid,
  })

  const createExpense = useMutation({
    mutationFn: async (data: CreateExpenseInput) => {
      if (!data || typeof data !== 'object') throw new Error('Expense data is required')
      const category = (data?.category || data?.type || '').trim()
      if (!category) throw new Error('Category required')
      const id = uuidv4()
      const spentAt = toMillis(data.spentAt) || nowMillis()
      await (database as any).write(async () => {
        const col: any = (database as any).get('expenses')
        await col.create((rec: any) => {
          rec._raw.id = id
          rec.businessId = bid
          rec.category = category
          rec.description = data.description?.trim() || null
          rec.vendor = data.vendor?.trim() || null
          rec.amount = toDecimalString(data.amount)
          rec.taxAmount = toDecimalString(data.taxAmount ?? 0)
          rec.isRecurring = !!data.isRecurring
          rec.recurringInterval =
            data.recurringInterval || data.frequency || null
          rec.spentAt = spentAt
          rec.syncVersion = 1
        })
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      import('../../lib/api').then(({ api }) => api.post('/analytics/refresh', {}, { params: { timeframe: 'week' } }).catch(()=>{}))
      return { id, category, amount: toDecimalString(data.amount) } as any
    },
  })

  const deleteExpense = useMutation({
    mutationFn: async (id: UUID) => {
      await (database as any).write(async () => {
        const rec: any = await (database as any).get('expenses').find(id)
        await rec.update((r: any) => {
          r.deletedAt = nowMillis()
        })
        await rec.markAsDeleted()
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      import('../../lib/api').then(({ api }) => api.post('/analytics/refresh', {}, { params: { timeframe: 'week' } }).catch(()=>{}))
    },
  })

  // Offline-first merge: server clean, but pending local expenses must appear immediately
  const expenses = (() => {
    const server = getExpenses.data as any[] | undefined
    if (server === undefined) return local
    if (!local.length) return server
    const serverIds = new Set(server.map((s: any) => s.id))
    const pending = local.filter((l: any) => !serverIds.has(l.id))
    return pending.length ? [...server, ...pending] : server
  })()
  return {
    expenses,
    totalExpenseAmount: expenses.reduce(
      (s: number, e: any) => s + toNumber(e.amount),
      0,
    ),
    isLoading:
      (isLocalLoading || getExpenses.isLoading) && expenses.length === 0,
    error: (getExpenses.error as ApiError)?.friendlyMessage || null,
    refetch: getExpenses.refetch,
    createExpense: createExpense.mutateAsync,
    isCreating: createExpense.isPending,
    updateExpense: async () => {
      throw new Error(
        'Updating expenses is not supported by the backend contract.',
      )
    },
    isUpdating: false,
    deleteExpense: deleteExpense.mutateAsync,
    isDeleting: deleteExpense.isPending,
  }
}
