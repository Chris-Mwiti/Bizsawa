import React, { useState, useEffect, useMemo } from "react";
import { ScrollView, View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert, Pressable } from "react-native";
import { TrendingUp, Receipt, DollarSign, Target, BarChart3, PieChart as PieIcon } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/Card";
import { useAnalytics } from "../../../hooks/api/useAnalytics";
import { useExpenses } from "../../../hooks/api/useExpenses";
import { TAB_BAR_SCROLL_PADDING } from "../../../constants/tabBar";
import { toNumber } from "../../../lib/api-dtos";
import { useLocalSearchParams } from "expo-router";
import { BarChart, SwitchableLineCard, PieChart } from "../../../components/charts/AnalyticsCharts";

export default function InsightsOverview() {
  const params = useLocalSearchParams<{ action?: string }>();
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseType, setExpenseType] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  useEffect(() => { if (params.action === "new-expense") setShowExpenseModal(true); }, [params.action]);

  const {
    weeklyOverview,
    isOverviewLoading,
    isBusinessLoading,
    hasBusiness,
    categoryPerformance,
    isCategoriesLoading,
    aiInsights,
    fetchAIInsights,
    isAIInsightsLoading,
    getRevenueAnalytics,
    getProfitAnalytics,
    getCategoryAnalytics,
  } = useAnalytics();
  const { expenses, isLoading: expensesLoading, createExpense, isCreating: isCreatingExpense } = useExpenses();
  const { data: revenueWeek } = getRevenueAnalytics("week");
  const { data: profitWeek } = getProfitAnalytics("week");
  const { data: categoryWeek } = getCategoryAnalytics("week");

  const weeklyRevenue = weeklyOverview.reduce((sum, d) => sum + d.sales, 0);
  const weeklyExpenses = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
  const weeklyProfit = weeklyRevenue - weeklyExpenses;
  const profitMargin = weeklyRevenue > 0 ? (weeklyProfit / weeklyRevenue) * 100 : 0;
  const formatCurrency = (a: number) => `KES ${a.toLocaleString("en-KE")}`;
  const topCategories = useMemo(() => categoryPerformance.sales.slice().sort((a, b) => b.value - a.value).slice(0, 5), [categoryPerformance.sales]);
  const expenseCategories = useMemo(() => {
    const m = new Map<string, number>();
    expenses.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + toNumber(e.amount)));
    return Array.from(m.entries()).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [expenses]);

  const handleExpenseSubmit = async () => {
    if (!expenseType.trim() || !expenseAmount.trim()) return Alert.alert("Validation", "Category and amount required");
    const amt = Number(expenseAmount);
    if (!Number.isFinite(amt) || amt <= 0) return Alert.alert("Validation", "Enter valid amount");
    try {
      await createExpense({ category: expenseType.trim(), description: expenseDescription.trim() || undefined, amount: expenseAmount.trim(), spentAt: new Date().toISOString() });
      setShowExpenseModal(false); setExpenseType(""); setExpenseDescription(""); setExpenseAmount("");
      Alert.alert("Success", "Expense added");
    } catch (e: any) { Alert.alert("Error", e.friendlyMessage || "Failed"); }
  };

  if (isBusinessLoading) return <View className="flex-1 bg-gray-50 items-center justify-center px-6"><ActivityIndicator color="#111827" /><Text className="text-sm text-gray-500 mt-2">Loading business…</Text></View>;
  if (!hasBusiness) return <View className="flex-1 bg-gray-50 items-center justify-center px-6"><Text className="font-bold text-gray-900">No business selected</Text><Text className="text-sm text-gray-500 mt-1">Create or select a business to see overview.</Text></View>;

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING + 24, gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* Metrics — restrained */}
        <View className="flex-row gap-3 flex-wrap">
          {[
            { label: "Weekly revenue", value: formatCurrency(weeklyRevenue), icon: DollarSign },
            { label: "Weekly expenses", value: formatCurrency(weeklyExpenses), icon: Receipt, tint: "text-red-700" },
            { label: "Weekly profit", value: formatCurrency(weeklyProfit), icon: TrendingUp, tint: "text-emerald-700" },
            { label: "Margin", value: `${profitMargin.toFixed(1)}%`, icon: Target },
          ].map((m) => (
            <View key={m.label} className="w-[48%]">
              <Card className="border border-gray-200">
                <CardContent className="p-4">
                  <View className="flex-row justify-between items-start mb-2">
                    <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">{m.label}</Text>
                    <View className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 items-center justify-center">
                      <m.icon size={14} color="#6b7280" />
                    </View>
                  </View>
                  <Text className={`text-lg font-bold tracking-tight ${m.tint || "text-gray-900"}`} numberOfLines={1}>{m.value}</Text>
                </CardContent>
              </Card>
            </View>
          ))}
        </View>

        {/* Day sales — Bar chart */}
        <Card className="border border-gray-200">
          <CardHeader className="flex-row items-center gap-2">
            <BarChart3 size={16} color="#111827" />
            <CardTitle>Day sales • week</CardTitle>
            <Text className="ml-auto text-xs text-gray-400">bar • units</Text>
          </CardHeader>
          <CardContent className="pt-0">
            {isOverviewLoading ? (
              <View className="items-center py-8"><ActivityIndicator color="#111827" /><Text className="text-xs text-gray-500 mt-2">Loading…</Text></View>
            ) : weeklyOverview.length ? (
              <BarChart data={weeklyOverview.map((d) => ({ label: d.day.slice(0, 3), value: d.sales }))} color="#111827" height={130} showValues />
            ) : (
              <Text className="text-sm text-gray-500 py-6 text-center">No sales this week</Text>
            )}
          </CardContent>
        </Card>

        {/* Revenue / Profit bars */}
        <View className="flex-row gap-3">
          <Card className="flex-1 border border-gray-200">
            <CardHeader><CardTitle>Revenue • week</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {revenueWeek?.data?.length ? (
                <BarChart data={revenueWeek.data.slice(-7).map((p) => ({ label: String(p.date).slice(5, 10), value: Number(p.revenue) }))} color="#0f766e" height={110} />
              ) : (
                <Text className="text-xs text-gray-500 py-4 text-center">No revenue</Text>
              )}
            </CardContent>
          </Card>
          <Card className="flex-1 border border-gray-200">
            <CardHeader><CardTitle>Profit • week</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {profitWeek?.data?.length ? (
                <BarChart data={profitWeek.data.slice(-7).map((p) => ({ label: String(p.date).slice(5, 10), value: Number(p.profit) }))} color="#1d4ed8" height={110} />
              ) : (
                <Text className="text-xs text-gray-500 py-4 text-center">No profit</Text>
              )}
            </CardContent>
          </Card>
        </View>

        {/* Switchable line — sales / revenue / profit + margin */}
        <Card className="border border-gray-200">
          <CardHeader><CardTitle>Trend • switch metric</CardTitle><Text className="text-xs text-gray-500">sales / revenue / profit — one line</Text></CardHeader>
          <CardContent className="pt-0">
            {isOverviewLoading ? (
              <View className="items-center py-8"><ActivityIndicator color="#111827" /></View>
            ) : (
              <SwitchableLineCard
                sales={weeklyOverview.map((d) => ({ label: d.day.slice(0, 3), value: d.sales }))}
                revenue={(revenueWeek?.data || []).slice(-7).map((p: any) => ({ label: String(p.date).slice(5, 10), value: Number(p.revenue) }))}
                profit={(profitWeek?.data || []).slice(-7).map((p: any) => ({ label: String(p.date).slice(5, 10), value: Number(p.profit) }))}
              />
            )}
          </CardContent>
        </Card>

        {/* Profit margin line explicit */}
        {profitWeek?.data?.length ? (
          <Card className="border border-gray-200">
            <CardHeader><CardTitle>Profit margin • week</CardTitle><Text className="text-xs text-gray-500">margin % line</Text></CardHeader>
            <CardContent className="pt-0">
              <BarChart data={profitWeek.data.slice(-7).map((p: any) => ({ label: String(p.date).slice(5, 10), value: Number(p.margin) }))} color="#7c3aed" height={110} showValues />
            </CardContent>
          </Card>
        ) : null}

        <Card className="border border-gray-200">
          <CardHeader className="flex-row items-center gap-2">
            <PieIcon size={16} color="#111827" />
            <CardTitle>Category sales • pie</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isCategoriesLoading ? (
              <View className="items-center py-6"><ActivityIndicator color="#111827" /></View>
            ) : (categoryWeek?.categories?.length || topCategories.length) ? (
              <PieChart
                data={(categoryWeek?.categories?.length ? categoryWeek.categories : topCategories).slice(0, 6).map((c: any) => ({
                  name: c.name || c.category,
                  value: c.revenue ?? c.value ?? c.amount ?? 0,
                }))}
                size={170}
              />
            ) : (
              <Text className="text-sm text-gray-500 py-4 text-center">No category data yet</Text>
            )}
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader><CardTitle>Top categories • list</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {isCategoriesLoading ? (
              <View className="items-center py-6"><ActivityIndicator color="#111827" /></View>
            ) : topCategories.length ? (
              <View className="gap-3">
                {topCategories.map((cat, i) => (
                  <View key={i} className="flex-row justify-between items-center">
                    <View className="flex-1 pr-3"><Text className="text-sm font-semibold text-gray-900">{cat.name}</Text><Text className="text-xs text-gray-500">sales</Text></View>
                    <Text className="text-sm font-bold text-gray-900">{formatCurrency(cat.value)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-gray-500 py-4 text-center">No category data yet</Text>
            )}
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader><CardTitle>Expense breakdown</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {expensesLoading ? (
              <View className="items-center py-6"><ActivityIndicator color="#111827" /></View>
            ) : expenseCategories.length ? (
              <View className="gap-2.5">
                {expenseCategories.map((cat) => (
                  <View key={cat.category} className="flex-row justify-between items-center p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <Text className="text-sm font-medium text-gray-900">{cat.category}</Text>
                    <Text className="text-sm font-bold text-red-700">{formatCurrency(cat.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-gray-500 py-4 text-center">No expenses breakdown</Text>
            )}
          </CardContent>
        </Card>

        <Card className="border border-gray-200 bg-white">
          <CardHeader className="flex-row items-center gap-2">
            <View className="w-7 h-7 rounded-full bg-gray-900 items-center justify-center"><Text className="text-white text-[10px] font-bold">AI</Text></View>
            <CardTitle>AI Insights</CardTitle>
            <Pressable onPress={() => fetchAIInsights()} className="ml-auto px-3 py-1.5 rounded-full bg-white border border-gray-200"><Text className="text-xs font-bold text-gray-700">Refresh</Text></Pressable>
          </CardHeader>
          <CardContent className="pt-0">
            {isAIInsightsLoading ? (
              <View className="flex-row items-center gap-2 py-2"><ActivityIndicator size="small" color="#111827" /><Text className="text-sm text-gray-500">Loading…</Text></View>
            ) : aiInsights?.summary ? (
              <Text className="text-sm leading-5 text-gray-700">{aiInsights.summary}</Text>
            ) : (
              <View><Text className="text-sm text-gray-600">No summary yet.</Text><TouchableOpacity onPress={() => fetchAIInsights()} className="self-start mt-3 px-3 py-2 bg-gray-900 rounded-full"><Text className="text-white text-xs font-bold">Generate</Text></TouchableOpacity></View>
            )}
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
          <CardContent className="pt-0 flex-row gap-3">
            <TouchableOpacity onPress={() => setShowExpenseModal(true)} className="flex-1 p-3.5 rounded-xl bg-gray-900 flex-row items-center justify-center gap-2">
              <Receipt size={16} color="white" /><Text className="text-sm font-bold text-white">Add Expense</Text>
            </TouchableOpacity>
            <View className="flex-1 p-3.5 rounded-xl bg-white border border-gray-200 items-center justify-center">
              <Text className="text-xs font-bold tracking-widest text-gray-400 uppercase">Profit</Text>
              <Text className="text-sm font-bold text-gray-900 mt-1">{profitMargin.toFixed(1)}% margin</Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>

      <Modal visible={showExpenseModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowExpenseModal(false)}>
        <View className="flex-1 bg-gray-50">
          <View className="flex-row justify-between items-center p-4 bg-white border-b border-gray-200">
            <Text className="text-lg font-bold text-gray-900">Add Expense</Text>
            <Pressable onPress={() => setShowExpenseModal(false)} className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"><Text className="font-bold">✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View><Text className="text-sm font-semibold text-gray-700 mb-2">Category *</Text><TextInput className="border border-gray-300 rounded-xl px-4 py-3.5 bg-white text-sm" placeholder="e.g., Feed, Rent" value={expenseType} onChangeText={setExpenseType} /></View>
            <View><Text className="text-sm font-semibold text-gray-700 mb-2">Description</Text><TextInput className="border border-gray-300 rounded-xl px-4 py-3.5 bg-white text-sm" placeholder="Optional" value={expenseDescription} onChangeText={setExpenseDescription} /></View>
            <View><Text className="text-sm font-semibold text-gray-700 mb-2">Amount *</Text><TextInput className="border border-gray-300 rounded-xl px-4 py-3.5 bg-white text-sm" placeholder="0.00" keyboardType="numeric" value={expenseAmount} onChangeText={setExpenseAmount} /></View>
            <TouchableOpacity className="bg-gray-900 py-4 rounded-xl items-center mt-2" onPress={handleExpenseSubmit} disabled={isCreatingExpense}>{isCreatingExpense ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Save</Text>}</TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
