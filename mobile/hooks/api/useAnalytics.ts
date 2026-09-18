import { useQuery } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
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

const SNAPSHOT_CACHE_PREFIX = 'bizsawa_analytics_snapshot_'

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

export interface TaxSummary {
  timeframe: string
  totalTax: any
  taxableSales: any
  totalSales: any
  transactionCount: number
  byProduct: Array<{ productId: string; name: string; category: string; taxAmount: any; revenue: any; quantity: any }>
  byCategory: Array<{ category: string; taxAmount: any; revenue: any; count: number }>
  kraPayable: any
  vatRate: number
  generatedAt: string
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

  const fetchSnapshot = async (
    tf: Timeframe,
    signal?: AbortSignal,
  ): Promise<BackendSnapshot> => {
    const bt = backendTimeframe(tf)
    const cacheKey = `${SNAPSHOT_CACHE_PREFIX}${activeBusinessId || 'none'}_${bt}`
    try {
      // Single canonical endpoint — GET /api/v1/analytics?timeframe=week
      // signal is forwarded so TanStack can cancel on unmount / swipe-away
      const response = await api.get<BackendSnapshot>('/analytics', {
        params: { timeframe: bt },
        signal,
      })
      const data = response.data
      AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {})
      return data
    } catch (e: any) {
      // Don't fallback to cache on explicit abort — let query get cancelled
      if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || signal?.aborted) throw e
      const cached = await AsyncStorage.getItem(cacheKey)
      if (cached) {
        try {
          return JSON.parse(cached) as BackendSnapshot
        } catch {}
      }
      throw e
    }
  }

  // Pre-computed analytics summary endpoint — now backed by Snapshot
  // Helpers: fill missing buckets on client as well (defensive — backend now also gap-fills)
  function fillWeekBuckets<T extends { date: string }>(data: T[], tf: Timeframe, zero: Omit<T, 'date'>): T[] {
    if (!data) return []
    // If backend already returns correct bucket count (7/24/30/12), pass through
    const expected = tf === 'day' ? 24 : tf === 'week' ? 7 : tf === 'month' ? 30 : 12
    if (data.length >= expected) return data
    // Build map by YYYY-MM-DD (or hour/month)
    const keyOf = (d: string) => {
      const dt = new Date(d)
      if (tf === 'day') return `${dt.toISOString().slice(0, 13)}` // hour
      if (tf === 'year') return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}`
      return dt.toISOString().slice(0,10)
    }
    const map = new Map<string, T>()
    data.forEach(x => map.set(keyOf(x.date), x))
    const now = new Date()
    const out: T[] = []
    if (tf === 'week') {
      for (let i=6;i>=0;i--) { const dt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-i)); const k=dt.toISOString().slice(0,10); const hit=map.get(k); out.push(hit||{date:dt.toISOString(), ...zero} as T) }
    } else if (tf === 'day') {
      const base = new Date(now); base.setMinutes(0,0,0)
      for (let i=23;i>=0;i--) { const dt=new Date(base.getTime()-i*3600*1000); const k=dt.toISOString().slice(0,13); const hit=map.get(k); out.push(hit||{date:dt.toISOString(), ...zero} as T) }
    } else if (tf === 'month') {
      for (let i=29;i>=0;i--) { const dt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-i)); const k=dt.toISOString().slice(0,10); const hit=map.get(k); out.push(hit||{date:dt.toISOString(), ...zero} as T) }
    } else {
      // year: 12 months
      for (let i=11;i>=0;i--) { const dt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1)); const k=`${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}`; const hit=map.get(k); out.push(hit||{date:dt.toISOString(), ...zero} as T) }
    }
    return out
  }

  const SNAP_STALE: Record<string, number> = { day: 30*1000, week: 60*1000, month: 5*60*1000, year: 15*60*1000 }

  const getAnalyticsSummary = (timeframe: Timeframe = 'week') =>
    useQuery<AnalyticsSummary>({
      queryKey: ['analytics', 'snapshot', timeframe, activeBusinessId],
      queryFn: ({ signal }) => (async () => {
        const snap = await fetchSnapshot(timeframe, signal)
        const mapped = mapSnapshotToAnalytics(snap, timeframe)
        ;(mapped.revenue as any).data = fillWeekBuckets(mapped.revenue.data as any, timeframe, { revenue: 0, transactions: 0 } as any)
        ;(mapped.profit as any).data = fillWeekBuckets(mapped.profit.data as any, timeframe, { revenue: 0, expenses: 0, profit: 0, margin: 0 } as any)
        return mapped
      })(),
      enabled,
      staleTime: SNAP_STALE[timeframe] ?? 60*1000,
      gcTime: 5*60*1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (count, err: any) =>
        err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2,
    })

  const getRevenueAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery<RevenueAnalytics>({
      queryKey: ['analytics', 'revenue', timeframe, activeBusinessId],
      queryFn: ({ signal }) => (async () => {
        const snap = await fetchSnapshot(timeframe, signal)
        const m = mapSnapshotToAnalytics(snap, timeframe).revenue
        ;(m as any).data = fillWeekBuckets(m.data as any, timeframe, { revenue: 0, transactions: 0 } as any)
        return m
      })(),
      enabled,
      staleTime: SNAP_STALE[timeframe] ?? 60*1000,
      gcTime: 5*60*1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (count, err: any) =>
        err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2,
    })

  const getProfitAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery<ProfitAnalytics>({
      queryKey: ['analytics', 'profit', timeframe, activeBusinessId],
      queryFn: ({ signal }) => (async () => {
        const snap = await fetchSnapshot(timeframe, signal)
        const m = mapSnapshotToAnalytics(snap, timeframe).profit
        ;(m as any).data = fillWeekBuckets(m.data as any, timeframe, { revenue: 0, expenses: 0, profit: 0, margin: 0 } as any)
        return m
      })(),
      enabled,
      staleTime: SNAP_STALE[timeframe] ?? 60*1000,
      gcTime: 5*60*1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (count, err: any) =>
        err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2,
    })

  const getCategoryAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery<CategoryAnalytics>({
      queryKey: ['analytics', 'categories', timeframe, activeBusinessId],
      queryFn: ({ signal }) => fetchSnapshot(timeframe, signal).then((snap) => mapSnapshotToAnalytics(snap, timeframe).categories),
      enabled,
      staleTime: 2*60*1000,
      retry: (count, err: any) =>
        err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2,
    })

  const getCustomerAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery<CustomerSegmentAnalytics>({
      queryKey: ['analytics', 'customers', timeframe, activeBusinessId],
      queryFn: ({ signal }) => fetchSnapshot(timeframe, signal).then((snap) => mapSnapshotToAnalytics(snap, timeframe).customers),
      enabled,
      staleTime: 5*60*1000,
      retry: (count, err: any) =>
        err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2,
    })

  // Legacy queries — also gated
  const getSalesSummary = useQuery({
    queryKey: ['analytics', 'sales-summary', activeBusinessId],
    queryFn: async ({ signal }) => {
      const response = await api.get<SalesSummary>('/sales/summary', {
        params: dateRangeFor('week'),
        signal,
      })
      return response.data
    },
    enabled,
    retry: (count, err: any) =>
      err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2,
  })

  const getCategoryPerformance = useQuery({
    queryKey: ['analytics', 'categories-legacy', activeBusinessId],
    queryFn: async ({ signal }) => {
      const [salesByProduct, expenseSummary] = await Promise.all([
        api.get<{ items: Breakdown[] }>('/sales/by-product', { signal }),
        api.get<{ summary: CategorySummary[] }>('/expenses/summary', {
          params: dateRangeFor('month'),
          signal,
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
      queryFn: async ({ signal }) => {
        const response = await api.get<SalesSummary>('/sales/summary', {
          params: dateRangeFor(timeframe),
          signal,
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
        err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2,
    })

  const getExpenseAnalytics = (timeframe: Timeframe = 'week') =>
    useQuery({
      queryKey: ['analytics', 'expenses', timeframe, activeBusinessId],
      queryFn: async ({ signal }) => {
        const response = await api.get<{ summary: CategorySummary[] }>(
          '/expenses/summary',
          { params: dateRangeFor(timeframe), signal },
        )
        const amount = (response.data.summary || []).reduce(
          (sum, item) => sum + toNumber(item.amount),
          0,
        )
        return [{ date: new Date().toISOString(), amount, revenue: amount }]
      },
      enabled,
      retry: (count, err: any) =>
        err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2,
    })

  const getAIInsights = useQuery<AIInsights>({
    queryKey: ['analytics', 'ai-insights', activeBusinessId],
    queryFn: async ({ signal }) => {
      const cacheKey = `${SNAPSHOT_CACHE_PREFIX}ai_${activeBusinessId}`
      try {
        const res = await api.get<AIInsights>('/analytics/ai-insights', {
          params: { timeframe: 'month' },
          signal,
        })
        AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {})
        return res.data
      } catch (e: any) {
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || signal?.aborted) throw e
        const cached = await AsyncStorage.getItem(cacheKey)
        if (cached) {
          try {
            return JSON.parse(cached) as AIInsights
          } catch {}
        }
        throw e
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: (count, err: any) => (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2),
  })

  const getTaxSummary = (timeframe: Timeframe = 'month') =>
    useQuery<TaxSummary>({
      queryKey: ['analytics', 'tax', timeframe, activeBusinessId],
      queryFn: async ({ signal }) => {
        const cacheKey = `${SNAPSHOT_CACHE_PREFIX}tax_${activeBusinessId}_${timeframe}`
        try {
          const res = await api.get<TaxSummary>('/analytics/tax', { params: { timeframe: backendTimeframe(timeframe) }, signal })
          AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {})
          return res.data
        } catch (e: any) {
          if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || signal?.aborted) throw e
          const cached = await AsyncStorage.getItem(cacheKey)
          if (cached) { try { return JSON.parse(cached) as TaxSummary } catch {} }
          throw e
        }
      },
      enabled,
      staleTime: 60 * 1000,
      retry: (count, err: any) => (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' ? false : err?.response?.status === 403 ? false : count < 2),
    })

  const defaultTimeframe: Timeframe = 'week'
  // Build 7-day overview from the same canonical snapshot — fixes "single bar" bug where overview previously showed one aggregated "This week" bar.
  const _revenueWeekForOverview = getRevenueAnalytics('week')
  const weeklyOverview: WeeklyOverview[] = (() => {
    const data = (_revenueWeekForOverview.data as any)?.data as Array<{ date: string; revenue: number; transactions: number }> | undefined
    if (data && data.length) {
      return data.slice(-7).map((p) => {
        const dt = new Date(p.date)
        const day = dt.toLocaleDateString('en-KE', { weekday: 'short' })
        return { day, sales: Number(p.revenue), fullDate: p.date }
      })
    }
    // fallback while loading: generate 7 empty buckets so chart still renders 7 x-positions with zeros
    const now = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (6 - i)))
      const day = dt.toLocaleDateString('en-KE', { weekday: 'short' })
      return { day, sales: 0, fullDate: dt.toISOString() }
    })
  })()
  const isOverviewLoading = businessLoading || _revenueWeekForOverview.isLoading

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
    getTaxSummary,
    weeklyOverview,
    isOverviewLoading,
    // keep legacy sales summary query for backward compat but not used for overview anymore
    _getSalesSummary: getSalesSummary,
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
