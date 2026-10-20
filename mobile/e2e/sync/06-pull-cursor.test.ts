// The pull cursor (lastPulledAt) must never skip a change: every row written
// after a device's last pull has to arrive on its next pull(s).
import { beforeAll, describe, expect, it } from 'vitest'
import { SyncDevice, Tenant, edited, ids, newTenant, rec } from './harness'

describe('06 pull cursor and pagination', () => {
  let t: Tenant
  let phone: SyncDevice
  let laptop: SyncDevice

  beforeAll(async () => {
    t = await newTenant()
    phone = await new SyncDevice(t).login()
    laptop = await new SyncDevice(t).login()
  })

  it('an incremental pull returns only changes made since the cursor', async () => {
    const a = rec.customer(t.businessId)
    await phone.push({ customers: { created: [a] } })
    await laptop.pull()

    const b = rec.customer(t.businessId)
    await phone.push({ customers: { created: [b] } })
    const next = await laptop.pull()
    expect(ids(next.changes.customers?.created)).toEqual([b.id])
    expect(ids(next.changes.customers?.updated)).not.toContain(a.id)

    const empty = await laptop.pull()
    expect(
      empty.changes.customers ?? { created: [], updated: [], deleted: [] },
    ).toEqual({ created: [], updated: [], deleted: [] })
  })

  it('an edit to an old record arrives in the `updated` bucket with the new version', async () => {
    const c = rec.customer(t.businessId)
    await phone.push({ customers: { created: [c] } })
    await laptop.pull()
    await phone.push({
      customers: { updated: [edited(c, { name: 'Edited' })] },
    })

    const next = await laptop.pull()
    const row = next.changes.customers?.updated.find((r) => r.id === c.id)
    expect(row?.name).toBe('Edited')
    expect(row?.sync_version).toBe(2)
  })

  it('a delete arrives in the `deleted` bucket', async () => {
    const c = rec.customer(t.businessId)
    await phone.push({ customers: { created: [c] } })
    await laptop.pull()
    await phone.push({ customers: { deleted: [c.id] } })
    const next = await laptop.pull()
    expect(next.changes.customers?.deleted).toContain(c.id)
  })

  it('a create + delete between two pulls never reaches the device as a live row', async () => {
    await laptop.pull()
    const c = rec.customer(t.businessId)
    await phone.push({ customers: { created: [c] } })
    await phone.push({ customers: { deleted: [c.id] } })
    const next = await laptop.pull()
    expect(ids(next.changes.customers?.created)).not.toContain(c.id)
  })

  it('more rows than the per-table limit: following the cursor still delivers every row', async () => {
    const fresh = await newTenant()
    const writer = await new SyncDevice(fresh).login()
    const reader = await new SyncDevice(fresh).login()

    const LIMIT = 25
    const TOTAL = 60
    const customers = Array.from({ length: TOTAL }, (_, i) =>
      rec.customer(fresh.businessId, { name: `C${i}` }),
    )
    await writer.push({ customers: { created: customers } })

    // The app pulls with the server default limit (1000); a small limit
    // exercises the same truncation without writing thousands of rows.
    const seen = new Set<string>()
    for (let page = 0; page < 5; page++) {
      const res = await reader.pull({ limit: LIMIT })
      const got = [
        ...(res.changes.customers?.created ?? []),
        ...(res.changes.customers?.updated ?? []),
      ]
      got.forEach((r) => seen.add(r.id))
      if (got.length === 0) break
    }
    expect(
      seen.size,
      `received ${seen.size}/${TOTAL} customers — rows past the limit were skipped by the cursor`,
    ).toBe(TOTAL)
  })

  it('a change committed while another device is pulling is not lost', async () => {
    // Fire a slow push (large batch → long transaction) and a pull concurrently.
    // Rows get updated_at = NOW() = transaction START time; if the pull's
    // timestamp lands after that but before COMMIT, the next pull's
    // `updated_at > since` filter skips them forever.
    const fresh = await newTenant()
    const writer = await new SyncDevice(fresh).login()
    const reader = await new SyncDevice(fresh).login()
    await reader.pull()

    let missed = 0
    for (let round = 0; round < 5; round++) {
      const batch = Array.from({ length: 400 }, () =>
        rec.customer(fresh.businessId),
      )
      const pushing = writer.push({ customers: { created: batch } })
      await new Promise((r) => setTimeout(r, 30))
      const seen = new Set<string>()
      const collect = (res: Awaited<ReturnType<SyncDevice['pull']>>) =>
        [
          ...(res.changes.customers?.created ?? []),
          ...(res.changes.customers?.updated ?? []),
        ].forEach((r) => seen.add(r.id))
      collect(await reader.pull()) // advances the cursor mid-transaction
      await pushing
      for (let i = 0; i < 3; i++) collect(await reader.pull())
      // Count rows the server holds that never reached the reader through its cursor.
      const all = new Set(
        (
          await reader.pull({ since: 0, limit: 5000 })
        ).changes.customers?.created.map((r) => r.id),
      )
      missed += batch.filter((r) => all.has(r.id) && !seen.has(r.id)).length
    }
    expect(
      missed,
      'rows committed during a concurrent pull were skipped by the cursor',
    ).toBe(0)
  })
})
