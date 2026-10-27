// A simulated install of the app: its own local WatermelonDB on the same
// storage engine the real platform uses, driven through the app's real
// sync/client.ts and db/stockOps.ts.
//   web     → LokiJSAdapter + IndexedDB (db/database.web.ts)
//   android → SQLiteAdapter (db/database.ts; Node uses better-sqlite3 instead of JSI)
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database, Q } from '@nozbe/watermelondb'
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { migrations } from '../../db/migrations'
import { schema } from '../../db/schema'
import Conflict from '../../db/models/Conflict'
import Customer from '../../db/models/Customer'
import Expense from '../../db/models/Expense'
import InventoryItem from '../../db/models/InventoryItem'
import Invoice from '../../db/models/Invoice'
import InvoiceLine from '../../db/models/InvoiceLine'
import Order from '../../db/models/Order'
import OrderLine from '../../db/models/OrderLine'
import Payment from '../../db/models/Payment'
import Product from '../../db/models/Product'
import ProductVariant from '../../db/models/ProductVariant'
import Sale from '../../db/models/Sale'
import SaleLine from '../../db/models/SaleLine'
import StockMovement from '../../db/models/StockMovement'
import { api } from '../api/helpers'
import type { Tenant } from '../sync/harness'
import { type DeviceContext, setContext } from './stubs/context'

export type Engine = 'web' | 'android'

const modelClasses: any[] = [
  Product,
  ProductVariant,
  Customer,
  Expense,
  Sale,
  SaleLine,
  Order,
  OrderLine,
  Invoice,
  InvoiceLine,
  InventoryItem,
  StockMovement,
  Payment,
  Conflict,
]

const API_URL = process.env.E2E_API_URL || 'http://localhost:5504/api/v1'
const sqliteDir = mkdtempSync(join(tmpdir(), 'bizsawa-sync-'))

// db/durableWrites.ts ships with the web build (feat/web-desktop-support).
// Until that lands, web devices run on bare LokiJS — and the crash-after-write
// test shows why it is needed.
const webDurability: { makeWritesDurable: (db: Database) => Database } | null =
  // @ts-ignore — module only exists once the web build is merged
  await import('../../db/durableWrites').catch(() => null)

// The real client keeps module-level state (_isSyncing, the database import),
// so devices take turns: one run() at a time, like separate processes would.
let queue: Promise<unknown> = Promise.resolve()

export class AppDevice {
  readonly ctx: DeviceContext
  private readonly storeName = `bizsawa-${randomUUID()}`

  private constructor(
    readonly engine: Engine,
    readonly tenant: Tenant,
    token: string,
  ) {
    this.ctx = {
      db: this.openDatabase(),
      apiUrl: API_URL,
      token,
      businessId: tenant.businessId,
      deviceId: randomUUID(),
      storage: new Map([['bizsawa_access_token', token]]),
      online: true,
      dropNextPushResponse: false,
    }
  }

  static async install(engine: Engine, tenant: Tenant): Promise<AppDevice> {
    const res = await api.post('/auth/login', {
      email: tenant.email,
      password: tenant.password,
      businessId: tenant.businessId,
    })
    const token = (res.data?.data ?? res.data)?.accessToken
    if (!token)
      throw new Error(`login failed ${res.status} ${JSON.stringify(res.data)}`)
    return new AppDevice(engine, tenant, token)
  }

  private openDatabase(): Database {
    const adapter =
      this.engine === 'web'
        ? new LokiJSAdapter({
            schema,
            migrations,
            dbName: this.storeName,
            useWebWorker: false,
            useIncrementalIndexedDB: true,
          })
        : new SQLiteAdapter({
            schema,
            migrations,
            dbName: join(sqliteDir, `${this.storeName}.db`),
          } as any)
    const db = new Database({ adapter, modelClasses })
    // Mirror db/database.web.ts: the web build wraps its database so writes
    // are flushed to IndexedDB before they resolve.
    return this.engine === 'web' && webDurability ? webDurability.makeWritesDurable(db) : db
  }

  /**
   * Kill and relaunch the app: same on-disk store, fresh in-memory state.
   * `afterMs` is how long the app stayed open after its last write — 0 is a
   * crash / tab close straight after tapping "Save".
   */
  async restart({ afterMs = 0 }: { afterMs?: number } = {}): Promise<void> {
    await this.run(async () => {})
    if (afterMs) await new Promise((r) => setTimeout(r, afterMs))
    this.ctx.db = this.openDatabase()
  }

