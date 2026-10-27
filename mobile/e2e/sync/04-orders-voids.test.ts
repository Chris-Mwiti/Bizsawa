// Offline order lifecycle and voids: every stock side effect must happen
// exactly once, whichever device triggers it and however often it is retried.
import { beforeAll, describe, expect, it } from 'vitest'
import {
  SyncDevice,
  Tenant,
  edited,
  ids,
  inventoryQty,
  newTenant,
  rec,
  serverRows,
  walkInSale,
} from './harness'

describe('04 orders, voids and stock side effects', () => {
  let t: Tenant
  let phone: SyncDevice
  let laptop: SyncDevice

  beforeAll(async () => {
    t = await newTenant()
    phone = await new SyncDevice(t).login()
    laptop = await new SyncDevice(t).login()
  })

  async function stocked(qty: number, price = 40) {
    const p = rec.product(t.businessId, { price: price.toFixed(2) })
    await phone.push({
      products: { created: [p] },
      inventory_items: { created: [rec.inventory(t.businessId, p.id, qty)] },
    })
    return p
  }

  async function draftOrder(productId: string, qty: number, price = 40) {
    const order = rec.order(t.businessId, qty * price)
    const line = rec.orderLine(t.businessId, order.id, productId, qty, price)
    const r = await phone.push({
      orders: { created: [order] },
      order_lines: { created: [line] },
    })
    expect(r.applied.orders).toEqual([order.id])
    return { order, line }
  }

  it('voiding an offline sale marks it void, hides it from pulls and restores stock once', async () => {
    const p = await stocked(10)
    const { sale, lines, movements } = walkInSale(t.businessId, t.userId, [
      { productId: p.id, qty: 4, price: 40 },
    ])
    await phone.push({
      stock_movements: { created: movements },
      sales: { created: [sale] },
      sale_lines: { created: lines },
    })
    expect(await inventoryQty(laptop, p.id)).toBe(6)
    await laptop.pull()

    const r = await phone.push({ sales: { deleted: [sale.id] } })
    expect(r.applied.sales).toEqual([sale.id])
    expect(await inventoryQty(laptop, p.id)).toBe(10)

    const pulled = await laptop.pull()
    expect(pulled.changes.sales?.deleted).toContain(sale.id)
    expect(ids(pulled.changes.sales?.updated)).not.toContain(sale.id)
  })

  it('voiding a sale whose deduction never reached the server does not invent stock', async () => {
    const p = await stocked(5)
    // Sale created and voided offline in the same session: the phone pushes the
    // delete for an id the server has never seen.
    const ghost = walkInSale(t.businessId, t.userId, [
      { productId: p.id, qty: 2, price: 40 },
    ])
    const r = await phone.push({ sales: { deleted: [ghost.sale.id] } })
    expect(r.rejected ?? {}).toEqual({})
    expect(await inventoryQty(laptop, p.id)).toBe(5)
  })

  it('draft order confirmed offline: stock deducted once, invoice derived once', async () => {
    const p = await stocked(30)
    const { order } = await draftOrder(p.id, 5)
    expect(await inventoryQty(laptop, p.id)).toBe(30) // drafts never deduct

    const confirm = edited(order, { status: 'confirmed' })
    const r = await phone.push({ orders: { updated: [confirm] } })
    expect(r.applied.orders).toEqual([order.id])
    expect(r.errors ?? {}).toEqual({})
    expect(await inventoryQty(laptop, p.id)).toBe(25)

    const invoices = (await serverRows(laptop, 'invoices')).filter(
      (i) => i.order_id === order.id,
    )
    expect(invoices).toHaveLength(1)
  })

  it('confirm pushed together with the client-mirrored ledger row does not double-deduct', async () => {
    const p = await stocked(30)
    const { order } = await draftOrder(p.id, 5)
    const mirrored = rec.movement(t.businessId, p.id, -5, 'order', order.id)
    await phone.push({
      stock_movements: { created: [mirrored] },
      orders: { updated: [edited(order, { status: 'confirmed' })] },
    })
    expect(await inventoryQty(laptop, p.id)).toBe(25)
  })

  it('cancelling a confirmed order restores stock exactly once (even if re-pushed)', async () => {
    const p = await stocked(30)
    const { order } = await draftOrder(p.id, 6)
    await phone.push({
      orders: { updated: [edited(order, { status: 'confirmed' })] },
    })
    expect(await inventoryQty(laptop, p.id)).toBe(24)

    const cancel = edited(
      { ...order, sync_version: 2 },
      { status: 'cancelled' },
    )
    await phone.push({ orders: { updated: [cancel] } })
    await phone.push({ orders: { updated: [cancel] } })
    expect(await inventoryQty(laptop, p.id)).toBe(30)
  })

  it('cancelling a draft order never restores stock it never removed', async () => {
    const p = await stocked(30)
    const { order } = await draftOrder(p.id, 6)
    await phone.push({
      orders: { updated: [edited(order, { status: 'cancelled' })] },
    })
    expect(await inventoryQty(laptop, p.id)).toBe(30)
  })

  it('fulfilling an order derives exactly one sale and does not deduct again', async () => {
    const p = await stocked(30)
    const { order } = await draftOrder(p.id, 3)
    await phone.push({
      orders: { updated: [edited(order, { status: 'confirmed' })] },
    })
    await phone.push({
      orders: {
        updated: [
          edited({ ...order, sync_version: 2 }, { status: 'fulfilled' }),
        ],
      },
    })

    const sales = (await serverRows(laptop, 'sales')).filter(
      (s) => s.order_id === order.id,
    )
    expect(sales).toHaveLength(1)
    expect(await inventoryQty(laptop, p.id)).toBe(27)
  })

  it('deleting a confirmed order (offline) restores its stock once', async () => {
    const p = await stocked(30)
    const { order } = await draftOrder(p.id, 4)
    await phone.push({
      orders: { updated: [edited(order, { status: 'confirmed' })] },
    })
    await phone.push({ orders: { deleted: [order.id] } })
    await phone.push({ orders: { deleted: [order.id] } })
    expect(await inventoryQty(laptop, p.id)).toBe(30)
  })
})
