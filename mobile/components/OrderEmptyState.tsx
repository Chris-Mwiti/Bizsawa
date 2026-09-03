import { Card, CardContent } from './ui/Card'
import { Text } from 'react-native'
import { memo } from 'react'

export const OrdersEmptyState = memo(() => (
  <Card>
    <CardContent className='p-4 items-center'>
      <Text className='font-bold text-gray-900'>No orders yet</Text>
      <Text className='text-sm text-gray-500 mt-1 text-center'>
        Create an order to track fulfillment and payments.
      </Text>
    </CardContent>
  </Card>
))
OrdersEmptyState.displayName = 'OrdersEmptyState'
