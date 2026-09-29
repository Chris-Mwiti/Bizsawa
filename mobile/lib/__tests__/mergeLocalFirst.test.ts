import { describe, expect, it } from 'vitest'
import { mergeLocalFirst, type LocalAware } from '../mergeLocalFirst'

type Row = LocalAware & {
  id: string
  name?: string
  price?: number
  cost?: number
  sku?: string
  stockQuantity?: number
  variants?: unknown[]
}

const OVERLAY = ['name', 'price', 'cost', 'sku'] as const

const row = (r: Row): Row => r

describe('mergeLocalFirst', () => {
  it('returns local rows when the server has not responded yet', () => {
    const local = [row({ id: 'a', name: 'Local A', _status: 'created' })]
    expect(mergeLocalFirst<Row>(undefined, local, { overlayFields: OVERLAY })).toEqual([
      { id: 'a', name: 'Local A', _status: 'created' },
    ])
    expect(mergeLocalFirst<Row>(null, local, { overlayFields: OVERLAY })).toHaveLength(1)
  })

  it('keeps the local edit when the local row is pending', () => {
    const server = [row({ id: 'a', name: 'Old Name', price: 10, _status: 'synced' })]
    const local = [row({ id: 'a', name: 'New Name', price: 25, _status: 'updated' })]

    const result = mergeLocalFirst<Row>(server, local, { overlayFields: OVERLAY })

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('New Name')
    expect(result[0].price).toBe(25)
  })

  it('lets the server win once the local row is synced', () => {
    const server = [row({ id: 'a', name: 'Server Name', price: 99, _status: 'synced' })]
    const local = [row({ id: 'a', name: 'Stale Local', price: 25, _status: 'synced' })]

    const result = mergeLocalFirst<Row>(server, local, { overlayFields: OVERLAY })

    expect(result[0].name).toBe('Server Name')
    expect(result[0].price).toBe(99)
  })

  it('overlays only the declared fields, leaving server-owned fields intact', () => {
    const server = [row({ id: 'a', name: 'Old', stockQuantity: 42, variants: [{ id: 'v1' }] })]
    const local = [
      row({
        id: 'a',
        name: 'New',
        stockQuantity: 0,
        variants: [],
        _status: 'updated',
      }),
    ]

    const result = mergeLocalFirst<Row>(server, local, { overlayFields: OVERLAY })

    expect(result[0].name).toBe('New')
    // not in overlayFields, so the server value survives
    expect(result[0].variants).toEqual([{ id: 'v1' }])
  })

  it('appends offline creates that the server has not seen', () => {
    const server = [row({ id: 'a', name: 'Server A' })]
    const local = [
      row({ id: 'a', name: 'Server A' }),
      row({ id: 'b', name: 'Pending B', _status: 'created' }),
    ]

    const result = mergeLocalFirst<Row>(server, local, { overlayFields: OVERLAY })

    expect(result.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result[1].name).toBe('Pending B')
  })

  it('preserves server ordering and does not duplicate ids', () => {
    const server = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]
    const local = [row({ id: 'c' }), row({ id: 'a' }), row({ id: 'd' })]

    const result = mergeLocalFirst<Row>(server, local, { overlayFields: OVERLAY })

    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('never surfaces soft-deleted local rows', () => {
    const server = [row({ id: 'a', name: 'A' })]
    const local = [
      row({ id: 'a', name: 'A' }),
      row({ id: 'b', name: 'Gone', _status: 'deleted' }),
    ]

    const result = mergeLocalFirst<Row>(server, local, { overlayFields: OVERLAY })

    expect(result.map((r) => r.id)).toEqual(['a'])
  })

  it('filters deleted rows when the server has not responded', () => {
    const local = [
      row({ id: 'a', _status: 'updated' }),
      row({ id: 'b', _status: 'deleted' }),
    ]

    expect(mergeLocalFirst<Row>(undefined, local, { overlayFields: OVERLAY }).map((r) => r.id)).toEqual(['a'])
  })

  it('keeps a non-empty local collection when the server copy is empty', () => {
    const server = [row({ id: 'a', name: 'A', variants: [] })]
    const local = [row({ id: 'a', name: 'A', variants: [{ id: 'v9' }], _status: 'synced' })]

    const result = mergeLocalFirst<Row>(server, local, {
      overlayFields: OVERLAY,
      keepLocalWhenServerEmpty: ['variants'],
    })

    expect(result[0].variants).toEqual([{ id: 'v9' }])
  })

  it('does not resurrect a collection the server intentionally emptied', () => {
    const server = [row({ id: 'a', variants: [] })]
    const local = [row({ id: 'a', variants: [{ id: 'v9' }], _status: 'synced' })]

    // without keepLocalWhenServerEmpty the server's empty list wins
    const result = mergeLocalFirst<Row>(server, local, { overlayFields: OVERLAY })

    expect(result[0].variants).toEqual([])
  })

  it('treats a null local collection as empty when checking the server copy', () => {
    const server = [row({ id: 'a', variants: null as unknown as unknown[] })]
    const local = [row({ id: 'a', variants: [{ id: 'v1' }], _status: 'updated' })]

    const result = mergeLocalFirst<Row>(server, local, {
      overlayFields: ['variants'],
      keepLocalWhenServerEmpty: ['variants'],
    })

    expect(result[0].variants).toEqual([{ id: 'v1' }])
  })

  it('honours a custom isPending predicate', () => {
    const server = [row({ id: 'a', name: 'Server' })]
    const local = [row({ id: 'a', name: 'Locally edited', _status: 'synced' })]

    const result = mergeLocalFirst<Row>(server, local, {
      overlayFields: OVERLAY,
      isPending: (r) => r.name !== 'Server',
    })

    expect(result[0].name).toBe('Locally edited')
  })

  it('returns the server rows untouched when there is no local data', () => {
    const server = [row({ id: 'a', name: 'A' }), row({ id: 'b', name: 'B' })]

    const result = mergeLocalFirst<Row>(server, [], { overlayFields: OVERLAY })

    expect(result).toEqual(server)
    expect(result[0]).toBe(server[0])
  })

  it('does not mutate its inputs', () => {
    const server = [row({ id: 'a', name: 'Server' })]
    const local = [row({ id: 'a', name: 'Local', _status: 'updated' })]
    const serverSnapshot = JSON.stringify(server)
    const localSnapshot = JSON.stringify(local)

    mergeLocalFirst<Row>(server, local, { overlayFields: OVERLAY })

    expect(JSON.stringify(server)).toBe(serverSnapshot)
    expect(JSON.stringify(local)).toBe(localSnapshot)
  })
})
