// Two devices edit the same record while offline. Cross-device edits must
// never silently overwrite each other; same-device retries must never nag.
import { beforeAll, describe, expect, it } from 'vitest'
import {
  SyncDevice,
  Tenant,
  api,
  edited,
  newTenant,
  rec,
  serverRows,
} from './harness'

describe('03 conflicts across devices', () => {
  let t: Tenant
  let phone: SyncDevice
  let laptop: SyncDevice

  beforeAll(async () => {
    t = await newTenant()
    phone = await new SyncDevice(t).login()
    laptop = await new SyncDevice(t).login()
  })

  async function sharedProduct(extra = {}) {
    const p = rec.product(t.businessId, {
      name: 'Sugar 1kg',
      price: '150.00',
      ...extra,
    })
    await phone.push({ products: { created: [p] } })
    await phone.pull()
    await laptop.pull()
    return p
  }

  it('stale edit from another device becomes a conflict, server keeps the first write', async () => {
    const p = await sharedProduct()
    // Both devices hold sync_version 1. Phone syncs first.
    const a = await phone.push({
      products: { updated: [edited(p, { price: '160.00' })] },
    })
    expect(a.applied.products).toEqual([p.id])

    const b = await laptop.push({
      products: { updated: [edited(p, { price: '155.00' })] },
    })
    expect(b.applied.products ?? []).not.toContain(p.id)
    expect(b.conflicts).toHaveLength(1)
    const c = b.conflicts[0]
    expect(c.record_id).toBe(p.id)
    expect(c.table_name).toBe('products')
    expect(c.client_version).toBe(1)
    expect(c.server_version).toBe(2)
    expect(c.client_device_id).toBe(laptop.deviceId)
    expect(c.server_device_id).toBe(phone.deviceId)

    const row = (await serverRows(laptop, 'products')).find(
      (r) => r.id === p.id,
    )!
    expect(Number(row.price)).toBe(160)
  })

  it('the conflicted device can see the winning server value on its next pull', async () => {
    const p = await sharedProduct()
    await phone.push({
      products: { updated: [edited(p, { price: '170.00' })] },
    })
    await laptop.push({
      products: { updated: [edited(p, { price: '175.00' })] },
    })

    // WatermelonDB marks the conflicted record synced (it is not in `rejected`),
    // so the laptop only converges if its next pull carries the server row.
    const pulled = await laptop.pull()
    const rows = [
      ...(pulled.changes.products?.updated ?? []),
      ...(pulled.changes.products?.created ?? []),
    ]
    const row = rows.find((r) => r.id === p.id)
    expect(
      row,
      'server version of the conflicted record must reach the losing device',
    ).toBeDefined()
    expect(Number(row!.price)).toBe(170)
  })

  it('a conflict is listed once and can be resolved kept_client', async () => {
    const p = await sharedProduct()
    await phone.push({
      products: { updated: [edited(p, { name: 'Phone name' })] },
    })
    const b = await laptop.push({
      products: { updated: [edited(p, { name: 'Laptop name' })] },
    })
    const conflictId = b.conflicts[0].id

    const list = await laptop.get('/sync/conflicts')
    expect(list.status).toBe(200)
    expect(
      list.data.conflicts.filter((c: any) => c.record_id === p.id),
    ).toHaveLength(1)

    const res = await api.post(
      `/sync/conflicts/${conflictId}/resolve`,
      { resolution: 'kept_client', device_id: laptop.deviceId },
      { headers: laptop.headers() },
    )
    expect(res.status).toBe(200)
    const row = (await serverRows(laptop, 'products')).find(
      (r) => r.id === p.id,
    )!
    expect(row.name).toBe('Laptop name')
    expect(row.sync_version).toBeGreaterThan(2)

    const after = await laptop.get('/sync/conflicts')
    expect(
      after.data.conflicts.filter((c: any) => c.record_id === p.id),
    ).toHaveLength(0)
  })

  it('resolving kept_server leaves the server row untouched', async () => {
    const p = await sharedProduct()
    await phone.push({
      products: { updated: [edited(p, { name: 'Server wins' })] },
    })
    const b = await laptop.push({
      products: { updated: [edited(p, { name: 'Discard me' })] },
    })
    const res = await api.post(
      `/sync/conflicts/${b.conflicts[0].id}/resolve`,
      { resolution: 'kept_server' },
      { headers: laptop.headers() },
    )
    expect(res.status).toBe(200)
    const row = (await serverRows(laptop, 'products')).find(
      (r) => r.id === p.id,
    )!
    expect(row.name).toBe('Server wins')
  })

  it('same-device stale edit (lost response, edited again) is applied last-write-wins, no conflict', async () => {
    const p = await sharedProduct()
    await phone.push({
      products: { updated: [edited(p, { price: '151.00' })] },
    })
    // Phone never got the response: still at version 1, edits again.
    const r = await phone.push({
      products: { updated: [edited(p, { price: '152.00' })] },
    })
    expect(r.conflicts ?? []).toEqual([])
    expect(r.lww_applied?.products).toEqual([p.id])
    const row = (await serverRows(phone, 'products')).find(
      (x) => x.id === p.id,
    )!
    expect(Number(row.price)).toBe(152)
  })

  it('an edit without a device id (old app build) is a conflict, never a silent overwrite', async () => {
    const p = await sharedProduct()
    await phone.push({
      products: { updated: [edited(p, { price: '199.00' })] },
    })
    const r = await laptop.push(
      { products: { updated: [edited(p, { price: '1.00' })] } },
      { deviceId: null },
    )
    expect(r.applied.products ?? []).not.toContain(p.id)
    expect(r.conflicts).toHaveLength(1)
    const row = (await serverRows(phone, 'products')).find(
      (x) => x.id === p.id,
    )!
    expect(Number(row.price)).toBe(199)
  })

  it('editing a record another device already deleted does not resurrect it', async () => {
    const c = rec.customer(t.businessId)
    await phone.push({ customers: { created: [c] } })
    await laptop.pull()
    await phone.push({ customers: { deleted: [c.id] } })

    await laptop.push({
      customers: { updated: [edited(c, { name: 'Ghost' })] },
    })
    const rows = await serverRows(laptop, 'customers')
    expect(
      rows.find((x) => x.id === c.id),
      'deleted customer must stay deleted',
    ).toBeUndefined()
    // ...and the laptop learns about the delete on its next pull.
    const next = await laptop.pull()
    expect(next.changes.customers?.deleted).toContain(c.id)
  })

  it('both devices editing DIFFERENT records never conflict', async () => {
    const a = rec.customer(t.businessId)
    const b = rec.customer(t.businessId)
    await phone.push({ customers: { created: [a, b] } })
    await laptop.pull()
    const r1 = await phone.push({
      customers: { updated: [edited(a, { name: 'A2' })] },
    })
    const r2 = await laptop.push({
      customers: { updated: [edited(b, { name: 'B2' })] },
    })
    expect(r1.conflicts ?? []).toEqual([])
    expect(r2.conflicts ?? []).toEqual([])
  })
})
