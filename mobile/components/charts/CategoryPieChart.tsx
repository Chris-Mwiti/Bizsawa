import React from 'react'
import { View, Text } from 'react-native'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'

export interface CategoryPieChartProps {
  categories: Array<{
    name: string
    revenue: number
    percentage: number
    trend: 'up' | 'down' | 'stable'
  }>
  title?: string
}

export function CategoryPieChart({
  categories,
  title = 'Category Performance',
}: CategoryPieChartProps) {
  if (!categories || categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <View className='items-center py-8'>
            <Text className='text-gray-500'>No category data</Text>
          </View>
        </CardContent>
      </Card>
    )
  }

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString('en-KE')}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <View className='space-y-3'>
          {categories.map((cat, i) => (
            <View key={i} className='space-y-1'>
              <View className='flex-row justify-between items-center'>
                <Text className='font-medium text-gray-900'>{cat.name}</Text>
                <View className='flex-row items-center gap-2'>
                  <Text className='font-bold font-mono text-gray-900'>
                    {formatCurrency(cat.revenue)}
                  </Text>
                  <Text className='text-xs text-gray-500'>
                    ({cat.percentage.toFixed(1)}%)
                  </Text>
                  <Text
                    className={`text-xs font-bold ${cat.trend === 'up' ? 'text-green-700' : cat.trend === 'down' ? 'text-red-700' : 'text-gray-500'}`}
                  >
                    {cat.trend.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  height: 8,
                  backgroundColor: '#e5e7eb',
                  borderRadius: 4,
                }}
              >
                <View
                  style={{
                    height: 8,
                    width: `${Math.min(cat.percentage, 100)}%`,
                    backgroundColor: '#006b5f',
                    borderRadius: 4,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      </CardContent>
    </Card>
  )
}
