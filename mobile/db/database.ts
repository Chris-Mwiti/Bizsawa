import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { schema } from './schema'
import Product from './models/Product'
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

// SQLiteAdapter with JSI enabled (required for Turbo Login §11, and sync perf)
// Uses expo-sqlite under the hood when running in Expo Go / dev-client
const adapter = new SQLiteAdapter({
  schema,
  // Enable JSI for sync perf — fallback to async if JSI unavailable (web/debug)
  jsi: true,
  onSetUpError: (error) => console.error('[WatermelonDB] setup failed', error),
  // Optional migration placeholder — bump schema version + add migrations.ts when adding columns
})

export const database = new Database({
  adapter,
  modelClasses: [
    Product as any,
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
