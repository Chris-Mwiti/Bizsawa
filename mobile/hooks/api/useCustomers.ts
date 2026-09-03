import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type {
  Customer as BackendCustomer,
  CustomerRequest,
  UUID,
} from '../../lib/api-dtos'
import { database } from '../../db/database'
import { v4 as uuidv4 } from 'uuid'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { toISO } from '../../lib/syncDates'

export interface Customer extends BackendCustomer {}
export interface CreateCustomerRequest extends CustomerRequest {
  businessId?: UUID
}

function mapRawToCustomer(raw: any): Customer {
  return {
    id: raw.id,
    tenantId: raw.business_id,
    businessId: raw.business_id,
    name: raw.name,
    phone: raw.phone,
    email: raw.email,
    address: raw.address,
    tags: raw.tags
      ? typeof raw.tags === 'string'
        ? JSON.parse(raw.tags)
        : raw.tags
      : [],
    notes: raw.notes,
    loyaltyPoints: raw.loyalty_points ?? 0,
    totalSpend: raw.total_spend ?? '0',
    lastPurchaseAt: raw.last_purchase_at ? toISO(raw.last_purchase_at) : null,
    createdAt: toISO(raw.created_at),
    updatedAt: toISO(raw.updated_at),
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

  const getCustomers = useQuery({
    queryKey: ['customers', bid],
    queryFn: async () => {
      const res = await api.get<{ customers: Customer[] }>('/customers')
      return res.data.customers || []
    },
    enabled: !!bid,
  })

  // Merge server + pending local (offline creates must appear immediately)
  return useQuery({
    queryKey: ['customers', bid, 'offline'],
    queryFn: async () => {
      const server = getCustomers.data as any[] | undefined
      if (server === undefined) return local
      if (!local.length) return server
      const ids = new Set(server.map((s: any) => s.id))
      const pending = local.filter((l: any) => !ids.has(l.id))
      return pending.length ? [...server, ...pending] : server
    },
    enabled: !isLocalLoading,
  }) as any as { data: Customer[] }
}

// Compatibility wrapper for existing call sites: useCustomers() previously returned Query, now we keep same shape
export const useCustomersQuery = () => {
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const bid = activeBusinessId || ''
  const [local, setLocal] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!bid) {
      setLocal([])
      setLoading(false)
      return
    }
    const col: any = (database as any).get('customers')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => {
        setLocal(rows.map(mapRawToCustomer))
        setLoading(false)
      })
    return () => sub.unsubscribe()
  }, [bid])

  const q = useQuery({
    queryKey: ['customers', bid],
    queryFn: async () => {
      const res = await api.get<{ customers: Customer[] }>('/customers')
      return res.data.customers || []
    },
    enabled: !!bid,
  })
  // Merge server + pending
  const merged = (() => {
    const server = q.data as any[] | undefined
    if (server === undefined) return local
    if (!local.length) return server
    const ids = new Set(server.map((s: any) => s.id))
    const pending = local.filter((l: any) => !ids.has(l.id))
    return pending.length ? [...server, ...pending] : server
  })()
  return {
    data: merged,
    isLoading:
      q.isLoading && !local.length && merged.length === 0
        ? true
        : loading && !q.data
          ? true
          : false,
    refetch: q.refetch,
    error: q.error,
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
      const id = uuidv4()
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
