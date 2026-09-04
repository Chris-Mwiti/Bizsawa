import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import type {
  Breakdown,
  CategorySummary,
  SalesSummary,
  RevenueAnalytics,
  ProfitAnalytics,
  CategoryAnalytics,
  CustomerSegmentAnalytics,
  AnalyticsSummary,
  AnalyticsTimeframe,
} from '../../lib/api-dtos'
import { toNumber } from '../../lib/api-dtos'
import { useBusinessContext } from '../../contexts/BusinessContext'

export type Timeframe = 'day' | 'week' | 'month' | 'year' | 'all' | 'custom'

export interface WeeklyOverview {
  day: string
  sales: number
  fullDate: string
}

export interface AnalyticsDataPoint {
  date: string
  amount: number
}

export interface CategoryPerformance {
  sales: Array<{ name: string; value: number; type: string }>
  expenses: Array<{ name: string; value: number; type: string }>
}

export interface ProfitAnalyticsDataPoint {
  date: string
  revenue: number
  expense: number
  profit: number
  margin: number
}

export interface AIInsights {
  summary: string
  trends: Array<{
    title: string
    description: string
    sentiment: 'positive' | 'negative' | 'neutral'
  }>
  recommendations: Array<{
    action: string
    reason: string
    priority: 'High' | 'Medium' | 'Low'
  }>
}

