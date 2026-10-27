// Flaky networks: the server commits a push but the phone never sees the
// response, so the same batch is pushed again (new idempotency key per batch,
// as sync/client.ts does). Nothing may be duplicated or applied twice.
import { randomUUID } from 'node:crypto'
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

describe('02 retries and idempotency', () => {
  let t: Tenant
  let phone: SyncDevice
  let laptop: SyncDevice
  let productId: string

  beforeAll(async () => {
    t = await newTenant()
    phone = await new SyncDevice(t).login()
    laptop = await new SyncDevice(t).login()
    const product = rec.product(t.businessId, { price: '20.00' })
    productId = product.id
    await phone.push({
      products: { created: [product] },
      inventory_items: {
        created: [rec.inventory(t.businessId, product.id, 100)],
      },
    })
  })

  it('re-pushing the same sale batch (lost response) reports applied and changes nothing', async () => {
    const { sale, lines, movements } = walkInSale(t.businessId, t.userId, [
      { productId, qty: 5, price: 20 },
    ])
    const batch = {
      stock_movements: { created: movements },
      sales: { created: [sale] },
      sale_lines: { created: lines },
    }

    const first = await phone.push(batch)
    const second = await phone.push(batch)
    const third = await phone.push(batch)

    for (const r of [first, second, third]) {
      expect(r.applied.sales).toEqual([sale.id])
      expect(r.rejected ?? {}).toEqual({})
    }
    expect(await inventoryQty(laptop, productId)).toBe(95)
    const sales = (await serverRows(laptop, 'sales')).filter(
      (r) => r.id === sale.id,
    )
    expect(sales).toHaveLength(1)
    const saleLines = (await serverRows(laptop, 'sale_lines')).filter(
      (r) => r.sale_id === sale.id,
    )
    expect(saleLines).toHaveLength(1)
  })

  it('replaying with the SAME idempotency key is equally safe', async () => {
    const { sale, lines, movements } = walkInSale(t.businessId, t.userId, [
      { productId, qty: 2, price: 20 },
    ])
    const key = randomUUID()
    const batch = {
      stock_movements: { created: movements },
      sales: { created: [sale] },
      sale_lines: { created: lines },
    }
    const a = await phone.push(batch, { idempotencyKey: key })
    const b = await phone.push(batch, { idempotencyKey: key })
    expect(a.applied.sales).toEqual([sale.id])
    expect(b.applied.sales).toEqual([sale.id])
    expect(await inventoryQty(laptop, productId)).toBe(93)
  })

  it('a retry that carries the old batch plus new offline work applies only the new work', async () => {
    const old = walkInSale(t.businessId, t.userId, [
      { productId, qty: 1, price: 20 },
    ])
    await phone.push({
      stock_movements: { created: old.movements },
      sales: { created: [old.sale] },
      sale_lines: { created: old.lines },
    })

    const fresh = walkInSale(t.businessId, t.userId, [
      { productId, qty: 4, price: 20 },
    ])
    const res = await phone.push({
      stock_movements: { created: [...old.movements, ...fresh.movements] },
      sales: { created: [old.sale, fresh.sale] },
      sale_lines: { created: [...old.lines, ...fresh.lines] },
    })
    expect(res.applied.sales?.sort()).toEqual(
      [old.sale.id, fresh.sale.id].sort(),
    )
    expect(await inventoryQty(laptop, productId)).toBe(88) // 93 - 1 - 4
  })

  it('re-pushing an already-applied update with the same version does not bump twice', async () => {
    const customer = rec.customer(t.businessId)
    await phone.push({ customers: { created: [customer] } })
    const update = {
      ...customer,
      name: 'Renamed once',
      _status: 'updated',
      _changed: 'name',
    }

    const a = await phone.push({ customers: { updated: [update] } })
    expect(a.applied.customers).toEqual([customer.id])
    // Lost response: the phone still holds sync_version 1 and resends.
    const b = await phone.push({ customers: { updated: [update] } })
    // Same device, stale version → silent last-write-wins, never a conflict for the user.
    expect(b.conflicts ?? []).toEqual([])
    const row = (await serverRows(laptop, 'customers')).find(
      (r) => r.id === customer.id,
    )!
    expect(row.name).toBe('Renamed once')
  })

  it('a retried void does not restore stock twice', async () => {
    const { sale, lines, movements } = walkInSale(t.businessId, t.userId, [
      { productId, qty: 3, price: 20 },
    ])
    await phone.push({
      stock_movements: { created: movements },
      sales: { created: [sale] },
      sale_lines: { created: lines },
    })
    const before = await inventoryQty(laptop, productId)

    await phone.push({ sales: { deleted: [sale.id] } })
    await phone.push({ sales: { deleted: [sale.id] } })
    expect(await inventoryQty(laptop, productId)).toBe(before + 3)
  })

  it('the same batch pushed concurrently (double tap / two sync triggers) is applied once', async () => {
    const { sale, lines, movements } = walkInSale(t.businessId, t.userId, [
      { productId, qty: 6, price: 20 },
    ])
    const before = await inventoryQty(laptop, productId)
    const batch = {
      stock_movements: { created: movements },
      sales: { created: [sale] },
      sale_lines: { created: lines },
    }

    const results = await Promise.all([
      phone.pushRaw(batch),
      phone.pushRaw(batch),
      phone.pushRaw(batch),
    ])
    // No request may fail outright: the loser of the race must still answer, not 500.
    for (const r of results) expect(r.status).toBe(200)
    // Whatever each response says, the server must hold exactly one sale and one deduction.
    expect(
      (await serverRows(laptop, 'sales')).filter((r) => r.id === sale.id),
    ).toHaveLength(1)
    expect(await inventoryQty(laptop, productId)).toBe(before - 6)
    // And at least one response must confirm it, so the phone can mark it synced.
    expect(results.some((r) => r.data?.applied?.sales?.includes(sale.id))).toBe(
      true,
    )
  })
})
