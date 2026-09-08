import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import type {
  InvoiceListItem,
  InvoiceDetail,
  UUID,
} from '../../lib/api-dtos'
import { toDecimalString, toNumber } from '../../lib/api-dtos'
import { database } from '../../db/database'
import { v4 as uuidv4 } from 'uuid'
import { Q } from '@nozbe/watermelondb'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { toISO, nowMillis, toMillis } from '../../lib/syncDates'

export interface CreateInvoiceInput {
  customerId: UUID
  dueAt: string
  lines: Array<{
    description: string
    quantity: number | string
    unitPrice: number | string
    taxRuleId?: UUID | null
  }>
  notes?: string
}

function mapRaw(raw: any): InvoiceListItem {
  const src: any = raw?._raw ? raw._raw : raw
  const get = (snake: string, camel: string) =>
    src[snake] ?? raw[camel] ?? raw[snake]
  const cid = get('customer_id', 'customerId') || null
  // Do NOT put UUID into customerName — leave blank for UI lookup via useCustomers; prevents showing raw UUID
  const invNo =
    get('invoice_number', 'invoiceNumber') ||
    get('invoiceNumber', 'invoice_number') ||
    (raw.id || src.id ? `INV-${String(raw.id || src.id).slice(0, 6).toUpperCase()}` : 'INV-??????')
  return {
    id: raw.id || src.id,
    invoiceNumber: invNo,
    customerId: cid,
    customerName: '', // resolved in UI via getCustomerName -> useCustomers lookup
    status: get('status', 'status') || 'draft',
    total: get('total', 'total') || '0',
    amountDue: get('amount_due', 'amountDue') || '0',
    currency: get('currency', 'currency') || 'KES',
    dueAt: toISO(get('due_at', 'dueAt')),
    createdAt: toISO(get('created_at', 'createdAt')),
  } as any
}

