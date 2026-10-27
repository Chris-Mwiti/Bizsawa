// A device works offline, then pushes its queue; a second device pulls it.
import { beforeAll, describe, expect, it } from 'vitest'
import {
  SyncDevice,
  Tenant,
  ids,
  inventoryQty,
  newTenant,
  rec,
  serverRows,
  walkInSale,
} from './harness'

describe('01 offline writes → push → second device pulls', () => {
  let t: Tenant
  let phone: SyncDevice
  let laptop: SyncDevice

  beforeAll(async () => {
    t = await newTenant()
    phone = await new SyncDevice(t).login()
    laptop = await new SyncDevice(t).login()
    await phone.pull()
    await laptop.pull()
  })

  it('applies a full offline catalogue (product → inventory) created in one batch', async () => {
    const product = rec.product(t.businessId, {
      name: 'Unga 2kg',
      price: '180.00',
    })
    const inv = rec.inventory(t.businessId, product.id, 50)
    const res = await phone.push({
      products: { created: [product] },
      inventory_items: { created: [inv] },
    })

    expect(res.applied.products).toEqual([product.id])
    expect(res.applied.inventory_items).toEqual([inv.id])
    expect(res.rejected ?? {}).toEqual({})

    const pulled = await laptop.pull()
    expect(ids(pulled.changes.products?.created)).toContain(product.id)
    const row = pulled.changes.products.created.find(
      (r) => r.id === product.id,
    )!
    expect(row.name).toBe('Unga 2kg')
    expect(Number(row.price)).toBe(180)
    expect(row.sync_version).toBe(1)
    // Server-only columns never leak into the client schema.
    expect(row).not.toHaveProperty('tenant_id')
    expect(row).not.toHaveProperty('created_at')
  })

  it('records an offline walk-in sale: sale + lines + ledger, stock deducted exactly once', async () => {
    const product = rec.product(t.businessId, { price: '50.00' })
    const inv = rec.inventory(t.businessId, product.id, 20)
    await phone.push({
      products: { created: [product] },
      inventory_items: { created: [inv] },
    })

    const { sale, lines, movements } = walkInSale(t.businessId, t.userId, [
      { productId: product.id, qty: 3, price: 50 },
    ])
    const res = await phone.push({
      stock_movements: { created: movements },
      sales: { created: [sale] },
      sale_lines: { created: lines },
    })

    expect(res.applied.sales).toEqual([sale.id])
    expect(res.applied.sale_lines).toEqual(ids(lines))
    expect(res.applied.stock_movements).toEqual(ids(movements))
    expect(res.errors ?? {}).toEqual({})
    // Pushed ledger row + the server's post-pass ensureSaleDeducted must not double-deduct.
    expect(await inventoryQty(laptop, product.id)).toBe(17)

    const pulled = await laptop.pull()
    expect(ids(pulled.changes.sales?.created)).toContain(sale.id)
    expect(ids(pulled.changes.sale_lines?.created)).toEqual(
      expect.arrayContaining(ids(lines)),
    )
    const s = pulled.changes.sales.created.find((r) => r.id === sale.id)!
    expect(Number(s.total)).toBe(150)
    expect(typeof s.sold_at).toBe('number')
  })

  it('a walk-in sale pushed WITHOUT its ledger rows is still deducted by the server', async () => {
    const product = rec.product(t.businessId)
    const inv = rec.inventory(t.businessId, product.id, 10)
    await phone.push({
      products: { created: [product] },
      inventory_items: { created: [inv] },
    })

    const { sale, lines } = walkInSale(t.businessId, t.userId, [
      { productId: product.id, qty: 4, price: 100 },
    ])
    const res = await phone.push({
      sales: { created: [sale] },
      sale_lines: { created: lines },
    })
    expect(res.applied.sales).toEqual([sale.id])
    expect(await inventoryQty(laptop, product.id)).toBe(6)
  })

  it('offline expenses and customers round-trip with their values intact', async () => {
    const expense = rec.expense(t.businessId, 2500, {
      category: 'transport',
      vendor: 'Matatu',
    })
    const customer = rec.customer(t.businessId, {
      name: 'Wanjiku',
      phone: '254711222333',
    })
    const res = await phone.push({
      expenses: { created: [expense] },
      customers: { created: [customer] },
    })
    expect(res.applied.expenses).toEqual([expense.id])
    expect(res.applied.customers).toEqual([customer.id])

    const pulled = await laptop.pull()
    const e = pulled.changes.expenses?.created.find((r) => r.id === expense.id)
    const c = pulled.changes.customers?.created.find(
      (r) => r.id === customer.id,
    )
    expect(e && Number(e.amount)).toBe(2500)
    expect(e?.vendor).toBe('Matatu')
    expect(c?.phone).toBe('254711222333')
  })

  it('a fresh device (since=0) receives everything the business has', async () => {
    const fresh = await new SyncDevice(t).login()
    const all = await fresh.pull()
    expect(all.changes.products?.created.length).toBeGreaterThanOrEqual(3)
    expect(all.changes.sales?.created.length).toBeGreaterThanOrEqual(2)
    // A full pull classifies everything as created (nothing is "updated" relative to epoch).
    expect(all.changes.products?.updated ?? []).toEqual([])
  })

  it('pushing nothing is a no-op that still succeeds', async () => {
    const res = await phone.pushRaw({})
    expect(res.status).toBe(200)
    expect(res.data.applied ?? {}).toEqual({})
  })

  it('offline placeholders ("local", "") in UUID columns are sanitised, not rejected', async () => {
    const product = rec.product(t.businessId)
    await phone.push({ products: { created: [product] } })
    const { sale, lines } = walkInSale(t.businessId, 'local', [
      { productId: product.id, qty: 1, price: 100 },
    ])
    sale.customer_id = ''
    const res = await phone.push({
      sales: { created: [sale] },
      sale_lines: { created: lines },
    })
    expect(res.applied.sales).toEqual([sale.id])
    const row = (await serverRows(laptop, 'sales')).find(
      (r) => r.id === sale.id,
    )!
    expect(row.staff_id).toBe(t.userId)
    expect(row.customer_id ?? null).toBeNull()
  })
})
