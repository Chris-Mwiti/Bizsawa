import React, { useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { TrendingUp, DollarSign, PieChart, Users } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/Card";
import { useAnalytics } from "../../../hooks/api/useAnalytics";
import { TAB_BAR_SCROLL_PADDING } from "../../../constants/tabBar";
import type { Timeframe } from "../../../hooks/api/useAnalytics";

const TIMEFRAMES: Timeframe[] = ["day", "week", "month", "year"];
const LABELS: Record<Timeframe, string> = { day: "Day", week: "Week", month: "Month", year: "Year", all: "All", custom: "Custom" };

export default function InsightsAnalytics() {
  const [timeframe, setTimeframe] = useState<Timeframe>("week");
  const { getRevenueAnalytics, getProfitAnalytics, getCategoryAnalytics, getCustomerAnalytics, hasBusiness, isBusinessLoading } = useAnalytics();
  const revenueQuery = getRevenueAnalytics(timeframe);
  const profitQuery = getProfitAnalytics(timeframe);
  const categoryQuery = getCategoryAnalytics(timeframe);
  const customerQuery = getCustomerAnalytics(timeframe);

  const formatCurrency = (amount: number) => `KES ${Number(amount || 0).toLocaleString("en-KE")}`;
  const Loading = () => (
    <View className="items-center py-8"><ActivityIndicator size="small" color="#006b5f" /><Text className="text-gray-500 mt-2">Loading...</Text></View>
  );

  if (isBusinessLoading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <ActivityIndicator size="large" color="#111827" />
        <Text className="text-sm text-gray-500 mt-3">Loading business context…</Text>
      </View>
    );
  }
  if (!hasBusiness) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <View className="w-14 h-14 rounded-full bg-amber-100 items-center justify-center mb-3">
          <PieChart size={22} color="#b45309" />
        </View>
        <Text className="font-bold text-gray-900 text-center">No business selected</Text>
        <Text className="text-sm text-gray-500 text-center mt-1">Create or select a business to view analytics. This fixes the 403 — business context is required.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING + 20 }} showsVerticalScrollIndicator={false}>
        <Card className="mb-4"><CardContent className="py-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-700">Timeframe</Text>
            <View className="flex-row gap-2">
              {TIMEFRAMES.map((tf) => (
                <TouchableOpacity key={tf} className={`px-3 py-2 rounded-full ${timeframe === tf ? "bg-primary-600" : "bg-gray-200"}`} onPress={() => setTimeframe(tf)}>
                  <Text className={`text-sm font-medium ${timeframe === tf ? "text-white" : "text-gray-700"}`}>{LABELS[tf]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </CardContent></Card>

        <View className="flex-row flex-wrap gap-4 mb-4">
          <Card className="bg-white p-4 flex-1" style={{ minWidth: 150 }}><View className="flex-row justify-between items-start">
            <View><Text className="text-sm text-gray-500 mb-1">Total Revenue</Text>
              <Text className="text-xl font-bold text-primary-700">{revenueQuery.data ? formatCurrency(revenueQuery.data.totalRevenue) : "-"}</Text></View>
            <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center"><DollarSign size={20} color="#006b5f" /></View>
          </View>{revenueQuery.data && <Text className="text-xs text-gray-500 mt-2">Growth: {revenueQuery.data.growthRate >= 0 ? "+" : ""}{Number(revenueQuery.data.growthRate).toFixed(1)}%</Text>}</Card>
          <Card className="bg-white p-4 flex-1" style={{ minWidth: 150 }}><View className="flex-row justify-between items-start">
            <View><Text className="text-sm text-gray-500 mb-1">Total Profit</Text>
              <Text className="text-xl font-bold text-green-700">{profitQuery.data ? formatCurrency(profitQuery.data.totalProfit) : "-"}</Text></View>
            <View className="w-10 h-10 rounded-full bg-green-100 items-center justify-center"><TrendingUp size={20} color="#16a34a" /></View>
          </View>{profitQuery.data && <Text className="text-xs text-gray-500 mt-2">Avg Margin: {Number(profitQuery.data.avgMargin).toFixed(1)}%</Text>}</Card>
          <Card className="bg-white p-4 flex-1" style={{ minWidth: 150 }}><View className="flex-row justify-between items-start">
            <View><Text className="text-sm text-gray-500 mb-1">Categories</Text>
              <Text className="text-xl font-bold text-purple-700">{categoryQuery.data ? categoryQuery.data.categories.length : 0}</Text></View>
            <View className="w-10 h-10 rounded-full bg-purple-100 items-center justify-center"><PieChart size={20} color="#8b5cf6" /></View>
          </View></Card>
          <Card className="bg-white p-4 flex-1" style={{ minWidth: 150 }}><View className="flex-row justify-between items-start">
            <View><Text className="text-sm text-gray-500 mb-1">Segments</Text>
              <Text className="text-xl font-bold text-blue-700">{customerQuery.data ? customerQuery.data.segments.length : 0}</Text></View>
            <View className="w-10 h-10 rounded-full bg-blue-100 items-center justify-center"><Users size={20} color="#2563eb" /></View>
          </View></Card>
        </View>

        <Card className="mb-4"><CardHeader><CardTitle>Revenue Trend</CardTitle></CardHeader><CardContent>
          {revenueQuery.isLoading ? <Loading /> : revenueQuery.data && revenueQuery.data.data.length > 0 ? (
            <View className="h-48 flex-row items-end justify-around">
              {revenueQuery.data.data.map((point, i) => {
                const max = Math.max(...revenueQuery.data!.data.map((d) => Number(d.revenue)));
                const h = max > 0 ? (Number(point.revenue) / max) * 100 : 0;
                return (<View key={i} className="flex-1 items-center justify-end px-1">
                  <View style={{ width: "100%", height: `${Math.max(h, 2)}%`, backgroundColor: "#006b5f", borderRadius: 4 }} />
                  <Text className="text-[10px] text-gray-500 mt-1" numberOfLines={1}>{point.date.split("T")[0].slice(5)}</Text>
                </View>);
              })}
            </View>
          ) : <View className="items-center py-8"><Text className="text-gray-500">No revenue data</Text></View>}
        </CardContent></Card>

        <Card className="mb-4"><CardHeader><CardTitle>Profit & Margin</CardTitle></CardHeader><CardContent>
          {profitQuery.isLoading ? <Loading /> : profitQuery.data && profitQuery.data.data.length > 0 ? (
            <View className="space-y-2">
              {profitQuery.data.data.map((point, i) => (
                <View key={i} className="flex-row items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <Text className="font-medium text-gray-900">{point.date.split("T")[0].slice(5)}</Text>
                  <View className="flex-row gap-3">
                    <Text className="text-green-700 font-bold">{formatCurrency(Number(point.profit))}</Text>
                    <Text className="text-blue-700 font-bold">{Number(point.margin).toFixed(1)}%</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : <View className="items-center py-8"><Text className="text-gray-500">No profit data</Text></View>}
        </CardContent></Card>

        <Card className="mb-4"><CardHeader><CardTitle>Category Performance</CardTitle></CardHeader><CardContent>
          {categoryQuery.isLoading ? <Loading /> : categoryQuery.data && categoryQuery.data.categories.length > 0 ? (
            <View className="space-y-3">
              {categoryQuery.data.categories.map((cat, i) => (
                <View key={i} className="space-y-1">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-medium text-gray-900">{cat.name}</Text>
                    <View className="flex-row items-center gap-2">
                      <Text className="font-bold text-gray-900">{formatCurrency(Number(cat.revenue))}</Text>
                      <Text className="text-xs text-gray-500">({Number(cat.percentage).toFixed(1)}%)</Text>
                      <Text className={`text-xs font-bold ${cat.trend === "up" ? "text-green-700" : cat.trend === "down" ? "text-red-700" : "text-gray-500"}`}>{cat.trend.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={{ height: 8, backgroundColor: "#e5e7eb", borderRadius: 4 }}>
                    <View style={{ height: 8, width: `${Math.min(Number(cat.percentage), 100)}%`, backgroundColor: "#006b5f", borderRadius: 4 }} />
                  </View>
                </View>
              ))}
            </View>
          ) : <View className="items-center py-8"><Text className="text-gray-500">No category data</Text></View>}
        </CardContent></Card>

        <Card className="mb-4"><CardHeader><CardTitle>Customer Segments</CardTitle></CardHeader><CardContent>
          {customerQuery.isLoading ? <Loading /> : customerQuery.data && customerQuery.data.segments.length > 0 ? (
            <View className="space-y-3">
              {customerQuery.data.segments.map((seg, i) => (
                <View key={i} className="p-3 bg-gray-50 rounded-lg">
                  <View className="flex-row justify-between">
                    <Text className="font-bold text-gray-900">{seg.segment}</Text>
                    <Text className="text-sm text-gray-500">{seg.count} customers</Text>
                  </View>
                  <View className="flex-row gap-4 mt-1">
                    <Text className={`text-sm font-bold ${Number(seg.growth) >= 0 ? "text-green-700" : "text-red-700"}`}>{Number(seg.growth) >= 0 ? "+" : ""}{Number(seg.growth).toFixed(1)}% growth</Text>
                    <Text className="text-sm text-gray-700">AOV: {formatCurrency(Number(seg.avgOrderValue))}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : <View className="items-center py-8"><Text className="text-gray-500">No customer data</Text></View>}
        </CardContent></Card>
      </ScrollView>
    </View>
  );
}