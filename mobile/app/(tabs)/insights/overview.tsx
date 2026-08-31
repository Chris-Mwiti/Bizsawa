import React, { useState, useEffect, useMemo } from "react";
import { ScrollView, View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { TrendingUp, Target, Lightbulb, Receipt, DollarSign } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Progress } from "../../../components/ui/Progress";
import { useAnalytics } from "../../../hooks/api/useAnalytics";
import { useExpenses } from "../../../hooks/api/useExpenses";
import { TAB_BAR_SCROLL_PADDING } from "../../../constants/tabBar";
import { toNumber } from "../../../lib/api-dtos";

export default function InsightsOverview() {
  const params = useLocalSearchParams<{ tab?: string; action?: string }>();
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseType, setExpenseType] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  useEffect(() => {
    if (params.action === "new-expense") setShowExpenseModal(true);
  }, [params.action]);

  const { weeklyOverview, isOverviewLoading, isBusinessLoading, hasBusiness, categoryPerformance, isCategoriesLoading, aiInsights, fetchAIInsights, isAIInsightsLoading, aiInsightsError } = useAnalytics();
  const { expenses, isLoading: expensesLoading, createExpense, isCreating: isCreatingExpense } = useExpenses();

  const weeklyRevenue = weeklyOverview.reduce((sum, day) => sum + day.sales, 0);
  const weeklyExpenses = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
  const weeklyProfit = weeklyRevenue - weeklyExpenses;
  const profitMargin = weeklyRevenue > 0 ? (weeklyProfit / weeklyRevenue) * 100 : 0;
  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
  const topCategories = useMemo(() => categoryPerformance.sales.sort((a,b) => b.value - a.value).slice(0,5), [categoryPerformance.sales]);
  const expenseCategories = useMemo(() => {
    const m = new Map<string, number>();
    expenses.forEach(e => m.set(e.category, (m.get(e.category)||0) + toNumber(e.amount)));
    return Array.from(m.entries()).map(([category, amount]) => ({ category, amount })).sort((a,b) => b.amount - a.amount).slice(0,5);
  }, [expenses]);

  const handleExpenseSubmit = async () => {
    if (!expenseType || !expenseAmount) { Alert.alert("Error", "Please fill all required fields"); return; }
    try { await createExpense({ category: expenseType, description: expenseDescription, amount: expenseAmount, spentAt: new Date().toISOString() });
      setShowExpenseModal(false); setExpenseType(""); setExpenseDescription(""); setExpenseAmount("");
    } catch (e: any) { Alert.alert("Error", e.friendlyMessage || "Failed to create expense"); }
  };

  if (isBusinessLoading) {
    return <View className="flex-1 bg-gray-50 items-center justify-center px-6"><ActivityIndicator size="large" color="#111827" /><Text className="text-sm text-gray-500 mt-3">Loading business context…</Text></View>;
  }
  if (!hasBusiness) {
    return <View className="flex-1 bg-gray-50 items-center justify-center px-6"><View className="w-14 h-14 rounded-full bg-amber-100 items-center justify-center mb-3"><Receipt size={22} color="#b45309" /></View><Text className="font-bold text-gray-900 text-center">No business selected</Text><Text className="text-sm text-gray-500 text-center mt-1">Create or select a business to view insights. This avoids the 403.</Text></View>;
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:TAB_BAR_SCROLL_PADDING+20}} showsVerticalScrollIndicator={false}>
        <View className="grid grid-cols-2 gap-4 mb-4">
          <Card className="bg-white p-4"><View className="flex-row justify-between items-start"><View><Text className="text-sm text-gray-500 mb-1">Weekly Revenue</Text><Text className="text-2xl font-bold text-primary-700">{formatCurrency(weeklyRevenue)}</Text></View><View className="w-12 h-12 rounded-full bg-primary-100 items-center justify-center"><DollarSign size={24} color="#006b5f" /></View></View></Card>
          <Card className="bg-white p-4"><View className="flex-row justify-between items-start"><View><Text className="text-sm text-gray-500 mb-1">Weekly Expenses</Text><Text className="text-2xl font-bold text-red-600">{formatCurrency(weeklyExpenses)}</Text></View><View className="w-12 h-12 rounded-full bg-red-100 items-center justify-center"><Receipt size={24} color="#ef4444" /></View></View></Card>
          <Card className="bg-white p-4"><View className="flex-row justify-between items-start"><View><Text className="text-sm text-gray-500 mb-1">Weekly Profit</Text><Text className="text-2xl font-bold text-green-700">{formatCurrency(weeklyProfit)}</Text></View><View className="w-12 h-12 rounded-full bg-green-100 items-center justify-center"><TrendingUp size={24} color="#16a34a" /></View></View></Card>
          <Card className="bg-white p-4"><View className="flex-row justify-between items-start"><View><Text className="text-sm text-gray-500 mb-1">Profit Margin</Text><Text className="text-2xl font-bold text-blue-700">{profitMargin.toFixed(1)}%</Text></View><View className="w-12 h-12 rounded-full bg-blue-100 items-center justify-center"><Target size={24} color="#2563eb" /></View></View></Card>
        </View>
        <Card className="mb-4"><CardHeader><CardTitle>Revenue Trend</CardTitle></CardHeader><CardContent>
          {isOverviewLoading ? <View className="items-center py-8"><ActivityIndicator size="small" color="#006b5f" /><Text className="text-gray-500 mt-2">Loading...</Text></View> : (
            <View className="h-48 flex-row items-end justify-around">
              {weeklyOverview.map((day,i) => { const max=Math.max(...weeklyOverview.map(d=>d.sales)); const h=max>0?(day.sales/max)*100:0; return <View key={i} className="flex-1 flex-col items-center justify-end px-2"><View style={{width:"100%",height:`${h}%`,minHeight:4,backgroundColor:"#006b5f",borderRadius:4}}/><Text className="text-xs text-gray-500 mt-2 text-center">{day.day}</Text></View>; })}
            </View>
          )}
        </CardContent></Card>
        <Card className="mb-4"><CardHeader><CardTitle>Top Categories</CardTitle></CardHeader><CardContent>
          {isCategoriesLoading ? <View className="items-center py-8"><ActivityIndicator size="small" color="#006b5f" /><Text className="text-gray-500 mt-2">Loading...</Text></View> : (
            <View className="space-y-3">{topCategories.map((cat,i) => <View key={i} className="flex-row items-center justify-between"><Text className="font-medium text-gray-900">{cat.name}</Text><Text className="font-bold text-gray-900">{formatCurrency(cat.value)}</Text></View>)}</View>
          )}
        </CardContent></Card>
        <Card className="mb-4"><CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader><CardContent>
          {expensesLoading ? <View className="items-center py-8"><ActivityIndicator size="small" color="#006b5f" /><Text className="text-gray-500 mt-2">Loading...</Text></View> : (
            <View className="space-y-3">{expenseCategories.map((cat,i) => <View key={i} className="flex-row items-center justify-between"><Text className="font-medium text-gray-900">{cat.category}</Text><Text className="font-bold text-red-600">{formatCurrency(cat.amount)}</Text></View>)}</View>
          )}
        </CardContent></Card>
        <Card className="mb-4 border-blue-200 bg-blue-50"><CardHeader className="bg-blue-50"><CardTitle className="text-blue-900 flex-row items-center"><Lightbulb size={20} color="#2563eb" className="mr-2" /> AI Business Insights</CardTitle></CardHeader><CardContent>
          {isAIInsightsLoading ? <View className="flex-row items-center py-2"><ActivityIndicator size="small" color="#2563eb" /><Text className="text-sm text-blue-900 ml-2">Loading AI summary…</Text></View> :
          aiInsightsError ? <View><Text className="text-sm text-red-700 mb-2">{aiInsightsError}</Text><TouchableOpacity onPress={()=>fetchAIInsights()} className="self-start px-3 py-2 bg-blue-600 rounded-lg"><Text className="text-white text-xs font-bold">Retry</Text></TouchableOpacity></View> :
          aiInsights?.summary ? <View><Text className="text-sm text-blue-900 mb-4">{aiInsights.summary}</Text><TouchableOpacity onPress={()=>setShowExpenseModal(true)}><Text className="text-blue-600 text-xs font-bold underline">View Recommendations</Text></TouchableOpacity></View> :
          <View><Text className="text-sm text-blue-900 mb-2">No AI summary yet.</Text><TouchableOpacity onPress={()=>fetchAIInsights()} className="self-start px-3 py-2 bg-blue-600 rounded-lg"><Text className="text-white text-xs font-bold">Generate Insights</Text></TouchableOpacity></View>}
        </CardContent></Card>
        <Card className="mb-4"><CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader><CardContent>
          <View className="grid grid-cols-2 gap-3">
            <TouchableOpacity className="p-4 bg-primary-50 border border-primary-200 rounded-lg items-center" onPress={()=>setShowExpenseModal(true)}><Receipt size={28} color="#006b5f" /><Text className="text-sm font-bold text-primary-800 mt-2 text-center">Add Expense</Text></TouchableOpacity>
            <TouchableOpacity className="p-4 bg-green-50 border border-green-200 rounded-lg items-center"><TrendingUp size={28} color="#16a34a" /><Text className="text-sm font-bold text-green-800 mt-2 text-center">Predict Sales</Text></TouchableOpacity>
            <TouchableOpacity className="p-4 bg-blue-50 border border-blue-200 rounded-lg items-center" onPress={()=>fetchAIInsights()}><Lightbulb size={28} color="#2563eb" /><Text className="text-sm font-bold text-blue-800 mt-2 text-center">AI Insights</Text></TouchableOpacity>
          </View>
        </CardContent></Card>
      </ScrollView>
      <Modal visible={showExpenseModal} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-gray-50"><View className="flex-row justify-between items-center p-4 bg-white border-b border-gray-200"><Text className="text-lg font-bold text-primary-800">Add Expense</Text><TouchableOpacity onPress={()=>setShowExpenseModal(false)}><Text className="text-gray-500 font-bold text-lg">X</Text></TouchableOpacity></View>
        <ScrollView contentContainerStyle={{padding:16}}><View className="space-y-4">
          <View><Text className="text-sm font-medium text-gray-700 mb-1">Category *</Text><TextInput className="border border-gray-300 rounded-lg px-4 py-3 bg-white" placeholder="e.g., Feed, Rent, Utilities" value={expenseType} onChangeText={setExpenseType}/></View>
          <View><Text className="text-sm font-medium text-gray-700 mb-1">Description</Text><TextInput className="border border-gray-300 rounded-lg px-4 py-3 bg-white" placeholder="Optional" value={expenseDescription} onChangeText={setExpenseDescription}/></View>
          <View><Text className="text-sm font-medium text-gray-700 mb-1">Amount (KES) *</Text><TextInput className="border border-gray-300 rounded-lg px-4 py-3 bg-white" placeholder="0.00" keyboardType="numeric" value={expenseAmount} onChangeText={setExpenseAmount}/></View>
          <TouchableOpacity className="mt-6 bg-primary-600 py-3 rounded-lg items-center" onPress={handleExpenseSubmit} disabled={isCreatingExpense}><Text className="text-white font-bold">{isCreatingExpense?"Adding...":"Add Expense"}</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}