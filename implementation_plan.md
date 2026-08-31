# Implementation Plan

## Overview

This plan addresses three major features for the Bizworth application:

1. **Insights Tab Navigation Restructure** - Split the current monolithic `insights.tsx` into separate route pages using Expo Router nested routing (`/insights/overview`, `/insights/analytics`, `/insights/expenses`)
2. **Analytics Backend Service Layer** - Create a new dedicated `analytics` module with background workers for pre-computing business metrics (revenue trends, profit margins, category performance, customer segments) with timeframe filters (day/week/month/year)
3. **Invoices Frontend Page + WAHA Integration** - Build a frontend page for displaying invoices with WhatsApp sharing capability via WAHA service, and implement the WAHA backend module for multi-channel notifications (invoices, order status, marketing)

## Types

### Frontend Types (mobile/lib/api-dtos.ts additions)
```typescript
// Analytics timeframe filters
export type AnalyticsTimeframe = "day" | "week" | "month" | "year" | "custom";

// Pre-computed analytics data structures
export interface RevenueAnalytics {
  timeframe: AnalyticsTimeframe;
  data: Array<{ date: string; revenue: number; transactions: number }>;
  totalRevenue: number;
  growthRate: number;
}

export interface ProfitAnalytics {
  timeframe: AnalyticsTimeframe;
  data: Array<{ date: string; revenue: number; expenses: number; profit: number; margin: number }>;
  totalProfit: number;
  avgMargin: number;
}

export interface CategoryAnalytics {
  timeframe: AnalyticsTimeframe;
  categories: Array<{ name: string; revenue: number; percentage: number; trend: "up" | "down" | "stable" }>;
}

export interface CustomerSegmentAnalytics {
  timeframe: AnalyticsTimeframe;
  segments: Array<{ segment: string; count: number; growth: number; avgOrderValue: number }>;
}

export interface AnalyticsSummary {
  revenue: RevenueAnalytics;
  profit: ProfitAnalytics;
  categories: CategoryAnalytics;
  customers: CustomerSegmentAnalytics;
  generatedAt: ISODateTime;
  timeframe: AnalyticsTimeframe;
}

// Invoice types for frontend
export interface InvoiceListItem {
  id: UUID;
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  status: "draft" | "sent" | "viewed" | "partial" | "paid" | "overdue" | "cancelled";
  total: DecimalString;
  amountDue: DecimalString;
  currency: string;
  dueAt: ISODateTime;
  createdAt: ISODateTime;
  sentAt?: ISODateTime;
}

export interface InvoiceDetail extends InvoiceListItem {
  lines: Array<{
    id: UUID;
    description: string;
    quantity: DecimalString;
    unitPrice: DecimalString;
    lineTotal: DecimalString;
  }>;
  subtotal: DecimalString;
  taxAmount: DecimalString;
  amountPaid: DecimalString;
  notes?: string;
  payments: Array<{ id: UUID; amount: DecimalString; paidAt: ISODateTime; method: string }>;
}

// WAHA notification types
export interface WAHAMessageRequest {
  phone: string;
  message: string;
  mediaUrl?: string;
  mediaType?: "image" | "document" | "video";
}

export interface WAHANotificationPayload {
  type: "invoice" | "order_status" | "payment_reminder" | "marketing";
  recipientPhone: string;
  templateData: Record<string, any>;
  invoiceId?: UUID;
  orderId?: UUID;
}
```

### Backend Types (New analytics module)
```go
// internal/analytics/types.go
type Timeframe string

const (
    TimeframeDay   Timeframe = "day"
    TimeframeWeek  Timeframe = "week"
    TimeframeMonth Timeframe = "month"
    TimeframeYear  Timeframe = "year"
)

type AnalyticsJobArgs struct {
    TenantID     uuid.UUID `json:"tenant_id"`
    Timeframe    Timeframe `json:"timeframe"`
    AggregateType string   `json:"aggregate_type"` // revenue, profit, categories, customers
    ScheduledAt  time.Time `json:"scheduled_at"`
}

type RevenueAggregate struct {
    Date         time.Time       `json:"date"`
    Revenue      decimal.Decimal `json:"revenue"`
    Transactions int             `json:"transactions"`
}

type ProfitAggregate struct {
    Date    time.Time       `json:"date"`
    Revenue decimal.Decimal `json:"revenue"`
    Expense decimal.Decimal `json:"expense"`
    Profit  decimal.Decimal `json:"profit"`
    Margin  float64         `json:"margin"`
}

type CategoryAggregate struct {
    Category   string          `json:"category"`
    Revenue    decimal.Decimal `json:"revenue"`
    Percentage float64         `json:"percentage"`
    Trend      string          `json:"trend"` // up, down, stable
}

type CustomerSegmentAggregate struct {
    Segment         string          `json:"segment"`
    Count           int             `json:"count"`
    Growth          float64         `json:"growth"`
    AvgOrderValue   decimal.Decimal `json:"avg_order_value"`
}

type PrecomputedAnalytics struct {
    TenantID     uuid.UUID                 `json:"tenant_id"`
    Timeframe    Timeframe                 `json:"timeframe"`
    Revenue      []RevenueAggregate        `json:"revenue"`
    Profit       []ProfitAggregate         `json:"profit"`
    Categories   []CategoryAggregate       `json:"categories"`
    Customers    []CustomerSegmentAggregate `json:"customers"`
    GeneratedAt  time.Time                 `json:"generated_at"`
}
```

