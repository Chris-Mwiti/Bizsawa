import { toNumber } from './api-dtos'

export interface InvoicePdfData {
  invoiceNumber: string
  status: string
  subtotal: string | number
  taxAmount: string | number
  total: string | number
  amountPaid: string | number
  amountDue: string | number
  currency: string
  dueAt: string
  createdAt: string
  notes?: string
  customerName?: string
  customerPhone?: string
  lines: Array<{
    description: string
    productName?: string
    quantity: string | number
    unitPrice: string | number
    lineTotal: string | number
  }>
  business: {
    name: string
    phone?: string
    email?: string
    address?: string
    taxPin?: string
  }
}

function esc(s: string) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

export function buildInvoiceHtml(data: InvoicePdfData): string {
  const fmt = (v: string | number) => `${data.currency || 'KES'} ${toNumber(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDate = (iso: string) => {
    try { const d=new Date(iso); return d.toLocaleDateString('en-KE', { day:'2-digit', month:'short', year:'numeric' }) } catch { return iso }
  }
  const shop = esc(data.business?.name || 'Business Shop')
  const rows = data.lines.map(l => {
    const name = esc(l.productName || l.description || 'Item')
    const qty = esc(String(l.quantity))
    const unit = fmt(l.unitPrice)
    const total = fmt(l.lineTotal || (toNumber(l.quantity)*toNumber(l.unitPrice)).toString())
    return `<tr><td style="padding:10px 8px;border-bottom:1px solid #eee;">${name}</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">${qty}</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">${unit}</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${total}</td></tr>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111827;margin:0;padding:24px;background:#fff}
  .header{border-bottom:3px solid #111827;padding-bottom:16px;margin-bottom:18px}
  .shop{font-size:22px;font-weight:900;letter-spacing:-0.02em}
  .meta{color:#6b7280;font-size:12px;margin-top:4px}
  .badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#f3f4f6;font-size:11px;font-weight:700;letter-spacing:0.08em}
  .grid{display:flex;gap:16px;margin:16px 0}
  .card{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:14px}
  .label{font-size:10px;letter-spacing:0.12em;color:#9ca3af;font-weight:700;text-transform:uppercase}
  .val{font-size:18px;font-weight:800;margin-top:4px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{font-size:11px;letter-spacing:0.08em;color:#6b7280;text-transform:uppercase;text-align:left;padding:10px 8px;border-bottom:2px solid #111827}
  .totalBox{background:#111827;color:#fff;border-radius:12px;padding:16px;margin-top:16px;display:flex;justify-content:space-between;align-items:center}
  .foot{margin-top:20px;color:#6b7280;font-size:11px;text-align:center;border-top:1px solid #eee;padding-top:12px}
  </style></head><body>
  <div class="header">
    <div class="shop">${shop}</div>
    <div class="meta">${esc(data.business.address||'')}${data.business.phone? ' • '+esc(data.business.phone):''}${data.business.email? ' • '+esc(data.business.email):''}</div>
    ${data.business.taxPin? `<div class="meta">KRA PIN: ${esc(data.business.taxPin)}</div>`:''}
    <div style="margin-top:10px"><span class="badge">${esc(data.status).toUpperCase()}</span> <span style="margin-left:8px;color:#6b7280;font-size:12px">${esc(data.invoiceNumber)} • ${fmtDate(data.createdAt)} • Due ${fmtDate(data.dueAt)}</span></div>
  </div>

  <div class="grid">
    <div class="card"><div class="label">Bill To</div><div style="font-weight:700;margin-top:6px">${esc(data.customerName||'Customer')}</div><div class="meta">${esc(data.customerPhone||'')}</div></div>
    <div class="card"><div class="label">Amount Due</div><div class="val">${fmt(data.amountDue)}</div><div class="meta">of ${fmt(data.total)} • Paid ${fmt(data.amountPaid)}</div></div>
  </div>

  <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>

  <div class="totalBox">
    <div><div style="opacity:0.7;font-size:11px;letter-spacing:0.12em">TOTAL</div><div style="font-size:20px;font-weight:900">${fmt(data.total)}</div><div style="opacity:0.7;font-size:11px">Subtotal ${fmt(data.subtotal)} • VAT 16% ${fmt(data.taxAmount)}</div></div>
    <div style="text-align:right"><div style="font-size:11px;opacity:0.7">PAID</div><div style="font-size:16px;font-weight:800;color:#34d399">${fmt(data.amountPaid)}</div><div style="font-size:11px;opacity:0.7">Due ${fmt(data.amountDue)}</div></div>
  </div>

  ${data.notes? `<div style="margin-top:16px;background:#f9fafb;border:1px solid #eee;border-radius:12px;padding:12px"><div class="label">Notes</div><div style="margin-top:6px;font-size:13px;line-height:1.5">${esc(data.notes)}</div></div>`:''}

  <div class="foot">Generated by BizSawa • ${shop} • Thank you for your business</div>
  </body></html>`
}

export function invoiceShareText(data: InvoicePdfData): string {
  const fmt = (v:any)=> `${data.currency||'KES'} ${toNumber(v).toLocaleString('en-KE')}`
  return `*${data.business?.name || 'Business Shop'}* — Invoice ${data.invoiceNumber}\nStatus: ${data.status}\nTotal: ${fmt(data.total)} | Due: ${fmt(data.amountDue)}\nCustomer: ${data.customerName||'Customer'}${data.customerPhone? ' ('+data.customerPhone+')':''}\n\nView & pay: ${data.invoiceNumber}`
}
