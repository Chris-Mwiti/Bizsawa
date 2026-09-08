import '../polyfills'
import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { schema } from './schema'
import { tableSchema } from '@nozbe/watermelondb'
import Product from './models/Product'
import ProductVariant from './models/ProductVariant'
import Customer from './models/Customer'
import Expense from './models/Expense'
import Sale from './models/Sale'
import SaleLine from './models/SaleLine'
import Order from './models/Order'
import OrderLine from './models/OrderLine'
import Invoice from './models/Invoice'
import InvoiceLine from './models/InvoiceLine'
import InventoryItem from './models/InventoryItem'
import StockMovement from './models/StockMovement'
import Payment from './models/Payment'
import Conflict from './models/Conflict'

// SQLiteAdapter via @morrowdigital/watermelondb-expo-plugin (disableJsi:false) → JSI in dev-client
// Expo Go has no native module — must use dev-client build (see guide below)
import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations'

const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        {
          type: 'add_columns',
          table: 'sale_lines',
          columns: [
            {
              name: 'product_variant_id',
              type: 'string',
              isOptional: true,
            },
          ],
        },
        {
          type: 'add_columns',
          table: 'order_lines',
          columns: [
            {
              name: 'product_variant_id',
              type: 'string',
              isOptional: true,
            },
          ],
        },
      ],
    },
    {
      toVersion: 3,
      steps: [
        {
          type: 'add_columns',
          table: 'payments',
          columns: [{ name: 'type', type: 'string', isOptional: true }],
        },
      ],
    },
    {
      toVersion: 4,
      steps: [
        {
          type: 'create_table',
          schema: tableSchema({
            name: 'payment_commands',
            columns: [
              { name: 'business_id', type: 'string', isIndexed: true },
              { name: 'order_id', type: 'string', isIndexed: true },
              { name: 'amount', type: 'string' },
              { name: 'currency', type: 'string' },
              { name: 'phone', type: 'string', isOptional: true },
              { name: 'status', type: 'string' },
              { name: 'provider', type: 'string' },
              { name: 'type', type: 'string' },
              { name: 'idempotency_key', type: 'string', isOptional: true },
              { name: 'sync_version', type: 'number' },
              { name: 'deleted_at', type: 'number', isOptional: true },
            ],
          }),
        },
      ],
    },
  ],
})

let adapter: any
try {
  adapter = new SQLiteAdapter({
    schema,
    migrations,
    jsi: true, // now linked via plugin — 3x faster, Turbo Login §11
    onSetUpError: (error) =>
      console.error('[WatermelonDB] setup failed', error),
  })
} catch (e: any) {
  console.warn(
    '[WatermelonDB] JSI init failed, falling back to async',
    e?.message,
  )
  adapter = new SQLiteAdapter({
    schema,
    migrations,
    jsi: false,
    onSetUpError: (error) =>
      console.error('[WatermelonDB] fallback setup failed', error),
  })
}

export const database = new Database({
  adapter,
  modelClasses: [
    Product as any,
    ProductVariant as any,
    Customer as any,
    Expense as any,
    Sale as any,
    SaleLine as any,
    Order as any,
    OrderLine as any,
    Invoice as any,
    InvoiceLine as any,
    InventoryItem as any,
    StockMovement as any,
    Payment as any,
    Conflict as any,
  ],
})

// Helper for writers — all local writes MUST go through database.write per sketch §3
export async function localCreateProduct(businessId: string, data: any) {
  return Product.createRaw(database as any, businessId, data)
}
