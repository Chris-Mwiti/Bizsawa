export function shortId(id: string, len = 6): string {
  if (!id) return '—'
  // strip dashes and take first len chars, upper
  const compact = id.replace(/-/g, '')
  return compact.slice(0, len).toUpperCase()
}

export function shortInvoiceNumber(num: string): string {
  // keep as-is if already short human readable, else trim
  if (!num) return '—'
  return num.length > 12 ? shortId(num, 8) : num
}

export function formatOrderId(id: string): string {
  return `ORD-${shortId(id, 6)}`
}

export function formatProductId(id: string): string {
  return shortId(id, 6)
}
