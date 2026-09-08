import React, { memo, useCallback, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  CheckCircle,
  Smartphone,
  Trash2,
} from 'lucide-react-native'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { OrdersEmptyState } from '../components/OrderEmptyState'
import { OrdersFooter } from '../components/OrderFooter'
import { OrdersHeader } from '../components/OrderHeader'
import { SalesEntryModal, DraftLine } from '../components/SalesEntryModal'
import { TAB_BAR_SCROLL_PADDING } from '../constants/tabBar'
import { useCustomers, useCreateCustomer } from '../hooks/api/useCustomers'
import { OrderStatus, useOrders } from '../hooks/api/useOrders'
import { useInitiatePayment, usePaymentStatus } from '../hooks/api/usePayments'
import { useProducts } from '../hooks/api/useProducts'
import { Order, toNumber } from '../lib/api-dtos'
import { shortId } from '../lib/ids'

const statusPill = (s: string) => {
  if (s === 'fulfilled')
    return 'bg-emerald-50 border-emerald-100 text-emerald-700'
  if (s === 'confirmed') return 'bg-sky-50 border-sky-100 text-sky-700'
  if (s === 'cancelled') return 'bg-red-50 border-red-100 text-red-700'
  return 'bg-amber-50 border-amber-100 text-amber-700'
}

const OrderItem = memo(
  ({
    order,
    onPress,
    onUpdateStatus,
    onInitiatePayment,
    isInitiatingPayment,
    formatCurrency,
    formatDate,
  }: {
    order: Order
    onPress: (order: Order) => void
    onUpdateStatus: (order: Order, status: OrderStatus) => void
    onInitiatePayment: (order: Order) => void
    isInitiatingPayment: boolean
    formatCurrency: (amount: number) => string
    formatDate: (iso: string) => string
  }) => {
    const s = String(order.status)
    const isFulfilled = s === 'fulfilled' || s === 'paid'
    const isCancelled = s === 'cancelled' || s === 'failed'
    const showMpesa = !isFulfilled && !isCancelled
    return (
      <Pressable
        onPress={() => onPress(order)}
        style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}
      >
        <Card className='border border-gray-200'>
          <CardContent className='p-4'>
            <View className='flex-row justify-between gap-3 mb-3'>
              <View className='flex-1'>
                <Text
                  className='text-sm font-bold tracking-tight text-gray-900'
                  numberOfLines={1}
                >
                  Order • {shortId(order.id, 6)}
                </Text>
                <Text className='text-xs text-gray-500 mt-1'>
                  {formatDate(order.createdAt)} • {order.paymentMethod}
                </Text>
              </View>
              <View className='items-end gap-1'>
                <Text className='text-sm font-bold tracking-tight text-gray-900 font-mono'>
                {formatCurrency(toNumber(order.total))}
                </Text>
                <View
                  className={`px-2 py-1 rounded-full border ${statusPill(order.status)}`}
                >
                  <Text className='text-xs font-bold tracking-widest'>
                    {order.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            <View className='flex-row gap-2'>
              {order.status === 'draft' && (
                <TouchableOpacity
                  className='flex-1 bg-gray-900 py-3 rounded-2xl items-center'
                  onPress={(e) => {
                    e.stopPropagation()
                    onUpdateStatus(order, OrderStatus.confirmed)
                  }}
                >
                  <Text className='text-white font-bold text-sm'>Confirm</Text>
                </TouchableOpacity>
              )}
              {order.status === 'confirmed' && (
                <TouchableOpacity
                  className='flex-1 bg-gray-900 py-3 rounded-2xl items-center'
                  onPress={(e) => {
                    e.stopPropagation()
                    onUpdateStatus(order, OrderStatus.fulfilled)
                  }}
                >
                  <Text className='text-white font-bold text-sm'>Fulfill</Text>
                </TouchableOpacity>
              )}
              {showMpesa ? (
                <TouchableOpacity
                  className='w-11 h-11 rounded-2xl bg-white border border-gray-200 items-center justify-center'
                  onPress={(e) => {
                    e.stopPropagation()
                    onInitiatePayment(order)
                  }}
                  disabled={isInitiatingPayment}
                >
                  <Smartphone size={16} color='#111827' />
                </TouchableOpacity>
              ) : (
                <View className='w-11 h-11 rounded-2xl bg-gray-100 border border-gray-200 items-center justify-center opacity-50'>
                  <Smartphone size={16} color='#9ca3af' />
                </View>
              )}
              {!isFulfilled && !isCancelled && (
                <TouchableOpacity
                  className='w-11 h-11 rounded-2xl bg-white border border-red-200 items-center justify-center'
                  onPress={(e) => {
                    e.stopPropagation()
                    onUpdateStatus(order, OrderStatus.cancelled)
                  }}
                >
                  <Trash2 size={16} color='#dc2626' />
                </TouchableOpacity>
              )}
            </View>
            {isFulfilled && (
              <Text className='text-xs text-gray-400 mt-2 text-center'>
                Fulfilled — M-Pesa disabled
              </Text>
            )}
          </CardContent>
        </Card>
      </Pressable>
    )
  },
)
OrderItem.displayName = 'OrderItem'

