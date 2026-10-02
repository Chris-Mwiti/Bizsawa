import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  CheckCircle,
  Smartphone,
  Trash2,
} from 'lucide-react-native'
import { Card, CardContent } from '../../../components/ui/Card'
import { Sheet } from '../../../components/ui/Sheet'
import { Button } from '../../../components/ui/Button'
import { OrdersEmptyState } from '../../../components/OrderEmptyState'
import { OrdersFooter } from '../../../components/OrderFooter'
import { OrdersHeader } from '../../../components/OrderHeader'
import { SalesEntryModal, DraftLine } from '../../../components/SalesEntryModal'
import { TAB_BAR_SCROLL_PADDING } from '../../../constants/tabBar'
import { useCustomers, useCreateCustomer } from '../../../hooks/api/useCustomers'
import { OrderStatus, useOrders } from '../../../hooks/api/useOrders'
import {
  useCancelPayment,
  useInitiatePayment,
  usePaymentStatus,
} from '../../../hooks/api/usePayments'
import {
  isPaymentFailed,
  isPaymentPending,
  isPaymentSucceeded,
  normalizePaymentStatus,
  paymentFailureMessage,
} from '../../../lib/payment-status'
import { useProducts } from '../../../hooks/api/useProducts'
import { Order, toNumber } from '../../../lib/api-dtos'
import { shortId } from '../../../lib/ids'

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
                  className='font-geist-bold text-sm font-bold tracking-tight text-gray-900'
                  numberOfLines={1}
                >
                  Order • {shortId(order.id, 6)}
                </Text>
                <Text className='font-sans text-xs text-gray-500 mt-1'>
                  {formatDate(order.createdAt)} • {order.paymentMethod}
                </Text>
              </View>
              <View className='items-end gap-1'>
                <Text className='font-geist-mono-bold text-sm font-bold tracking-tight text-gray-900'>
                {formatCurrency(toNumber(order.total))}
                </Text>
                <View
                  className={`px-2 py-1 rounded-full border ${statusPill(order.status)}`}
                >
                  <Text className='font-geist-bold text-xs font-bold tracking-widest'>
                    {order.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            <View className='flex-row gap-2'>
              {order.status === 'draft' && (
                <TouchableOpacity
                  className='flex-1 bg-accent py-3 rounded-2xl items-center'
                  onPress={(e) => {
                    e.stopPropagation()
                    onUpdateStatus(order, OrderStatus.confirmed)
                  }}
                >
                  <Text className='font-geist-bold text-white font-bold text-sm'>Confirm</Text>
                </TouchableOpacity>
              )}
              {order.status === 'confirmed' && (
                <TouchableOpacity
                  className='flex-1 bg-accent py-3 rounded-2xl items-center'
                  onPress={(e) => {
                    e.stopPropagation()
                    onUpdateStatus(order, OrderStatus.fulfilled)
                  }}
                >
                  <Text className='font-geist-bold text-white font-bold text-sm'>Fulfill</Text>
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
                  <Smartphone size={16} color='#6b7280' />
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
              <Text className='font-sans text-xs text-gray-500 mt-2 text-center'>
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
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const autoConfirmRef = useRef(false)
  const failureNotifiedRef = useRef<string | null>(null)

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
  const { mutateAsync: cancelPayment } = useCancelPayment()
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

  /** One-tap add: qty 1, merged when the line already exists. */
  const quickAddLine = (productId: string, variantId?: string | null) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    const variants = (product as any).variants || []
    const variant = variantId
      ? variants.find((v: any) => v.id === variantId)
      : null
    const unitPrice = variant
      ? variant.price.toString()
      : product.price.toString()
    setDraftLines((prev) => {
      const i = prev.findIndex(
        (l) =>
          l.productId === productId &&
          (l.variantId || null) === (variant?.id || null),
      )
      if (i >= 0) {
        const next = [...prev]
        next[i] = {
          ...next[i],
          quantity: String(toNumber(next[i].quantity) + 1),
        }
        return next
      }
      return [
        ...prev,
        {
          productId,
          variantId: variant?.id || null,
          productName: product.name,
          variantName: variant?.name || null,
          quantity: '1',
          unitPrice,
        },
      ]
    })
  }

  const updateLineQty = (index: number, quantity: string) => {
    setDraftLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, quantity } : l)),
    )
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
      if (!order?.id) {
        Alert.alert('Error', 'Order id missing')
        return
      }
      try {
        // Only status is needed — customerPhone is not an orders column
        await updateOrder({ id: order.id, data: { status } })
      } catch (e: any) {
        console.error('[Orders] updateOrder failed', e)
        Alert.alert('Error', e?.message || 'Failed to update order')
      }
    },
    [updateOrder],
  )
  const handleInitiateOrderPayment = useCallback(
    async (order: Order) => {
      if (String(order.status) !== 'draft') {
        Alert.alert('Already processed', `Order is already ${order.status} — M-Pesa not needed.`)
        return
      }
      if (paymentId && isPaymentPending(paymentStatus.data?.status) && paymentOrderId === order.id) {
        Alert.alert('Payment pending', 'An M-Pesa request is already pending for this order.')
        return
      }
      const customer = order.customerId
        ? customers.find((i) => i.id === order.customerId)
        : undefined
      if (!customer?.phone)
        return Alert.alert(
          'Missing phone',
          'This order needs a customer phone number before M-Pesa.',
        )
      try {
        setPaymentError(null)
        failureNotifiedRef.current = null
        const payment = await initiatePayment({
          orderId: order.id,
          phone: customer.phone,
          amount: order.total,
          currency: 'KES',
        })
        if (isPaymentFailed((payment as any)?.status)) {
          const msg = paymentFailureMessage(payment)
          setPaymentError(msg)
          Alert.alert('M-Pesa failed', msg)
          return
        }
        setPaymentId(payment.id)
        setPaymentOrderId(order.id)
        autoConfirmRef.current = false
        Alert.alert('Payment sent', 'M-Pesa request sent — order will auto-confirm on success. Cancelling on the phone marks it as failed so you can retry.')
      } catch (e: any) {
        Alert.alert(
          'Error',
          e.friendlyMessage || e.message || 'Failed to initiate M-Pesa',
        )
      }
    },
    [customers, initiatePayment, paymentId, paymentStatus.data?.status, paymentOrderId],
  )

  const handleCancelPayment = useCallback(async () => {
    if (!paymentId) return
    try {
      await cancelPayment(paymentId)
      await paymentStatus.refetch()
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.friendlyMessage || e?.message || 'Failed to cancel payment',
      )
    }
  }, [cancelPayment, paymentId, paymentStatus])

  // Auto-confirm draft → confirmed when M-Pesa succeeds; notify + keep draft
  // on any terminal failure (cancelled, timeout, failed) so the user can retry.
  useEffect(() => {
    const rawStatus = paymentStatus.data?.status
    if (!paymentId || !paymentOrderId || !rawStatus) return
    const status = normalizePaymentStatus(rawStatus)
    if (isPaymentSucceeded(rawStatus) && !autoConfirmRef.current) {
      const target = orders.find((o) => o.id === paymentOrderId)
      if (target && String(target.status) === 'draft') {
        autoConfirmRef.current = true
        updateOrder({ id: paymentOrderId as any, data: { status: OrderStatus.confirmed } })
          .then(() => Alert.alert('Payment confirmed', 'M-Pesa succeeded — order moved to Confirmed.'))
          .catch((e: any) => console.error('[Orders] auto-confirm failed', e))
      }
    }
    if (isPaymentFailed(rawStatus)) {
      autoConfirmRef.current = true
      if (failureNotifiedRef.current !== paymentId) {
        failureNotifiedRef.current = paymentId
        const msg = paymentFailureMessage(paymentStatus.data)
        setPaymentError(msg)
        Alert.alert('M-Pesa failed', `${msg}\n\nOrder is still draft — you can retry.`)
      }
    }
    void status
  }, [paymentStatus.data?.status, paymentId, paymentOrderId, orders])

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
        <Text className='font-sans text-sm text-gray-500 mt-2'>Loading orders…</Text>
      </View>
    )

  return (
    <View className='flex-1 bg-gray-50'>
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
        quickAddLine={quickAddLine}
        updateLineQty={updateLineQty}
        total={total}
        isSaving={isCreatingOrder}
        submitLabel='Create order'
        onAddCustomer={() => setShowCustomerModal(true)}
        onClose={() => {
          setShowOrderModal(false)
          setSelectedVariantId(null)
        }}
        onSubmit={handleCreateOrder}
      />

      <Sheet
        visible={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        eyebrow='Customer'
        title='New customer'
        subtitle='They become selectable in the order sheet'
        footer={
          <Button onPress={handleCreateCustomer}>Save customer</Button>
        }
      >
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
      </Sheet>

      {paymentStatus.data && (
        <View className='absolute bottom-24 left-4 right-4 bg-white border border-gray-200 rounded-2xl p-3 gap-2 shadow-sm'>
          <View className='flex-row items-center gap-2'>
            <CheckCircle
              size={18}
              color={
                isPaymentFailed(paymentStatus.data.status) ? '#dc2626' : '#059669'
              }
            />
            <Text className='font-geist-semibold text-sm font-semibold text-gray-900 flex-1'>
              {isPaymentFailed(paymentStatus.data.status)
                ? `Payment ${normalizePaymentStatus(paymentStatus.data.status)}`
                : `Payment ${paymentStatus.data.status}`}
            </Text>
            <Pressable
              onPress={() => {
                setPaymentId(null)
                setPaymentOrderId(null)
                setPaymentError(null)
                failureNotifiedRef.current = null
              }}
              className='px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200'
            >
              <Text className='font-geist-bold text-xs font-bold text-gray-600'>Dismiss</Text>
            </Pressable>
          </View>
          {isPaymentFailed(paymentStatus.data.status) ? (
            <Text className='font-sans text-xs text-red-700'>
              {paymentError || paymentFailureMessage(paymentStatus.data)} Order is
              still draft — you can retry.
            </Text>
          ) : isPaymentPending(paymentStatus.data.status) ? (
            <View className='flex-row items-center gap-2'>
              <Text className='font-sans text-xs text-gray-500 flex-1'>
                Waiting for the STK prompt… cancelling on the phone marks this as
                failed.
              </Text>
              <Pressable
                onPress={handleCancelPayment}
                className='px-3 py-1.5 rounded-full bg-white border border-gray-200'
              >
                <Text className='font-geist-bold text-xs font-bold text-gray-700'>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  )
}
