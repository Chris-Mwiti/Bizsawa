export type SyncStatus = 'created' | 'updated' | 'synced' | 'deleted'

export interface LocalAware {
  id: string
  _status?: SyncStatus | string
  _changed?: string
}

export interface MergeOptions<T> {
  /**
   * Decides whether a local row still holds unsynced intent. Default treats
   * WatermelonDB's `created` / `updated` markers as pending.
   */
  isPending?: (row: T) => boolean
  /**
   * Fields where a pending local row wins over the server copy. Identity and
   * server-owned metadata must stay server-authoritative.
   */
  overlayFields: readonly (keyof T)[]
  /**
   * Fields that should keep the local value when the server copy is empty or
   * missing, even for rows that are otherwise fully synced. Used for nested
   * collections (e.g. variants) that the server may not have returned yet.
   */
  keepLocalWhenServerEmpty?: readonly (keyof T)[]
}

function defaultIsPending(row: LocalAware): boolean {
  return row._status === 'created' || row._status === 'updated'
}

function isDeleted(row: LocalAware): boolean {
  return row._status === 'deleted'
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'string') return v.length === 0
  return false
}

function pick<T>(row: T, fields: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {}
  for (const f of fields) {
    out[f] = row[f]
  }
  return out
}

/**
 * Merges a server response over the local database, giving precedence to local
 * rows that have not been synced yet.
 *
 * The precedence rule is:
 *  - local row pending (`_status` created/updated) -> local values win, so an
 *    optimistic edit is not visually reverted by a slower server response
 *  - local row synced -> server values win, so genuine server corrections and
 *    computed fields land
 *  - local row absent from the server response -> appended, so offline creates
 *    appear immediately
 *  - soft-deleted local rows are never surfaced
 */
export function mergeLocalFirst<T extends LocalAware>(
  server: readonly T[] | undefined | null,
  local: readonly T[],
  options: MergeOptions<T>,
): T[] {
  const isPending = options.isPending ?? defaultIsPending
  const overlayFields = options.overlayFields
  const keepLocalWhenServerEmpty = options.keepLocalWhenServerEmpty ?? []

  if (server === undefined || server === null) {
    return local.filter((row) => !isDeleted(row as LocalAware)).map((row) => ({ ...row }))
  }

  const localById = new Map<string, T>()
  for (const row of local) {
    if (!isDeleted(row as LocalAware)) localById.set(row.id, row)
  }

  const merged: T[] = server.map((serverRow) => {
    const localRow = localById.get(serverRow.id)
    if (!localRow) return serverRow

    let next = serverRow

    if (isPending(localRow)) {
      next = { ...serverRow, ...pick(localRow, overlayFields) }
    }

    for (const field of keepLocalWhenServerEmpty) {
      if (isEmptyValue(next[field]) && !isEmptyValue(localRow[field])) {
        next = { ...next, [field]: localRow[field] }
      }
    }

    return next
  })

  const serverIds = new Set(server.map((row) => row.id))
  const appended = local.filter((row) => !serverIds.has(row.id) && !isDeleted(row as LocalAware))
  return appended.length ? [...merged, ...appended] : merged
}
