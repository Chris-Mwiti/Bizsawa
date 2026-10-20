import '../polyfills'
import { Database } from '@nozbe/watermelondb'
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'
import { schema } from './schema'
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

import { migrations } from './migrations'
import { makeWritesDurable } from './durableWrites'

// Web/desktop build: Metro picks this file over database.ts. No native SQLite
// in the browser, so LokiJS persists to IndexedDB — same schema, models and
// sync protocol, so offline writes still push through sync/client.ts.
const adapter = new LokiJSAdapter({
  schema,
  migrations,
  useWebWorker: false,
  useIncrementalIndexedDB: true,
  dbName: 'bizsawa',
  onSetUpError: (error) =>
    console.error('[WatermelonDB] web setup failed', error),
})

export const database = makeWritesDurable(
  new Database({
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
  }),
)

// Helper for writers — all local writes MUST go through database.write per sketch §3
export async function localCreateProduct(businessId: string, data: any) {
  return Product.createRaw(database as any, businessId, data)
}
