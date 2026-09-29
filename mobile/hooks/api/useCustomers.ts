import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type {
  Customer as BackendCustomer,
  CustomerRequest,
  UUID,
} from '../../lib/api-dtos'
import { database } from '../../db/database'
import { randomUUID } from 'expo-crypto'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { toISO } from '../../lib/syncDates'

export interface Customer extends BackendCustomer {}
export interface CreateCustomerRequest extends CustomerRequest {
  businessId?: UUID
}

function mapRawToCustomer(raw: any): Customer {
  const src: any = raw?._raw ? raw._raw : raw
  const get = (snake: string, camel: string) =>
    src[snake] ?? raw[camel] ?? raw[snake]
  const tagsRaw = get('tags', 'tags')
  return {
    id: raw.id || src.id,
    tenantId: get('business_id', 'businessId'),
    businessId: get('business_id', 'businessId'),
    name: get('name', 'name'),
    phone: get('phone', 'phone'),
    email: get('email', 'email'),
    address: get('address', 'address'),
    tags: tagsRaw
      ? typeof tagsRaw === 'string'
        ? (() => {
            try {
              return JSON.parse(tagsRaw)
            } catch {
              return []
            }
          })()
        : tagsRaw
      : [],
    notes: get('notes', 'notes'),
    loyaltyPoints: get('loyalty_points', 'loyaltyPoints') ?? 0,
    totalSpend: get('total_spend', 'totalSpend') ?? '0',
    lastPurchaseAt: get('last_purchase_at', 'lastPurchaseAt')
      ? toISO(get('last_purchase_at', 'lastPurchaseAt'))
      : null,
    createdAt: toISO(get('created_at', 'createdAt')),
    updatedAt: toISO(get('updated_at', 'updatedAt')),
    // Offline UX: expose Watermelon sync status so UI can show "Pending" badge
    _status: src._status ?? raw._status,
    _changed: src._changed ?? raw._changed,
  } as any
}

export const useCustomers = () => {
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const bid = activeBusinessId || ''
  const [local, setLocal] = useState<Customer[]>([])
  const [isLocalLoading, setIsLocalLoading] = useState(true)

  useEffect(() => {
    if (!bid) {
      setLocal([])
      setIsLocalLoading(false)
      return
    }
    const col: any = (database as any).get('customers')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => {
        setLocal(rows.map(mapRawToCustomer))
        setIsLocalLoading(false)
      })
    return () => sub.unsubscribe()
  }, [bid])

  // Trigger background sync hydration when business becomes active so Watermelon local is populated
  useEffect(() => {
    if (!bid) return
    // fire-and-forget sync pull; local observer will update when pull completes
    import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
    // also ensure server fetch runs via query below
  }, [bid])

  const getCustomers = useQuery({
    queryKey: ['customers', bid],
    queryFn: async ({ signal }) => {
      const res = await api.get<{ customers: Customer[] }>('/customers', { signal })
      return res.data.customers || []
    },
    enabled: !!bid,
    staleTime: 30 * 1000,
  })

  // Merge server + pending local reactively (not via separate query, so it updates when either changes)
  const merged = (() => {
    const server = getCustomers.data as any[] | undefined
    if (server === undefined) return local
    if (!local.length) return server
    const ids = new Set(server.map((s: any) => s.id))
    const pending = local.filter((l: any) => !ids.has(l.id))
    return pending.length ? [...server, ...pending] : server
  })()

  // If local has data, we are not loading even if server is still fetching; only loading when both empty
  const isLoading = isLocalLoading || (getCustomers.isLoading && merged.length === 0)

  // Expose Query-like shape expected by callers: { data, isLoading, refetch, error, isFetching }
  return {
    data: merged,
    isLoading,
    isFetching: getCustomers.isFetching,
    error: getCustomers.error,
    refetch: getCustomers.refetch,
  } as any as { data: Customer[]; isLoading: boolean; refetch: () => any }
}

// Compatibility wrapper — delegate to useCustomers so both hooks share sync + merge logic
export const useCustomersQuery = () => {
  const res: any = useCustomers()
  return {
    data: res.data,
    isLoading: res.isLoading,
    isFetching: res.isFetching,
    error: res.error,
    refetch: res.refetch,
  } as any
}

// Re-export for callers that do `const { data: customers } = useCustomers()` — keep Query shape
// We'll keep original export as function returning Query for backward compat, but also provide offline hooks below
export const useCreateCustomer = () => {
  const queryClient = useQueryClient()
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const bid = activeBusinessId || ''
  return useMutation({
    mutationFn: async (data: CreateCustomerRequest) => {
      if (!bid) throw new Error('Select a business first')
      const id = randomUUID()
      await (database as any).write(async () => {
        const col: any = (database as any).get('customers')
        await col.create((rec: any) => {
          rec._raw.id = id
          rec.businessId = bid
          rec.name = data.name.trim()
          rec.phone = (data as any).phone?.trim() || null
          rec.email = (data as any).email?.trim() || null
          rec.address = (data as any).address?.trim() || null
          rec.tags = JSON.stringify((data as any).tags || [])
          rec.notes = (data as any).notes || null
          rec.loyaltyPoints = 0
          rec.totalSpend = '0'
          rec.syncVersion = 1
        })
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      return { id, name: data.name } as any
    },
  })
}

export const useUpdateCustomer = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<CustomerRequest> & { id: UUID }) => {
      const { id, ...payload } = data
      await (database as any).write(async () => {
        const rec: any = await (database as any).get('customers').find(id)
        await rec.update((r: any) => {
          if ((payload as any).name) r.name = (payload as any).name.trim()
          if ((payload as any).phone !== undefined)
            r.phone = (payload as any).phone?.trim() || null
          if ((payload as any).email !== undefined)
            r.email = (payload as any).email?.trim() || null
          if ((payload as any).address !== undefined)
            r.address = (payload as any).address?.trim() || null
          if ((payload as any).tags !== undefined)
            r.tags = JSON.stringify((payload as any).tags || [])
          if ((payload as any).notes !== undefined)
            r.notes = (payload as any).notes || null
          r.syncVersion = (r.syncVersion || 1) + 1
        })
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      return { id } as any
    },
  })
}
