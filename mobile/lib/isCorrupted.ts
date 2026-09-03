export function isCorruptedNumeric(v: any): boolean {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "nan" || s === "local" || s === "undefined" || s === "null" || s === "";
}

export function isCorruptedDate(v: any): boolean {
  if (v == null || v === "" || v === 0 || v === "0") return true;
  const s = String(v);
  if (s === "0" || s.toLowerCase() === "nan" || s.toLowerCase() === "local") return true;
  const d = new Date(v as any);
  if (isNaN(d.getTime())) return true;
  // 1970 epoch is corruption signal
  if (d.getFullYear() <= 1970) return true;
  return false;
}

export function hasCorruptedNumeric(records: any[], fields: string[]): boolean {
  for (const r of records) {
    const raw = r._raw ? r._raw : r;
    for (const f of fields) {
      const v = raw[f] ?? raw[f.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())];
      if (isCorruptedNumeric(v)) return true;
    }
  }
  return false;
}
