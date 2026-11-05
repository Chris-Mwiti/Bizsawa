export type AssistantLocale = 'en' | 'sw'

export interface PeriodArgs {
  from?: string
  to?: string
}

export interface LimitArgs {
  limit?: number
}

export interface PageArgs extends LimitArgs {
  offset?: number
}

export interface SearchArgs extends LimitArgs {
  query?: string
}

export interface SalesSummary {
  count: number
  subtotal: string
  tax_amount: string
  total: string
  currency: 'KES'
  from: string
  to: string
}

export interface ProductSaleRow {
  key: string
  total: string
  count: number
  currency: 'KES'
}

export interface ProductSalesOutput {
  results: ProductSaleRow[]
}

export interface LowStockRow {
  product_id: string
  quantity: string
  low_stock_threshold: string
}

export interface LowStockOutput {
  results: LowStockRow[]
}

export interface InventoryValuationRow {
  product_id: string
  quantity: string
}

export interface InventoryValuationOutput {
  results: InventoryValuationRow[]
}

export type ExpenseCategory = string

export interface ExpenseCategoryRow {
  category: ExpenseCategory
  amount: string
  tax_amount: string
  count: number
  currency: 'KES'
}

export interface ExpenseSummaryOutput {
  results: ExpenseCategoryRow[]
  from: string
  to: string
}

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'cancelled'

export interface InvoiceRow {
  invoice_id: string
  invoice_number: string
  status: InvoiceStatus
  total: string
  amount_paid: string
  amount_due: string
  currency: string
  due_at: string | null
  sent_at: string | null
  paid_at: string | null
  customer_id?: string
  order_id?: string
}

export interface InvoiceListOutput {
  results: InvoiceRow[]
}

export interface CustomerCandidate {
  customer_id: string
  name: string
  phone_last4: string
  email_domain: string
  loyalty_points: number
}

export interface CustomerSearchOutput {
  results: CustomerCandidate[]
}

export interface ToolOutputMap {
  summarize_sales: SalesSummary
  list_sales_by_product: ProductSalesOutput
  list_low_stock_items: LowStockOutput
  get_inventory_valuation: InventoryValuationOutput
  summarize_expenses_by_category: ExpenseSummaryOutput
  list_invoices: InvoiceListOutput
  search_customers: CustomerSearchOutput
}

export type AssistantToolName = keyof ToolOutputMap

export type AssistantToolCall = {
  [Name in AssistantToolName]: {
    name: Name
    arguments: Record<string, unknown>
    output: ToolOutputMap[Name]
  }
}[AssistantToolName]

export interface AssistantMetricCard {
  kind: 'metric'
  label: string
  value: string
  hint?: string
}

export interface AssistantListItem {
  label: string
  value?: string
  meta?: string
}

export interface AssistantListCard {
  kind: 'list'
  title: string
  items: AssistantListItem[]
}

export type AssistantCard = AssistantMetricCard | AssistantListCard

export interface AssistantChart {
  kind: 'bar'
  title: string
  series: Array<{ label: string; value: number }>
}

export interface AssistantAnswer {
  text: string
  cards: AssistantCard[]
  chart?: AssistantChart
  tool?: AssistantToolCall
  locale: AssistantLocale
}

export interface AssistantStore {
  summarizeSales(args: PeriodArgs): Promise<SalesSummary>
  listSalesByProduct(args: LimitArgs): Promise<ProductSalesOutput>
  listLowStockItems(args: LimitArgs): Promise<LowStockOutput>
  getInventoryValuation(args: LimitArgs): Promise<InventoryValuationOutput>
  summarizeExpensesByCategory(args: PeriodArgs): Promise<ExpenseSummaryOutput>
  listInvoices(args: PageArgs): Promise<InvoiceListOutput>
  searchCustomers(args: SearchArgs): Promise<CustomerSearchOutput>
  productNames(ids: string[]): Promise<Record<string, string>>
}
