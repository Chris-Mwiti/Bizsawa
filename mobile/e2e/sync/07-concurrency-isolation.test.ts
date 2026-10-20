// Several tills selling the same stock at once, plus tenant and auth
// boundaries a sync batch must never cross.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  SyncDevice,
  Tenant,
  api,
  edited,
  inventoryQty,
  newTenant,
  rec,
  serverRows,
  walkInSale,
} from './harness'

describe('07 concurrency', () => {
  let t: Tenant
  let tills: SyncDevice[]

  beforeAll(async () => {
    t = await newTenant()
    tills = await Promise.all(
      Array.from({ length: 4 }, () => new SyncDevice(t).login()),
    )
  })

  it('four devices pushing offline sales of the same product concurrently: stock is exact', async () => {
    const p = rec.product(t.businessId, { price: '10.00' })
    await tills[0].push({
      products: { created: [p] },
      inventory_items: { created: [rec.inventory(t.businessId, p.id, 500)] },
    })

    const perTill = 10
    const results = await Promise.all(
      tills.map((till) => {
        const sales = Array.from({ length: perTill }, () =>
          walkInSale(t.businessId, t.userId, [
            { productId: p.id, qty: 3, price: 10 },
          ]),
        )
        return till.pushRaw({
          stock_movements: { created: sales.flatMap((s) => s.movements) },
          sales: { created: sales.map((s) => s.sale) },
          sale_lines: { created: sales.flatMap((s) => s.lines) },
        })
      }),
    )
    for (const r of results) {
      expect(r.status).toBe(200)
      expect(r.data.applied?.sales).toHaveLength(perTill)
    }
    expect(await inventoryQty(tills[0], p.id)).toBe(500 - 4 * perTill * 3)
  })

  it('concurrent edits of one record from two devices: exactly one applies, the other conflicts', async () => {
    const c = rec.customer(t.businessId)
    await tills[0].push({ customers: { created: [c] } })
    const [a, b] = await Promise.all([
      tills[1].push({
        customers: { updated: [edited(c, { name: 'Till 1' })] },
      }),
      tills[2].push({
        customers: { updated: [edited(c, { name: 'Till 2' })] },
      }),
    ])
    const appliedBy = [a, b].filter((r) => r.applied.customers?.includes(c.id))
    const conflicted = [a, b].filter((r) =>
      r.conflicts?.some((x: any) => x.record_id === c.id),
    )
    expect(appliedBy, 'exactly one concurrent edit may win').toHaveLength(1)
    expect(
      conflicted,
      'the other must surface as a conflict, not be lost',
    ).toHaveLength(1)
    const row = (await serverRows(tills[0], 'customers')).find(
      (x) => x.id === c.id,
    )!
    expect(row.sync_version).toBe(2)
  })
})

describe('07 isolation and auth', () => {
  let a: Tenant
  let b: Tenant
  let devA: SyncDevice
  let devB: SyncDevice

  beforeAll(async () => {
    ;[a, b] = await Promise.all([newTenant(), newTenant()])
    devA = await new SyncDevice(a).login()
    devB = await new SyncDevice(b).login()
  })

  it('a device cannot sync against a business it is not a member of', async () => {
    const pull = await api.get('/sync/pull', {
      headers: { ...devB.headers(), 'X-Business-ID': a.businessId },
      params: { since: 0 },
    })
    expect([401, 403]).toContain(pull.status)
    const push = await api.post(
      '/sync/push',
      {
        changes: {
          customers: {
            created: [rec.customer(a.businessId)],
            updated: [],
            deleted: [],
          },
        },
      },
      {
        headers: {
          ...devB.headers(),
          'X-Business-ID': a.businessId,
          'X-Idempotency-Key': randomUUID(),
        },
      },
    )
    expect([401, 403]).toContain(push.status)
  })

  it("updating or deleting another business's record by id has no effect", async () => {
    const victim = rec.customer(a.businessId, { name: 'Victim' })
    await devA.push({ customers: { created: [victim] } })

    await devB.pushRaw({
      customers: {
        updated: [
          edited({ ...victim, business_id: b.businessId }, { name: 'Pwned' }),
        ],
      },
    })
    await devB.pushRaw({ customers: { deleted: [victim.id] } })

    const row = (await serverRows(devA, 'customers')).find(
      (x) => x.id === victim.id,
    )
    expect(row?.name).toBe('Victim')
  })

  it('a client-chosen id that already exists in another business is not overwritten', async () => {
    const original = rec.customer(a.businessId, { name: 'Original' })
    await devA.push({ customers: { created: [original] } })
    const clash = {
      ...rec.customer(b.businessId, { name: 'Clash' }),
      id: original.id,
    }
    const r = await devB.pushRaw({ customers: { created: [clash] } })
    expect(r.status).toBe(200)
    const row = (await serverRows(devA, 'customers')).find(
      (x) => x.id === original.id,
    )
    expect(row?.name).toBe('Original')
  })

  it('an expired/invalid token is refused and nothing is applied; a retry with a fresh token applies', async () => {
    const c = rec.customer(a.businessId)
    const denied = await devA.pushRaw(
      { customers: { created: [c] } },
      { token: 'expired.token.value' },
    )
    expect(denied.status).toBe(401)
    expect(
      (await serverRows(devA, 'customers')).find((x) => x.id === c.id),
    ).toBeUndefined()

    const ok = await devA.push({ customers: { created: [c] } })
    expect(ok.applied.customers).toEqual([c.id])
  })
})
