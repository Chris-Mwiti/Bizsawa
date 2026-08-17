import React, { useState, useEffect, useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Lightbulb,
  Edit2,
  Plus,
  Receipt,
  Download,
  DollarSign,
  Users,
  PieChart as PieChartIcon,
  Activity,
} from "lucide-react-native";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/Progress";
import { useAnalytics } from "../../hooks/api/useAnalytics";
import { useExpenses } from "../../hooks/api/useExpenses";
import { TAB_BAR_SCROLL_PADDING } from "../../constants/tabBar";

export default function InsightsTab() {
  const params = useLocalSearchParams<{ tab?: string; action?: string }>();
  const [activeTab, setActiveTab] = useState<
    "overview" | "analytics" | "expenses"
  >("overview");
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseType, setExpenseType] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  useEffect(() => {
    const raw = params.tab;
    const t = Array.isArray(raw) ? raw[0] : raw;
    if (t === "overview" || t === "analytics" || t === "expenses") {
      setActiveTab(t);
    }
    
    if (params.action === "new-expense") {
      setShowExpenseModal(true);
    }
  }, [params.tab, params.action]);

  // API hooks
  const {
    weeklyOverview,
    isOverviewLoading,
    categoryPerformance,
    isCategoriesLoading,
    aiInsights,
    fetchAIInsights,
    isAIInsightsLoading,
    aiInsightsError,
  } = useAnalytics();
  const {
    expenses,
    isLoading: expensesLoading,
    createExpense,
    isCreating: isCreatingExpense,
  } = useExpenses();

  // Default goals (will be replaced with API later)
  const defaultGoals = [
    {
      id: 1,
      title: "Monthly Feed Sales Target",
      current: 450000,
      target: 600000,
      unit: "KES",
    },
    {
      id: 2,
      title: "New Farmer Customers",
      current: 23,
      target: 30,
      unit: "farmers",
    },
    {
      id: 3,
      title: "Feed Inventory Turnover",
      current: 2.3,
      target: 3.0,
      unit: "times",
    },
  ];
  const [goals, setGoals] = useState(defaultGoals);

  // Map category performance from API
  const productCategories = useMemo(() => {
    const sales = categoryPerformance.sales;
    const total = sales.reduce((sum, c) => sum + c.value, 0);
    if (total <= 0) return [];
    return sales.map((cat, i) => ({
      name: cat.name,
      value: Math.round((cat.value / total) * 100),
      color: ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088fe"][i % 5],
    }));
  }, [categoryPerformance.sales]);

  // Calculate weekly performance from overview
  const weeklyRevenue = weeklyOverview.reduce((sum, day) => sum + day.sales, 0);
  const weeklyTransactions = weeklyOverview.length;

  // Customer segments (derived from sales data - simplified for now)
  const customerSegments = [
    {
      segment: "Regular Farmers",
      count: 156,
      growth: 12,
      color: "text-green-600",
    },
    { segment: "New Farmers", count: 23, growth: 8, color: "text-blue-600" },
    {
      segment: "Large-Scale Farms",
      count: 67,
      growth: -3,
      color: "text-orange-600",
    },
  ];

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString("en-KE")}`;

  return (
    <View className="flex-1 bg-gray-50">
      <View className="px-4 pt-4">
        <View className="items-center mb-4">
          <Text className="text-xl font-bold text-gray-900">
            Business Insights
          </Text>
          <Text className="text-sm text-gray-500">
            Analytics & performance insights
          </Text>
        </View>

        <View className="flex-row bg-gray-200 rounded-lg mb-2 w-full">
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg items-center ${activeTab === "overview" ? "bg-white shadow" : ""}`}
            onPress={() => setActiveTab("overview")}
          >
            <Text
              className={`font-medium ${activeTab === "overview" ? "text-gray-900" : "text-gray-500"}`}
            >
              Overview
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg items-center ${activeTab === "analytics" ? "bg-white shadow" : ""}`}
            onPress={() => setActiveTab("analytics")}
          >
            <Text
              className={`font-medium ${activeTab === "analytics" ? "text-gray-900" : "text-gray-500"}`}
            >
              Analytics
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg items-center ${activeTab === "expenses" ? "bg-white shadow" : ""}`}
            onPress={() => setActiveTab("expenses")}
          >
            <Text
              className={`font-medium ${activeTab === "expenses" ? "text-gray-900" : "text-gray-500"}`}
            >
              Expenses
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: TAB_BAR_SCROLL_PADDING,
        }}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
      >
        {activeTab === "overview" && (
          <View>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>
                  <View className="flex-row items-center">
                    <View className="mr-2">
                      <Target size={16} color="#374151" />
                    </View>
                    <Text className="font-bold">Monthly Goals</Text>
                  </View>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {goals.map((goal) => {
                  const percentage = Math.min(
                    (goal.current / goal.target) * 100,
                    100,
                  );
                  return (
                    <View key={goal.id} className="mb-3">
                      <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-sm font-medium">
                          {goal.title}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          {goal.unit === "KES"
                            ? formatCurrency(goal.current)
                            : `${goal.current} ${goal.unit}`}{" "}
                          /{" "}
                          {goal.unit === "KES"
                            ? formatCurrency(goal.target)
                            : `${goal.target} ${goal.unit}`}
                        </Text>
                      </View>
                      <Progress value={percentage} className="my-1" />
                      <Text className="text-[10px] text-gray-400">
                        {percentage.toFixed(1)}% complete
                      </Text>
                    </View>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle>
                  <View className="flex-row items-center">
                    <View className="mr-2">
                      <Lightbulb size={16} color="#eab308" />
                    </View>
                    <Text className="font-bold">AI Strategic Analysis</Text>
                  </View>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <View className="flex-row justify-between mb-3">
                  <TouchableOpacity
                    onPress={() => {
                      setShowPredictionModal(true);
                      fetchAIInsights();
                    }}
                    className="flex-1 mr-2 p-3 border border-blue-200 rounded-lg bg-blue-50 items-center justify-center"
                  >
                    <View className="mb-2">
                      <TrendingUp size={24} color="#2563eb" />
                    </View>
                    <Text className="text-blue-700 font-bold text-center text-sm">
                      Market Trends
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setShowPricingModal(true);
                      fetchAIInsights();
                    }}
                    className="flex-1 ml-2 p-3 border border-primary-200 rounded-lg bg-primary-50 items-center justify-center"
                  >
                    <View className="mb-2">
                      <Lightbulb size={24} color="#006b5f" />
                    </View>
                    <Text className="text-primary-700 font-bold text-center text-sm">
                      Smart Advice
                    </Text>
                  </TouchableOpacity>
                </View>
              </CardContent>
            </Card>

            <Card className="bg-green-50 border-green-200 mb-4">
              <CardHeader>
                <CardTitle>
                  <View className="flex-row items-center">
                    <View className="mr-2">
                      <Activity size={16} color="#16a34a" />
                    </View>
                    <Text className="font-bold text-green-800">
                      This Week's Performance
                    </Text>
                  </View>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <View className="min-h-[72px] justify-center">
                  {isOverviewLoading ? (
                    <ActivityIndicator size="small" color="#16a34a" />
                  ) : (
                    <View className="flex-row justify-between text-center pb-2">
                      <View className="items-center flex-1">
                        <Text className="text-xs text-gray-500 mb-1">
                          Revenue
                        </Text>
                        <Text className="text-lg font-bold text-green-700">
                          {formatCurrency(weeklyRevenue)}
                        </Text>
                        <Text className="text-[10px] text-green-600 font-medium">
                          This week
                        </Text>
                      </View>
                      <View className="items-center flex-1">
                        <Text className="text-xs text-gray-500 mb-1">
                          Transactions
                        </Text>
                        <Text className="text-lg font-bold text-blue-700">
                          {weeklyTransactions}
                        </Text>
                        <Text className="text-[10px] text-blue-600 font-medium">
                          This week
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </CardContent>
            </Card>
          </View>
        )}

        {activeTab === "analytics" && (
          <View>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>
                  <View className="flex-row items-center">
                    <View className="mr-2">
                      <PieChartIcon size={16} color="#374151" />
                    </View>
                    <Text className="font-bold">Product Categories</Text>
                  </View>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <View className="min-h-[40px]">
                  {isCategoriesLoading ? (
                    <ActivityIndicator size="small" color="#374151" />
                  ) : productCategories.length === 0 ? (
                    <Text className="text-sm text-gray-500">
                      No category sales data yet.
                    </Text>
                  ) : (
                    productCategories.map((cat, i) => (
                      <View
                        key={i}
                        className="flex-row justify-between items-center mb-2"
                      >
                        <View className="flex-row items-center">
                          <View
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: cat.color }}
                          />
                          <Text className="text-sm font-medium">{cat.name}</Text>
                        </View>
                        <Text className="text-sm font-bold">{cat.value}%</Text>
                      </View>
                    ))
                  )}
                </View>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle>
                  <View className="flex-row items-center">
                    <View className="mr-2">
                      <Users size={16} color="#374151" />
                    </View>
                    <Text className="font-bold">Customer Segments</Text>
                  </View>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customerSegments.map((segment, i) => (
                  <View
                    key={i}
                    className="flex-row justify-between items-center mb-3"
                  >
                    <View>
                      <Text className="font-medium">{segment.segment}</Text>
                      <Text className="text-xs text-gray-500">
                        {segment.count} customers
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text
                        className={`font-bold ${segment.growth > 0 ? "text-green-600" : "text-red-500"}`}
                      >
                        {segment.growth > 0 ? "+" : ""}
                        {segment.growth}%
                      </Text>
                    </View>
                  </View>
                ))}
              </CardContent>
            </Card>
          </View>
        )}

        {activeTab === "expenses" && (
          <View>
            <Card className="mb-4">
              <CardContent className="p-8 items-center min-h-[160px] justify-center">
                {expensesLoading ? (
                  <ActivityIndicator size="small" color="#9ca3af" />
                ) : expenses.length === 0 ? (
                  <>
                    <View className="mb-4">
                      <Receipt size={40} color="#9ca3af" />
                    </View>
                    <Text className="text-gray-500 font-medium">
                      No expenses recorded yet
                    </Text>
                    <TouchableOpacity
                      className="mt-4 bg-gray-900 py-3 px-6 rounded-lg flex-row items-center"
                      onPress={() => setShowExpenseModal(true)}
                      activeOpacity={0.85}
                    >
                      <View className="mr-2">
                        <Plus size={16} color="white" />
                      </View>
                      <Text className="text-white font-bold">Add Expense</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View className="w-full items-stretch p-0 -m-2">
                    <View className="flex-row items-center mb-4 px-2">
                      <View className="mr-2">
                        <Receipt size={16} color="#374151" />
                      </View>
                      <Text className="font-bold text-base text-gray-900">
                        Recent Expenses
                      </Text>
                    </View>
                    {expenses.slice(0, 5).map((expense) => (
                      <View
                        key={expense.id}
                        className="flex-row justify-between items-center mb-3 p-3 bg-gray-100 rounded-lg"
                      >
                        <View className="flex-1">
                          <Text className="font-bold text-gray-900">
                            {expense.type}
                          </Text>
                          <Text className="text-xs text-gray-600">
                            {expense.description || "No description"}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="font-bold text-gray-900">
                            {formatCurrency(expense.amount)}
                          </Text>
                          <Text className="text-[10px] text-gray-500">
                            {new Date(expense.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </CardContent>
            </Card>
          </View>
        )}
      </ScrollView>

      {/* Add expense */}
      <Modal
        visible={showExpenseModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowExpenseModal(false)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-2xl p-4 pb-8">
            <Text className="text-lg font-bold text-gray-900 mb-4">Add expense</Text>
            <Text className="text-xs text-gray-500 mb-1">Type</Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-3 py-2 mb-3 text-gray-900"
              placeholder="e.g. Rent, Transport"
              value={expenseType}
              onChangeText={setExpenseType}
            />
            <Text className="text-xs text-gray-500 mb-1">Description (optional)</Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-3 py-2 mb-3 text-gray-900"
              placeholder="Notes"
              value={expenseDescription}
              onChangeText={setExpenseDescription}
            />
            <Text className="text-xs text-gray-500 mb-1">Amount (KES)</Text>
            <TextInput
              className="border border-gray-200 rounded-lg px-3 py-2 mb-4 text-gray-900"
              placeholder="0"
              keyboardType="numeric"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-3 rounded-lg bg-gray-100 items-center"
                onPress={() => setShowExpenseModal(false)}
              >
                <Text className="font-medium text-gray-800">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 rounded-lg bg-gray-900 items-center"
                disabled={isCreatingExpense}
                onPress={async () => {
                  const amt = Math.round(Number.parseFloat(expenseAmount));
                  if (!expenseType.trim() || !Number.isFinite(amt) || amt <= 0) {
                    Alert.alert("Validation", "Enter a valid expense type and amount.");
                    return;
                  }
                  try {
                    await createExpense({
                      type: expenseType.trim(),
                      description: expenseDescription.trim() || undefined,
                      amount: amt,
                      isRecurring: false,
                    });
                    setExpenseType("");
                    setExpenseDescription("");
                    setExpenseAmount("");
                    setShowExpenseModal(false);
                    setActiveTab("expenses");
                  } catch (error: any) {
                    Alert.alert("Error", error.friendlyMessage || "Failed to create expense");
                  }
                }}
              >
                {isCreatingExpense ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="font-bold text-white">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Trends Modal (Reusing Prediction Modal) */}
      <Modal
        visible={showPredictionModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View className="flex-1 bg-gray-50">
          <View className="flex-row justify-between items-center p-4 bg-white border-b border-gray-200 shadow-sm">
            <Text className="text-lg font-bold text-blue-800">
              Strategic Trends
            </Text>
            <TouchableOpacity onPress={() => setShowPredictionModal(false)}>
              <Text className="text-gray-500 font-bold text-lg">X</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View className="min-h-[200px]">
              {isAIInsightsLoading ? (
                <View className="items-center py-8">
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text className="text-gray-500 mt-2">
                    Analyzing market trends...
                  </Text>
                </View>
              ) : aiInsightsError ? (
                <View className="py-6 px-4">
                  <Text className="text-red-700 text-center mb-4">
                    {aiInsightsError}
                  </Text>
                  <TouchableOpacity
                    className="bg-blue-600 py-3 rounded-lg items-center"
                    onPress={() => fetchAIInsights()}
                  >
                    <Text className="text-white font-bold">Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : aiInsights?.trends &&
                aiInsights.trends.length > 0 ? (
                <View className="space-y-3">
                  {aiInsights.trends.map((trend, i) => (
                    <View
                      key={i}
                      className={`p-4 border rounded-lg mb-3 ${
                        trend.sentiment === 'positive' ? 'bg-green-50 border-green-200' : 
                        trend.sentiment === 'negative' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'
                      }`}
                    >
                      <Text className={`font-bold mb-1 ${
                        trend.sentiment === 'positive' ? 'text-green-800' : 
                        trend.sentiment === 'negative' ? 'text-red-800' : 'text-blue-800'
                      }`}>
                        {trend.title}
                      </Text>
                      <Text className="text-sm text-gray-700">
                        {trend.description}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="py-6 px-2">
                  <Text className="text-gray-600 text-sm mb-3 text-center">
                    No trends detected yet.
                  </Text>
                  <TouchableOpacity
                    className="bg-blue-600 py-3 rounded-lg items-center"
                    onPress={() => fetchAIInsights()}
                  >
                    <Text className="text-white font-bold">Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Recommendations Modal (Reusing Pricing Modal) */}
      <Modal
        visible={showPricingModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View className="flex-1 bg-gray-50">
          <View className="flex-row justify-between items-center p-4 bg-white border-b border-gray-200 shadow-sm">
            <Text className="text-lg font-bold text-primary-800">
              AI Recommendations
            </Text>
            <TouchableOpacity onPress={() => setShowPricingModal(false)}>
              <Text className="text-gray-500 font-bold text-lg">X</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View className="min-h-[200px]">
              {isAIInsightsLoading ? (
                <View className="items-center py-8">
                  <ActivityIndicator size="small" color="#006b5f" />
                  <Text className="text-gray-500 mt-2">
                    Generating actionable advice...
                  </Text>
                </View>
              ) : aiInsightsError ? (
                <View className="py-6 px-4">
                  <Text className="text-red-700 text-center mb-4">
                    {aiInsightsError}
                  </Text>
                  <TouchableOpacity
                    className="bg-primary-600 py-3 rounded-lg items-center"
                    onPress={() => fetchAIInsights()}
                  >
                    <Text className="text-white font-bold">Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : aiInsights?.recommendations &&
                aiInsights.recommendations.length > 0 ? (
                <View className="space-y-3">
                  {aiInsights.recommendations.map((rec, i) => (
                    <View
                      key={i}
                      className="p-4 bg-primary-50 border border-primary-200 rounded-lg mb-3"
                    >
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="font-bold text-primary-800 flex-1 mr-2">
                          {rec.action}
                        </Text>
                        <Badge className={`${
                          rec.priority === 'High' ? 'bg-red-100' : 
                          rec.priority === 'Medium' ? 'bg-orange-100' : 'bg-green-100'
                        }`}>
                          <Text className="text-[10px]">{rec.priority}</Text>
                        </Badge>
                      </View>
                      <Text className="text-sm text-primary-700">
                        {rec.reason}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="py-6 px-2">
                  <Text className="text-gray-600 text-sm mb-3 text-center">
                    No recommendations yet.
                  </Text>
                  <TouchableOpacity
                    className="bg-primary-600 py-3 rounded-lg items-center"
                    onPress={() => fetchAIInsights()}
                  >
                    <Text className="text-white font-bold">Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