export default function OrdersScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '' })
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [draftLines, setDraftLines] = useState<DraftLine[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  )
  const [quantity, setQuantity] = useState('1')
  const [paymentId, setPaymentId] = useState<string | null>(null)

  const { products, isLoading: productsLoading } = useProducts()
  const { data: customers = [] } = useCustomers()
  const { mutateAsync: createCustomer } = useCreateCustomer()
  const {
    orders,
    hasNextPage,
    createOrder,
    updateOrder,
    nextPage,
    isCreating: isCreatingOrder,
    isFetching,
  } = useOrders({ limit: 25 })
  const { mutateAsync: initiatePayment, isPending: isInitiatingPayment } =
    useInitiatePayment()
  const paymentStatus = usePaymentStatus(paymentId || undefined, !!paymentId)

  const selectedProduct = products.find((p) => p.id === selectedProductId)
  const total = draftLines.reduce(
    (sum, line) => sum + toNumber(line.unitPrice) * toNumber(line.quantity),
    0,
  )
  const orderStats = useMemo(() => {
    const open = orders.filter(
      (o) => o.status === 'draft' || o.status === 'confirmed',
    ).length
    const fulfilled = orders.filter((o) => o.status === 'fulfilled').length
    const value = orders.reduce((sum, o) => sum + toNumber(o.total), 0)
    return { open, fulfilled, value }
  }, [orders])

  const formatCurrency = useCallback(
    (amount: number) => `KES ${amount.toLocaleString('en-KE')}`,
    [],
  )
  const formatDate = useCallback(
    (iso: string) =>
      new Date(iso).toLocaleDateString('en-KE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [],
  )

  const addLine = () => {
    if (!selectedProduct)
      return Alert.alert('Validation', 'Select a product first.')

    const variants = (selectedProduct as any).variants || []
    const hasVariants = variants.length > 0
    if (hasVariants && !selectedVariantId) {
      return Alert.alert(
        'Validation',
        'This product has variants — please select one.',
      )
    }
    if (toNumber(quantity) <= 0)
      return Alert.alert('Validation', 'Enter a valid quantity.')

    const variant = hasVariants
      ? variants.find((v: any) => v.id === selectedVariantId)
      : null
    const unitPrice = variant
      ? variant.price.toString()
      : selectedProduct.price.toString()

    setDraftLines((prev) => [
      ...prev,
      {
        productId: selectedProduct.id,
        variantId: variant?.id || null,
        productName: selectedProduct.name,
        variantName: variant?.name || null,
        quantity,
        unitPrice,
      },
    ])
    setSelectedProductId('')
    setSelectedVariantId(null)
    setQuantity('1')
  }

  const removeLine = (index: number) => {
    setDraftLines((prev) => prev.filter((_, i) => i !== index))
  }

  const resetDraft = () => {
    setCustomerId(null)
    setPaymentMethod('cash')
    setDraftLines([])
    setSelectedProductId('')
    setSelectedVariantId(null)
    setQuantity('1')
  }
  const handleCreateCustomer = async () => {
    if (!customerForm.name.trim())
      return Alert.alert('Validation', 'Customer name is required.')
    const c = await createCustomer({
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim() || undefined,
    })
    setCustomerId(c.id)
    setCustomerForm({ name: '', phone: '' })
    setShowCustomerModal(false)
  }
  const handleCreateOrder = async () => {
    if (draftLines.length === 0)
      return Alert.alert('Validation', 'Add at least one product.')
    try {
      const order = await createOrder({
        customerId,
        paymentMethod,
        lines: draftLines.map((l) => ({
          productId: l.productId,
          variantId: (l as any).variantId || null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      })
      setShowOrderModal(false)
      resetDraft()
      Alert.alert('Success', `Order ${order.status} created.`)
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.friendlyMessage || e.message || 'Failed to create order.',
      )
    }
  }
  const handleUpdateStatus = useCallback(
    async (order: Order, status: OrderStatus) => {
      const customer = order.customerId
        ? customers.find((i) => i.id === order.customerId)
        : undefined
      if (
        status === OrderStatus.confirmed &&
        order.paymentMethod == 'mpesa' &&
        customer?.phone
      ) {
        try {
          await updateOrder({
            id: order.id,
            data: { status, customerPhone: customer?.phone },
          })
        } catch {
          Alert.alert('Error', 'Failed to update order')
        }
        return
      }
      try {
        await updateOrder({ id: order.id, data: { status } })
      } catch {
        Alert.alert('Error', 'Failed to update order')
      }
    },
    [customers, updateOrder],
  )
  const handleInitiateOrderPayment = useCallback(
    async (order: Order) => {
      const customer = order.customerId
        ? customers.find((i) => i.id === order.customerId)
        : undefined
      if (!customer?.phone)
        return Alert.alert(
          'Missing phone',
          'This order needs a customer phone number before M-Pesa.',
        )
      const payment = await initiatePayment({
        orderId: order.id,
        phone: customer.phone,
        amount: order.total,
        currency: 'KES',
      })
      setPaymentId(payment.id)
      Alert.alert('Payment sent', 'M-Pesa request sent.')
    },
    [customers, initiatePayment],
  )

  const handlePressOrder = useCallback(
    (order: Order) => router.push(`/orders/${order.id}` as any),
    [router],
  )
  const renderOrder = useCallback(
    ({ item: order }: { item: Order }) => (
      <OrderItem
        order={order}
        onPress={handlePressOrder}
        onUpdateStatus={handleUpdateStatus}
        onInitiatePayment={handleInitiateOrderPayment}
        isInitiatingPayment={isInitiatingPayment}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
      />
    ),
    [
      handlePressOrder,
      handleUpdateStatus,
      handleInitiateOrderPayment,
      isInitiatingPayment,
      formatCurrency,
      formatDate,
    ],
  )

  if (productsLoading)
    return (
      <View className='flex-1 bg-gray-50 items-center justify-center px-6'>
        <ActivityIndicator color='#111827' />
        <Text className='text-sm text-gray-500 mt-2'>Loading orders…</Text>
      </View>
    )

  return (
    <View className='flex-1 bg-gray-50'>
      <View className='px-4 pt-12 pb-4 bg-white border-b border-gray-200'>
        <View className='flex-row items-center gap-3 mb-4'>
          <TouchableOpacity
            onPress={() => router.back()}
            className='w-11 h-11 rounded-full bg-gray-100 items-center justify-center'
          >
            <ChevronLeft size={18} color='#111827' />
          </TouchableOpacity>
          <View>
            <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
              Workspace
            </Text>
            <Text className='text-lg font-bold tracking-tight text-gray-900 -mt-0.5'>
              Orders
            </Text>
          </View>
          <Text className='ml-auto text-xs text-gray-500'>
            {orders.length} total
          </Text>
        </View>
        <View className='flex-row bg-gray-100 rounded-full p-1'>
          <Pressable
            onPress={() => router.replace('/(tabs)/sales')}
            className='flex-1 py-3 rounded-full items-center'
          >
            <Text className='text-sm font-medium text-gray-500'>Sales</Text>
          </Pressable>
          <View className='flex-1 py-3 rounded-full items-center bg-white shadow-sm border border-gray-200'>
            <Text className='text-sm font-bold text-gray-900'>Orders</Text>
          </View>
          <Pressable
            onPress={() => router.replace('/invoices')}
            className='flex-1 py-3 rounded-full items-center'
          >
            <Text className='text-sm font-medium text-gray-500'>Invoices</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        renderItem={renderOrder}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
          gap: 12,
        }}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasNextPage && !isFetching) nextPage()
        }}
        ListHeaderComponent={
          <OrdersHeader
            stats={orderStats}
            formatCurrency={formatCurrency}
            onCreateOrder={() => setShowOrderModal(true)}
          />
        }
        ListEmptyComponent={<OrdersEmptyState />}
        ListFooterComponent={<OrdersFooter visible={isFetching} />}
      />

      <SalesEntryModal
        visible={showOrderModal}
        title='Create New Order'
        products={products}
        customers={customers}
        customerId={customerId}
        setCustomerId={setCustomerId}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        selectedVariantId={selectedVariantId}
        setSelectedVariantId={setSelectedVariantId}
        quantity={quantity}
        setQuantity={setQuantity}
        draftLines={draftLines}
        addLine={addLine}
        removeLine={removeLine}
        total={total}
        isSaving={isCreatingOrder}
        onAddCustomer={() => setShowCustomerModal(true)}
        onClose={() => {
          setShowOrderModal(false)
          setSelectedVariantId(null)
        }}
        onSubmit={handleCreateOrder}
      />

      <Modal
        visible={showCustomerModal}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={() => setShowCustomerModal(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={20}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View className='flex-1 bg-gray-50 p-4 justify-center' style={{ paddingBottom: insets.bottom }}>
          <Card className='border border-gray-200'>
            <CardHeader>
              <CardTitle>
                <Text className='font-bold text-gray-900'>New Customer</Text>
              </CardTitle>
            </CardHeader>
            <CardContent className='gap-3'>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
                placeholder='Customer name *'
                value={customerForm.name}
                onChangeText={(n) =>
                  setCustomerForm((p) => ({ ...p, name: n }))
                }
              />
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
                placeholder='Phone'
                keyboardType='phone-pad'
                value={customerForm.phone}
                onChangeText={(p) =>
                  setCustomerForm((pr) => ({ ...pr, phone: p }))
                }
              />
              <TouchableOpacity
                className='bg-gray-900 py-4 rounded-2xl items-center mt-2'
                onPress={handleCreateCustomer}
              >
                <Text className='text-white font-bold text-sm'>
                  Save Customer
                </Text>
              </TouchableOpacity>
            </CardContent>
          </Card>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {paymentStatus.data && (
        <View className='absolute bottom-24 left-4 right-4 bg-white border border-gray-200 rounded-2xl p-3 flex-row items-center gap-2 shadow-sm'>
          <CheckCircle
            size={18}
            color={
              paymentStatus.data.status === 'failed' ? '#dc2626' : '#059669'
            }
          />
          <Text className='text-sm font-semibold text-gray-900'>
            Payment {paymentStatus.data.status}
          </Text>
        </View>
      )}
    </View>
  )
}
