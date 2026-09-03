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
  const [quantity, setQuantity] = useState('1')

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
    if (toNumber(quantity) <= 0)
      return Alert.alert('Validation', 'Enter a valid quantity.')
    setDraftLines((prev) => [
      ...prev,
      {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity,
        unitPrice: selectedProduct.price.toString(),
      },
    ])
    setSelectedProductId('')
    setQuantity('1')
  }

  const resetDraft = () => {
    setCustomerId(null)
    setPaymentMethod('cash')
    setDraftLines([])
    setSelectedProductId('')
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
    if (draftLines.length === 0)
      return Alert.alert('Validation', 'Add at least one product.')
    try {
      await createSale({
        customerId,
        paymentMethod,
        lines: draftLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      })
      setShowSaleModal(false)
      resetDraft()
      await refetchSales()
      Alert.alert('Success', 'Sale recorded')
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.friendlyMessage || error.message || 'Failed to record sale.',
      )
    }
  }

  if (productsLoading) {
    return (
      <View className='flex-1 bg-gray-50 items-center justify-center px-6'>
        <ActivityIndicator color='#111827' />
        <Text className='text-gray-500 mt-3 text-sm'>
          Loading sales workspace…
        </Text>
      </View>
    )
  }

  return (
    <View className='flex-1 bg-gray-50'>
      {/* Header — impeccable ink */}
      <View className='px-4 pt-12 pb-4 bg-white border-b border-gray-200'>
        <View className='items-start mb-4'>
          <Text className='text-[11px] font-bold tracking-widest text-gray-400 uppercase'>
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
          <View className='flex-1 py-2.5 rounded-full items-center bg-white shadow-sm border border-gray-200'>
            <Text className='font-bold text-gray-900 text-sm'>Sales</Text>
          </View>
          <Pressable
            onPress={() => router.push('/orders')}
            className='flex-1 py-2.5 rounded-full items-center'
          >
            <Text className='font-medium text-gray-500 text-sm'>Orders</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/invoices')}
            className='flex-1 py-2.5 rounded-full items-center'
          >
            <Text className='font-medium text-gray-500 text-sm'>Invoices</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Metrics — restrained */}
        <View className='flex-row gap-3'>
          <Card className='flex-1 border border-gray-200'>
            <CardContent className='p-4'>
              <Text className='text-[11px] font-bold tracking-widest text-gray-400 uppercase'>
                Today
              </Text>
              <Text className='text-lg font-bold tracking-tight text-gray-900 mt-1'>
                {formatCurrency(todaysRevenue)}
              </Text>
              <View className='flex-row items-center gap-1 mt-1'>
                <ArrowUpRight size={12} color='#6b7280' />
                <Text className='text-xs text-gray-500'>revenue</Text>
              </View>
            </CardContent>
          </Card>
          <Card className='flex-1 border border-gray-200'>
            <CardContent className='p-4'>
              <Text className='text-[11px] font-bold tracking-widest text-gray-400 uppercase'>
                Transactions
              </Text>
              <Text className='text-lg font-bold tracking-tight text-gray-900 mt-1'>
                {todaysSales.length}
              </Text>
              <Text className='text-xs text-gray-500 mt-1'>
                {sales.length} total
              </Text>
            </CardContent>
          </Card>
        </View>

        <TouchableOpacity
          onPress={() => setShowSaleModal(true)}
          className='bg-gray-900 py-3.5 rounded-xl flex-row items-center justify-center gap-2 active:opacity-90'
        >
          <Plus size={18} color='white' />
          <Text className='text-white font-bold text-[14px]'>Record Sale</Text>
        </TouchableOpacity>

        {/* List — consistent card language */}
        {sales.length === 0 ? (
          <Card className='border border-dashed border-gray-300'>
            <CardContent className='items-center py-12'>
              <View className='w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 items-center justify-center mb-3'>
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
                <CardContent className='p-4'>
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
                      <Text className='text-sm font-bold tracking-tight text-gray-900'>
                        {formatCurrency(toNumber(sale.total))}
                      </Text>
                      <View className='px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200'>
                        <Text className='text-[11px] font-bold text-gray-600 tracking-wide'>
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
        quantity={quantity}
        setQuantity={setQuantity}
        draftLines={draftLines}
        addLine={addLine}
        total={total}
        isSaving={isCreatingSale}
        onAddCustomer={() => setShowCustomerModal(true)}
        onClose={() => setShowSaleModal(false)}
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
                className='border border-gray-300 rounded-xl px-4 py-3.5 bg-white text-sm'
                placeholder='Customer name *'
                value={customerForm.name}
                onChangeText={(name) =>
                  setCustomerForm((prev) => ({ ...prev, name }))
                }
              />
              <TextInput
                className='border border-gray-300 rounded-xl px-4 py-3.5 bg-white text-sm'
                placeholder='Phone (optional)'
                keyboardType='phone-pad'
                value={customerForm.phone}
                onChangeText={(phone) =>
                  setCustomerForm((prev) => ({ ...prev, phone }))
                }
              />
              <TouchableOpacity
                className='bg-gray-900 py-3.5 rounded-xl items-center mt-2'
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
