/**
 * Single source of truth for the shared analytics snapshot query key.
 *
 * Every analytics projection (summary, revenue, profit, categories, customers) must
 * resolve to the SAME key for a given timeframe + business. That identity is what makes
 * TanStack collapse the projections into a single GET /analytics — different keys would
 * mean one request per projection, which is the fan-out this replaces.
 *
 * Kept dependency-free so it can be unit tested without pulling in React Native.
 */
export function analyticsSnapshotKey(
  timeframe: string,
  activeBusinessId: string | null,
): readonly ['analytics', 'snapshot', string, string | null] {
  return ['analytics', 'snapshot', timeframe, activeBusinessId] as const
}
