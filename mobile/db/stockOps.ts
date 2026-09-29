import { Q } from '@nozbe/watermelondb'
import { randomUUID } from 'expo-crypto'
import { database } from './database'
import { toDecimalString, toNumber } from '../lib/api-dtos'
import { nowMillis } from '../lib/syncDates'

export interface LocalLedgerLine {
  productId: string
  quantity: string | number
}

export interface LocalLedgerRequest {
  businessId: string
  refType: 'sale' | 'order'
  refId: string
  side: 'out' | 'in'
  movementType: string
  notes: string
  lines: LocalLedgerLine[]
}

function signOf(delta: string): number {
  const n = toNumber(delta)
  if (n < 0) return -1
  if (n > 0) return 1
  return 0
}

// Local mirror of the backend's ledger-guarded inventory adjustments. Rules match
// inventory.ApplyLedger on the server:
//   - side 'out': only applies if this reference has not already deducted stock.
//   - side 'in': only applies if this reference previously deducted AND has not
//     already restored (prevents phantom restores of draft orders / voiding never).
// Only products with a tracked inventory_items row are adjusted (untracked stock is
// left alone, matching the backend). The inventory_items row is marked synced so the
// server's canonical quantity wins on pull (no sync-version conflict), while the
// stock_movements ledger row IS pushed so the server ledger dedupes.
export async function applyLocalStockLedgerBatch(req: LocalLedgerRequest): Promise<void> {
  if (!req.businessId || !req.refId || !req.lines.length) return

  const movCol: any = (database as any).get('stock_movements')
  const itemCol: any = (database as any).get('inventory_items')

  // Read current ledger state for this reference — outside the write.
  let refs: any[] = []
  try {
    refs = (await movCol
      .query(
        Q.where('business_id', req.businessId),
        Q.where('reference_type', req.refType),
        Q.where('reference_id', req.refId),
      )
      .fetch()) as any[]
  } catch {
    return
  }
  let hadOut = false
  let hadIn = false
  for (const m of refs) {
    const s = signOf(String(m.quantityDelta ?? m._raw?.quantity_delta ?? '0'))
    if (s < 0) hadOut = true
    if (s > 0) hadIn = true
  }

  if (req.side === 'out') {
    if (hadOut) return
  } else {
    if (!hadOut || hadIn) return
  }

  const now = nowMillis()

  await (database as any).write(async () => {
    let items: any[] = []
    try {
      items = (await itemCol
        .query(Q.where('business_id', req.businessId))
        .fetch()) as any[]
    } catch {
      items = []
    }
    const byProduct = new Map<string, any>()
    for (const it of items) {
      const pid = it.productId ?? it._raw?.product_id
      const del = it.deletedAt ?? it._raw?.deleted_at
      if (!pid) continue
      if (del && del !== 0) continue
      byProduct.set(String(pid), it)
    }

    for (const line of req.lines) {
      const item = byProduct.get(String(line.productId))
      const qty = toNumber(line.quantity)
      if (!item || qty <= 0) continue

      const current = toNumber(item.quantity ?? item._raw?.quantity ?? '0')
      const next = Math.max(req.side === 'out' ? current - qty : current + qty, 0)
      const nextStr = toDecimalString(next)

      await item.update((r: any) => {
        r.quantity = nextStr
        r._raw._status = 'synced'
        r._raw._changed = ''
      })

      await movCol.create((rec: any) => {
        rec._raw.id = randomUUID()
        rec.businessId = req.businessId
        rec.productId = String(line.productId)
        rec.quantityDelta = toDecimalString(req.side === 'out' ? -qty : qty)
        rec.movementType = req.movementType
        rec.referenceType = req.refType
        rec.referenceId = req.refId
        rec.notes = req.notes
        rec.occurredAt = now
        rec.syncVersion = 1
      })
    }
  })
}