function dateRangeFor(timeframe: Timeframe): { from?: string; to?: string } {
  if (timeframe === 'all') return {}
  const to = new Date()
  const from = new Date(to)
  if (timeframe === 'day') from.setDate(to.getDate() - 1)
  if (timeframe === 'week') from.setDate(to.getDate() - 7)
  if (timeframe === 'month') from.setMonth(to.getMonth() - 1)
  if (timeframe === 'year') from.setFullYear(to.getFullYear() - 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

// Backend expects "day" | "week" | "month" | "year" - map "all" to "year" and "custom" to "month" as fallback
function backendTimeframe(tf: Timeframe): 'day' | 'week' | 'month' | 'year' {
  if (tf === 'day') return 'day'
  if (tf === 'week') return 'week'
  if (tf === 'month') return 'month'
  if (tf === 'year') return 'year'
  if (tf === 'all') return 'year'
  return 'month' // custom
}

// Backend Snapshot shape — single endpoint GET /analytics?timeframe=...
// Decimal fields arrive as strings from shopspring/decimal
interface BackendSnapshot {
  businessId: string
  timeframe: AnalyticsTimeframe
  revenue?: {
    data: Array<{ date: string; revenue: any; transactions: number }>
    totalRevenue: any
    growthRate: number
    transactions: number
  }
  profit?: {
    data: Array<{
      date: string
      revenue: any
      expense: any
      profit: any
      margin: number
    }>
    totalProfit: any
    avgMargin: number
  }
  categories?: Array<{
    name: string
    revenue: any
    percentage: number
    trend: string
  }>
  customers?: {
    segments: Array<{
      segment: string
      count: number
      growth: number
      avgOrderValue: any
      totalSpend?: any
    }>
    ltv: any
  }
  generatedAt: string
}

function mapSnapshotToAnalytics(
  snap: BackendSnapshot,
  tf: Timeframe,
): AnalyticsSummary {
  const bt = backendTimeframe(tf) as AnalyticsTimeframe
  return {
    timeframe: bt,
    generatedAt: snap.generatedAt,
    revenue: {
      timeframe: bt,
      data: (snap.revenue?.data || []).map((d) => ({
        date: d.date,
        revenue: toNumber(d.revenue),
        transactions: d.transactions,
      })),
      totalRevenue: toNumber(snap.revenue?.totalRevenue),
      growthRate: Number(snap.revenue?.growthRate ?? 0),
    },
    profit: {
      timeframe: bt,
      data: (snap.profit?.data || []).map((d) => ({
        date: d.date,
        revenue: toNumber(d.revenue),
        expenses: toNumber(d.expense),
        profit: toNumber(d.profit),
        margin: Number(d.margin ?? 0),
      })),
      totalProfit: toNumber(snap.profit?.totalProfit),
      avgMargin: Number(snap.profit?.avgMargin ?? 0),
    },
    categories: {
      timeframe: bt,
      categories: (snap.categories || []).map((c) => ({
        name: c.name,
        revenue: toNumber(c.revenue),
        percentage: Number(c.percentage ?? 0),
        trend: (c.trend as any) || 'stable',
      })),
    },
    customers: {
      timeframe: bt,
      segments: (snap.customers?.segments || []).map((s) => ({
        segment: s.segment,
        count: s.count,
        growth: Number(s.growth ?? 0),
        avgOrderValue: toNumber(s.avgOrderValue),
      })),
    },
  }
}

export const useAnalytics = () => {
  // Gate all analytics on active business — prevents 403 "business context is required" on cold start
  let activeBusinessId: string | null = null
  let businessLoading = false
  try {
    const biz = useBusinessContext()
    activeBusinessId = biz.activeBusinessId
    businessLoading = biz.isLoading
  } catch {
    // outside provider (tests) — allow queries
    activeBusinessId = 'test'
  }
  const hasBusiness = !!activeBusinessId
  const enabled = hasBusiness && !businessLoading

  const fetchSnapshot = async (tf: Timeframe): Promise<BackendSnapshot> => {
    // Single canonical endpoint — backend/internal/analytics/module.go:51 r.Get("/", h.Get)
    // GET /api/v1/analytics?timeframe=week  with X-Business-ID header + ?businessId= fallback
    const response = await api.get<BackendSnapshot>('/analytics', {
      params: { timeframe: backendTimeframe(tf) },
    })
    return response.data
  }

  // Pre-computed analytics summary endpoint — now backed by Snapshot
  const getAnalyticsSummary = (timeframe: Timeframe = 'week') =>
    useQuery<AnalyticsSummary>({
      queryKey: ['analytics', 'snapshot', timeframe, activeBusinessId],
      queryFn: async () => {
        const snap = await fetchSnapshot(timeframe)
        return mapSnapshotToAnalytics(snap, timeframe)
      },
      enabled,
      staleTime: 5 * 60 * 1000,
      retry: (count, err: any) =>
        err?.response?.status === 403 ? false : count < 2,
    })

  const getRevenueAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery<RevenueAnalytics>({
      queryKey: ['analytics', 'revenue', timeframe, activeBusinessId],
      queryFn: async () => {
        const snap = await fetchSnapshot(timeframe)
        return mapSnapshotToAnalytics(snap, timeframe).revenue
      },
      enabled,
      staleTime: 5 * 60 * 1000,
      retry: (count, err: any) =>
        err?.response?.status === 403 ? false : count < 2,
    })

  const getProfitAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery<ProfitAnalytics>({
      queryKey: ['analytics', 'profit', timeframe, activeBusinessId],
      queryFn: async () => {
        const snap = await fetchSnapshot(timeframe)
        return mapSnapshotToAnalytics(snap, timeframe).profit
      },
      enabled,
      staleTime: 5 * 60 * 1000,
      retry: (count, err: any) =>
        err?.response?.status === 403 ? false : count < 2,
    })

  const getCategoryAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery<CategoryAnalytics>({
      queryKey: ['analytics', 'categories', timeframe, activeBusinessId],
      queryFn: async () => {
        const snap = await fetchSnapshot(timeframe)
        return mapSnapshotToAnalytics(snap, timeframe).categories
      },
      enabled,
      staleTime: 5 * 60 * 1000,
      retry: (count, err: any) =>
        err?.response?.status === 403 ? false : count < 2,
    })

  const getCustomerAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery<CustomerSegmentAnalytics>({
      queryKey: ['analytics', 'customers', timeframe, activeBusinessId],
      queryFn: async () => {
        const snap = await fetchSnapshot(timeframe)
        return mapSnapshotToAnalytics(snap, timeframe).customers
      },
      enabled,
      staleTime: 5 * 60 * 1000,
      retry: (count, err: any) =>
        err?.response?.status === 403 ? false : count < 2,
    })

  // Legacy queries — also gated
  const getSalesSummary = useQuery({
    queryKey: ['analytics', 'sales-summary', activeBusinessId],
    queryFn: async () => {
      const response = await api.get<SalesSummary>('/sales/summary', {
        params: dateRangeFor('week'),
      })
      return response.data
    },
    enabled,
    retry: (count, err: any) =>
      err?.response?.status === 403 ? false : count < 2,
  })

  const getCategoryPerformance = useQuery({
    queryKey: ['analytics', 'categories-legacy', activeBusinessId],
    queryFn: async () => {
      const [salesByProduct, expenseSummary] = await Promise.all([
        api.get<{ items: Breakdown[] }>('/sales/by-product'),
        api.get<{ summary: CategorySummary[] }>('/expenses/summary', {
          params: dateRangeFor('month'),
        }),
      ])
      return {
        sales: (salesByProduct.data.items || []).map((item) => ({
          name: item.key,
          value: toNumber(item.total),
          type: 'sales',
        })),
        expenses: (expenseSummary.data.summary || []).map((item) => ({
          name: item.category,
          value: toNumber(item.amount),
          type: 'expenses',
        })),
      } satisfies CategoryPerformance
    },
    enabled,
    retry: (count, err: any) =>
      err?.response?.status === 403 ? false : count < 2,
  })

  const getSalesAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery({
      queryKey: ['analytics', 'sales', timeframe, activeBusinessId],
      queryFn: async () => {
        const response = await api.get<SalesSummary>('/sales/summary', {
          params: dateRangeFor(timeframe),
        })
        return [
          {
            date: new Date().toISOString(),
            amount: toNumber(response.data.total),
            revenue: toNumber(response.data.total),
          },
        ]
      },
      enabled,
      retry: (count, err: any) =>
        err?.response?.status === 403 ? false : count < 2,
    })

  const getExpenseAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery({
      queryKey: ['analytics', 'expenses', timeframe, activeBusinessId],
      queryFn: async () => {
        const response = await api.get<{ summary: CategorySummary[] }>(
          '/expenses/summary',
          { params: dateRangeFor(timeframe) },
        )
        const amount = (response.data.summary || []).reduce(
          (sum, item) => sum + toNumber(item.amount),
          0,
        )
        return [{ date: new Date().toISOString(), amount, revenue: amount }]
      },
      enabled,
      retry: (count, err: any) =>
        err?.response?.status === 403 ? false : count < 2,
    })

  const getAIInsights = useQuery<AIInsights>({
    queryKey: ['analytics', 'ai-insights'],
    queryFn: async () => ({
      summary:
        'AI insights are unavailable until the backend exposes an AI endpoint.',
      trends: [],
      recommendations: [],
    }),
    staleTime: Infinity,
  })

  const defaultTimeframe: Timeframe = 'week'

  return {
    analyticsSummary: getAnalyticsSummary(defaultTimeframe),
    revenueAnalytics: getRevenueAnalytics(defaultTimeframe),
    profitAnalyticsData: getProfitAnalytics(defaultTimeframe),
    categoryAnalytics: getCategoryAnalytics(defaultTimeframe),
    customerAnalytics: getCustomerAnalytics(defaultTimeframe),
    getAnalyticsSummary,
    getRevenueAnalytics,
    getProfitAnalytics,
    getCategoryAnalytics,
    getCustomerAnalytics,
    weeklyOverview: [
      {
        day: 'This week',
        sales: toNumber(getSalesSummary.data?.total),
        fullDate: new Date().toISOString(),
      },
    ],
    isOverviewLoading: businessLoading || getSalesSummary.isLoading,
    overviewError: (getSalesSummary.error as ApiError)?.friendlyMessage || null,
    hasBusiness,
    isBusinessLoading: businessLoading,
    salesAnalytics: getSalesAnalytics,
    expenseAnalytics: getExpenseAnalytics,
    profitAnalytics: getSalesAnalytics,
    categoryPerformance: getCategoryPerformance.data || {
      sales: [],
      expenses: [],
    },
    isCategoriesLoading: getCategoryPerformance.isLoading,
    categoriesError:
      (getCategoryPerformance.error as ApiError)?.friendlyMessage || null,
    aiInsights: getAIInsights.data,
    isAIInsightsLoading: getAIInsights.isLoading,
    aiInsightsError: null,
    fetchAIInsights: getAIInsights.refetch,
  }
}
