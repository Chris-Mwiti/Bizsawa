// Multi-device harness for the offline sync protocol (/sync/push, /sync/pull).
// Each SyncDevice speaks exactly what sync/client.ts sends: WatermelonDB raw
// records (snake_case, _status/_changed included), a per-batch
// X-Idempotency-Key, device_id, and lastPulledAt as the pull cursor.
import { randomUUID } from 'node:crypto'
import { api, authHeader, registerAndLogin } from '../api/helpers'

export { api }

export interface Tenant {
  email: string
  password: string
  userId: string
  businessId: string
}

export type Raw = Record<string, any>
export type TableChanges = { created: Raw[]; updated: Raw[]; deleted: string[] }
export type Changes = Record<string, Partial<TableChanges>>

export interface PushResult {
  applied: Record<string, string[]>
  rejected?: Record<string, string[]>
  errors?: Record<string, string[]>
  conflicts: any[]
  lww_applied?: Record<string, string[]>
}

export interface PullResult {
  changes: Record<string, TableChanges>
  timestamp: number
}

/** Fresh user + business. One business per user (free plan), so tests never share data. */
export async function newTenant(): Promise<Tenant> {
  const s = await registerAndLogin()
  const res = await api.post(
    '/businesses',
    {
      name: `Sync E2E ${Date.now()}`,
      businessType: 'retail',
      location: 'Nairobi',
    },
    { headers: authHeader(s.accessToken) },
  )
  const businessId = res.data?.data?.id ?? res.data?.id
  if (!businessId)
    throw new Error(
      `create business failed ${res.status} ${JSON.stringify(res.data)}`,
    )
  return { email: s.email, password: s.password, userId: s.userId, businessId }
}

export class SyncDevice {
  readonly deviceId = randomUUID()
  lastPulledAt: number | null = null
  private token = ''

  constructor(readonly tenant: Tenant) {}

  /** Log in as the tenant's user — a fresh token per device, like a second phone. */
  async login(): Promise<this> {
    const res = await api.post('/auth/login', {
      email: this.tenant.email,
      password: this.tenant.password,
      businessId: this.tenant.businessId,
    })
    const data = res.data?.data ?? res.data
    if (res.status !== 200 || !data?.accessToken)
      throw new Error(`login failed ${res.status} ${JSON.stringify(res.data)}`)
    this.token = data.accessToken
    return this
  }

  headers(extra: Record<string, string> = {}) {
    return {
      ...authHeader(this.token),
      'X-Business-ID': this.tenant.businessId,
      'X-Device-Id': this.deviceId,
      ...extra,
    }
  }

  /** Raw push: returns status + body so tests can assert on failures too. */
  async pushRaw(
    changes: Changes,
    opts: {
      idempotencyKey?: string
      token?: string
      deviceId?: string | null
    } = {},
  ) {
    const headers = this.headers({
      'X-Idempotency-Key': opts.idempotencyKey ?? randomUUID(),
    })
    if (opts.token !== undefined) headers.Authorization = `Bearer ${opts.token}`
    const body = {
      changes: normalize(changes),
      lastPulledAt: this.lastPulledAt,
      device_id:
        opts.deviceId === null ? undefined : (opts.deviceId ?? this.deviceId),
    }
    return api.post('/sync/push', body, { headers })
  }

  async push(
    changes: Changes,
    opts: Parameters<SyncDevice['pushRaw']>[1] = {},
  ): Promise<PushResult> {
    const res = await this.pushRaw(changes, opts)
    if (res.status !== 200)
      throw new Error(`push failed ${res.status} ${JSON.stringify(res.data)}`)
    return res.data
  }

  /** One pull, advancing the cursor exactly like WatermelonDB's synchronize(). */
  /**
   * One complete pull session, exactly like sync/client.ts: page with the same
   * `since` plus the server's cursor while hasMore, merge the pages, then
   * advance lastPulledAt to the session timestamp. An old server without
   * paging simply answers hasMore=false on the first page.
   */
  async pull(
    opts: { limit?: number; since?: number | null } = {},
  ): Promise<PullResult> {
    const since = opts.since !== undefined ? opts.since : this.lastPulledAt
    const merged: Record<string, TableChanges> = {}
    let cursor: string | undefined
    let timestamp = Date.now()
    for (let page = 0; page < 1000; page++) {
      const params: Record<string, any> = { since: since ?? 0 }
      if (opts.limit) params.limit = opts.limit
      if (cursor) params.cursor = cursor
      const res = await api.get('/sync/pull', {
        headers: this.headers(),
        params,
      })
      if (res.status !== 200)
        throw new Error(`pull failed ${res.status} ${JSON.stringify(res.data)}`)
      const changes = res.data?.changes ?? res.data
      for (const [t, c] of Object.entries<any>(changes ?? {})) {
        const m = (merged[t] ??= { created: [], updated: [], deleted: [] })
        m.created.push(...(c.created ?? []))
        m.updated.push(...(c.updated ?? []))
        m.deleted.push(...(c.deleted ?? []))
      }
      timestamp = res.data?.timestamp ?? timestamp
      if (!res.data?.hasMore) break
      if (!res.data.cursor || res.data.cursor === cursor)
        throw new Error(
          'pull paging stalled: hasMore without an advancing cursor',
        )
      cursor = res.data.cursor
    }
    if (opts.since === undefined) this.lastPulledAt = timestamp
    return { changes: merged, timestamp }
  }

