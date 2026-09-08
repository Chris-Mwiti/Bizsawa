import React, { useState } from 'react'
import { ScrollView, View, Text, ActivityIndicator } from 'react-native'
import {
  TrendingUp,
  DollarSign,
  PieChart,
  Users,
  BarChart3,
} from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/Card'
import { useAnalytics } from '../../../hooks/api/useAnalytics'
import { TAB_BAR_SCROLL_PADDING } from '../../../constants/tabBar'
import type { Timeframe } from '../../../hooks/api/useAnalytics'
import {
  BarChart,
  SwitchableLineCard,
  PieChart as Pie,
} from '../../../components/charts/AnalyticsCharts'
import { Tabs } from 'tamagui'

const TIMEFRAMES: Timeframe[] = ['day', 'week', 'month', 'year']
const LABELS: Record<Timeframe, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  all: 'All',
  custom: 'Custom',
}

export default function InsightsAnalytics() {
  const [timeframe, setTimeframe] = useState<Timeframe>('week')
  const {
    getRevenueAnalytics,
    getProfitAnalytics,
    getCategoryAnalytics,
    getCustomerAnalytics,
    hasBusiness,
    isBusinessLoading,
  } = useAnalytics()
  const revenueQuery = getRevenueAnalytics(timeframe)
  const profitQuery = getProfitAnalytics(timeframe)
  const categoryQuery = getCategoryAnalytics(timeframe)
  const customerQuery = getCustomerAnalytics(timeframe)

  const formatCurrency = (a: number) =>
    `KES ${Number(a || 0).toLocaleString('en-KE')}`
  const Loading = () => (
    <View className='items-center py-8'>
      <ActivityIndicator color='#111827' />
      <Text className='text-xs text-gray-500 mt-2'>Loading…</Text>
    </View>
  )

  if (isBusinessLoading)
    return (
      <View className='flex-1 bg-gray-50 items-center justify-center px-6'>
        <ActivityIndicator color='#111827' />
        <Text className='text-sm text-gray-500 mt-2'>Loading business…</Text>
      </View>
    )
  if (!hasBusiness)
    return (
      <View className='flex-1 bg-gray-50 items-center justify-center px-6'>
        <Text className='font-bold text-gray-900'>No business selected</Text>
        <Text className='text-sm text-gray-500 mt-1 text-center'>
          Create or select a business to view analytics.
        </Text>
      </View>
    )

  return (
    <View className='flex-1 bg-gray-50'>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Timeframe — Tamagui Tabs (impeccable pill, no overflow) */}
        <Card className='border border-gray-200'>
          <CardContent className='py-3'>
            <View className='gap-3'>
              <View className='flex-row items-center justify-between'>
                <Text className='text-sm font-semibold text-gray-700'>
                  Timeframe
                </Text>
                <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
                  {timeframe}
                </Text>
              </View>
              <Tabs
                value={timeframe}
                onValueChange={(v) => setTimeframe(v as Timeframe)}
                orientation='horizontal'
                defaultValue='week'
                activationMode='manual'
              >
                <Tabs.List
                  backgroundColor='$background'
                  borderRadius={999}
                  padding={4}
                  gap={4}
                  style={{
                    backgroundColor: '#f3f4f6',
                    borderRadius: 999,
                    padding: 4,
                    width: '100%',
                  }}
                  flexDirection='row'
                >
                  {TIMEFRAMES.map((tf) => (
                    <Tabs.Tab
                      key={tf}
                      value={tf}
                      flex={1}
                      justifyContent='center'
                      alignItems='center'
                      paddingHorizontal={10}
                      paddingVertical={7}
                      borderRadius={999}
                      backgroundColor={
                        timeframe === tf ? 'white' : 'transparent'
                      }
                      borderWidth={timeframe === tf ? 1 : 0}
                      borderColor={timeframe === tf ? '#e5e7eb' : 'transparent'}
                      pressStyle={{ opacity: 0.85 }}
                      style={{
                        flex: 1,
                        backgroundColor:
                          timeframe === tf ? 'white' : 'transparent',
                        borderRadius: 999,
                        borderWidth: timeframe === tf ? 1 : 0,
                        borderColor:
                          timeframe === tf ? '#e5e7eb' : 'transparent',
                        minWidth: 0,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: timeframe === tf ? '#111827' : '#6b7280',
                          textAlign: 'center',
                        }}
                      >
                        {LABELS[tf]}
                      </Text>
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            </View>
          </CardContent>
        </Card>

        {/* KPIs — 2x2 restrained */}
        <View className='flex-row flex-wrap gap-3'>
          {[
            {
              label: 'Total revenue',
              value: revenueQuery.data
                ? formatCurrency(revenueQuery.data.totalRevenue)
                : '—',
              sub: revenueQuery.data
                ? `${revenueQuery.data.growthRate >= 0 ? '+' : ''}${Number(revenueQuery.data.growthRate).toFixed(1)}% growth`
                : '',
              icon: DollarSign,
            },
            {
              label: 'Total profit',
              value: profitQuery.data
                ? formatCurrency(profitQuery.data.totalProfit)
                : '—',
              sub: profitQuery.data
                ? `${Number(profitQuery.data.avgMargin).toFixed(1)}% margin`
                : '',
              icon: TrendingUp,
            },
            {
              label: 'Categories',
              value: categoryQuery.data
                ? String(categoryQuery.data.categories.length)
                : '0',
              sub: 'tracked',
              icon: PieChart,
            },
            {
              label: 'Segments',
              value: customerQuery.data
                ? String(customerQuery.data.segments.length)
                : '0',
              sub: 'cohorts',
              icon: Users,
            },
          ].map((k) => (
            <View key={k.label} className='w-[48%]'>
              <Card className='border border-gray-200'>
                <CardContent className='p-4'>
                  <View className='flex-row justify-between items-start mb-2'>
                    <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
                      {k.label}
                    </Text>
                    <View className='w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 items-center justify-center'>
                      <k.icon size={14} color='#6b7280' />
                    </View>
                  </View>
                  <Text className='text-lg font-bold tracking-tight text-gray-900 font-mono'>
                    {k.value}
                  </Text>
                  <Text className='text-xs text-gray-500 mt-1'>{k.sub}</Text>
                </CardContent>
              </Card>
            </View>
          ))}
        </View>

        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center gap-2'>
            <BarChart3 size={16} color='#111827' />
            <CardTitle>Revenue • {timeframe}</CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            {revenueQuery.isLoading ? (
              <Loading />
            ) : revenueQuery.data && revenueQuery.data.data.length ? (
              <BarChart
                data={revenueQuery.data.data.slice(-7).map((p) => {
                  const dt=new Date(p.date); const lbl=timeframe==='day'? dt.toLocaleTimeString('en-KE',{hour:'2-digit'}): timeframe==='year'? dt.toLocaleDateString('en-KE',{month:'short'}): `${dt.toLocaleDateString('en-KE',{weekday:'short'}).slice(0,2)} ${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`
                  return { label: lbl, value: Number(p.revenue) }
                })}
                color='#0f766e'
                height={130}
                showValues
              />
            ) : (
              <Text className='text-sm text-gray-500 py-6 text-center'>
                No revenue data
              </Text>
            )}
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Trend • switch</CardTitle>
            <Text className='text-xs text-gray-500'>
              revenue / profit / margin — one line
            </Text>
          </CardHeader>
          <CardContent className='pt-0'>
            {revenueQuery.isLoading || profitQuery.isLoading ? (
              <Loading />
            ) : (
              <SwitchableLineCard
                sales={(revenueQuery.data?.data || []).slice(-7).map((p) => {
                  const dt=new Date(p.date); return { label: timeframe==='day'? dt.toLocaleTimeString('en-KE',{hour:'2-digit'}): `${dt.toLocaleDateString('en-KE',{weekday:'short'}).slice(0,3)} ${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`, value: Number((p as any).transactions ?? 0) }
                })}
                revenue={(revenueQuery.data?.data || []).slice(-7).map((p) => {
                  const dt=new Date(p.date); return { label: timeframe==='day'? dt.toLocaleTimeString('en-KE',{hour:'2-digit'}): `${dt.toLocaleDateString('en-KE',{weekday:'short'}).slice(0,3)} ${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`, value: Number(p.revenue) }
                })}
                profit={(profitQuery.data?.data || []).slice(-7).map((p) => {
                  const dt=new Date(p.date); return { label: timeframe==='day'? dt.toLocaleTimeString('en-KE',{hour:'2-digit'}): `${dt.toLocaleDateString('en-KE',{weekday:'short'}).slice(0,3)} ${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`, value: Number((p as any).profit ?? 0) }
                })}
              />
            )}
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Profit & margin</CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            {profitQuery.isLoading ? (
              <Loading />
            ) : profitQuery.data && profitQuery.data.data.length ? (
              <View className='gap-2'>
                {profitQuery.data.data.map((pt, i) => (
                  <View
                    key={i}
                    className='flex-row justify-between items-center p-3 rounded-2xl bg-gray-50 border border-gray-100'
                  >
                    <Text className='text-xs font-semibold text-gray-700'>
                      {pt.date.split('T')[0].slice(5)}
                    </Text>
                    <View className='flex-row gap-3'>
                      <Text className='text-xs font-bold font-mono text-emerald-700'>
                        {formatCurrency(Number(pt.profit))}
                      </Text>
                      <Text className='text-xs font-bold text-gray-500'>
                        {Number(pt.margin).toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text className='text-sm text-gray-500 py-6 text-center'>
                No profit data
              </Text>
            )}
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center gap-2'>
            <PieChart size={16} color='#111827' />
            <CardTitle>Category sales • pie</CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            {categoryQuery.isLoading ? (
              <Loading />
            ) : categoryQuery.data && categoryQuery.data.categories.length ? (
              <Pie
                data={categoryQuery.data.categories
                  .slice(0, 6)
                  .map((c) => ({ name: c.name, value: Number(c.revenue) }))}
                size={170}
              />
            ) : (
              <Text className='text-sm text-gray-500 py-6 text-center'>
                No category data
              </Text>
            )}
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Category performance</CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            {categoryQuery.isLoading ? (
              <Loading />
            ) : categoryQuery.data && categoryQuery.data.categories.length ? (
              <View className='gap-4'>
                {categoryQuery.data.categories.map((cat, i) => (
                  <View key={i} className='gap-2'>
                    <View className='flex-row justify-between items-center'>
                      <Text className='text-sm font-semibold text-gray-900'>
                        {cat.name}
                      </Text>
                      <Text className='text-xs font-bold font-mono text-gray-900'>
                        {formatCurrency(Number(cat.revenue))}{' '}
                        <Text className='font-normal text-gray-500'>
                          ({Number(cat.percentage).toFixed(1)}%)
                        </Text>
                      </Text>
                    </View>
                    <View className='h-2 bg-gray-100 rounded-full overflow-hidden'>
                      <View
                        style={{
                          width: `${Math.min(Number(cat.percentage), 100)}%`,
                        }}
                        className='h-2 bg-gray-900 rounded-full'
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text className='text-sm text-gray-500 py-6 text-center'>
                No category data
              </Text>
            )}
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Customer segments</CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            {customerQuery.isLoading ? (
              <Loading />
            ) : customerQuery.data && customerQuery.data.segments.length ? (
              <View className='gap-3'>
                {customerQuery.data.segments.map((seg, i) => (
                  <View
                    key={i}
                    className='p-3 rounded-2xl bg-white border border-gray-200'
                  >
                    <View className='flex-row justify-between'>
                      <Text className='text-sm font-bold text-gray-900'>
                        {seg.segment}
                      </Text>
                      <Text className='text-xs text-gray-500'>
                        {seg.count} customers
                      </Text>
                    </View>
                    <View className='flex-row gap-3 mt-1'>
                      <Text
                        className={`text-xs font-bold ${Number(seg.growth) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
                      >
                        {Number(seg.growth) >= 0 ? '+' : ''}
                        {Number(seg.growth).toFixed(1)}% growth
                      </Text>
                      <Text className='text-xs text-gray-600'>
                        AOV {formatCurrency(Number(seg.avgOrderValue))}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text className='text-sm text-gray-500 py-6 text-center'>
                No customer data
              </Text>
            )}
          </CardContent>
        </Card>
      </ScrollView>
    </View>
  )
}
