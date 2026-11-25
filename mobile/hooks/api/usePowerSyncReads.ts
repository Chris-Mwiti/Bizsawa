import { usePowerSyncOrNull, useQuery, useStatusOrNull } from '@powersync/react'
import { isPowerSyncEnabledForPlatform } from '../../sync/powersync/config'

export function usePowerSyncEnabledQuery<T>(
  sql: string,
  parameters: any[],
) {
  const db = usePowerSyncOrNull()
  const status = useStatusOrNull()
  const query = useQuery<T>(sql, parameters)

  return {
    active: isPowerSyncEnabledForPlatform() && !!db,
    hasSynced: status?.hasSynced === true,
    isLoading: query.isLoading,
    error: query.error?.message || null,
    rows: query.data || [],
  }
}

export const SALES_SQL = `SELECT * FROM sales
  WHERE business_id = ? AND deleted_at IS NULL
  ORDER BY sold_at DESC`

export const ORDERS_SQL = `SELECT * FROM orders
  WHERE business_id = ? AND deleted_at IS NULL
  ORDER BY created_at DESC`

export const INVOICES_SQL = `SELECT * FROM invoices
  WHERE business_id = ? AND deleted_at IS NULL
  ORDER BY created_at DESC`

export const CUSTOMERS_SQL = `SELECT * FROM customers
  WHERE business_id = ? AND deleted_at IS NULL
  ORDER BY name COLLATE NOCASE`

export const EXPENSES_SQL = `SELECT * FROM expenses
  WHERE business_id = ? AND deleted_at IS NULL
  ORDER BY spent_at DESC`

export const INVENTORY_SQL = `SELECT * FROM inventory_items
  WHERE business_id = ? AND deleted_at IS NULL`

export const STOCK_MOVEMENTS_SQL = `SELECT * FROM stock_movements
  WHERE business_id = ? AND deleted_at IS NULL
  ORDER BY occurred_at DESC`