  /** Run `fn` with this device as the current one (serialised across devices). */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = queue.then(async () => {
      setContext(this.ctx)
      try {
        return await fn()
      } finally {
        setContext(null)
      }
    })
    queue = next.catch(() => {})
    return next
  }

  goOffline() {
    this.ctx.online = false
  }

  goOnline() {
    this.ctx.online = true
  }

  /** The app's own sync entry point (sync/client.ts → syncNow). */
  async sync(): Promise<void> {
    const client = await import('../../sync/client')
    await this.run(() => client.syncNow({ force: true }))
  }

  /** sync() that reports failure instead of throwing (offline / server down). */
  async trySync(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.sync()
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message }
    }
  }

  async pendingCount(): Promise<number> {
    const client = await import('../../sync/client')
    return this.run(() => client.getPendingChangesCount())
  }

  async conflictsCount(): Promise<number> {
    const client = await import('../../sync/client')
    return this.run(() => client.getConflictsCount())
  }

  async raw(table: string, id: string): Promise<Record<string, any> | null> {
    return this.run(async () => {
      try {
        const rec: any = await this.ctx.db.get(table).find(id)
        return { ...rec._raw }
      } catch {
        return null
      }
    })
  }

  async rows(table: string, ...where: any[]): Promise<Record<string, any>[]> {
    return this.run(async () => {
      const rows: any[] = await this.ctx.db
        .get(table)
        .query(...where)
        .fetch()
      return rows.map((r) => ({ ...r._raw }))
    })
  }

  async inventoryQty(productId: string): Promise<number> {
    const [row] = await this.rows(
      'inventory_items',
      Q.where('product_id', productId),
    )
    if (!row) throw new Error(`no local inventory row for ${productId}`)
    return Number(row.quantity)
  }

  // ── App write paths (mirroring the hooks that the UI calls) ────────────────

  /** products + inventory, as the stock screen creates them. */
  async addProduct(
    name: string,
    price: number,
    stock: number,
  ): Promise<string> {
    const id = randomUUID()
    await this.run(() =>
      this.ctx.db.write(async () => {
        await this.ctx.db.get('products').create((r: any) => {
          r._raw.id = id
          r._raw.business_id = this.tenant.businessId
          r._raw.name = name
          r._raw.price = price.toFixed(2)
          r._raw.cost = '0.00'
          r._raw.is_active = true
          r._raw.sync_version = 1
        })
        await this.ctx.db.get('inventory_items').create((r: any) => {
          r._raw.id = randomUUID()
          r._raw.business_id = this.tenant.businessId
          r._raw.product_id = id
          r._raw.quantity = String(stock)
          r._raw.low_stock_threshold = '2'
          r._raw.sync_version = 1
        })
      }),
    )
    return id
  }

  /** hooks/api/useSales.ts createSale, line for line, incl. the local stock ledger. */
  async sell(
    lines: { productId: string; qty: number; price: number }[],
  ): Promise<string> {
    const id = randomUUID()
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
    await this.run(async () => {
      await this.ctx.db.write(async () => {
        await this.ctx.db.get('sales').create((rec: any) => {
          rec._raw.id = id
          rec.businessId = this.tenant.businessId
          rec.orderId = null
          rec.customerId = null
          rec.receiptNumber = `RCPT-${id.slice(0, 6)}`
          rec.staffId = this.tenant.userId
          rec.paymentMethod = 'cash'
          rec.subtotal = total.toFixed(2)
          rec.taxAmount = '0.00'
          rec.total = total.toFixed(2)
          rec.status = 'completed'
          rec.soldAt = Date.now()
          rec.syncVersion = 1
        })
        for (const l of lines) {
          await this.ctx.db.get('sale_lines').create((rec: any) => {
            rec._raw.id = randomUUID()
            rec.businessId = this.tenant.businessId
            rec.saleId = id
            rec.productId = l.productId
            rec.productVariantId = null
            rec.quantity = String(l.qty)
            rec.unitPrice = l.price.toFixed(2)
            rec.lineTotal = (l.qty * l.price).toFixed(2)
            rec.syncVersion = 1
          })
        }
      })
      const { applyLocalStockLedgerBatch } = await import('../../db/stockOps')
      await applyLocalStockLedgerBatch({
        businessId: this.tenant.businessId,
        refType: 'sale',
        refId: id,
        side: 'out',
        movementType: 'out',
        notes: 'sale created',
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.qty })),
      } as any)
    })
    return id
  }

  /** Edit one column of a record, as any form screen does. */
  async edit(
    table: string,
    id: string,
    column: string,
    value: any,
  ): Promise<void> {
    await this.run(() =>
      this.ctx.db.write(async () => {
        const rec: any = await this.ctx.db.get(table).find(id)
        await rec.update((r: any) => {
          r._setRaw(column, value)
        })
      }),
    )
  }

  /** markAsDeleted: the record is pushed in `deleted` on next sync (sale void, etc.). */
  async remove(table: string, id: string): Promise<void> {
    await this.run(() =>
      this.ctx.db.write(async () => {
        const rec: any = await this.ctx.db.get(table).find(id)
        await rec.markAsDeleted()
      }),
    )
  }

  /** Insert a raw row exactly as given (for malformed / edge-case records). */
  async insertRaw(table: string, raw: Record<string, any>): Promise<void> {
    await this.run(() =>
      this.ctx.db.write(async () => {
        await this.ctx.db.get(table).create((r: any) => {
          for (const [k, v] of Object.entries(raw)) r._raw[k] = v
        })
      }),
    )
  }
}
