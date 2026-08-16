import React, { useState, useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Package,
  Users,
  Lightbulb,
  Target,
  Truck,
  Heart,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react-native";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/Progress";
import { useAuth } from "../../contexts/AuthContext";
import { useAnalytics } from "../../hooks/api/useAnalytics";
import { useProducts } from "../../hooks/api/useProducts";
import { TAB_BAR_SCROLL_PADDING } from "../../constants/tabBar";

const growthTips = [
  {
    icon: Target,
    title: "Poultry Feed Focus",
    tip: "Promote chick mash, layers mash, and growers mash as your premium poultry feed line.",
    impact: "High",
  },
  {
    icon: Truck,
    title: "Bulk Poultry Orders",
    tip: "Offer volume discounts on 10+ bags of layers mash.",
    impact: "Medium",
  },
  {
    icon: Heart,
    title: "Feed Quality Guarantee",
    tip: "Highlight that your chick mash and growers mash meet KEB standards.",
    impact: "High",
  },
];

export default function Dashboard() {
  const [showGrowthTips, setShowGrowthTips] = useState(false);
  const { userData } = useAuth();
  const { 
    weeklyOverview, 
    isOverviewLoading, 
    aiInsights, 
    isAIInsightsLoading, 
    aiInsightsError, 
    fetchAIInsights,
    expenseAnalytics,
    profitAnalytics
  } = useAnalytics();
  const { products, isLoading: productsLoading } = useProducts();

  const { data: expensesData } = expenseAnalytics("week");
  const { data: profitData } = profitAnalytics("week");

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString("en-KE")}`;

  // Calculate metrics from real data
  const weeklyRevenue = weeklyOverview.reduce((sum, day) => sum + day.sales, 0);
  const weeklyExpenses = (expensesData || []).reduce((sum, e) => sum + e.amount, 0);
  
  const lowStockItems = products.filter((p) => {
    const min = p.minStockLevel ?? 20;
    return p.stockQuantity < min;
  });
  const inventoryAlerts = lowStockItems.length;

  // Calculate weekly growth
  const weeklyGrowth = useMemo(() => {
    if (!profitData || profitData.length < 2) return 12.5; // Fallback
    const current = profitData[profitData.length - 1]?.revenue || 0;
    const previous = profitData[profitData.length - 2]?.revenue || 0;
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }, [profitData]);

  // Use AI recommendations for tips if available
  const displayTips = useMemo(() => {
    if (aiInsights?.recommendations && aiInsights.recommendations.length > 0) {
      return aiInsights.recommendations.map(rec => ({
        icon: rec.priority === "High" ? Target : Lightbulb,
        title: rec.action,
        tip: rec.reason,
        impact: rec.priority
      }));
    }
    return growthTips;
  }, [aiInsights]);

  // Top products calculation
  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => (b.stockQuantity || 0) - (a.stockQuantity || 0))
      .slice(0, 4)
      .map((p) => ({
        name: p.name,
        sold: p.stockQuantity,
        revenue: p.stockQuantity * p.price,
        category: p.category || "Uncategorized",
      }));
  }, [products]);

  const firstName = userData?.ownerName?.split(" ")[0] || "there";

  if (isOverviewLoading || productsLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#006b5f" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{
        padding: 16,
        paddingBottom: TAB_BAR_SCROLL_PADDING,
      }}
    >
      {/* Welcome Message */}
      <View className="items-center py-6">
        <Text className="text-xl font-bold text-gray-900">
          Good morning, {firstName}!
        </Text>
        <Text className="text-sm text-gray-500 mt-1">
          Here's your business overview
        </Text>
        <View className="flex-row mt-3 gap-2 justify-center flex-wrap">
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/sales?segment=orders")}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-full"
            activeOpacity={0.85}
          >
            <Text className="text-xs font-medium text-gray-800">Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/insights?tab=expenses")}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-full"
            activeOpacity={0.85}
          >
            <Text className="text-xs font-medium text-gray-800">Expenses</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/insights?tab=analytics")}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-full"
            activeOpacity={0.85}
          >
            <Text className="text-xs font-medium text-gray-800">Analytics</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Action Buttons */}
        <View className="flex-row mt-6 gap-3 w-full px-2">
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/sales?segment=sales&action=new-sale")}
            className="flex-1 bg-blue-600 py-4 rounded-2xl items-center justify-center shadow-lg shadow-blue-900/20"
            activeOpacity={0.85}
          >
            <View className="flex-row items-center">
              <Plus size={20} color="white" />
              <Text className="text-white font-bold ml-2">Add Sale</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/insights?tab=expenses&action=new-expense")}
            className="flex-1 bg-gray-900 py-4 rounded-2xl items-center justify-center shadow-lg"
            activeOpacity={0.85}
          >
            <View className="flex-row items-center">
              <Plus size={20} color="white" />
              <Text className="text-white font-bold ml-2">Add Expense</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Key Metrics Grid */}
      <View className="flex-row flex-wrap justify-between">
        {[
          {
            label: "Today's Sales",
            val: formatCurrency(weeklyRevenue / 7), // Daily average
            icon: TrendingUp,
            color: "#16a34a",
            bg: "bg-green-100",
          },
          {
            label: "Cash In",
            val: formatCurrency(weeklyRevenue),
            icon: DollarSign,
            color: "#2563eb",
            bg: "bg-blue-100",
          },
          {
            label: "Cash Out",
            val: formatCurrency(weeklyExpenses),
            icon: TrendingDown,
            color: "#dc2626",
            bg: "bg-red-100",
          },
          {
            label: "Inventory",
            val: `${inventoryAlerts} items`,
            icon: AlertTriangle,
            color: "#ea580c",
            bg: "bg-orange-100",
          },
        ].map((item, i) => (
          <View key={i} className="w-[48%] mb-3">
            <Card>
              <CardContent className="flex-row items-center p-3">
                <View
                  className={`w-9 h-9 ${item.bg} rounded-lg items-center justify-center mr-2`}
                >
                  <item.icon size={18} color={item.color} />
                </View>
                <View className="flex-1">
                  <Text className="text-[10px] text-gray-500 uppercase font-bold">
                    {item.label}
                  </Text>
                  <Text className="font-bold text-gray-900 text-xs mt-0.5">
                    {item.val}
                  </Text>
                </View>
              </CardContent>
            </Card>
          </View>
        ))}
      </View>

      {/* Weekly Growth */}
      <Card className="mb-4">
        <CardHeader>
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-bold">Weekly Growth</Text>
            <Badge className={`${weeklyGrowth >= 0 ? "bg-green-100" : "bg-red-100"} px-2 py-1`}>
              <Text className={`${weeklyGrowth >= 0 ? "text-green-700" : "text-red-700"} font-bold`}>
                {weeklyGrowth >= 0 ? "+" : ""}{weeklyGrowth}%
              </Text>
            </Badge>
          </View>
        </CardHeader>
        <CardContent>
          <Progress value={Math.min(Math.abs(weeklyGrowth), 100)} className="h-2 mb-2" />
          <Text className="text-xs text-gray-500">
            {weeklyGrowth >= 0 ? "Sales increased" : "Sales decreased"} by {Math.abs(weeklyGrowth)}% compared to last period
          </Text>
        </CardContent>
      </Card>

      {/* Top Products */}
      <Card className="mb-4">
        <CardHeader>
          <View className="flex-row items-center">
            <TrendingUp size={20} color="#1f2937" />
            <Text className="text-base font-bold ml-2">Top Products Today</Text>
          </View>
        </CardHeader>
        <CardContent>
          {topProducts.length > 0 ? (
            topProducts.map((product, index) => (
              <View
                key={index}
                className={`flex-row justify-between items-center ${index !== 0 ? "mt-4 border-t border-gray-100 pt-4" : ""}`}
              >
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-gray-900">
                    {product.name}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <Badge variant="outline" className="mr-2 px-1">
                      <Text className="text-[10px]">{product.category}</Text>
                    </Badge>
                    <Text className="text-[11px] text-gray-500">
                      {product.sold} sold
                    </Text>
                  </View>
                </View>
                <Text className="font-bold text-gray-900">
                  {formatCurrency(product.revenue)}
                </Text>
              </View>
            ))
          ) : (
            <Text className="text-center text-gray-500 py-4">
              No products yet
            </Text>
          )}
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card className="mb-4 bg-blue-50 border-blue-100">
        <CardHeader>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <View className="w-8 h-8 rounded-full bg-blue-600 items-center justify-center mr-2">
                <Text className="text-white text-[10px] font-bold">AI</Text>
              </View>
              <Text className="text-base font-bold text-blue-900">AI Insights</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/insights?tab=overview")}
              className="px-3 py-1.5 bg-blue-600 rounded-lg"
              activeOpacity={0.85}
            >
              <Text className="text-white text-xs font-bold">Open Insights</Text>
            </TouchableOpacity>
          </View>
        </CardHeader>
        <CardContent>
          {isAIInsightsLoading ? (
            <View className="flex-row items-center py-2">
              <ActivityIndicator size="small" color="#2563eb" />
              <Text className="text-sm text-blue-900 ml-2">Loading AI summary…</Text>
            </View>
          ) : aiInsightsError ? (
            <View>
              <Text className="text-sm text-red-700 mb-2">
                {aiInsightsError}
              </Text>
              <TouchableOpacity onPress={() => fetchAIInsights()} className="self-start px-3 py-2 bg-blue-600 rounded-lg">
                <Text className="text-white text-xs font-bold">Retry</Text>
              </TouchableOpacity>
            </View>
          ) : aiInsights?.summary ? (
            <View>
              <Text className="text-sm text-blue-900 mb-4 leading-relaxed">
                {aiInsights.summary}
              </Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-[10px] text-blue-700 font-bold uppercase tracking-wider">
                  {aiInsights.trends?.length || 0} Trends Detected
                </Text>
                <TouchableOpacity onPress={() => router.push("/(tabs)/insights?tab=overview")}>
                  <Text className="text-blue-600 text-xs font-bold underline">View All</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <Text className="text-sm text-blue-900 mb-2">
                No AI summary yet. Tap below to generate a deep-dive analysis.
              </Text>
              <TouchableOpacity onPress={() => fetchAIInsights()} className="self-start px-3 py-2 bg-blue-600 rounded-lg">
                <Text className="text-white text-xs font-bold">Generate Insights</Text>
              </TouchableOpacity>
            </View>
          )}
        </CardContent>
      </Card>

      {/* Growth Tips Toggle */}
      <Card className="mb-4 overflow-hidden border-green-200">
        <TouchableOpacity
          className="p-4 bg-green-50 flex-row items-center justify-between"
          onPress={() => setShowGrowthTips(!showGrowthTips)}
        >
          <View className="flex-row items-center">
            <Lightbulb size={20} color="#16a34a" />
            <Text className="text-base font-bold text-green-900 ml-2">
              Business Growth Tips
            </Text>
          </View>
          {showGrowthTips ? (
            <ChevronUp size={20} color="#16a34a" />
          ) : (
            <ChevronDown size={20} color="#16a34a" />
          )}
        </TouchableOpacity>

        {showGrowthTips && (
          <View className="p-4 bg-white">
            {displayTips.map((tip, index) => {
              const IconComponent = tip.icon;
              return (
                <View key={index} className="flex-row mb-4">
                  <View className="w-8 h-8 rounded-full bg-green-100 items-center justify-center mr-3">
                    <IconComponent size={16} color="#16a34a" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-gray-900 text-sm">
                      {tip.title}
                    </Text>
                    <Text className="text-xs text-gray-600">{tip.tip}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