  async get(path: string, params?: Record<string, any>) {
    return api.get(path, { headers: this.headers(), params })
  }
}

function normalize(changes: Changes): Record<string, TableChanges> {
  const out: Record<string, TableChanges> = {}
  for (const [t, c] of Object.entries(changes)) {
    out[t] = {
      created: c.created ?? [],
      updated: c.updated ?? [],
      deleted: c.deleted ?? [],
    }
  }
  return out
}

// ── Record builders: same shape as the app's WatermelonDB writes ──────────────

const now = () => Date.now()
const base = (businessId: string, extra: Raw): Raw => ({
  id: randomUUID(),
  business_id: businessId,
  sync_version: 1,
  _status: 'created',
  _changed: '',
  ...extra,
})

export const rec = {
  product: (b: string, x: Raw = {}) =>
    base(b, {
      name: `Product ${randomUUID().slice(0, 6)}`,
      price: '100.00',
      cost: '60.00',
      is_active: true,
      ...x,
    }),
  inventory: (b: string, productId: string, quantity: number, x: Raw = {}) =>
    base(b, {
      product_id: productId,
      quantity: String(quantity),
      low_stock_threshold: '2',
      ...x,
    }),
  customer: (b: string, x: Raw = {}) =>
    base(b, {
      name: `Customer ${randomUUID().slice(0, 6)}`,
      phone: '254700000001',
      total_spend: '0',
      ...x,
    }),
  sale: (b: string, staffId: string, total: number, x: Raw = {}) => {
    const id = randomUUID()
    return base(b, {
      id,
      receipt_number: `RCPT-${id.slice(0, 6)}`,
      staff_id: staffId,
      payment_method: 'cash',
      subtotal: total.toFixed(2),
      tax_amount: '0.00',
      total: total.toFixed(2),
      status: 'completed',
      sold_at: now(),
      ...x,
    })
  },
  saleLine: (
    b: string,
    saleId: string,
    productId: string,
    qty: number,
    unitPrice: number,
    x: Raw = {},
  ) =>
    base(b, {
      sale_id: saleId,
      product_id: productId,
      quantity: String(qty),
      unit_price: unitPrice.toFixed(2),
      line_total: (qty * unitPrice).toFixed(2),
      ...x,
    }),
  /** The ledger row applyLocalStockLedgerBatch writes alongside a walk-in sale. */
  movement: (
    b: string,
    productId: string,
    delta: number,
    refType: string,
    refId: string,
    x: Raw = {},
  ) =>
    base(b, {
      product_id: productId,
      quantity_delta: String(delta),
      movement_type: delta < 0 ? 'out' : 'in',
      reference_type: refType,
      reference_id: refId,
      notes: 'e2e',
      occurred_at: now(),
      ...x,
    }),
  order: (b: string, total: number, x: Raw = {}) =>
    base(b, {
      status: 'draft',
      subtotal: total.toFixed(2),
      tax_amount: '0.00',
      total: total.toFixed(2),
      payment_method: 'cash',
      ...x,
    }),
  orderLine: (
    b: string,
    orderId: string,
    productId: string,
    qty: number,
    unitPrice: number,
    x: Raw = {},
  ) =>
    base(b, {
      order_id: orderId,
      product_id: productId,
      quantity: String(qty),
      unit_price: unitPrice.toFixed(2),
      line_total: (qty * unitPrice).toFixed(2),
      ...x,
    }),
  expense: (b: string, amount: number, x: Raw = {}) =>
    base(b, {
      category: 'rent',
      amount: amount.toFixed(2),
      tax_amount: '0.00',
      spent_at: now(),
      ...x,
    }),
}

/** An offline walk-in sale exactly as the app records it: sale + lines + ledger rows. */
export function walkInSale(
  b: string,
  staffId: string,
  lines: { productId: string; qty: number; price: number }[],
) {
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const sale = rec.sale(b, staffId, total)
  return {
    sale,
    lines: lines.map((l) =>
      rec.saleLine(b, sale.id, l.productId, l.qty, l.price),
    ),
    movements: lines.map((l) =>
      rec.movement(b, l.productId, -l.qty, 'sale', sale.id),
    ),
  }
}

/** A row as it looks after edit: bumped field(s), Watermelon 'updated' status. */
export function edited(row: Raw, patch: Raw): Raw {
  return {
    ...row,
    ...patch,
    _status: 'updated',
    _changed: Object.keys(patch).join(','),
  }
}

// ── Assertions helpers ────────────────────────────────────────────────────────

export function ids(rows: Raw[] | undefined): string[] {
  return (rows ?? []).map((r) => r.id)
}

/** Every row the server would hand a fresh device for `table` (created + updated buckets). */
export async function serverRows(
  device: SyncDevice,
  table: string,
): Promise<Raw[]> {
  const res = await device.pull({ since: 0, limit: 5000 })
  const t = res.changes[table]
  return [...(t?.created ?? []), ...(t?.updated ?? [])]
}

export async function inventoryQty(
  device: SyncDevice,
  productId: string,
): Promise<number> {
  const rows = await serverRows(device, 'inventory_items')
  const row = rows.find((r) => r.product_id === productId)
  if (!row) throw new Error(`no inventory row for ${productId}`)
  return Number(row.quantity)
}
