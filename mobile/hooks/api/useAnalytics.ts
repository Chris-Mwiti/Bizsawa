import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Breakdown, CategorySummary, SalesSummary } from "../../lib/api-dtos";
import { toNumber } from "../../lib/api-dtos";

export type Timeframe = "week" | "month" | "year" | "all";

export interface WeeklyOverview {
  day: string;
  sales: number;
  fullDate: string;
}

export interface AnalyticsDataPoint {
  date: string;
  amount: number;
}

export interface CategoryPerformance {
  sales: Array<{ name: string; value: number; type: string }>;
  expenses: Array<{ name: string; value: number; type: string }>;
}

export interface ProfitAnalytics {
  date: string;
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
}

export interface AIInsights {
  summary: string;
  trends: Array<{ title: string; description: string; sentiment: "positive" | "negative" | "neutral" }>;
  recommendations: Array<{ action: string; reason: string; priority: "High" | "Medium" | "Low" }>;
}

function dateRangeFor(timeframe: Timeframe): { from?: string; to?: string } {
  if (timeframe === "all") return {};
  const to = new Date();
  const from = new Date(to);
  if (timeframe === "week") from.setDate(to.getDate() - 7);
  if (timeframe === "month") from.setMonth(to.getMonth() - 1);
  if (timeframe === "year") from.setFullYear(to.getFullYear() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const useAnalytics = () => {
  const getSalesSummary = useQuery({
    queryKey: ["analytics", "sales-summary"],
    queryFn: async () => {
      const response = await api.get<SalesSummary>("/sales/summary", { params: dateRangeFor("week") });
      return response.data;
    },
  });

  const getCategoryPerformance = useQuery({
    queryKey: ["analytics", "categories"],
    queryFn: async () => {
      const [salesByProduct, expenseSummary] = await Promise.all([
        api.get<{ items: Breakdown[] }>("/sales/by-product"),
        api.get<{ summary: CategorySummary[] }>("/expenses/summary", { params: dateRangeFor("month") }),
      ]);
      return {
        sales: (salesByProduct.data.items || []).map((item) => ({
          name: item.key,
          value: toNumber(item.total),
          type: "sales",
        })),
        expenses: (expenseSummary.data.summary || []).map((item) => ({
          name: item.category,
          value: toNumber(item.amount),
          type: "expenses",
        })),
      } satisfies CategoryPerformance;
    },
  });

  const getSalesAnalytics = (timeframe: Timeframe = "week") =>
    useQuery({
      queryKey: ["analytics", "sales", timeframe],
      queryFn: async () => {
        const response = await api.get<SalesSummary>("/sales/summary", { params: dateRangeFor(timeframe) });
        return [{ date: new Date().toISOString(), amount: toNumber(response.data.total) }];
      },
    });

  const getExpenseAnalytics = (timeframe: Timeframe = "week") =>
    useQuery({
      queryKey: ["analytics", "expenses", timeframe],
      queryFn: async () => {
        const response = await api.get<{ summary: CategorySummary[] }>("/expenses/summary", { params: dateRangeFor(timeframe) });
        const amount = (response.data.summary || []).reduce((sum, item) => sum + toNumber(item.amount), 0);
        return [{ date: new Date().toISOString(), amount }];
      },
    });

  const getAIInsights = useQuery<AIInsights>({
    queryKey: ["analytics", "ai-insights"],
    queryFn: async () => ({
      summary: "AI insights are unavailable until the backend exposes an AI endpoint.",
      trends: [],
      recommendations: [],
    }),
    staleTime: Infinity,
  });

  return {
    weeklyOverview: [
      {
        day: "This week",
        sales: toNumber(getSalesSummary.data?.total),
        fullDate: new Date().toISOString(),
      },
    ],
    isOverviewLoading: getSalesSummary.isLoading,
    overviewError: (getSalesSummary.error as ApiError)?.friendlyMessage || null,
    salesAnalytics: getSalesAnalytics,
    expenseAnalytics: getExpenseAnalytics,
    profitAnalytics: getSalesAnalytics,
    categoryPerformance: getCategoryPerformance.data || { sales: [], expenses: [] },
    isCategoriesLoading: getCategoryPerformance.isLoading,
    categoriesError: (getCategoryPerformance.error as ApiError)?.friendlyMessage || null,
    aiInsights: getAIInsights.data,
    isAIInsightsLoading: getAIInsights.isLoading,
    aiInsightsError: null,
    fetchAIInsights: getAIInsights.refetch,
  };
};
