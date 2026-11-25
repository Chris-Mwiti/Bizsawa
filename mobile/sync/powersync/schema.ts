import { column, Schema, Table } from '@powersync/common'

export const products = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    name: column.text,
    description: column.text,
    sku: column.text,
    category: column.text,
    barcode: column.text,
    image_url: column.text,
    tax_rule_id: column.text,
    price: column.text,
    cost: column.text,
    is_active: column.integer,
    supplier: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
  },
  { indexes: { products_business: ['business_id'] } },
)

export const productVariants = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    product_id: column.text,
    name: column.text,
    sku: column.text,
    barcode: column.text,
    price: column.text,
    cost: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
  },
  { indexes: { product_variants_business: ['business_id'], product_variants_product: ['product_id'] } },
)

export const customers = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    name: column.text,
    phone: column.text,
    email: column.text,
    address: column.text,
    tags: column.text,
    notes: column.text,
    loyalty_points: column.integer,
    total_spend: column.text,
    last_purchase_at: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
  },
  { indexes: { customers_business: ['business_id'] } },
)

export const inventoryItems = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    product_id: column.text,
    quantity: column.text,
    low_stock_threshold: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
  },
  { indexes: { inventory_items_business: ['business_id'], inventory_items_product: ['product_id'] } },
)

export const stockMovements = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    product_id: column.text,
    quantity_delta: column.text,
    movement_type: column.text,
    reference_type: column.text,
    reference_id: column.text,
    notes: column.text,
    occurred_at: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
  },
  { indexes: { stock_movements_business: ['business_id'], stock_movements_product: ['product_id'] } },
)

export const orders = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    customer_id: column.text,
    status: column.text,
    subtotal: column.text,
    tax_amount: column.text,
    total: column.text,
    payment_method: column.text,
    idempotency_key: column.text,
    confirmed_at: column.text,
    fulfilled_at: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    payment_status: column.text,
    sync_version: column.integer,
  },
  { indexes: { orders_business: ['business_id'] } },
)

export const orderLines = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    order_id: column.text,
    product_id: column.text,
    quantity: column.text,
    unit_price: column.text,
    line_total: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
    product_variant_id: column.text,
  },
  { indexes: { order_lines_business: ['business_id'], order_lines_order: ['order_id'] } },
)

export const sales = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    order_id: column.text,
    customer_id: column.text,
    receipt_number: column.text,
    staff_id: column.text,
    payment_method: column.text,
    subtotal: column.text,
    tax_amount: column.text,
    total: column.text,
    status: column.text,
    idempotency_key: column.text,
    sold_at: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
  },
  { indexes: { sales_business: ['business_id'] } },
)

export const saleLines = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    sale_id: column.text,
    product_id: column.text,
    quantity: column.text,
    unit_price: column.text,
    line_total: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
    product_variant_id: column.text,
  },
  { indexes: { sale_lines_business: ['business_id'], sale_lines_sale: ['sale_id'] } },
)

export const expenses = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    category: column.text,
    description: column.text,
    vendor: column.text,
    amount: column.text,
    tax_amount: column.text,
    is_recurring: column.integer,
    recurring_interval: column.text,
    spent_at: column.text,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
  },
  { indexes: { expenses_business: ['business_id'] } },
)

export const invoices = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    customer_id: column.text,
    invoice_number: column.text,
    status: column.text,
    subtotal: column.text,
    tax_amount: column.text,
    total: column.text,
    amount_paid: column.text,
    amount_due: column.text,
    currency: column.text,
    notes: column.text,
    due_at: column.text,
    sent_at: column.text,
    viewed_at: column.text,
    paid_at: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    order_id: column.text,
    sync_version: column.integer,
  },
  { indexes: { invoices_business: ['business_id'] } },
)

export const invoiceLines = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    invoice_id: column.text,
    product_id: column.text,
    description: column.text,
    quantity: column.text,
    unit_price: column.text,
    line_total: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
  },
  { indexes: { invoice_lines_business: ['business_id'], invoice_lines_invoice: ['invoice_id'] } },
)

export const paymentCommands = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    type: column.text,
    status: column.text,
    idempotency_key: column.text,
    amount: column.text,
    currency: column.text,
    phone: column.text,
    account_reference: column.text,
    provider: column.text,
    provider_request_id: column.text,
    provider_receipt: column.text,
    failure_code: column.text,
    failure_message: column.text,
    payload: column.text,
    result_payload: column.text,
    processed_at: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    order_id: column.text,
    sync_version: column.integer,
  },
  { indexes: { payment_commands_business: ['business_id'] } },
)

export const taxRules = new Table(
  {
    tenant_id: column.text,
    business_id: column.text,
    name: column.text,
    rate: column.text,
    country: column.text,
    is_default: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text,
    sync_version: column.integer,
  },
  { indexes: { tax_rules_business: ['business_id'] } },
)

// Local-only table — not part of the sync protocol. Chat transcripts stay on
// the device and are scoped by business.
export const assistantThreads = new Table(
  {
    id: column.text,
    business_id: column.text,
    thread_id: column.text,
    state: column.text,
    updated_at_ms: column.integer,
  },
  {
    indexes: {
      assistant_threads_business: ['business_id'],
      assistant_threads_thread: ['thread_id'],
    },
    localOnly: true,
  },
)

export const AppSchema = new Schema({
  products,
  product_variants: productVariants,
  customers,
  inventory_items: inventoryItems,
  stock_movements: stockMovements,
  orders,
  order_lines: orderLines,
  sales,
  sale_lines: saleLines,
  expenses,
  invoices,
  invoice_lines: invoiceLines,
  payment_commands: paymentCommands,
  tax_rules: taxRules,
  assistant_threads: assistantThreads,
})

export type Database = (typeof AppSchema)['types']
export type ProductRecord = Database['products']
export type ProductVariantRecord = Database['product_variants']
export type InventoryItemRecord = Database['inventory_items']
