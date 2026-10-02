import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import {
  ChevronLeft,
  CheckCircle,
  Clock,
  Package,
  User,
  Smartphone,
  Trash2,
  Check,
  XCircle,
  CreditCard,
} from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card'
import { useOrders, OrderStatus } from '../../hooks/api/useOrders'
import { useCustomers } from '../../hooks/api/useCustomers'
import { useProducts } from '../../hooks/api/useProducts'
import {
  useCancelPayment,
  useInitiatePayment,
  usePaymentStatus,
} from '../../hooks/api/usePayments'
import {
  isPaymentFailed,
  isPaymentPending,
  isPaymentSucceeded,
  normalizePaymentStatus,
  paymentFailureMessage,
} from '../../lib/payment-status'
import { TAB_BAR_SCROLL_PADDING } from '../../constants/tabBar'
import { toNumber } from '../../lib/api-dtos'
import { shortId } from '../../lib/ids'

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')} ${d.toLocaleString('en-KE', { month: 'short' })} ${d.getFullYear()}`
}

const STATUS_STYLE: Record<
  string,
  { bg: string; text: string; label: string; icon: any }
> = {
  draft: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    label: 'DRAFT',
    icon: Clock,
  },
  confirmed: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    label: 'CONFIRMED',
    icon: Check,
  },
  fulfilled: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    label: 'FULFILLED',
    icon: CheckCircle,
  },
  cancelled: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    label: 'CANCELLED',
    icon: XCircle,
  },
  paid: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    label: 'FULFILLED',
    icon: CheckCircle,
  },
  failed: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    label: 'FAILED',
    icon: XCircle,
  },
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { getOrder, updateOrder, isUpdating } = useOrders()
  const { data: customers = [] } = useCustomers()
  const { products } = useProducts()
  const { mutateAsync: initiatePayment, isPending: isInitiating } =
    useInitiatePayment()
  const { mutateAsync: cancelPayment, isPending: isCancelling } =
    useCancelPayment()
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const paymentStatus = usePaymentStatus(paymentId || undefined, !!paymentId)
  const autoConfirmedRef = useRef(false)
  const failureNotifiedRef = useRef<string | null>(null)

  const query = getOrder(id)
  const order: any = query.data
  const isLoading = query.isLoading

  const formatCurrency = (amount: string | number) =>
    `KES ${toNumber(amount).toLocaleString('en-KE')}`

  const productMap = useMemo(() => {
    const m = new Map<string, string>()
    products.forEach((p) => m.set(p.id, p.name))
    return m
  }, [products])

  const getLineTitle = (line: any) => {
    if (line.productId && productMap.has(line.productId))
      return productMap.get(line.productId)!
    if (line.description) return line.description
    return 'Item'
  }

  const handleUpdateStatus = async (status: OrderStatus) => {
    try {
      if (!id || typeof id !== 'string') {
        Alert.alert('Error', 'Order id missing')
        return
      }
      // Always send only {status} — customerPhone is not an orders column (was silently dropped and caused sync confusion)
      await updateOrder({ id: id as any, data: { status } })
      query.refetch()
    } catch (e: any) {
      console.error('[OrderDetail] updateOrder failed', e)
      Alert.alert(
        'Error',
        e.friendlyMessage || e.message || 'Failed to update order',
      )
    }
  }

  const handleMpesa = async () => {
    const customer = order?.customerId
      ? customers.find((c: any) => c.id === order.customerId)
      : undefined
    if (!customer?.phone)
      return Alert.alert(
        'Missing phone',
        'This order needs a customer phone before M-Pesa.',
      )
    // Prevent double charge: if already confirmed/fulfilled or already have pending payment, don't re-send
    if (String(order.status) !== 'draft') {
      Alert.alert('Already processed', `Order is already ${order.status} — M-Pesa not needed.`)
      return
    }
    if (paymentId && isPaymentPending(paymentStatus.data?.status)) {
      Alert.alert('Payment pending', 'An M-Pesa request is already pending for this order.')
      return
    }
    try {
      setPaymentError(null)
      failureNotifiedRef.current = null
      const payment = await initiatePayment({
        orderId: id,
        phone: customer.phone,
        amount: order.total,
        currency: 'KES',
      })
      // The direct-API path returns the server id (pollable); the offline
      // queue path returns a local id that reconciles on next sync. Either
      // way the status poller below watches for the terminal outcome.
      // A synchronous Daraja rejection can already come back as failed — if
      // the server id is missing we surface the local pending state instead.
      if (isPaymentFailed((payment as any)?.status)) {
        setPaymentError(paymentFailureMessage(payment))
        Alert.alert('M-Pesa failed', paymentFailureMessage(payment))
        return
      }
      setPaymentId(payment.id)
      autoConfirmedRef.current = false
      Alert.alert(
        'Payment sent',
        `M-Pesa request sent (${payment.id.slice(0, 8)}…) — order will auto-confirm on success. If you cancel on your phone, the order stays draft so you can retry.`,
      )
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.friendlyMessage || e.message || 'Failed to initiate M-Pesa',
      )
    }
  }

  const handleCancelPayment = async () => {
    if (!paymentId) return
    try {
      await cancelPayment(paymentId)
      await paymentStatus.refetch()
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.friendlyMessage || e.message || 'Failed to cancel payment',
      )
    }
  }

  // Auto-confirm draft → confirmed when M-Pesa succeeds (prevents double charges).
  // Any terminal failure (cancelled on phone, timeout, insufficient balance)
  // flips the UI to failed, notifies once, and leaves the order in draft so
  // the user can retry — the order is NOT auto-confirmed or auto-cancelled.
  useEffect(() => {
    const rawStatus = paymentStatus.data?.status
    const status = normalizePaymentStatus(rawStatus)
    if (!paymentId || !rawStatus) return
    if (isPaymentSucceeded(rawStatus) && !autoConfirmedRef.current && String(order?.status) === 'draft') {
      autoConfirmedRef.current = true
      updateOrder({ id: id as any, data: { status: OrderStatus.confirmed } })
        .then(() => {
          Alert.alert('Payment confirmed', 'M-Pesa succeeded — order moved to Confirmed.')
          query.refetch()
        })
        .catch((e: any) => console.error('[OrderDetail] auto-confirm failed', e))
    }
    if (isPaymentFailed(rawStatus) && failureNotifiedRef.current !== paymentId) {
      failureNotifiedRef.current = paymentId
      const msg = paymentFailureMessage(paymentStatus.data)
      setPaymentError(msg)
      Alert.alert('M-Pesa failed', `${msg}\n\nOrder is still draft — you can retry.`)
    }
  }, [paymentStatus.data?.status, order?.status, paymentId, id])

  if (isLoading)
    return (
      <View className='flex-1 items-center justify-center bg-white'>
        <ActivityIndicator size='large' color='#111827' />
      </View>
    )
  if (!order)
    return (
      <View className='flex-1 items-center justify-center p-6 bg-gray-50'>
        <Text className='font-sans text-gray-500'>Order not found</Text>
        <Pressable
          onPress={() => router.back()}
          className='mt-4 px-4 py-2 bg-accent rounded-full'
        >
          <Text className='font-geist-bold text-white font-bold text-sm'>Go back</Text>
        </Pressable>
      </View>
    )

  const s = STATUS_STYLE[String(order.status)] || STATUS_STYLE.draft
  const Icon = s.icon
  const customer = customers.find((c: any) => c.id === order.customerId)
  const isFulfilled =
    String(order.status) === 'fulfilled' || String(order.status) === 'paid'
  const isCancelled =
    String(order.status) === 'cancelled' || String(order.status) === 'failed'
  const isDraft = String(order.status) === 'draft'
  const isConfirmed = String(order.status) === 'confirmed'

  return (
    <View className='flex-1 bg-gray-50'>
      {/* Header — impeccable */}
      <View className='px-4 pt-12 pb-4 bg-white border-b border-gray-200'>
        <View className='flex-row items-center gap-3'>
          <TouchableOpacity
            onPress={() => router.back()}
            className='p-2 -ml-2 rounded-full active:bg-gray-100'
          >
            <ChevronLeft size={22} color='#111827' />
          </TouchableOpacity>
          <View className='flex-1'>
            <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
              Order
            </Text>
            <Text className='font-geist-bold text-lg font-bold text-gray-900' numberOfLines={1}>
              Order • {shortId(order.id, 6)}
            </Text>
          </View>
          <View
            className={`flex-row items-center gap-2 px-3 py-1.5 rounded-full border ${s.bg} ${s.bg.includes('emerald') ? 'border-emerald-100' : s.bg.includes('red') ? 'border-red-100' : s.bg.includes('sky') ? 'border-sky-100' : 'border-amber-100'}`}
          >
            <Icon
              size={13}
              color={
                s.text.includes('emerald')
                  ? '#047857'
                  : s.text.includes('red')
                    ? '#b91c1c'
                    : s.text.includes('sky')
                      ? '#0369a1'
                      : '#b45309'
              }
            />
            <Text className={`font-geist-bold text-xs font-bold tracking-widest ${s.text}`}>
              {s.label}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Card className='border border-gray-200'>
          <CardContent className='p-5'>
            <View className='flex-row justify-between items-start gap-4'>
              <View className='flex-1'>
                <Text className='font-geist-mono-bold text-xs font-bold tracking-widest text-gray-500 uppercase mb-1'>
                  Total amount
                </Text>
                <Text className='font-geist-mono-bold text-3xl font-bold tracking-tight text-gray-900'>
                  {formatCurrency(order.total)}
                </Text>
                <Text className='font-sans text-xs text-gray-500 mt-1'>
                  {order.paymentMethod?.toUpperCase()} •{' '}
                  {formatDate(order.createdAt)}
                </Text>
              </View>
              <View className='items-end'>
                <Text className='font-sans text-xs text-gray-500'>Status</Text>
                <Text className='font-geist-bold text-sm font-bold text-gray-900 capitalize mt-1'>
                  {order.status}
                </Text>
              </View>
            </View>
            <View className='h-px bg-gray-100 my-4' />
            <View className='flex-row justify-between gap-4'>
              <View className='flex-1'>
                <Text className='font-geist-mono-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                  Subtotal
                </Text>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-900 mt-1'>
                  {formatCurrency(order.subtotal)}
                </Text>
              </View>
              <View className='flex-1'>
                <Text className='font-geist-mono-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                  Tax
                </Text>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-900 mt-1'>
                  {formatCurrency(order.taxAmount)}
                </Text>
              </View>
              <View className='flex-1 items-end'>
                <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                  Items
                </Text>
                <Text className='font-geist-bold text-sm font-bold text-gray-900 mt-1'>
                  {order.lines?.length || 0}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Customer */}
        <Card className='border border-gray-200'>
          <CardHeader className='pb-2'>
            <View className='flex-row items-center gap-2'>
              <User size={16} color='#6b7280' />
              <CardTitle>Customer</CardTitle>
            </View>
          </CardHeader>
          <CardContent className='pt-0'>
            <View className='flex-row items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100'>
              <View className='w-10 h-10 rounded-full bg-accent items-center justify-center'>
                <Text className='font-geist-bold text-white font-bold'>
                  {(customer?.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className='flex-1'>
                <Text className='font-geist-bold font-bold text-gray-900'>
                  {customer?.name ||
                    (order.customerId
                      ? 'Customer • ' + shortId(order.customerId, 6)
                      : 'Walk-in')}
                </Text>
                <Text className='font-sans text-sm text-gray-500'>
                  {customer?.phone || '-'}
                </Text>
              </View>
              {customer?.email ? (
                <Text className='font-sans text-xs text-gray-500' numberOfLines={1}>
                  {customer.email}
                </Text>
              ) : null}
            </View>
            {!order.customerId && (
              <Text className='font-sans text-xs text-gray-500 mt-2 text-center'>
                No customer linked — walk-in order
              </Text>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card className='border border-gray-200'>
          <CardHeader>
            <View className='flex-row items-center justify-between'>
              <View className='flex-row items-center gap-2'>
                <Package size={16} color='#6b7280' />
                <CardTitle>Items</CardTitle>
              </View>
              <View className='px-3 py-1 rounded-full bg-gray-100'>
                <Text className='font-geist-mono-bold text-xs font-bold text-gray-600'>
                  {order.lines?.length || 0}{' '}
                  {(order.lines?.length || 0) === 1 ? 'item' : 'items'}
                </Text>
              </View>
            </View>
          </CardHeader>
          <CardContent>
            <View className='gap-3'>
              {(order.lines || []).map((line: any, i: number) => {
                const title = getLineTitle(line)
                const qty = toNumber(line.quantity)
                const unit = formatCurrency(line.unitPrice)
                const total = formatCurrency(
                  toNumber(line.lineTotal) || qty * toNumber(line.unitPrice),
                )
                return (
                  <View
                    key={line.id || i}
                    className='flex-row gap-3 p-4 bg-white rounded-2xl border border-gray-200'
                  >
                    <View className='w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 items-center justify-center shrink-0'>
                      <Package size={16} color='#6b7280' />
                    </View>
                    <View className='flex-1 gap-1'>
                      <Text
                        className='font-geist-bold font-bold text-gray-900 text-[14px] leading-4'
                        numberOfLines={2}
                      >
                        {title}
                      </Text>
                      <View className='flex-row items-center gap-2 flex-wrap'>
                        <View className='px-2 py-1 rounded-full bg-gray-100'>
                          <Text className='font-geist-bold text-xs font-bold text-gray-600'>
                            QTY {qty}
                          </Text>
                        </View>
                        <Text className='font-sans text-xs text-gray-500'>× {unit}</Text>
                      </View>
                    </View>
                    <View className='items-end justify-center shrink-0 ml-2'>
                      <Text className='font-geist-bold font-bold text-gray-900 text-sm'>
                        {total}
                      </Text>
                      <Text className='font-sans text-xs text-gray-500'>
                        Line total
                      </Text>
                    </View>
                  </View>
                )
              })}
              {(!order.lines || order.lines.length === 0) && (
                <View className='p-8 items-center border border-dashed border-gray-200 rounded-2xl'>
                  <Text className='font-sans text-sm text-gray-500'>No items</Text>
                </View>
              )}
            </View>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <View className='gap-3'>
              <View className='flex-row justify-between items-center'>
                <Text className='font-sans text-sm text-gray-600'>Subtotal</Text>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-900'>
                  {formatCurrency(order.subtotal)}
                </Text>
              </View>
              <View className='flex-row justify-between items-center'>
                <Text className='font-sans text-sm text-gray-600'>Tax</Text>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-900'>
                  {formatCurrency(order.taxAmount)}
                </Text>
              </View>
              <View className='h-px bg-gray-100' />
              <View className='flex-row justify-between items-center'>
                <Text className='font-geist-mono-bold text-sm font-bold text-gray-900'>Total</Text>
                <Text className='font-geist-mono-bold text-base font-bold text-gray-900'>
                  {formatCurrency(order.total)}
                </Text>
              </View>
              <View className='flex-row justify-between items-center'>
                <Text className='font-sans text-xs text-gray-500'>Payment</Text>
                <View className='px-3 py-1 rounded-full bg-gray-100 border border-gray-200'>
                  <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-600'>
                    {(order.paymentMethod || 'cash').toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* M-Pesa status — pending / failed / succeeded inline feedback */}
        {paymentId && paymentStatus.data ? (
          <Card
            className={`border ${isPaymentFailed(paymentStatus.data.status) ? 'border-red-200' : isPaymentSucceeded(paymentStatus.data.status) ? 'border-emerald-200' : 'border-gray-200'}`}
          >
            <CardContent className='p-4'>
              <View className='flex-row items-center gap-3'>
                {paymentStatus.isFetching ? (
                  <ActivityIndicator size='small' color='#111827' />
                ) : isPaymentFailed(paymentStatus.data.status) ? (
                  <XCircle size={20} color='#dc2626' />
                ) : isPaymentSucceeded(paymentStatus.data.status) ? (
                  <CheckCircle size={20} color='#059669' />
                ) : (
                  <Clock size={20} color='#6b7280' />
                )}
                <View className='flex-1'>
                  <Text className='font-geist-bold text-sm font-bold text-gray-900'>
                    {isPaymentFailed(paymentStatus.data.status)
                      ? 'M-Pesa failed'
                      : isPaymentSucceeded(paymentStatus.data.status)
                        ? 'M-Pesa succeeded'
                        : 'Waiting for M-Pesa…'}
                  </Text>
                  <Text className='font-sans text-xs text-gray-500 mt-0.5'>
                    {isPaymentFailed(paymentStatus.data.status)
                      ? paymentError || paymentFailureMessage(paymentStatus.data)
                      : isPaymentSucceeded(paymentStatus.data.status)
                        ? 'Payment confirmed.'
                        : 'Check the phone for the STK prompt and enter PIN. Cancelling on the phone marks this as failed.'}
                  </Text>
                </View>
              </View>
              <View className='flex-row gap-2 mt-3'>
                {isPaymentFailed(paymentStatus.data.status) ? (
                  <TouchableOpacity
                    className='flex-1 bg-accent py-3 rounded-2xl items-center'
                    onPress={() => {
                      setPaymentId(null)
                      setPaymentError(null)
                      failureNotifiedRef.current = null
                      paymentStatus.remove?.()
                    }}
                  >
                    <Text className='font-geist-bold text-white font-bold text-sm'>
                      Retry M-Pesa
                    </Text>
                  </TouchableOpacity>
                ) : !isPaymentSucceeded(paymentStatus.data.status) ? (
                  <TouchableOpacity
                    className='flex-1 bg-white border border-gray-200 py-3 rounded-2xl items-center'
                    onPress={handleCancelPayment}
                    disabled={isCancelling}
                  >
                    <Text className='font-geist-bold text-gray-900 font-bold text-sm'>
                      {isCancelling ? 'Cancelling…' : 'Cancel request'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </CardContent>
          </Card>
        ) : null}

        {/* Actions — impeccable 2x2 */}
        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <View className='gap-3'>
              <View className='flex-row gap-3'>
                {isDraft && (
                  <TouchableOpacity
                    className='flex-1 flex-row items-center justify-center gap-2 bg-accent px-4 py-4 rounded-2xl active:opacity-90'
                    onPress={() => handleUpdateStatus(OrderStatus.confirmed)}
                    disabled={isUpdating}
                  >
                    <Check size={18} color='white' />
                    <Text className='font-geist-bold text-white font-bold text-sm'>
                      {isUpdating ? 'Updating…' : 'Confirm Order'}
                    </Text>
                  </TouchableOpacity>
                )}
                {isConfirmed && (
                  <TouchableOpacity
                    className='flex-1 flex-row items-center justify-center gap-2 bg-emerald-600 px-4 py-4 rounded-2xl active:opacity-90'
                    onPress={() => handleUpdateStatus(OrderStatus.fulfilled)}
                    disabled={isUpdating}
                  >
                    <CheckCircle size={18} color='white' />
                    <Text className='font-geist-bold text-white font-bold text-sm'>
                      {isUpdating ? 'Fulfilling…' : 'Fulfill Order'}
                    </Text>
                  </TouchableOpacity>
                )}
                {!isFulfilled &&
                  !isCancelled &&
                  isDraft === false &&
                  isConfirmed === false && (
                    <View className='flex-1 bg-gray-100 border border-gray-200 px-4 py-4 rounded-2xl items-center'>
                      <Text className='font-geist-bold text-gray-500 font-bold text-sm'>
                        {order.status.toUpperCase()}
                      </Text>
                    </View>
                  )}
                {isFulfilled || isCancelled ? (
                  <View className='flex-1 bg-gray-50 border border-gray-200 px-4 py-4 rounded-2xl items-center'>
                    <Text className='font-geist-bold text-gray-500 font-bold text-sm'>
                      No further status
                    </Text>
                  </View>
                ) : null}
                {!isFulfilled && !isCancelled ? (
                  <TouchableOpacity
                    className='flex-1 flex-row items-center justify-center gap-2 bg-white border border-red-200 px-4 py-4 rounded-2xl active:bg-red-50'
                    onPress={() => handleUpdateStatus(OrderStatus.cancelled)}
                    disabled={isUpdating}
                  >
                    <Trash2 size={18} color='#dc2626' />
                    <Text className='font-geist-bold text-red-600 font-bold text-sm'>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View className='flex-row gap-3'>
                {!isFulfilled && !isCancelled ? (
                  <TouchableOpacity
                    className='flex-1 flex-row items-center justify-center gap-2 bg-white border border-gray-200 px-4 py-4 rounded-2xl active:bg-gray-50'
                    onPress={handleMpesa}
                    disabled={isInitiating}
                  >
                    <Smartphone size={18} color='#111827' />
                    <Text className='font-geist-bold text-gray-900 font-bold text-sm'>
                      {isInitiating ? 'Sending…' : 'M-Pesa'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View className='flex-1 flex-row items-center justify-center gap-2 bg-gray-100 border border-gray-200 px-4 py-4 rounded-2xl opacity-50'>
                    <Smartphone size={18} color='#6b7280' />
                    <Text className='font-geist-bold text-gray-500 font-bold text-sm'>
                      M-Pesa disabled
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  className='flex-1 flex-row items-center justify-center gap-2 bg-white border border-gray-200 px-4 py-4 rounded-2xl active:bg-gray-50'
                  onPress={() => router.push('/(tabs)/sales/invoices' as any)}
                >
                  <CreditCard size={18} color='#111827' />
                  <Text className='font-geist-bold text-gray-900 font-bold text-sm'>
                    Invoices
                  </Text>
                </TouchableOpacity>
              </View>
              {isFulfilled && (
                <Text className='font-sans text-xs text-center text-gray-500'>
                  Fulfilled — M-Pesa and status changes disabled
                </Text>
              )}
              {isCancelled && (
                <Text className='font-sans text-xs text-center text-gray-500'>
                  Cancelled — no further actions
                </Text>
              )}
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </View>
  )
}
