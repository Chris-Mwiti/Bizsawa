import React, { memo } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Plus } from 'lucide-react-native'
import { Card, CardContent } from '../components/ui/Card'

interface OrderStats {
  open: number
  fulfilled: number
  value: number
}

interface OrdersHeaderProps {
  stats: OrderStats
  formatCurrency: (amount: number) => string
  onCreateOrder: () => void
}

export const OrdersHeader = memo(
  ({ stats, formatCurrency, onCreateOrder }: OrdersHeaderProps) => {
    return (
      <View>
        <View className='flex-row justify-between mb-4'>
          <Card className='w-[31%]'>
            <CardContent className='p-3 items-center'>
              <Text className='text-lg font-bold'>{stats.open}</Text>
              <Text className='text-xs text-gray-500'>Open</Text>
            </CardContent>
          </Card>
          <Card className='w-[31%]'>
            <CardContent className='p-3 items-center'>
              <Text className='text-lg font-bold'>{stats.fulfilled}</Text>
              <Text className='text-xs text-gray-500'>Done</Text>
            </CardContent>
          </Card>
          <Card className='w-[31%]'>
            <CardContent className='p-3 items-center'>
              <Text className='text-lg font-bold'>
                {formatCurrency(stats.value)}
              </Text>
              <Text className='text-xs text-gray-500'>Value</Text>
            </CardContent>
          </Card>
        </View>
        <TouchableOpacity
          className='bg-gray-900 h-12 rounded-lg flex-row items-center justify-center mb-4'
          onPress={onCreateOrder}
        >
          <Plus size={18} color='white' />
          <Text className='text-white font-bold ml-2'>Create Order</Text>
        </TouchableOpacity>
      </View>
    )
  },
  (prev, next) =>
    prev.stats.open === next.stats.open &&
    prev.stats.fulfilled === next.stats.fulfilled &&
    prev.stats.value === next.stats.value &&
    prev.formatCurrency === next.formatCurrency &&
    prev.onCreateOrder === next.onCreateOrder,
)

OrdersHeader.displayName = 'OrdersHeader'
