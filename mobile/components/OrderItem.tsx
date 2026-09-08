import React, { memo } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Smartphone, Trash2 } from 'lucide-react-native'
import { Order, toNumber } from '../lib/api-dtos'
import { OrderStatus } from '../hooks/api/useOrders'
import { shortId } from '../lib/ids'

interface OrderItemProps {
  order: Order
  onUpdateStatus: (id: string, status: OrderStatus) => void
  onInitiatePayment: (id: string, amount: string) => void
  isInitiatingPayment: boolean
  formatCurrency: (amount: number) => string
  formatDate: (iso: string) => string
}

export const OrderItem = memo(
  ({
    order,
    onUpdateStatus,
    onInitiatePayment,
    isInitiatingPayment,
    formatCurrency,
    formatDate,
  }: OrderItemProps) => {
    return (
      <Card className='mb-3'>
        <CardContent className='p-4'>
          <View className='flex-row justify-between mb-3'>
            <View className='flex-1 pr-3'>
              <Text className='font-bold text-gray-900'>
                Order {shortId(order.id, 6)}
              </Text>
              <Text className='text-xs text-gray-500'>
                {formatDate(order.createdAt)}
              </Text>
            </View>
            <View className='items-end'>
              <Text className='font-bold font-mono'>
                {formatCurrency(toNumber(order.total))}
              </Text>
              <Badge
                variant={
                  order.status === 'fulfilled' ? 'secondary' : 'destructive'
                }
              >
                {order.status}
              </Badge>
            </View>
          </View>

          <View className='flex-row gap-2'>
            {order.status === 'draft' && (
              <TouchableOpacity
                className='flex-1 bg-green-600 py-2 rounded-2xl items-center'
                onPress={() => onUpdateStatus(order.id, OrderStatus.confirmed)}
              >
                <Text className='text-white font-bold'>Confirm</Text>
              </TouchableOpacity>
            )}
            {order.status === 'confirmed' && (
              <TouchableOpacity
                className='flex-1 bg-blue-600 py-2 rounded-2xl items-center'
                onPress={() => onUpdateStatus(order.id, OrderStatus.fulfilled)}
              >
                <Text className='text-white font-bold'>Fulfill</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              className='px-3 py-2 rounded-2xl bg-gray-100'
              onPress={() => onInitiatePayment(order.id, order.total)}
              disabled={isInitiatingPayment}
            >
              <Smartphone size={18} color='#006b5f' />
            </TouchableOpacity>
            <TouchableOpacity
              className='px-3 py-2 rounded-2xl bg-red-50'
              onPress={() => onUpdateStatus(order.id, OrderStatus.cancelled)}
            >
              <Trash2 size={18} color='#dc2626' />
            </TouchableOpacity>
          </View>
        </CardContent>
      </Card>
    )
  },
)

OrderItem.displayName = 'OrderItem'
