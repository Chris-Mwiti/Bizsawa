export type UUID = string;
export type DecimalString = string;
export type ISODateTime = string;

export type Role = "OWNER" | "MANAGER" | "CASHIER" | "VIEWER";

export interface AuthResponse {
  userId: UUID;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest extends RegisterRequest {
  businessId?: UUID | null;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface UserProfile {
  id: UUID;
  tenantId: UUID;
  userId: UUID;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  timezone: string;
  language: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CreateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
}

export interface Business {
  id: UUID;
  tenantId: UUID;
  ownerId: UUID;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  taxPin?: string;
  phone?: string;
  email?: string;
  address?: string;
  mpesaPaymentType?: "paybill" | "pochi_biashara" | "buy_goods";
  mpesaShortcodeConfigured: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CreateBusinessRequest {
  name: string;
  slug?: string;
  currency?: string;
  timezone?: string;
  taxPin?: string;
  mpesaPaymentType?: "paybill" | "pochi_biashara" | "buy_goods";
  mpesaShortcode?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface BusinessMember {
  id: UUID;
  tenantId: UUID;
  businessId: UUID;
  userId: UUID;
  role: Role;
  isActive: boolean;
  invitedBy?: UUID;
  invitedAt: ISODateTime;
  joinedAt?: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProductVariant {
  id: UUID;
  productId: UUID;
  name: string;
  sku?: string;
  barcode?: string;
  price: DecimalString;
  cost: DecimalString;
  isActive: boolean;
}

export interface Product {
  id: UUID;
  tenantId: UUID;
  businessId: UUID;
  name: string;
  description?: string;
  sku?: string;
  category?: string;
  barcode?: string;
  imageUrl?: string;
  taxRuleId?: UUID | null;
  price: DecimalString;
  cost: DecimalString;
  isActive: boolean;
  variants?: ProductVariant[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProductRequest {
  name: string;
  description?: string;
  sku?: string;
  category?: string;
  barcode?: string;
  imageUrl?: string;
  taxRuleId?: UUID | null;
  price: DecimalString;
  cost: DecimalString;
  isActive?: boolean;
}

export interface Customer {
  id: UUID;
  tenantId: UUID;
  businessId: UUID;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  tags?: string[];
  notes?: string;
  loyaltyPoints: number;
  totalSpend: DecimalString;
  lastPurchaseAt?: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CustomerRequest {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  tags?: string[];
  notes?: string;
}

export interface LineRequest {
  productId: UUID;
  quantity: DecimalString;
  unitPrice: DecimalString;
}

export interface Order {
  id: UUID;
  businessId: UUID;
  customerId?: UUID | null;
  status: "draft" | "confirmed" | "fulfilled" | "cancelled" | "refunded";
  subtotal: DecimalString;
  taxAmount: DecimalString;
  total: DecimalString;
  paymentMethod: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  lines?: Array<LineRequest & { id: UUID; lineTotal: DecimalString }>;
}

export interface CreateOrderRequest {
  customerId?: UUID | null;
  paymentMethod?: string;
  lines: LineRequest[];
}

export interface Sale {
  id: UUID;
  businessId: UUID;
  orderId?: UUID | null;
  customerId?: UUID | null;
  receiptNumber: string;
  staffId: UUID;
  paymentMethod: string;
  subtotal: DecimalString;
  taxAmount: DecimalString;
  total: DecimalString;
  status: string;
  soldAt: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  lines?: Array<LineRequest & { id: UUID; lineTotal: DecimalString }>;
}

export interface CreateSaleRequest {
  orderId?: UUID | null;
  customerId?: UUID | null;
  paymentMethod?: string;
  lines: LineRequest[];
}

export interface Expense {
  id: UUID;
  businessId: UUID;
  category: string;
  description?: string;
  vendor?: string;
  amount: DecimalString;
  taxAmount: DecimalString;
  isRecurring: boolean;
  recurringInterval?: string;
  spentAt: ISODateTime;
  createdBy?: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ExpenseRequest {
  category: string;
  description?: string;
  vendor?: string;
  amount: DecimalString;
  taxAmount?: DecimalString;
  isRecurring?: boolean;
  recurringInterval?: string;
  spentAt?: ISODateTime | null;
}

export interface InventoryItem {
  id: UUID;
  businessId: UUID;
  productId: UUID;
  quantity: DecimalString;
  lowStockThreshold: DecimalString;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AdjustmentRequest {
  productId: UUID;
  quantityDelta: DecimalString;
  lowStockThreshold?: DecimalString;
  notes?: string;
}

export interface SalesSummary {
  count: number;
  subtotal: DecimalString;
  taxAmount: DecimalString;
  total: DecimalString;
}

export interface Breakdown {
  key: string;
  total: DecimalString;
  count: number;
}

export interface CategorySummary {
  category: string;
  amount: DecimalString;
  taxAmount: DecimalString;
  count: number;
}

export interface PaymentCommand {
  id: UUID;
  businessId: UUID;
  invoiceId?: UUID | null;
  type: "stk_push" | "b2c" | "c2b";
  status: "pending" | "processing" | "succeeded" | "failed";
  amount: DecimalString;
  currency: string;
  phone?: string;
  accountReference?: string;
  provider: string;
  failureMessage?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  processedAt?: ISODateTime | null;
}

export interface InitiatePaymentRequest {
  type?: "stk_push" | "b2c" | "c2b";
  orderID?: UUID | null;
  invoiceId?: UUID | null;
  amount: DecimalString;
  currency?: string;
  phone?: string;
  accountReference?: string;
  payload?: Record<string, unknown>;
}

export function toDecimalString(value: number | string | null | undefined, fallback = "0"): DecimalString {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  return value.trim() || fallback;
}

export function toNumber(value: DecimalString | number | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
