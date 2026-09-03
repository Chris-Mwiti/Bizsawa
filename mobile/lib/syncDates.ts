// Shared date handling for offline sync — backend now sends Unix ms (pullTable converts time.Time → UnixMilli)
// Watermelon stores dates as number (ms) via @field, but old local data may be seconds, and backend may send ISO strings in fallback.
// This helper prevents "date value out of bounds" on reload by normalizing all inputs to ISO string safely.

export function toISO(v: any): string {
  if (v == null || v === '' || v === 0 || v === '0')
    return new Date().toISOString()
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (
      trimmed === '' ||
      trimmed === '0' ||
      trimmed.toLowerCase() === 'nan' ||
      trimmed.toLowerCase() === 'local'
    )
      return new Date().toISOString()
    // Try ISO first
    const d = new Date(trimmed)
    if (
      !isNaN(d.getTime()) &&
      d.getFullYear() > 1970 &&
      d.getFullYear() < 275760
    )
      return d.toISOString()
    // Try numeric string
    const n = Number(trimmed)
    if (!isNaN(n) && n !== 0) return toISO(n)
    if (n === 0) return new Date().toISOString()
    return new Date().toISOString()
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v === 0) return new Date().toISOString()
    // Distinguish seconds vs ms: ms > 1e12, seconds ~1e9-1e10
    let ms = v
    if (v < 1e12) ms = v * 1000 // seconds → ms
    // Guard bounds: JS max 8.64e15, min -8.64e15, and Watermelon out-of-bounds check
    if (
      ms === 0 ||
      ms > 8640000000000000 ||
      ms < -8640000000000000 ||
      isNaN(ms)
    )
      return new Date().toISOString()
    const d = new Date(ms)
    if (isNaN(d.getTime()) || d.getFullYear() <= 1970)
      return new Date().toISOString()
    return d.toISOString()
  }
  if (v instanceof Date) {
    if (!isNaN(v.getTime())) return v.toISOString()
    return new Date().toISOString()
  }
  // Fallback for objects (Watermelon raw may have Date)
  try {
    const d = new Date(v as any)
    if (!isNaN(d.getTime())) return d.toISOString()
  } catch {}
  return new Date().toISOString()
}

export function toMillis(v: any): number {
  if (v == null || v === '' || v === 0 || v === '0') return Date.now()
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (
      trimmed === '' ||
      trimmed === '0' ||
      trimmed.toLowerCase() === 'nan' ||
      trimmed.toLowerCase() === 'local'
    )
      return Date.now()
    const d = new Date(trimmed)
    if (!isNaN(d.getTime()) && d.getFullYear() > 1970) return d.getTime()
    const n = Number(trimmed)
    if (!isNaN(n) && n !== 0) return toMillis(n)
    return Date.now()
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v === 0) return Date.now()
    if (v > 1e12) return v // already ms
    if (v > 1e10) return v // assume ms borderline? treat as ms if >1e10? Actually seconds*1000 = 1.7e12, so >1e12 is ms
    return v * 1000 // seconds → ms
  }
  if (v instanceof Date) return v.getTime()
  return Date.now()
}

// For Watermelon local writes: always store ms
export function nowMillis(): number {
  return Date.now()
}

export function parseMillisOrNow(v: any): number {
  const ms = toMillis(v)
  if (isNaN(ms) || ms > 8640000000000000 || ms < -8640000000000000)
    return Date.now()
  return ms
}