export const useInvoices = () => {
  const queryClient = useQueryClient()
  const { activeBusinessId } = (() => {
    try {
      return useBusinessContext() as any
    } catch {
      return { activeBusinessId: null }
    }
  })()
  const bid = activeBusinessId || ''
  const [local, setLocal] = useState<InvoiceListItem[]>([])
  const [isLocalLoading, setIsLocalLoading] = useState(true)
  useEffect(() => {
    if (!bid) {
      setLocal([])
      setIsLocalLoading(false)
      return
    }
    const col: any = (database as any).get('invoices')
    const sub = col
      .query(Q.where('business_id', bid))
      .observe()
      .subscribe((rows: any[]) => {
        setLocal(rows.map(mapRaw))
        setIsLocalLoading(false)
      })
    return () => sub.unsubscribe()
  }, [bid])

  const getInvoices = useQuery({
    queryKey: ['invoices', bid],
    queryFn: async () => {
      const res = await api.get<{ invoices: InvoiceListItem[] }>('/invoices')
      return res.data.invoices || []
    },
    enabled: !!bid,
  })

  const getInvoice = (id: UUID) =>
    useQuery<InvoiceDetail>({
      queryKey: ['invoices', id],
      queryFn: async () => {
        // Prefer local — keep customerId and productId for name resolution in UI
        try {
          const rec: any = await (database as any).get('invoices').find(id)
          const raw = rec._raw
          const linesCol: any = (database as any).get('invoice_lines')
          const lines = (await linesCol
            .query(Q.where('invoice_id', id))
            .fetch()) as any[]
          const srcInv: any = (raw as any)._raw ? (raw as any)._raw : raw
          const g = (snake: string, camel: string) =>
            srcInv[snake] ?? (raw as any)[camel] ?? srcInv[camel] ?? (raw as any)[snake]
          return {
            id: raw.id || srcInv.id,
            invoiceNumber:
              g('invoice_number', 'invoiceNumber') ||
              `INV-${String(raw.id || srcInv.id).slice(0, 6).toUpperCase()}`,
            customerId: g('customer_id', 'customerId') || null,
            customerName: '', // UI resolves via customers hook, avoid UUID display
            status: g('status', 'status') || 'draft',
            total: g('total', 'total') || '0',
            subtotal: g('subtotal', 'subtotal') || '0',
            taxAmount: g('tax_amount', 'taxAmount') || '0',
            amountPaid: g('amount_paid', 'amountPaid') || '0',
            amountDue: g('amount_due', 'amountDue') || '0',
            currency: g('currency', 'currency') || 'KES',
            dueAt: toISO(g('due_at', 'dueAt')),
            createdAt: toISO(g('created_at', 'createdAt')),
            lines: lines.map((l: any) => ({
              id: l.id,
              productId: l._raw?.product_id || l.productId || null,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
            })),
            payments: [],
          } as any
        } catch {
          const res = await api.get<InvoiceDetail>(`/invoices/${id}`)
          return res.data
        }
      },
      enabled: !!id,
    })

  const createInvoice = useMutation({
    mutationFn: async (data: CreateInvoiceInput) => {
      const id = uuidv4()
      const number = `INV-${id.slice(0, 6).toUpperCase()}`
      const subtotal = data.lines.reduce(
        (s, l) => s + toNumber(l.unitPrice) * toNumber(l.quantity),
        0,
      )
      const total = subtotal
      const dueAt = data.dueAt
        ? toMillis(data.dueAt)
        : nowMillis() + 7 * 86400000
      await (database as any).write(async () => {
        const col: any = (database as any).get('invoices')
        await col.create((rec: any) => {
          rec._raw.id = id
          rec.businessId = bid
          rec.customerId = data.customerId
          rec.invoiceNumber = number
          rec.status = 'draft'
          rec.subtotal = toDecimalString(subtotal)
          rec.taxAmount = toDecimalString(0)
          rec.total = toDecimalString(total)
          rec.amountPaid = toDecimalString(0)
          rec.amountDue = toDecimalString(total)
          rec.currency = 'KES'
          rec.notes = data.notes || null
          rec.dueAt = dueAt
          rec.syncVersion = 1
        })
        const lineCol: any = (database as any).get('invoice_lines')
        for (const line of data.lines) {
          await lineCol.create((rec: any) => {
            rec._raw.id = uuidv4()
            rec.businessId = bid
            rec.invoiceId = id
            rec.description = line.description
            rec.quantity = toDecimalString(line.quantity)
            rec.unitPrice = toDecimalString(line.unitPrice)
            rec.lineTotal = toDecimalString(
              toNumber(line.quantity) * toNumber(line.unitPrice),
            )
            rec.syncVersion = 1
          })
        }
      })
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      return { id, invoiceNumber: number } as any
    },
  })

  const sendInvoice = useMutation({
    mutationFn: async (id: UUID) => {
      await api.post(`/invoices/${id}/send`)
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoices', id] })
    },
  })
  const sendWhatsApp = useMutation({
    mutationFn: async (id: UUID) => {
      await api.post(`/invoices/${id}/send-whatsapp`)
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoices', id] })
    },
  })
  const recordPayment = useMutation({
    mutationFn: async ({
      id,
      amount,
      method,
      reference,
    }: {
      id: UUID
      amount: number | string
      method: string
      reference?: string
    }) => {
      if (!bid) throw new Error('Select a business first')
      const amountStr = toDecimalString(amount)
      if (toNumber(amountStr) <= 0) throw new Error('Payment amount must be positive')
      // Offline-first: update local invoice immediately
      let localResult: any = null
      try {
        await (database as any).write(async () => {
          const rec: any = await (database as any).get('invoices').find(id)
          const raw = rec._raw
          const total = toNumber(raw.total ?? raw._raw?.total ?? rec.total)
          const prevPaid = toNumber(raw.amount_paid ?? rec.amountPaid ?? '0')
          const newPaid = prevPaid + toNumber(amountStr)
          const newDue = Math.max(0, total - newPaid)
          const newStatus = newDue <= 0.005 ? 'paid' : 'partial'
          await rec.update((r: any) => {
            r.amountPaid = toDecimalString(newPaid)
            r.amountDue = toDecimalString(newDue)
            r.status = newStatus
            // bump sync version for conflict detection
            const cur = (r.syncVersion ?? raw.sync_version ?? 1) as number
            r.syncVersion = (typeof cur === 'number' ? cur : toNumber(cur as any) || 1) + 1
          })
          localResult = { id, amount: amountStr, amountPaid: toDecimalString(newPaid), amountDue: toDecimalString(newDue), status: newStatus }
        })
      } catch (e: any) {
        // If invoice not found locally, fallback to server (e.g. legacy server-only invoice)
        console.warn('[Invoices] recordPayment local update failed, will try server', e?.message)
      }
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoices', id] })
      // Best-effort online API for immediate server settlement (when online, sync push will also reconcile)
      try {
        const { default: NetInfo } = await import('@react-native-community/netinfo')
        const s: any = await NetInfo.fetch()
        if (s.isConnected) {
          try {
            await api.post(`/invoices/${id}/record-payment`, { amount: amountStr, method, reference })
          } catch (apiErr: any) {
            // If API fails due to invoice not yet synced (404), rely on sync push — don't throw
            if (apiErr?.response?.status >= 400 && apiErr?.response?.status < 500 && apiErr?.response?.status !== 404) throw apiErr
            console.warn('[Invoices] recordPayment API failed (offline queue will sync)', apiErr?.message)
          }
        }
      } catch {}
      return localResult || { id, amount: amountStr }
    },
  })

  // Customer-level settlement: payment is distributed FIFO across all unpaid invoices for that customer
  // Offline-first mirror of backend SettleCustomerPayment — updates local invoices FIFO, then syncs
  const settleCustomerPayment = useMutation({
    mutationFn: async ({
      customerId,
      amount,
      method,
      reference,
    }: {
      customerId: UUID
      amount: number | string
      method?: string
      reference?: string
    }) => {
      if (!bid) throw new Error('Select a business first')
      const amountStr = toDecimalString(amount)
      if (toNumber(amountStr) <= 0) throw new Error('Payment amount must be positive')
      if (!customerId) throw new Error('customerId required')
      // Local FIFO settlement
      let result: any = { allocations: [], totalApplied: '0', remainingCredit: amountStr }
      try {
        await (database as any).write(async () => {
          const col: any = (database as any).get('invoices')
          const rows: any[] = await col.query(Q.where('business_id', bid), Q.where('customer_id', customerId)).fetch()
          // Filter unpaid & sort by due_at asc (oldest first)
          const unpaid = rows
            .map((r: any) => ({ rec: r, raw: r._raw, dueAt: r.dueAt ?? r._raw?.due_at ?? r._raw?.created_at ?? 0, total: toNumber(r._raw?.total ?? r.total), paid: toNumber(r._raw?.amount_paid ?? r.amountPaid), due: toNumber(r._raw?.amount_due ?? r.amountDue) }))
            .filter((x: any) => x.due > 0.005 && !['paid', 'cancelled'].includes(String(x.raw.status ?? x.rec.status)))
            .sort((a: any, b: any) => (a.dueAt || 0) - (b.dueAt || 0))
          if (!unpaid.length) throw new Error('no unpaid invoices for this customer (local)')
          let remaining = toNumber(amountStr)
          const allocations: any[] = []
          let totalApplied = 0
          for (const item of unpaid) {
            if (remaining <= 0.005) break
            const due = item.due
            const apply = Math.min(remaining, due)
            const newPaid = item.paid + apply
            const newDue = Math.max(0, item.total - newPaid)
            const newStatus = newDue <= 0.005 ? 'paid' : 'partial'
            await item.rec.update((r: any) => {
              r.amountPaid = toDecimalString(newPaid)
              r.amountDue = toDecimalString(newDue)
              r.status = newStatus
              const cur = (r.syncVersion ?? item.raw.sync_version ?? 1) as number
              r.syncVersion = (typeof cur === 'number' ? cur : toNumber(cur as any) || 1) + 1
            })
            allocations.push({ invoiceId: item.rec.id, invoiceNumber: item.rec.invoiceNumber ?? item.raw.invoice_number, amount: toDecimalString(apply), status: newStatus })
            totalApplied += apply
            remaining = Math.max(0, remaining - apply)
          }
          if (!allocations.length) throw new Error('payment could not be applied to any invoice')
          result = { allocations, totalApplied: toDecimalString(totalApplied), remainingCredit: toDecimalString(remaining) }
        })
      } catch (e: any) {
        // If no local unpaid invoices (e.g. all server-only), fallback to API when online
        console.warn('[Invoices] settleCustomerPayment local failed', e?.message)
        try {
          const { default: NetInfo } = await import('@react-native-community/netinfo')
          const s: any = await NetInfo.fetch()
          if (s.isConnected) {
            const res = await api.post(`/invoices/customer/${customerId}/settle`, { amount: amountStr, method: method || 'cash', reference })
            return res.data
          }
        } catch {}
        throw e
      }
      import('../../sync/client').then((m) => m.syncNow().catch(() => {}))
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      // Best-effort server settle when online (idempotent, will reconcile on next pull)
      try {
        const { default: NetInfo } = await import('@react-native-community/netinfo')
        const s: any = await NetInfo.fetch()
        if (s.isConnected) {
          api.post(`/invoices/customer/${customerId}/settle`, { amount: amountStr, method: method || 'cash', reference }).catch((err: any) => console.warn('[Invoices] settle API background failed', err?.message))
        }
      } catch {}
      return result
    },
  })

  // Offline-first merge: server clean heals 0/NaN, pending local invoices must appear immediately
  const invoices = (() => {
    const server = getInvoices.data as any[] | undefined
    if (server === undefined) return local
    if (!local.length) return server
    const serverIds = new Set(server.map((s: any) => s.id))
    const pending = local.filter((l: any) => !serverIds.has(l.id))
    return pending.length ? [...server, ...pending] : server
  })()
  // Use local loading to avoid flash when offline
  void isLocalLoading
  return {
    invoices,
    isLoading:
      (isLocalLoading || getInvoices.isLoading) && invoices.length === 0,
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
    settleCustomerPayment: settleCustomerPayment.mutateAsync,
    isSettlingCustomer: settleCustomerPayment.isPending,
  }
}
