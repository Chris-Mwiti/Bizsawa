import React, { useMemo, useState } from 'react'
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { router } from 'expo-router'
import {
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Package,
  Lightbulb,
  Target,
  Truck,
  Heart,
  ChevronDown,
  ChevronUp,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
} from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { DashboardSkeleton } from '../../components/ui/Skeleton'
import { useAuth } from '../../contexts/AuthContext'
import { useAnalytics } from '../../hooks/api/useAnalytics'
import { useProducts } from '../../hooks/api/useProducts'
import { TAB_BAR_SCROLL_PADDING } from '../../constants/tabBar'

const growthTips = [
  {
    icon: Target,
    title: 'Poultry Feed Focus',
    tip: 'Promote chick mash, layers mash, and growers mash as your premium line.',
    impact: 'High',
  },
  {
    icon: Truck,
    title: 'Bulk Orders',
    tip: 'Offer volume discounts on 10+ bags of layers mash.',
    impact: 'Medium',
  },
  {
    icon: Heart,
    title: 'Quality Guarantee',
    tip: 'Highlight KEB compliance for chick mash and growers mash.',
    impact: 'High',
  },
]

export default function Dashboard() {
  const [showGrowthTips, setShowGrowthTips] = useState(false)
  const { userData } = useAuth()
  const {
    weeklyOverview,
    isOverviewLoading,
    isBusinessLoading,
    hasBusiness,
    aiInsights,
    isAIInsightsLoading,
    fetchAIInsights,
    expenseAnalytics,
    getRevenueAnalytics,
    getCategoryAnalytics,
  } = useAnalytics() as any
  const { products, isLoading: productsLoading } = useProducts()
  const { data: expensesData } = expenseAnalytics('week')
  const { data: revenueAnalytics } = getRevenueAnalytics('week') as { data?: { totalRevenue: number; growthRate: number; data: Array<{ revenue: number }> } }
  const { data: categoryAnalytics } = getCategoryAnalytics('week') as { data?: { categories: Array<{ name: string; revenue: number; percentage: number; trend: string }> } }

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString('en-KE')}`
  const weeklyRevenue = revenueAnalytics?.totalRevenue ?? weeklyOverview.reduce((sum, day) => sum + day.sales, 0)
  const weeklyExpenses = (expensesData || []).reduce(
    (sum, e) => sum + e.amount,
    0,
  )
  const lowStockItems = products.filter(
    (p) => (p.stockQuantity ?? 0) < (p.minStockLevel ?? 20),
  )
  const inventoryAlerts = lowStockItems.length

  const weeklyGrowth = useMemo(() => {
    const g = Number(revenueAnalytics?.growthRate ?? 0)
    return Number.isFinite(g) ? Math.round(g * 10) / 10 : 0
  }, [revenueAnalytics?.growthRate])

  const displayTips = useMemo(() => {
    if (aiInsights?.recommendations?.length) {
      return aiInsights.recommendations.map((rec) => ({
        icon: rec.priority === 'High' ? Target : Lightbulb,
        title: rec.action,
        tip: rec.reason,
        impact: rec.priority,
      }))
    }
    return growthTips
  }, [aiInsights])

  const topProducts = useMemo(() => {
    // Prefer real analytics categories (revenue by product/category) when available
    if (categoryAnalytics?.categories?.length) {
      return [...categoryAnalytics.categories]
        .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
        .slice(0, 4)
        .map((c) => ({
          name: c.name,
          sold: undefined as unknown as number,
          revenue: c.revenue,
          category: `${Math.round(c.percentage || 0)}% • ${c.trend}`,
        }))
    }
    // Fallback: products sorted by price*stock as proxy for value (avoid dummy stockQuantity ranking when backend has no sales yet)
    if (!products.length) return []
    return [...products]
      .sort((a, b) => (b.price || 0) - (a.price || 0))
      .slice(0, 4)
      .map((p) => ({
        name: p.name,
        sold: p.stockQuantity,
        revenue: (p.stockQuantity || 0) * (p.price || 0),
        category: p.category || 'Uncat.',
      }))
  }, [products, categoryAnalytics])

  const firstName =
    userData?.ownerName?.split(' ')[0] ||
    userData?.name?.split(' ')[0] ||
    'there'
  const today = new Date().toLocaleDateString('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })

  if (isBusinessLoading || isOverviewLoading || productsLoading) {
    return <DashboardSkeleton />
  }

  return (
    <ScrollView
      className='flex-1 bg-paper'
      contentContainerStyle={{
        padding: 16,
        paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
        gap: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header — soft clinical: date eyebrow + greeting, pill shortcuts */}
      <View className='bg-surface rounded-lg p-6 border border-hairline shadow-clinical-sm'>
        <Text className='text-xs font-bold tracking-widest text-ink-subtle uppercase'>
          {today}
        </Text>
        <Text className='text-lg font-bold tracking-tight text-ink mt-1'>
          Good morning, {firstName}
        </Text>
        <Text className='text-sm text-ink-muted mt-1'>
          Here&apos;s what&apos;s happening in your shop today
        </Text>

        <View className='flex-row gap-2 mt-4 flex-wrap'>
          {[
            { label: 'Orders', href: '/(tabs)/sales/orders' as const },
            { label: 'Expenses', href: '/(tabs)/insights/expenses' as const },
            { label: 'Analytics', href: '/(tabs)/insights/analytics' as const },
          ].map((p) => (
            <Pressable
              key={p.label}
              onPress={() => router.push(p.href)}
              className='px-4 py-2 bg-paper border border-hairline rounded-full active:bg-accent-soft'
            >
              <Text className='text-xs font-semibold text-ink-strong'>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Primary actions — same component, same size, always uniform */}
      <View className='flex-row gap-3'>
        <Button
          onPress={() => router.push('/(tabs)/sales?action=new-sale')}
          className='flex-1'
        >
          <Plus size={18} color='white' />
          <Text className='font-geist-bold text-white font-bold text-sm'>Add Sale</Text>
        </Button>
        <Button
          variant='secondary'
          onPress={() => router.push('/(tabs)/insights/expenses')}
          className='flex-1'
        >
          <Plus size={18} color='#0E1F1C' />
          <Text className='font-geist-bold text-ink font-bold text-sm'>
            Add Expense
          </Text>
        </Button>
      </View>

      {/* Metrics — restrained, not hero-metric cliché */}
      <View className='flex-row flex-wrap gap-3'>
        {[
          {
            label: "Today's sales",
            value: formatCurrency(weeklyRevenue / 7),
            sub: 'avg / day',
            icon: DollarSign,
          },
          {
            label: 'Cash in',
            value: formatCurrency(weeklyRevenue),
            sub: 'this week',
            icon: TrendingUp,
          },
          {
            label: 'Cash out',
            value: formatCurrency(weeklyExpenses),
            sub: 'this week',
            icon: ArrowDownRight,
          },
          {
            label: 'Low stock',
            value: `${inventoryAlerts}`,
            sub: 'items',
            icon: AlertTriangle,
            alert: inventoryAlerts > 0,
          },
        ].map((m) => (
          <View key={m.label} className='w-[48%]'>
            <Card>
              <CardContent className='p-4'>
                <View className='flex-row items-start justify-between mb-2'>
                  <View
                    className={`w-11 h-11 rounded-full items-center justify-center ${m.alert ? 'bg-warn-soft border border-hairline' : 'bg-paper border border-hairline'}`}
                  >
                    <m.icon size={18} color={m.alert ? '#8A5A0B' : '#4F625E'} />
                  </View>
                  {m.label === 'Cash in' && (
                    <ArrowUpRight size={14} color='#6b7280' />
                  )}
                </View>
                <Text className='text-xs font-medium text-gray-500'>
                  {m.label}
                </Text>
                <Text
                  className='text-base font-bold tracking-tight text-gray-900 mt-1 font-mono'
                  numberOfLines={1}
                >
                  {m.value}
                </Text>
                <Text className='text-xs text-gray-500'>{m.sub}</Text>
              </CardContent>
            </Card>
          </View>
        ))}
      </View>

      {/* Weekly Growth — explain the number */}
      <Card className='border border-gray-200'>
        <CardHeader className='flex-row justify-between items-center'>
          <Text className='text-sm font-bold text-gray-900'>Weekly growth</Text>
          <View
            className={`px-3 py-1 rounded-full ${weeklyGrowth >= 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}
          >
            <Text
              className={`text-xs font-bold ${weeklyGrowth >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
            >
              {weeklyGrowth >= 0 ? '+' : ''}
              {weeklyGrowth}%
            </Text>
          </View>
        </CardHeader>
        <CardContent className='pt-0'>
          <View className='h-2 bg-gray-100 rounded-full overflow-hidden'>
            <View
              style={{ width: `${Math.min(Math.abs(weeklyGrowth) * 4, 100)}%` }}
              className={`h-2 ${weeklyGrowth >= 0 ? 'bg-accent' : 'bg-red-600'} rounded-full`}
            />
          </View>
          <Text className='text-xs text-gray-500 mt-2'>
            {weeklyGrowth >= 0 ? 'Trending up' : 'Trending down'} vs last period
            • Based on revenue series
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/insights/analytics')}
            className='self-start mt-3'
          >
            <Text className='text-xs font-bold text-gray-900 underline'>
              View analytics →
            </Text>
          </Pressable>
        </CardContent>
      </Card>

      {/* Top products — dense, scannable */}
      <Card className='border border-gray-200'>
        <CardHeader className='flex-row items-center justify-between'>
          <View className='flex-row items-center gap-2'>
            <Package size={16} color='#111827' />
            <Text className='text-sm font-bold text-gray-900'>
              Top products
            </Text>
          </View>
          <Text className='text-xs text-gray-400'>{categoryAnalytics?.categories?.length ? 'by revenue' : 'by value'}</Text>
        </CardHeader>
        <CardContent className='pt-0'>
          {topProducts.length ? (
            <View>
              {topProducts.map((p, i) => (
                <View
                  key={i}
                  className={`flex-row justify-between items-center py-3 ${i !== 0 ? 'border-t border-gray-100' : ''}`}
                >
                  <View className='flex-1 pr-3'>
                    <Text
                      className='text-sm font-semibold text-gray-900'
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    <View className='flex-row items-center gap-2 mt-1'>
                      <View className='px-2 py-1 rounded-full bg-gray-100 border border-gray-200'>
                        <Text className='text-xs font-bold text-gray-600' numberOfLines={1}>
                          {p.category}
                        </Text>
                      </View>
                      {typeof p.sold === 'number' && (
                        <Text className='text-xs text-gray-500'>
                          {p.sold} in stock
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text className='text-sm font-bold text-gray-900 font-mono'>
                    {formatCurrency(p.revenue)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className='py-8 items-center'>
              <Text className='text-sm text-gray-500'>
                No products yet — add stock to see top movers
              </Text>
            </View>
          )}
        </CardContent>
      </Card>

      {/* AI Insights — restrained, not drenched blue */}
      <Card className='border border-gray-200'>
        <CardHeader className='flex-row items-center justify-between'>
          <View className='flex-row items-center gap-2'>
            <View className='w-11 h-11 rounded-full bg-accent items-center justify-center'>
              <Text className='text-white text-xs font-bold'>AI</Text>
            </View>
            <Text className='text-sm font-bold text-gray-900'>AI Insights</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/insights/analytics')}
            className='px-3 py-1.5 bg-white border border-gray-200 rounded-full'
          >
            <Text className='text-xs font-bold text-gray-700'>Open</Text>
          </TouchableOpacity>
        </CardHeader>
        <CardContent className='pt-0'>
          {isAIInsightsLoading ? (
            <View className='flex-row items-center gap-2 py-2'>
              <ActivityIndicator size='small' color='#111827' />
              <Text className='text-sm text-gray-500'>Generating summary…</Text>
            </View>
          ) : aiInsights?.summary ? (
            <View>
              <Text className='text-sm leading-5 text-gray-700'>
                {aiInsights.summary}
              </Text>
              <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase mt-3'>
                {aiInsights.trends?.length || 0} trends
              </Text>
            </View>
          ) : (
            <View>
              <Text className='text-sm text-gray-600'>
                No summary yet. Generate a deep-dive when you have a week of
                sales.
              </Text>
              <TouchableOpacity
                onPress={() => fetchAIInsights()}
                className='self-start mt-3 px-3 py-2 bg-accent rounded-full'
              >
                <Text className='text-white text-xs font-bold'>Generate</Text>
              </TouchableOpacity>
            </View>
          )}
        </CardContent>
      </Card>

      {/* Growth tips — progressive disclosure */}
      <Card className='border border-gray-200 overflow-hidden'>
        <Pressable
          onPress={() => setShowGrowthTips(!showGrowthTips)}
          className='p-4 flex-row items-center justify-between bg-gray-50'
        >
          <View className='flex-row items-center gap-2'>
            <Lightbulb size={16} color='#111827' />
            <Text className='text-sm font-bold text-gray-900'>Growth tips</Text>
            <View className='px-2 py-1 rounded-full bg-white border border-gray-200'>
              <Text className='text-xs font-bold text-gray-600'>
                {displayTips.length}
              </Text>
            </View>
          </View>
          {showGrowthTips ? (
            <ChevronUp size={16} color='#6b7280' />
          ) : (
            <ChevronDown size={16} color='#6b7280' />
          )}
        </Pressable>
        {showGrowthTips && (
          <View className='p-4 gap-4'>
            {displayTips.map((tip, i) => (
              <View key={i} className='flex-row gap-3'>
                <View className='w-11 h-11 rounded-2xl bg-white border border-gray-200 items-center justify-center shrink-0'>
                  <tip.icon size={14} color='#111827' />
                </View>
                <View className='flex-1'>
                  <View className='flex-row items-center gap-2'>
                    <Text className='text-sm font-semibold text-gray-900'>
                      {tip.title}
                    </Text>
                    <View
                      className={`px-2 py-1 rounded-full ${tip.impact === 'High' ? 'bg-accent' : 'bg-white border border-gray-200'}`}
                    >
                      <Text
                        className={`text-xs font-bold ${tip.impact === 'High' ? 'text-white' : 'text-gray-600'}`}
                      >
                        {tip.impact}
                      </Text>
                    </View>
                  </View>
                  <Text className='text-xs leading-4 text-gray-600 mt-1'>
                    {tip.tip}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  )
}
