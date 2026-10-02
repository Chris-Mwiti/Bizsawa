import React, { useState, useEffect, useMemo } from 'react'
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native'
import {
  TrendingUp,
  Receipt,
  DollarSign,
  Target,
  BarChart3,
  PieChart as PieIcon,
} from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/Card'
import { useAnalytics } from '../../../hooks/api/useAnalytics'
import { useExpenses } from '../../../hooks/api/useExpenses'
import { TAB_BAR_SCROLL_PADDING } from '../../../constants/tabBar'
import { toNumber } from '../../../lib/api-dtos'
import { useLocalSearchParams } from 'expo-router'
import {
  BarChart,
  SwitchableLineCard,
  PieChart,
} from '../../../components/charts/AnalyticsCharts'

export default function InsightsOverview() {
  const params = useLocalSearchParams<{ action?: string }>()
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseType, setExpenseType] = useState('')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')

  useEffect(() => {
    if (params.action === 'new-expense') setShowExpenseModal(true)
  }, [params.action])

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
  } = useAnalytics()
  const {
    expenses,
    isLoading: expensesLoading,
    createExpense,
    isCreating: isCreatingExpense,
  } = useExpenses()
  const { data: revenueWeek } = getRevenueAnalytics('week')
  const { data: profitWeek } = getProfitAnalytics('week')
  const { data: categoryWeek } = getCategoryAnalytics('week')

  const weeklyRevenue = weeklyOverview.reduce((sum, d) => sum + d.sales, 0)
  const weeklyExpenses = expenses.reduce(
    (sum, e) => sum + toNumber(e.amount),
    0,
  )
  const weeklyProfit = weeklyRevenue - weeklyExpenses
  const profitMargin =
    weeklyRevenue > 0 ? (weeklyProfit / weeklyRevenue) * 100 : 0
  const formatCurrency = (a: number) => `KES ${a.toLocaleString('en-KE')}`
  const topCategories = useMemo(
    () =>
      categoryPerformance.sales
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    [categoryPerformance.sales],
  )
  const expenseCategories = useMemo(() => {
    const m = new Map<string, number>()
    expenses.forEach((e) =>
      m.set(e.category, (m.get(e.category) || 0) + toNumber(e.amount)),
    )
    return Array.from(m.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [expenses])

  const handleExpenseSubmit = async () => {
    if (!expenseType.trim() || !expenseAmount.trim())
      return Alert.alert('Validation', 'Category and amount required')
    const amt = Number(expenseAmount)
    if (!Number.isFinite(amt) || amt <= 0)
      return Alert.alert('Validation', 'Enter valid amount')
    try {
      await createExpense({
        category: expenseType.trim(),
        description: expenseDescription.trim() || undefined,
        amount: expenseAmount.trim(),
        spentAt: new Date().toISOString(),
      })
      setShowExpenseModal(false)
      setExpenseType('')
      setExpenseDescription('')
      setExpenseAmount('')
      Alert.alert('Success', 'Expense added')
    } catch (e: any) {
      Alert.alert('Error', e.friendlyMessage || 'Failed')
    }
  }

  if (isBusinessLoading)
    return (
      <View className='flex-1 bg-gray-50 items-center justify-center px-6'>
        <ActivityIndicator color='#111827' />
        <Text className='font-sans text-sm text-gray-500 mt-2'>Loading business…</Text>
      </View>
    )
  if (!hasBusiness)
    return (
      <View className='flex-1 bg-gray-50 items-center justify-center px-6'>
        <Text className='font-geist-bold font-bold text-gray-900'>No business selected</Text>
        <Text className='font-sans text-sm text-gray-500 mt-1'>
          Create or select a business to see overview.
        </Text>
      </View>
    )

  return (
    <View className='flex-1 bg-gray-50'>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Metrics — restrained */}
        <View className='flex-row gap-3 flex-wrap'>
          {[
            {
              label: 'Weekly revenue',
              value: formatCurrency(weeklyRevenue),
              icon: DollarSign,
            },
            {
              label: 'Weekly expenses',
              value: formatCurrency(weeklyExpenses),
              icon: Receipt,
              tint: 'text-red-700',
            },
            {
              label: 'Weekly profit',
              value: formatCurrency(weeklyProfit),
              icon: TrendingUp,
              tint: 'text-emerald-700',
            },
            {
              label: 'Margin',
              value: `${profitMargin.toFixed(1)}%`,
              icon: Target,
            },
          ].map((m) => (
            <View key={m.label} className='w-[48%]'>
              <Card className='border border-gray-200'>
                <CardContent className='p-4'>
                  <View className='flex-row justify-between items-start mb-2'>
                    <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                      {m.label}
                    </Text>
                    <View className='w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 items-center justify-center'>
                      <m.icon size={14} color='#6b7280' />
                    </View>
                  </View>
                  <Text
                    className={`font-geist-bold text-lg font-bold tracking-tight ${m.tint || 'text-gray-900'}`}
                    numberOfLines={1}
                  >
                    {m.value}
                  </Text>
                </CardContent>
              </Card>
            </View>
          ))}
        </View>

        {/* Day sales — Bar chart — now 7 dated bars, 0 = gray baseline + "0" */}
        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center gap-2'>
            <BarChart3 size={16} color='#111827' />
            <CardTitle>Day sales • week</CardTitle>
            <Text className='font-sans ml-auto text-xs text-gray-500'>7 days • 0 baseline</Text>
          </CardHeader>
          <CardContent className='pt-0'>
            {isOverviewLoading ? (
              <View className='items-center py-8'>
                <ActivityIndicator color='#111827' />
                <Text className='font-sans text-xs text-gray-500 mt-2'>Loading…</Text>
              </View>
            ) : weeklyOverview.length ? (
              <BarChart
                data={weeklyOverview.map((d) => ({
                  label: `${d.day.slice(0, 3)} ${new Date(d.fullDate).toLocaleDateString('en-KE', { month: '2-digit', day: '2-digit' })}`,
                  value: d.sales,
                }))}
                color='#111827'
                height={130}
                showValues
              />
            ) : (
              <Text className='font-sans text-sm text-gray-500 py-6 text-center'>
                No sales this week
              </Text>
            )}
          </CardContent>
        </Card>

        {/* Revenue / Profit bars — 7 dated buckets, zero = gray hairline + "0" */}
        <View className='flex-row gap-3'>
          <Card className='flex-1 border border-gray-200'>
            <CardHeader>
              <CardTitle>Revenue • week</CardTitle>
            </CardHeader>
            <CardContent className='pt-0'>
              {revenueWeek?.data?.length ? (
                <BarChart
                  data={revenueWeek.data.slice(-7).map((p) => {
                    const dt = new Date(p.date)
                    return { label: `${dt.toLocaleDateString('en-KE', { weekday: 'short' }).slice(0,2)} ${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`, value: Number(p.revenue) }
                  })}
                  color='#0f766e'
                  height={110}
                  showValues
                />
              ) : (
                <Text className='font-sans text-xs text-gray-500 py-4 text-center'>
                  No revenue
                </Text>
              )}
            </CardContent>
          </Card>
          <Card className='flex-1 border border-gray-200'>
            <CardHeader>
              <CardTitle>Profit • week</CardTitle>
            </CardHeader>
            <CardContent className='pt-0'>
              {profitWeek?.data?.length ? (
                <BarChart
                  data={profitWeek.data.slice(-7).map((p) => {
                    const dt = new Date(p.date)
                    return { label: `${dt.toLocaleDateString('en-KE', { weekday: 'short' }).slice(0,2)} ${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`, value: Number(p.profit) }
                  })}
                  color='#1d4ed8'
                  height={110}
                  showValues
                />
              ) : (
                <Text className='font-sans text-xs text-gray-500 py-4 text-center'>
                  No profit
                </Text>
              )}
            </CardContent>
          </Card>
        </View>

        {/* Switchable line — sales / revenue / profit + margin */}
        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Trend • switch metric</CardTitle>
            <Text className='font-sans text-xs text-gray-500'>
              sales / revenue / profit — one line
            </Text>
          </CardHeader>
          <CardContent className='pt-0'>
            {isOverviewLoading ? (
              <View className='items-center py-8'>
                <ActivityIndicator color='#111827' />
              </View>
            ) : (
              <SwitchableLineCard
                sales={weeklyOverview.map((d) => ({
                  label: `${d.day.slice(0,3)} ${new Date(d.fullDate).toLocaleDateString('en-KE', { month: '2-digit', day: '2-digit' })}`,
                  value: d.sales,
                }))}
                revenue={(revenueWeek?.data || []).slice(-7).map((p: any) => {
                  const dt=new Date(p.date); return { label: `${dt.toLocaleDateString('en-KE',{weekday:'short'}).slice(0,3)} ${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`, value: Number(p.revenue) }
                })}
                profit={(profitWeek?.data || []).slice(-7).map((p: any) => {
                  const dt=new Date(p.date); return { label: `${dt.toLocaleDateString('en-KE',{weekday:'short'}).slice(0,3)} ${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`, value: Number(p.profit) }
                })}
              />
            )}
          </CardContent>
        </Card>

        {/* Profit margin — 7 dated bars */}
        {profitWeek?.data?.length ? (
          <Card className='border border-gray-200'>
            <CardHeader>
              <CardTitle>Profit margin • week</CardTitle>
              <Text className='font-sans text-xs text-gray-500'>margin % • 0 baseline</Text>
            </CardHeader>
            <CardContent className='pt-0'>
              <BarChart
                data={profitWeek.data.slice(-7).map((p: any) => {
                  const dt=new Date(p.date); return { label: `${dt.toLocaleDateString('en-KE',{weekday:'short'}).slice(0,2)} ${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`, value: Number(p.margin) }
                })}
                color='#7c3aed'
                height={110}
                showValues
              />
            </CardContent>
          </Card>
        ) : null}

        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center gap-2'>
            <PieIcon size={16} color='#111827' />
            <CardTitle>Category sales • pie</CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            {isCategoriesLoading ? (
              <View className='items-center py-6'>
                <ActivityIndicator color='#111827' />
              </View>
            ) : categoryWeek?.categories?.length || topCategories.length ? (
              <PieChart
                data={(categoryWeek?.categories?.length
                  ? categoryWeek.categories
                  : topCategories
                )
                  .slice(0, 6)
                  .map((c: any) => ({
                    name: c.name || c.category,
                    value: c.revenue ?? c.value ?? c.amount ?? 0,
                  }))}
                size={170}
              />
            ) : (
              <Text className='font-sans text-sm text-gray-500 py-4 text-center'>
                No category data yet
              </Text>
            )}
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Top categories • list</CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            {isCategoriesLoading ? (
              <View className='items-center py-6'>
                <ActivityIndicator color='#111827' />
              </View>
            ) : topCategories.length ? (
              <View className='gap-3'>
                {topCategories.map((cat, i) => (
                  <View
                    key={i}
                    className='flex-row justify-between items-center'
                  >
                    <View className='flex-1 pr-3'>
                      <Text className='font-geist-semibold text-sm font-semibold text-gray-900'>
                        {cat.name}
                      </Text>
                      <Text className='font-sans text-xs text-gray-500'>sales</Text>
                    </View>
                    <Text className='font-geist-mono-bold text-sm font-bold text-gray-900'>
                      {formatCurrency(cat.value)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className='font-sans text-sm text-gray-500 py-4 text-center'>
                No category data yet
              </Text>
            )}
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Expense breakdown</CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            {expensesLoading ? (
              <View className='items-center py-6'>
                <ActivityIndicator color='#111827' />
              </View>
            ) : expenseCategories.length ? (
              <View className='gap-2.5'>
                {expenseCategories.map((cat) => (
                  <View
                    key={cat.category}
                    className='flex-row justify-between items-center p-3 rounded-2xl bg-gray-50 border border-gray-100'
                  >
                    <Text className='font-geist-medium text-sm font-medium text-gray-900'>
                      {cat.category}
                    </Text>
                    <Text className='font-geist-mono-bold text-sm font-bold text-red-700'>
                      {formatCurrency(cat.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className='font-sans text-sm text-gray-500 py-4 text-center'>
                No expenses breakdown
              </Text>
            )}
          </CardContent>
        </Card>

        <Card className='border border-gray-200 bg-white'>
          <CardHeader className='flex-row items-center gap-2'>
            <View className='w-11 h-11 rounded-full bg-accent items-center justify-center'>
              <Text className='font-geist-bold text-white text-xs font-bold'>AI</Text>
            </View>
            <CardTitle>AI Insights</CardTitle>
            <Pressable
              onPress={() => fetchAIInsights()}
              className='ml-auto px-3 py-1.5 rounded-full bg-white border border-gray-200'
            >
              <Text className='font-geist-bold text-xs font-bold text-gray-700'>Refresh</Text>
            </Pressable>
          </CardHeader>
          <CardContent className='pt-0'>
            {isAIInsightsLoading ? (
              <View className='flex-row items-center gap-2 py-2'>
                <ActivityIndicator size='small' color='#111827' />
                <Text className='font-sans text-sm text-gray-500'>Loading…</Text>
              </View>
            ) : aiInsights?.summary ? (
              <Text className='font-sans text-sm leading-5 text-gray-700'>
                {aiInsights.summary}
              </Text>
            ) : (
              <View>
                <Text className='font-sans text-sm text-gray-600'>No summary yet.</Text>
                <TouchableOpacity
                  onPress={() => fetchAIInsights()}
                  className='self-start mt-3 px-3 py-2 bg-accent rounded-full'
                >
                  <Text className='font-geist-bold text-white text-xs font-bold'>Generate</Text>
                </TouchableOpacity>
              </View>
            )}
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 flex-row gap-3'>
            <TouchableOpacity
              onPress={() => setShowExpenseModal(true)}
              className='flex-1 p-3.5 rounded-2xl bg-accent flex-row items-center justify-center gap-2'
            >
              <Receipt size={16} color='white' />
              <Text className='font-geist-bold text-sm font-bold text-white'>Add Expense</Text>
            </TouchableOpacity>
            <View className='flex-1 p-3.5 rounded-2xl bg-white border border-gray-200 items-center justify-center'>
              <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                Profit
              </Text>
              <Text className='font-geist-bold text-sm font-bold text-gray-900 mt-1'>
                {profitMargin.toFixed(1)}% margin
              </Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>

      <Modal
        visible={showExpenseModal}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={() => setShowExpenseModal(false)}
      >
        <View className='flex-1 bg-gray-50'>
          <View className='flex-row justify-between items-center p-4 bg-white border-b border-gray-200'>
            <Text className='font-geist-bold text-lg font-bold text-gray-900'>Add Expense</Text>
            <Pressable
              onPress={() => setShowExpenseModal(false)}
              className='w-11 h-11 rounded-full bg-gray-100 items-center justify-center'
            >
              <Text className='font-geist-bold font-bold'>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Category *
              </Text>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
                placeholder='e.g., Feed, Rent'
                value={expenseType}
                onChangeText={setExpenseType}
              />
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Description
              </Text>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
                placeholder='Optional'
                value={expenseDescription}
                onChangeText={setExpenseDescription}
              />
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Amount *
              </Text>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
                placeholder='0.00'
                keyboardType='numeric'
                value={expenseAmount}
                onChangeText={setExpenseAmount}
              />
            </View>
            <TouchableOpacity
              className='bg-accent py-4 rounded-2xl items-center mt-2'
              onPress={handleExpenseSubmit}
              disabled={isCreatingExpense}
            >
              {isCreatingExpense ? (
                <ActivityIndicator color='white' />
              ) : (
                <Text className='font-geist-bold text-white font-bold'>Save</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}
