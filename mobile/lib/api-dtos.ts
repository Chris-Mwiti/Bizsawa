export type UUID = string
export type DecimalString = string
export type ISODateTime = string

export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'VIEWER'

export interface AuthResponse {
  userId: UUID
  accessToken: string
  refreshToken: string
}

export interface RegisterRequest {
  email: string
  password: string
}

export interface LoginRequest extends RegisterRequest {
  businessId?: UUID | null
}

export interface RefreshRequest {
  refreshToken: string
}

export interface UserProfile {
  id: UUID
  tenantId: UUID
  userId: UUID
  firstName?: string
  lastName?: string
  phone?: string
  avatarUrl?: string
  timezone: string
  language: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface CreateProfileRequest {
  firstName?: string
  lastName?: string
  phone?: string
  avatarUrl?: string
  timezone?: string
  language?: string
}

export interface Business {
  id: UUID
  tenantId: UUID
  ownerId: UUID
  name: string
  slug: string
  currency: string
  timezone: string
  taxPin?: string
  phone?: string
  email?: string
  address?: string
  mpesaPaymentType?: 'paybill' | 'pochi_biashara' | 'buy_goods'
  mpesaShortcodeConfigured: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface CreateBusinessRequest {
  name: string
  slug?: string
  currency?: string
  timezone?: string
  taxPin?: string
  mpesaPaymentType?: 'paybill' | 'pochi_biashara' | 'buy_goods'
  mpesaShortcode?: string
  phone?: string
  email?: string
  address?: string
}

export interface BusinessMember {
  id: UUID
  tenantId: UUID
  businessId: UUID
  userId: UUID
  role: Role
  isActive: boolean
  invitedBy?: UUID
  invitedAt: ISODateTime
  joinedAt?: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface ProductVariant {
  id: UUID
  productId: UUID
  name: string
  sku?: string
  barcode?: string
  price: DecimalString
  cost: DecimalString
  isActive: boolean
}

export interface Product {
  id: UUID
  tenantId: UUID
  businessId: UUID
  name: string
  description?: string
  sku?: string
  category?: string
  barcode?: string
  imageUrl?: string
  taxRuleId?: UUID | null
  price: DecimalString
  cost: DecimalString
  isActive: boolean
  variants?: ProductVariant[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface ProductRequest {
  name: string
  description?: string
  sku?: string
  category?: string
  barcode?: string
  imageUrl?: string
  taxRuleId?: UUID | null
  price: DecimalString
  cost: DecimalString
  isActive?: boolean
}

export interface Customer {
  id: UUID
  tenantId: UUID
  businessId: UUID
  name: string
  phone?: string
  email?: string
  address?: string
  tags?: string[]
  notes?: string
  loyaltyPoints: number
  totalSpend: DecimalString
  lastPurchaseAt?: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface CustomerRequest {
  name: string
  phone?: string
  email?: string
  address?: string
  tags?: string[]
  notes?: string
}

export interface LineRequest {
  productId: UUID
  quantity: DecimalString
  unitPrice: DecimalString
}

export interface Order {
  id: UUID
  businessId: UUID
  customerId?: UUID | null
  status: 'draft' | 'confirmed' | 'fulfilled' | 'cancelled' | 'refunded'
  subtotal: DecimalString
  taxAmount: DecimalString
  total: DecimalString
  paymentMethod: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  lines?: Array<LineRequest & { id: UUID; lineTotal: DecimalString }>
}

export interface CreateOrderRequest {
  customerId?: UUID | null
  paymentMethod?: string
  lines: LineRequest[]
}

export interface Sale {
  id: UUID
  businessId: UUID
  orderId?: UUID | null
  customerId?: UUID | null
  receiptNumber: string
  staffId: UUID
  paymentMethod: string
  subtotal: DecimalString
  taxAmount: DecimalString
  total: DecimalString
  status: string
  soldAt: ISODateTime
  createdAt: ISODateTime
  updatedAt: ISODateTime
  lines?: Array<LineRequest & { id: UUID; lineTotal: DecimalString }>
}

export interface CreateSaleRequest {
  orderId?: UUID | null
  customerId?: UUID | null
  paymentMethod?: string
  lines: LineRequest[]
}

export interface Expense {
  id: UUID
  businessId: UUID
  category: string
  description?: string
  vendor?: string
  amount: DecimalString
  taxAmount: DecimalString
  isRecurring: boolean
  recurringInterval?: string
  spentAt: ISODateTime
  createdBy?: UUID
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface ExpenseRequest {
  category: string
  description?: string
  vendor?: string
  amount: DecimalString
  taxAmount?: DecimalString
  isRecurring?: boolean
  recurringInterval?: string
  spentAt?: ISODateTime | null
}

export interface InventoryItem {
  id: UUID
  businessId: UUID
  productId: UUID
  quantity: DecimalString
  lowStockThreshold: DecimalString
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface AdjustmentRequest {
  productId: UUID
  quantityDelta: DecimalString
  lowStockThreshold?: DecimalString
  notes?: string
}

export interface SalesSummary {
  count: number
  subtotal: DecimalString
  taxAmount: DecimalString
  total: DecimalString
}

export interface Breakdown {
  key: string
  total: DecimalString
  count: number
}

export interface CategorySummary {
  category: string
  amount: DecimalString
  taxAmount: DecimalString
  count: number
}

export interface PaymentCommand {
  id: UUID
  businessId: UUID
  invoiceId?: UUID | null
  type: 'stk_push' | 'b2c' | 'c2b'
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  amount: DecimalString
  currency: string
  phone?: string
  accountReference?: string
  provider: string
  failureMessage?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  processedAt?: ISODateTime | null
}

export interface InitiatePaymentRequest {
  type?: 'stk_push' | 'b2c' | 'c2b'
  orderID?: UUID | null
  invoiceId?: UUID | null
  amount: DecimalString
  currency?: string
  phone?: string
  accountReference?: string
  payload?: Record<string, unknown>
}

export function toDecimalString(
  value: number | string | null | undefined,
  fallback = '0',
): DecimalString {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : fallback
  const str = String(value).trim()
  if (
    str === '' ||
    str.toLowerCase() === 'nan' ||
    str.toLowerCase() === 'local'
  )
    return fallback
  const n = Number(str)
  if (!Number.isFinite(n)) return fallback
  return str
}

export function toNumber(
  value: DecimalString | number | null | undefined,
): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value == null || value === '') return 0
  // Handle Decimal objects from Watermelon/SQLite or base64 edge
  if (typeof value === 'object') {
    try {
      const v = (value as any).toString()
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    } catch {
      return 0
    }
  }
  const str = String(value).trim()
  if (
    str === '' ||
    str.toLowerCase() === 'nan' ||
    str.toLowerCase() === 'local'
  )
    return 0
  const parsed = Number(str)
  return Number.isFinite(parsed) ? parsed : 0
}

// ===== Analytics Types =====

export type AnalyticsTimeframe = 'day' | 'week' | 'month' | 'year' | 'custom'

export interface RevenueAnalytics {
  timeframe: AnalyticsTimeframe
  data: Array<{ date: string; revenue: number; transactions: number }>
  totalRevenue: number
  growthRate: number
}

export interface ProfitAnalytics {
  timeframe: AnalyticsTimeframe
  data: Array<{
    date: string
    revenue: number
    expenses: number
    profit: number
    margin: number
  }>
  totalProfit: number
  avgMargin: number
}

export interface CategoryAnalytics {
  timeframe: AnalyticsTimeframe
  categories: Array<{
    name: string
    revenue: number
    percentage: number
    trend: 'up' | 'down' | 'stable'
  }>
}

export interface CustomerSegmentAnalytics {
  timeframe: AnalyticsTimeframe
  segments: Array<{
    segment: string
    count: number
    growth: number
    avgOrderValue: number
  }>
}

export interface AnalyticsSummary {
  revenue: RevenueAnalytics
  profit: ProfitAnalytics
  categories: CategoryAnalytics
  customers: CustomerSegmentAnalytics
  generatedAt: ISODateTime
  timeframe: AnalyticsTimeframe
}

// ===== Invoice Types =====

export interface InvoiceListItem {
  id: UUID
  invoiceNumber: string
  customerName: string
  customerPhone?: string
  status:
    | 'draft'
    | 'sent'
    | 'viewed'
    | 'partial'
    | 'paid'
    | 'overdue'
    | 'cancelled'
  total: DecimalString
  amountDue: DecimalString
  currency: string
  dueAt: ISODateTime
  createdAt: ISODateTime
  sentAt?: ISODateTime
}

export interface InvoiceDetail extends InvoiceListItem {
  lines: Array<{
    id: UUID
    description: string
    quantity: DecimalString
    unitPrice: DecimalString
    lineTotal: DecimalString
  }>
  subtotal: DecimalString
  taxAmount: DecimalString
  amountPaid: DecimalString
  notes?: string
  payments: Array<{
    id: UUID
    amount: DecimalString
    paidAt: ISODateTime
    method: string
  }>
}

// ===== WAHA Notification Types =====

export interface WAHAMessageRequest {
  phone: string
  message: string
  mediaUrl?: string
  mediaType?: 'image' | 'document' | 'video'
}

export interface WAHANotificationPayload {
  type: 'invoice' | 'order_status' | 'payment_reminder' | 'marketing'
  recipientPhone: string
  templateData: Record<string, any>
  invoiceId?: UUID
  orderId?: UUID
}
