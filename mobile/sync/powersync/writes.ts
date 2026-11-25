import type { CommonPowerSyncDatabase } from '@powersync/common'
import { randomUUID } from 'expo-crypto'

type SqlWrite = {
  execute: (query: string, params?: any[]) => Promise<any>
  getAll: (sql: string, params?: any[]) => Promise<any[]>
  get: <T = any>(sql: string, params?: any[]) => Promise<T>
}

function normalizeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue
    if (typeof v === 'boolean') out[k] = v ? 1 : 0
    else if (v instanceof Date) out[k] = v.toISOString()
    else out[k] = v
  }
  return out
}

/** Insert a synced row. Client-generated UUID, tenant/business scoping and
 *  sync_version=1 are set automatically. */
export async function psInsert(
  exec: SqlWrite,
  table: string,
  row: Record<string, any>
) {
  const now = new Date().toISOString()
  const record = normalizeRow({
    ...row,
    id: row.id ?? randomUUID(),
    business_id: row.business_id,
    tenant_id: row.tenant_id ?? row.business_id,
    sync_version: 1,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  })
  const cols = Object.keys(record)
  await exec.execute(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    Object.values(record)
  )
}

/** Update a synced row by id. Never bumps sync_version locally — the server
 *  owns it; same-device last-write-wins applies on upload. */
export async function psUpdate(
  exec: SqlWrite,
  table: string,
  id: string,
  patch: Record<string, any>
) {
  const record = normalizeRow({ ...patch, updated_at: new Date().toISOString() })
  const cols = Object.keys(record)
  if (cols.length === 0) return
  const sets = cols.map((c) => `${c} = ?`).join(', ')
  await exec.execute(
    `UPDATE ${table} SET ${sets} WHERE id = ?`,
    [...Object.values(record), id]
  )
}

/** Hard-delete a synced row. The server soft-deletes (deleted_at) and runs
 *  delete side effects (stock restore, voided sales, …). */
export async function psDelete(exec: SqlWrite, table: string, id: string) {
  await exec.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
}

/** Run multiple PowerSync writes in one local transaction. All operations
 *  land in a single CRUD transaction, so they upload atomically to
 *  POST /api/v1/sync/push in FK-safe table order. */
export async function psWriteTransaction<T>(
  db: CommonPowerSyncDatabase,
  fn: (exec: SqlWrite) => Promise<T>
): Promise<T> {
  return db.writeTransaction(async (tx) => {
    return fn(tx)
  })
}
