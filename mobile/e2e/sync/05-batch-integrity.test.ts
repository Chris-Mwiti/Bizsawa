// One bad record must never take the rest of an offline queue down with it:
// good records apply, bad ones come back in `rejected` so the phone keeps
// them pending (sync/client.ts → experimentalRejectedIds).
import { randomUUID } from 'node:crypto'
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

describe('05 batch integrity', () => {
  let t: Tenant
  let phone: SyncDevice
  let laptop: SyncDevice

  beforeAll(async () => {
    t = await newTenant()
    phone = await new SyncDevice(t).login()
    laptop = await new SyncDevice(t).login()
  })

  it('a record with an invalid id is rejected; the rest of the batch applies', async () => {
    const good = rec.customer(t.businessId)
    const bad = { ...rec.customer(t.businessId), id: 'not-a-uuid' }
    const r = await phone.push({ customers: { created: [bad, good] } })
    expect(r.applied.customers).toEqual([good.id])
    expect(r.rejected?.customers).toEqual(['not-a-uuid'])
  })

  it('a child whose parent is missing is rejected cleanly (no raw SQL error, batch survives)', async () => {
    const orphanLine = rec.saleLine(
      t.businessId,
      randomUUID(),
      randomUUID(),
      1,
      10,
    )
    const good = rec.expense(t.businessId, 100)
    const r = await phone.push({
      sale_lines: { created: [orphanLine] },
      expenses: { created: [good] },
    })
    expect(r.rejected?.sale_lines).toEqual([orphanLine.id])
    expect(r.applied.expenses).toEqual([good.id])
    for (const msg of r.errors?.sale_lines ?? []) {
      expect(msg).not.toMatch(/SQLSTATE|violates foreign key/)
    }
  })

  it('parents and children in the same batch apply regardless of the order they are listed', async () => {
    const p = rec.product(t.businessId)
    const inv = rec.inventory(t.businessId, p.id, 9)
    const { sale, lines } = walkInSale(t.businessId, t.userId, [
      { productId: p.id, qty: 1, price: 100 },
    ])
    // JSON object order is irrelevant: the server must walk tables in FK order.
    const r = await phone.push({
      sale_lines: { created: lines },
      sales: { created: [sale] },
      inventory_items: { created: [inv] },
      products: { created: [p] },
    })
    expect(r.applied.products).toEqual([p.id])
    expect(r.applied.sale_lines).toEqual(ids(lines))
    expect(await inventoryQty(laptop, p.id)).toBe(8)
  })

  it('a garbage numeric value does not abort the batch', async () => {
    const weird = rec.expense(t.businessId, 0, { amount: 'NaN' })
    const ok = rec.expense(t.businessId, 75)
    const r = await phone.push({ expenses: { created: [weird, ok] } })
    expect(r.applied.expenses).toContain(ok.id)
    // NaN is coerced to 0 (never stored as NaN, which would break analytics).
    const rows = await serverRows(laptop, 'expenses')
    const stored = rows.find((x) => x.id === weird.id)
    if (stored) expect(Number(stored.amount)).toBe(0)
  })

  it('a duplicate sale for an already-fulfilled order is rejected without poisoning the batch', async () => {
    const p = rec.product(t.businessId)
    await phone.push({
      products: { created: [p] },
      inventory_items: { created: [rec.inventory(t.businessId, p.id, 20)] },
    })
    const order = rec.order(t.businessId, 100)
    await phone.push({
      orders: { created: [order] },
      order_lines: {
        created: [rec.orderLine(t.businessId, order.id, p.id, 1, 100)],
      },
    })
    await phone.push({
      orders: { updated: [edited(order, { status: 'confirmed' })] },
    })
    // Laptop fulfils online → server derives the order's sale.
    await laptop.push({
      orders: {
        updated: [
          edited({ ...order, sync_version: 2 }, { status: 'fulfilled' }),
        ],
      },
    })

    // Phone fulfilled the same order offline and recorded its own sale, plus an
    // unrelated walk-in sale queued after it.
    const dup = rec.sale(t.businessId, t.userId, 100, { order_id: order.id })
    const walk = walkInSale(t.businessId, t.userId, [
      { productId: p.id, qty: 2, price: 100 },
    ])
    const res = await phone.pushRaw({
      sales: { created: [dup, walk.sale] },
      sale_lines: { created: walk.lines },
    })

    expect(res.status).toBe(200)
    expect(res.data.rejected?.sales).toContain(dup.id)
    expect(
      res.data.applied?.sales,
      'walk-in sale queued after the duplicate must still apply',
    ).toContain(walk.sale.id)
    for (const msg of res.data.errors?.sales ?? []) {
      expect(msg).not.toMatch(/current transaction is aborted/)
      expect(msg).not.toMatch(/duplicate key value/)
    }
  })

  it('an unknown table is reported, not fatal', async () => {
    const c = rec.customer(t.businessId)
    const res = await phone.pushRaw({
      not_a_table: { created: [{ id: randomUUID() }] },
      customers: { created: [c] },
    } as any)
    expect(res.status).toBe(200)
    expect(res.data.errors?.not_a_table).toBeTruthy()
    expect(res.data.applied?.customers).toEqual([c.id])
  })

  it('a client cannot smuggle another business_id onto its record', async () => {
    const other = await newTenant()
    const c = rec.customer(other.businessId) // claims the other tenant's business
    const r = await phone.push({ customers: { created: [c] } })
    const otherDevice = await new SyncDevice(other).login()
    const leaked = (await serverRows(otherDevice, 'customers')).find(
      (x) => x.id === c.id,
    )
    expect(leaked, 'record must not land in the other business').toBeUndefined()
    // Either rejected, or stored under the pushing business.
    if (r.applied.customers?.includes(c.id)) {
      const mine = (await serverRows(laptop, 'customers')).find(
        (x) => x.id === c.id,
      )
      expect(mine?.business_id).toBe(t.businessId)
    }
  })
})