### Backend Types (WAHA module)
```go
// internal/waha/types.go
type WAHAClient struct {
    BaseURL  string
    APIKey   string
    Session  string
    HTTPClient *http.Client
}

type WAHAMessage struct {
    ChatID      string `json:"chatId"`
    Text        string `json:"text"`
    MediaURL    string `json:"mediaUrl,omitempty"`
    MediaType   string `json:"mediaType,omitempty"`
    Session     string `json:"session"`
}

type WAHAResponse struct {
    ID        string `json:"id"`
    Status    string `json:"status"`
    Timestamp int64  `json:"timestamp"`
}

type NotificationTemplate struct {
## Files

### New Files

#### Frontend (Mobile)
1. **`mobile/app/(tabs)/insights/overview.tsx`** - Overview tab content (extracted from current insights.tsx)
2. **`mobile/app/(tabs)/insights/analytics.tsx`** - Analytics tab with charts, timeframe filters
3. **`mobile/app/(tabs)/insights/expenses.tsx`** - Expenses tab with list/add functionality
4. **`mobile/app/(tabs)/insights/_layout.tsx`** - Nested tab layout for insights sub-tabs
4. **`mobile/app/(tabs)/invoices.tsx`** - New invoices tab page (main tab)
5. **`mobile/app/(tabs)/invoices/[id].tsx`** - Invoice detail page with WhatsApp share button
6. **`mobile/hooks/api/useAnalytics.ts`** - Updated with timeframe support and new query hooks
7. **`mobile/hooks/api/useInvoices.ts`** - New hook for invoice CRUD and WhatsApp sharing
8. **`mobile/components/charts/RevenueChart.tsx`** - Reusable revenue trend chart component
9. **`mobile/components/charts/ProfitChart.tsx`** - Profit/margin chart component
10. **`mobile/components/charts/CategoryPieChart.tsx`** - Category distribution pie chart
11. **`mobile/components/ui/TimeframeSelector.tsx`** - Day/Week/Month/Year filter component

#### Backend
12. **`backend/internal/analytics/types.go`** - Type definitions for analytics
13. **`backend/internal/analytics/repository.go`** - Database queries for pre-computed aggregates
14. **`backend/internal/analytics/service.go`** - Business logic for computing analytics
15. **`backend/internal/analytics/handler.go`** - HTTP handlers for analytics endpoints
16. **`backend/internal/analytics/workers.go`** - River workers for background computation
17. **`backend/internal/analytics/module.go`** - Module wiring (routes + workers)
18. **`backend/internal/analytics/migrations/xxx_create_analytics_tables.sql`** - Database schema
19. **`backend/internal/waha/client.go`** - WAHA HTTP client
20. **`backend/internal/waha/service.go`** - Notification service with templates
21. **`backend/internal/waha/handler.go`** - Webhook handlers for WAHA callbacks
22. **`backend/internal/waha/module.go`** - Module wiring
23. **`backend/internal/waha/templates.go`** - Message templates for invoice, order status, marketing
24. **`backend/migrations/xxx_add_waha_config_to_business.sql`** - Store WAHA config per business

### Modified Files

#### Frontend
1. **`mobile/app/(tabs)/insights.tsx`** - Delete (replaced by nested routes)
2. **`mobile/app/(tabs)/_layout.tsx`** - Add invoices tab, update insights to use nested layout
3. **`mobile/app/(tabs)/index.tsx`** - Update "View All" link to point to new analytics route
4. **`mobile/hooks/api/useAnalytics.ts`** - Add timeframe parameter, new query hooks for pre-computed data
5. **`mobile/lib/api-dtos.ts`** - Add new analytics and invoice types

#### Backend
6. **`backend/cmd/api/main.go`** - Register analytics and waha modules
7. **`backend/cmd/api/server.go`** - Add routes for analytics and waha modules
8. **`backend/internal/invoices/service.go`** - Integrate WAHA service for sending invoices
9. **`backend/internal/invoices/workers.go`** - Trigger WAHA notifications on invoice events
10. **`backend/internal/sales/service.go`** - Emit events for analytics aggregation
11. **`backend/internal/expenses/service.go`** - Emit events for analytics aggregation
12. **`backend/internal/shared/db/models.go`** - Add analytics tables to GORM auto-migration
    Type        string
    Template    string
    Variables   []string
}
```