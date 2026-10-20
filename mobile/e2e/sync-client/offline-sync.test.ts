// The app's real sync client on both storage engines, against a real backend.
// Every scenario runs on web (LokiJS/IndexedDB) and android (SQLite).
import { Q } from '@nozbe/watermelondb'
import { describe, expect, it } from 'vitest'
import { newTenant } from '../sync/harness'
import { AppDevice, type Engine } from './appDevice'

const engines: Engine[] = ['web', 'android']

describe.each(engines)('offline sync on %s', (engine) => {
  async function freshShop() {
    const tenant = await newTenant()
    const till = await AppDevice.install(engine, tenant)
    const office = await AppDevice.install(
      engine === 'web' ? 'android' : 'web',
      tenant,
    )
    await till.sync()
    await office.sync()
    return { tenant, till, office }
  }

  it('sells offline, queues locally, then syncs everything once back online', async () => {
    const { till, office } = await freshShop()
    const productId = await till.addProduct('Milk 500ml', 60, 24)
    await till.sync()

    till.goOffline()
    const s1 = await till.sell([{ productId, qty: 2, price: 60 }])
    const s2 = await till.sell([{ productId, qty: 1, price: 60 }])
    expect(await till.inventoryQty(productId)).toBe(21) // local stock reacts immediately

    const failed = await till.trySync()
    expect(failed.ok).toBe(false)
    // 2 sales + 2 lines + 2 ledger rows wait in the queue.
    expect(await till.pendingCount()).toBe(6)

    till.goOnline()
    await till.sync()
    expect(await till.pendingCount()).toBe(0)

    await office.sync()
    expect(await office.raw('sales', s1)).toMatchObject({
      total: '120.00',
      status: 'completed',
    })
    expect(await office.raw('sales', s2)).toBeTruthy()
    expect(
      await office.rows('sale_lines', Q.where('sale_id', s1)),
    ).toHaveLength(1)
    expect(await office.inventoryQty(productId)).toBe(21)
    // ...and the till converges on the server's canonical stock, not double-deducted.
    await till.sync()
    expect(await till.inventoryQty(productId)).toBe(21)
  })

  it('keeps the offline queue across an app restart', async () => {
    const { till, office } = await freshShop()
    const productId = await till.addProduct('Bread', 70, 10)
    await till.sync()

    till.goOffline()
    const saleId = await till.sell([{ productId, qty: 3, price: 70 }])
    await till.restart({ afterMs: 1500 }) // app closed a moment later, while offline
    expect(await till.pendingCount()).toBe(3)
    expect(await till.raw('sales', saleId)).toMatchObject({
      _status: 'created',
    })

    till.goOnline()
    await till.sync()
    await office.sync()
    expect(await office.raw('sales', saleId)).toBeTruthy()
    expect(await office.inventoryQty(productId)).toBe(7)
  })

  it('a sale survives the app being killed right after it is recorded', async () => {
    const { till } = await freshShop()
    const productId = await till.addProduct('Matches', 10, 100)
    await till.sync()

    till.goOffline()
    const saleId = await till.sell([{ productId, qty: 1, price: 10 }])
    await till.restart() // crash / tab closed / OS killed the app immediately
    expect(
      await till.raw('sales', saleId),
      'a sale the cashier saw confirmed must not vanish on restart',
    ).toMatchObject({ _status: 'created' })
  })

  it('a product created AND sold before its first sync reaches the server with its stock', async () => {
    const { till, office } = await freshShop()
    till.goOffline()
    const productId = await till.addProduct('Brand new item', 200, 10)
    await till.sell([{ productId, qty: 2, price: 200 }])
    till.goOnline()
    await till.sync()

    await office.sync()
    expect(await office.raw('products', productId)).toBeTruthy()
    expect(
      await office.rows('inventory_items', Q.where('product_id', productId)),
      'the stock row created offline was never pushed',
    ).toHaveLength(1)
    expect(await office.inventoryQty(productId)).toBe(8)
  })

  it('a sale made offline earlier still reaches a device that synced in the meantime', async () => {
    const { till, office } = await freshShop()
    const productId = await till.addProduct('Flour', 150, 40)
    await till.sync()

    till.goOffline()
    const saleId = await till.sell([{ productId, qty: 1, price: 150 }])
    await new Promise((r) => setTimeout(r, 1500))
    await office.sync() // office's cursor moves past the sale's local timestamp
    till.goOnline()
    await till.sync()

    await office.sync()
    expect(
      await office.raw('sales', saleId),
      "the sale carried the till's offline clock and fell behind the office's pull cursor",
    ).toBeTruthy()
  })

  it('a push whose response is lost is retried without duplicates', async () => {
    const { till, office } = await freshShop()
    const productId = await till.addProduct('Eggs tray', 450, 12)
    await till.sync()

    const saleId = await till.sell([{ productId, qty: 2, price: 450 }])
    till.ctx.dropNextPushResponse = true
    expect((await till.trySync()).ok).toBe(false) // server committed, phone saw a dead socket
    expect(await till.pendingCount()).toBeGreaterThan(0) // so it must still think it's pending

    await till.sync() // retry
    expect(await till.pendingCount()).toBe(0)
    await office.sync()
    expect(await office.rows('sales', Q.where('id', saleId))).toHaveLength(1)
    expect(await office.inventoryQty(productId)).toBe(10)
  })

  it('a record the server rejects stays pending; the rest of the queue syncs', async () => {
    const { tenant, till, office } = await freshShop()
    const productId = await till.addProduct('Soap', 90, 30)
    await till.sync()

    // A sale line pointing at a sale that does not exist (e.g. half-written before a crash).
    const orphanId = crypto.randomUUID()
    await till.insertRaw('sale_lines', {
      id: orphanId,
      business_id: tenant.businessId,
      sale_id: crypto.randomUUID(),
      product_id: productId,
      quantity: '1',
      unit_price: '90.00',
      line_total: '90.00',
      sync_version: 1,
    })
    const saleId = await till.sell([{ productId, qty: 1, price: 90 }])
    await till.sync()

    expect(await till.raw('sale_lines', orphanId)).toMatchObject({
      _status: 'created',
    })
    expect((await till.raw('sales', saleId))?._status).toBe('synced')
    expect(await till.pendingCount()).toBe(1)
    await office.sync()
    expect(await office.raw('sales', saleId)).toBeTruthy()
    expect(await office.raw('sale_lines', orphanId)).toBeNull()
  })

  it('a sale voided on one device disappears from the other and restores stock', async () => {
    const { till, office } = await freshShop()
    const productId = await till.addProduct('Rice 2kg', 320, 15)
    const saleId = await till.sell([{ productId, qty: 5, price: 320 }])
    await till.sync()
    await office.sync()
    expect(await office.inventoryQty(productId)).toBe(10)

    await office.remove('sales', saleId)
    await office.sync()
    await till.sync()
    expect(await till.raw('sales', saleId)).toBeNull()
    expect(await till.inventoryQty(productId)).toBe(15)
  })

  it('both devices sell the same stock offline: both converge on the exact server count', async () => {
    const { till, office } = await freshShop()
    const productId = await till.addProduct('Cooking oil', 280, 20)
    await till.sync()
    await office.sync()

    till.goOffline()
    office.goOffline()
    await till.sell([{ productId, qty: 3, price: 280 }])
    await office.sell([{ productId, qty: 4, price: 280 }])
    expect(await till.inventoryQty(productId)).toBe(17)
    expect(await office.inventoryQty(productId)).toBe(16)

    till.goOnline()
    office.goOnline()
    await till.sync()
    await office.sync()
    await till.sync()
    expect(await till.inventoryQty(productId)).toBe(13)
    expect(await office.inventoryQty(productId)).toBe(13)
  })

  it('a cross-device edit conflict is saved locally and the device converges after pulling', async () => {
    const { till, office } = await freshShop()
    const productId = await till.addProduct('Tea leaves', 100, 5)
    await till.sync()
    await office.sync()

    till.goOffline()
    await office.edit('products', productId, 'price', '120.00')
    await office.sync() // office wins
    await till.edit('products', productId, 'price', '110.00')
    till.goOnline()
    await till.sync()

    expect(await till.conflictsCount()).toBe(1)
    // The conflict screen shows both values, but the record itself must not
    // silently disagree with the server forever.
    await till.sync()
    const local = await till.raw('products', productId)
    expect(
      Number(local?.price),
      'after a conflict, the losing device keeps its own price and never receives the server value',
    ).toBe(120)
  })

  it('pull failure leaves local state untouched and the next sync recovers', async () => {
    const { till, office } = await freshShop()
    const productId = await office.addProduct('Salt', 30, 50)
    await office.sync()

    till.ctx.apiUrl = 'http://127.0.0.1:9/api/v1' // server unreachable mid-session
    expect((await till.trySync()).ok).toBe(false)
    expect(await till.raw('products', productId)).toBeNull()

    till.ctx.apiUrl = office.ctx.apiUrl
    await till.sync()
    expect(await till.raw('products', productId)).toMatchObject({
      name: 'Salt',
    })
  })
})
