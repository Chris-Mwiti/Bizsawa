// A shop that traded offline all day: a large queue must push in one go,
// within a sane time, and come back intact on a fresh device.
import { beforeAll, describe, expect, it } from 'vitest'
import {
  SyncDevice,
  Tenant,
  inventoryQty,
  newTenant,
  rec,
  walkInSale,
} from './harness'

describe('08 volume', () => {
  let t: Tenant
  let phone: SyncDevice

  beforeAll(async () => {
    t = await newTenant()
    phone = await new SyncDevice(t).login()
  })

  it('pushes a day of offline trading (300 sales, 900 lines) in one batch', async () => {
    const products = Array.from({ length: 3 }, () =>
      rec.product(t.businessId, { price: '25.00' }),
    )
    await phone.push({
      products: { created: products },
      inventory_items: {
        created: products.map((p) => rec.inventory(t.businessId, p.id, 1000)),
      },
    })

    const sales = Array.from({ length: 300 }, () =>
      walkInSale(
        t.businessId,
        t.userId,
        products.map((p) => ({ productId: p.id, qty: 1, price: 25 })),
      ),
    )
    const started = Date.now()
    const res = await phone.pushRaw({
      stock_movements: { created: sales.flatMap((s) => s.movements) },
      sales: { created: sales.map((s) => s.sale) },
      sale_lines: { created: sales.flatMap((s) => s.lines) },
    })
    const elapsed = Date.now() - started

    expect(res.status).toBe(200)
    expect(res.data.applied.sales).toHaveLength(300)
    expect(res.data.applied.sale_lines).toHaveLength(900)
    expect(res.data.rejected ?? {}).toEqual({})
    console.log(
      `[volume] 300 sales / 900 lines / 900 movements pushed in ${elapsed}ms`,
    )
    // The phone's HTTP client times out at 15s (e2e/api/helpers) — a backlog push must finish well inside it.
    expect(elapsed).toBeLessThan(15_000)

    for (const p of products) expect(await inventoryQty(phone, p.id)).toBe(700)

    const fresh = await new SyncDevice(t).login()
    const all = await fresh.pull()
    expect(all.changes.sales?.created.length).toBe(300)
    expect(all.changes.sale_lines?.created.length).toBe(900)
  })
})
