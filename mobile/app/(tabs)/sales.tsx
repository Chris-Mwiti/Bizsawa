import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Plus, Receipt, ArrowUpRight } from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { SalesEntryModal, DraftLine } from '../../components/SalesEntryModal'
import { SuccessCelebration } from '../../components/ui/SuccessCelebration'
import { DashboardSkeleton } from '../../components/ui/Skeleton'
import { TAB_BAR_SCROLL_PADDING } from '../../constants/tabBar'
import { useCustomers, useCreateCustomer } from '../../hooks/api/useCustomers'
import { useProducts } from '../../hooks/api/useProducts'
import { useSales } from '../../hooks/api/useSales'
import { toNumber } from '../../lib/api-dtos'

export default function SalesTab() {
  const router = useRouter()
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
  const { data: customers = [] } = useCustomers()
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
    <View className='flex-1 bg-gray-50'>
      {/* Header — impeccable ink */}
      <View className='px-4 pt-12 pb-4 bg-white border-b border-gray-200'>
        <View className='items-start mb-4'>
          <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
            Workspace
          </Text>
          <Text className='text-xl font-bold tracking-tight text-gray-900 -mt-0.5'>
            Sales Tracker
          </Text>
          <Text className='text-xs text-gray-500'>
            Today's sales & orders • {todaysSales.length} today
          </Text>
        </View>

        <View className='flex-row bg-gray-100 rounded-full p-1'>
          <View className='flex-1 py-3 rounded-full items-center bg-white shadow-sm border border-gray-200'>
            <Text className='font-bold text-gray-900 text-sm'>Sales</Text>
          </View>
          <Pressable
            onPress={() => router.push('/orders')}
            className='flex-1 py-3 rounded-full items-center'
          >
            <Text className='font-medium text-gray-500 text-sm'>Orders</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/invoices')}
            className='flex-1 py-3 rounded-full items-center'
          >
            <Text className='font-medium text-gray-500 text-sm'>Invoices</Text>
          </Pressable>
        </View>
      </View>

      {inlineError ? (
        <View className='mx-4 mt-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex-row items-center gap-2'>
          <Text className='text-sm text-red-700 flex-1'>{inlineError}</Text>
          <Pressable onPress={() => setInlineError(null)} className='px-3 py-1 rounded-full bg-white border border-red-200'>
            <Text className='text-xs font-bold text-red-700'>Dismiss</Text>
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
        {/* Metrics — restrained */}
        <View className='flex-row gap-3'>
          <Card className='flex-1 border border-gray-200'>
            <CardContent className='p-6'>
              <Text className='text-xs font-medium text-gray-500'>
                Today
              </Text>
              <Text className='text-lg font-bold tracking-tight text-gray-900 mt-1 font-mono'>
                {formatCurrency(todaysRevenue)}
              </Text>
              <View className='flex-row items-center gap-1 mt-1'>
                <ArrowUpRight size={12} color='#6b7280' />
                <Text className='text-xs text-gray-500'>revenue</Text>
              </View>
            </CardContent>
          </Card>
          <Card className='flex-1 border border-gray-200'>
            <CardContent className='p-6'>
              <Text className='text-xs font-medium text-gray-500'>
                Transactions
              </Text>
              <Text className='text-lg font-bold tracking-tight text-gray-900 mt-1 font-mono'>
                {todaysSales.length}
              </Text>
              <Text className='text-xs text-gray-500 mt-1'>
                {sales.length} total
              </Text>
            </CardContent>
          </Card>
        </View>

        {/* List — consistent card language */}
        {sales.length === 0 ? (
          <Card className='border border-dashed border-gray-300'>
            <CardContent className='items-center py-12'>
              <View className='w-12 h-12 rounded-2xl bg-gray-50 border border-gray-200 items-center justify-center mb-3'>
                <Receipt size={20} color='#9ca3af' />
              </View>
              <Text className='font-bold text-gray-900'>No sales today</Text>
              <Text className='text-sm text-gray-500 text-center mt-1 px-6'>
                Sales appear here as you record them. Tap Record Sale to start.
              </Text>
            </CardContent>
          </Card>
        ) : (
          <View className='gap-3'>
            {sales.map((sale) => (
              <Card key={sale.id} className='border border-gray-200'>
                <CardContent className='p-6'>
                  <View className='flex-row justify-between gap-3'>
                    <View className='flex-1'>
                      <Text
                        className='text-sm font-bold text-gray-900'
                        numberOfLines={1}
                      >
                        {sale.receiptNumber}
                      </Text>
                      <Text className='text-xs text-gray-500 mt-1'>
                        {formatDate(sale.soldAt)} • {sale.paymentMethod}
                      </Text>
                    </View>
                    <View className='items-end gap-1'>
                      <Text className='text-sm font-bold tracking-tight text-gray-900 font-mono'>
                        {formatCurrency(toNumber(sale.total))}
                      </Text>
                      <View className='px-2 py-1 rounded-full bg-gray-100 border border-gray-200'>
                        <Text className='text-xs font-bold text-gray-600 tracking-wide'>
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

      {/* Thumb-zone sticky CTA per mobile-app-ui-design:32 */}
      <View className='absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4' style={{ paddingBottom: 16 + 8 }}>
        <TouchableOpacity
          onPress={() => setShowSaleModal(true)}
          className='bg-gray-900 py-4 rounded-full flex-row items-center justify-center gap-2 active:opacity-90'
          style={{ shadowColor: '#006b5f', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } }}
        >
          <Plus size={18} color='white' />
          <Text className='text-white font-bold text-sm'>Record Sale</Text>
        </TouchableOpacity>
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
        isSaving={isCreatingSale}
        onAddCustomer={() => setShowCustomerModal(true)}
        onClose={() => {
          setShowSaleModal(false)
          setSelectedVariantId(null)
        }}
        onSubmit={handleCreateSale}
      />

      <Modal
        visible={showCustomerModal}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={() => setShowCustomerModal(false)}
      >
        <View className='flex-1 bg-gray-50 p-4 justify-center'>
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
      </Modal>
    </View>
  )
}
