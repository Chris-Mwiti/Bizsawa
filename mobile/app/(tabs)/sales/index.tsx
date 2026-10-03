import React, { useEffect, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { Plus, Receipt, ArrowUpRight } from 'lucide-react-native'
import {
  Card,
  CardContent,
} from '../../../components/ui/Card'
import { Sheet } from '../../../components/ui/Sheet'
import { Button } from '../../../components/ui/Button'
import { SalesEntryModal, DraftLine } from '../../../components/SalesEntryModal'
import { SuccessCelebration } from '../../../components/ui/SuccessCelebration'
import { DashboardSkeleton } from '../../../components/ui/Skeleton'
import { TAB_BAR_SCROLL_PADDING } from '../../../constants/tabBar'
import { useCustomers, useCreateCustomer } from '../../../hooks/api/useCustomers'
import { useProducts } from '../../../hooks/api/useProducts'
import { useSales } from '../../../hooks/api/useSales'
import { toNumber } from '../../../lib/api-dtos'

export default function SalesTab() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ action?: string }>()
  const [showSaleModal, setShowSaleModal] = useState(false)
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
  const [showSuccess, setShowSuccess] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const { products, isLoading: productsLoading } = useProducts()
  const { data: customers = [], isLoading: customersLoading } = useCustomers() as any
  const { mutateAsync: createCustomer } = useCreateCustomer()
  const {
    sales,
    createSale,
    isCreating: isCreatingSale,
    refetch: refetchSales,
  } = useSales()

  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  )
  const total = draftLines.reduce(
    (sum, line) => sum + toNumber(line.unitPrice) * toNumber(line.quantity),
    0,
  )
  const todaysSales = sales.filter(
    (sale) =>
      new Date(sale.soldAt).toDateString() === new Date().toDateString(),
  )
  const todaysRevenue = todaysSales.reduce(
    (sum, sale) => sum + toNumber(sale.total),
    0,
  )

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString('en-KE')}`
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-KE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  useEffect(() => {
    if (params.action === 'new-sale') setShowSaleModal(true)
  }, [params.action])

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
    const customer = await createCustomer({
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim() || undefined,
    })
    setCustomerId(customer.id)
    setCustomerForm({ name: '', phone: '' })
    setShowCustomerModal(false)
  }

  const handleCreateSale = async () => {
    if (draftLines.length === 0) {
      setInlineError('Add at least one product to record a sale.')
      return
    }
    setInlineError(null)
    try {
      await createSale({
        customerId,
        paymentMethod,
        lines: draftLines.map((l) => ({
          productId: l.productId,
          variantId: (l as any).variantId || null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      })
      setShowSaleModal(false)
      resetDraft()
      await refetchSales()
      setShowSuccess(true)
    } catch (error: any) {
      setInlineError(error.friendlyMessage || error.message || 'Failed to record sale.')
    }
  }

  if (productsLoading) {
    return <DashboardSkeleton />
  }

  return (
    <View className='flex-1 bg-paper'>
      {inlineError ? (
        <View className='mx-4 mt-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex-row items-center gap-2'>
          <Text className='font-sans text-sm text-red-700 flex-1'>{inlineError}</Text>
          <Pressable onPress={() => setInlineError(null)} className='px-3 py-1 rounded-full bg-white border border-red-200'>
            <Text className='font-geist-bold text-xs font-bold text-red-700'>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 96,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Metrics — soft clinical 2-up */}
        <View className='flex-row gap-3'>
          <Card className='flex-1'>
            <CardContent className='p-6'>
              <Text className='font-geist-medium text-xs font-medium text-ink-muted'>
                Today
              </Text>
              <Text className='font-geist-mono-bold text-lg font-bold tracking-tight text-ink mt-1'>
                {formatCurrency(todaysRevenue)}
              </Text>
              <View className='flex-row items-center gap-1 mt-1'>
                <ArrowUpRight size={12} color='#4F625E' />
                <Text className='font-sans text-xs text-ink-muted'>revenue</Text>
              </View>
            </CardContent>
          </Card>
          <Card className='flex-1'>
            <CardContent className='p-6'>
              <Text className='font-geist-medium text-xs font-medium text-ink-muted'>
                Transactions
              </Text>
              <Text className='font-geist-mono-bold text-lg font-bold tracking-tight text-ink mt-1'>
                {todaysSales.length}
              </Text>
              <Text className='font-sans text-xs text-ink-muted mt-1'>
                {sales.length} total
              </Text>
            </CardContent>
          </Card>
        </View>

        {/* List — consistent card language */}
        {sales.length === 0 ? (
          <Card className='border border-dashed border-hairline'>
            <CardContent className='items-center py-12'>
              <View className='w-12 h-12 rounded-full bg-paper border border-hairline items-center justify-center mb-3'>
                <Receipt size={20} color='#4F625E' />
              </View>
              <Text className='font-geist-bold font-bold text-ink'>No sales today</Text>
              <Text className='font-sans text-sm text-ink-muted text-center mt-1 px-6'>
                Sales appear here as you record them. Tap Record Sale to start.
              </Text>
            </CardContent>
          </Card>
        ) : (
          <View className='gap-3'>
            {sales.map((sale) => (
              <Card key={sale.id}>
                <CardContent className='p-6'>
                  <View className='flex-row justify-between gap-3'>
                    <View className='flex-1'>
                      <Text
                        className='font-geist-bold text-sm font-bold text-ink'
                        numberOfLines={1}
                      >
                        {sale.receiptNumber}
                      </Text>
                      <Text className='font-sans text-xs text-ink-muted mt-1'>
                        {formatDate(sale.soldAt)} • {sale.paymentMethod}
                      </Text>
                    </View>
                    <View className='items-end gap-1'>
                      <Text className='font-geist-mono-bold text-sm font-bold tracking-tight text-ink'>
                        {formatCurrency(toNumber(sale.total))}
                      </Text>
                      <View className='px-2 py-1 rounded-full bg-paper border border-hairline'>
                        <Text className='font-geist-bold text-xs font-bold text-ink-muted tracking-wide'>
                          {String(sale.status).toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Thumb-zone sticky CTA: today at a glance + one clear action */}
      <View
        className='absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 pt-3'
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <View className='flex-row items-center justify-between px-1 mb-2'>
          <Text className='font-geist-medium text-xs font-medium text-gray-500'>
            Today • {todaysSales.length} sale
            {todaysSales.length === 1 ? '' : 's'}
          </Text>
          <Text className='font-geist-mono-bold text-sm font-bold text-gray-900'>
            {formatCurrency(todaysRevenue)}
          </Text>
        </View>
        <Button onPress={() => setShowSaleModal(true)}>
          <Plus size={18} color='white' />
          <Text className='font-geist-bold text-white font-bold text-sm'>
            Record sale
          </Text>
        </Button>
      </View>

      <SuccessCelebration
        visible={showSuccess}
        title='Sale recorded! ✨'
        message={`KES ${total.toLocaleString('en-KE')} added to today's revenue. Keep the momentum!`}
        onClose={() => setShowSuccess(false)}
      />
      <SalesEntryModal
        visible={showSaleModal}
        title='Record Direct Sale'
        products={products}
        customers={customers}
        customersLoading={customersLoading}
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
        isSaving={isCreatingSale}
        error={inlineError}
        onAddCustomer={() => setShowCustomerModal(true)}
        onClose={() => {
          setShowSaleModal(false)
          setSelectedVariantId(null)
        }}
        onSubmit={handleCreateSale}
      />

      <Sheet
        visible={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        eyebrow='Customer'
        title='New customer'
        subtitle='They become selectable in the sale sheet'
        footer={
          <Button onPress={handleCreateCustomer}>Save customer</Button>
        }
      >
        <TextInput
          className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
          placeholder='Customer name *'
          value={customerForm.name}
          onChangeText={(name) =>
            setCustomerForm((prev) => ({ ...prev, name }))
          }
        />
        <TextInput
          className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
          placeholder='Phone (optional)'
          keyboardType='phone-pad'
          value={customerForm.phone}
          onChangeText={(phone) =>
            setCustomerForm((prev) => ({ ...prev, phone }))
          }
        />
      </Sheet>
    </View>
  )
}
