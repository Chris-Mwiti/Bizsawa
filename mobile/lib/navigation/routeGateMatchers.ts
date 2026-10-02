/**
 * Pure href → gate resolution.
 *
 * Deliberately free of React and data hooks: this module holds the routing *rules*
 * (which paths block navigation, which never do, how ids are parsed) so they can be
 * unit tested without a renderer. `routeGates.tsx` binds these rules to prefetchers.
 */

/** Detail routes carry their record id in the path. */
const DETAIL_PATTERNS = {
  order: /^\/orders\/([^/?#]+)\/?$/,
  invoice: /^\/invoices\/([^/?#]+)\/?$/,
} as const

export type DetailKind = keyof typeof DETAIL_PATTERNS

export type GateMatch =
  | { kind: 'static'; path: string }
  | { kind: 'detail'; detail: DetailKind; id: string }

/**
 * Strip query, hash and trailing slashes so `/orders/abc?tab=1#top` and
 * `/orders/abc/` resolve identically. Non-strings and empties collapse to ''.
 */
export function normalizeHref(href: unknown): string {
  if (typeof href !== 'string') return ''
  return href.split('?')[0].split('#')[0].replace(/\/+$/, '')
}

/**
 * Resolve a normalized path to the gate it should use.
 *
 * `static` means an exact entry in the gate table; `detail` means a parameterized
 * record route. Anything else — auth flows, modals, sheets, unknown paths — returns
 * null so navigation is never held.
 */
export function matchGatePath(path: string): GateMatch | null {
  if (!path) return null
  // The tabs index is also reachable as '/'.
  const normalized = path === '/' ? '/(tabs)' : path
  for (const detail of Object.keys(DETAIL_PATTERNS) as DetailKind[]) {
    const match = DETAIL_PATTERNS[detail].exec(normalized)
    if (match) return { kind: 'detail', detail, id: match[1] }
  }
  return { kind: 'static', path: normalized }
}

/** Pull the record id out of a detail href, or null when it isn't a detail route. */
export function extractRouteId(href: string): string | null {
  const match = matchGatePath(normalizeHref(href))
  return match?.kind === 'detail' ? match.id : null
}
