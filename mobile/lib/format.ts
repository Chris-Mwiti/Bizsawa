/**
 * Compact money for tight card grids: `KES 1.2M`, `KES 450K`, `KES 980`.
 *
 * Full `toLocaleString` figures ("KES 1,234,567") exceed a half-width card at
 * any readable size — the value either truncates mid-digit or shrinks to
 * nothing. Compact keeps the magnitude readable; pair it with
 * `adjustsFontSizeToFit` + `numberOfLines={1}` so mid-size values still fit,
 * and keep the exact figure for detail screens and ledgers.
 */
export function formatCompactCurrency(amount: number): string {
  const a = Number(amount) || 0
  const abs = Math.abs(a)
  // One decimal only when it carries information: 1.2M, 12.5K — never 25.0M.
  const trim = (v: number) => String(v >= 100 ? Math.round(v) : Math.round(v * 10) / 10)
  if (abs >= 1_000_000) return `KES ${trim(a / 1_000_000)}M`
  if (abs >= 10_000) return `KES ${trim(a / 1_000)}K`
  return `KES ${a.toLocaleString('en-KE')}`
}
