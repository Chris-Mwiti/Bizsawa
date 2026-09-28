/**
 * WatermelonDB's `experimentalRejectedIds` is `{ [tableName]: RecordId[] }`
 * (see @nozbe/watermelondb/sync `SyncRejectedIds`). The backend `/sync/push`
 * response reports the same shape under `rejected`.
 *
 * Returning this from `pushChanges` is what keeps failed records pending for retry.
 * Without it, `synchronize()` assumes every pushed record was accepted and marks
 * them all synced — silently dropping the ones the server refused.
 */
export type RejectedIdsByTable = Record<string, string[]>

/**
 * Extracts per-table rejected record ids from a `/sync/push` response.
 *
 * Tolerates the response being a raw body, an axios response, or a single/double
 * `{ data: ... }` envelope, because the API layer is inconsistent about wrapping.
 * Returns `undefined` when nothing was rejected so the caller can hand
 * WatermelonDB an explicit absence rather than an empty map.
 */
export function extractRejectedIds(response: unknown): RejectedIdsByTable | undefined {
  const body = unwrapBody(response)
  if (!body || typeof body !== 'object') return undefined

  const rejected = (body as { rejected?: unknown }).rejected
  if (!rejected || typeof rejected !== 'object' || Array.isArray(rejected)) return undefined

  const out: RejectedIdsByTable = {}
  for (const [table, ids] of Object.entries(rejected as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue
    const cleaned = ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (cleaned.length) out[table] = cleaned
  }

  return Object.keys(out).length ? out : undefined
}

function unwrapBody(response: unknown): unknown {
  let current = response
  // Bounded so a self-referential object cannot spin here.
  for (let i = 0; i < 3; i++) {
    if (!current || typeof current !== 'object') return current
    const next = (current as { data?: unknown }).data
    if (next === undefined || next === null) return current
    current = next
  }
  return current
}
