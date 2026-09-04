import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  Banknote,
  CreditCard,
  Plus,
  Smartphone,
  Trash2,
  WifiOff,
  Package,
} from 'lucide-react-native'
import NetInfo from '@react-native-community/netinfo'
import { toNumber } from '../lib/api-dtos'

export interface DraftLine {
  productId: string
  variantId?: string | null
  productName: string
  variantName?: string | null
  quantity: string
  unitPrice: string
}

export function SalesEntryModal(props: {
  visible: boolean
  title: string
  products: Array<{
    id: string
    name: string
    price: number
    stockQuantity: number
    variants?: Array<{
      id: string
      name: string
      price: string | number
      sku?: string
    }>
  }>
  customers: Array<{
    id: string
    name: string
    phone?: string
  }>
  customerId: string | null
  setCustomerId: (id: string | null) => void
  paymentMethod: string
  setPaymentMethod: (method: string) => void
  selectedProductId: string
  setSelectedProductId: (id: string) => void
  selectedVariantId?: string | null
  setSelectedVariantId?: (id: string | null) => void
  quantity: string
  setQuantity: (quantity: string) => void
  draftLines: DraftLine[]
  addLine: () => void
  removeLine?: (index: number) => void
  total: number
  isSaving: boolean
  onAddCustomer: () => void
  onClose: () => void
  onSubmit: () => void
}) {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOffline(!s.isConnected))
    NetInfo.fetch().then((s) => setIsOffline(!s.isConnected))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (
      isOffline &&
      (props.paymentMethod === 'mpesa' || props.paymentMethod === 'card')
    ) {
      props.setPaymentMethod('cash')
    }
  }, [isOffline])

  const selectedProduct = props.products.find(
    (product) => product.id === props.selectedProductId,
  )

  const variants = selectedProduct?.variants || []
  const hasVariants = variants.length > 0
  const selectedVariant = hasVariants
    ? variants.find((v) => v.id === props.selectedVariantId)
    : null
  const effectivePrice = selectedVariant
    ? toNumber(selectedVariant.price)
    : selectedProduct
      ? toNumber(selectedProduct.price)
      : 0

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString('en-KE')}`

  return (
    <Modal
      visible={props.visible}
      animationType='slide'
      presentationStyle='pageSheet'
      onRequestClose={props.onClose}
    >
      <View className='flex-1 bg-gray-50'>
        <View className='flex-row justify-between items-center p-4 bg-white border-b border-gray-200'>
          <Text className='text-lg font-bold'>{props.title}</Text>
          <TouchableOpacity onPress={props.onClose} className='p-2'>
            <Text className='text-gray-500 font-bold text-lg'>X</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text className='font-bold text-gray-900 mb-2'>Customer</Text>
          <View className='bg-white border border-gray-200 rounded-lg mb-4'>
            <TouchableOpacity
              className='p-3 border-b border-gray-100'
              onPress={props.onAddCustomer}
            >
              <Text className='text-green-700 font-bold'>
                + Add New Customer
              </Text>
            </TouchableOpacity>
            {props.customers.map((customer) => (
              <TouchableOpacity
                key={customer.id}
                className={`p-3 border-b border-gray-100 ${props.customerId === customer.id ? 'bg-green-50' : ''}`}
                onPress={() => props.setCustomerId(customer.id)}
              >
                <Text className='font-medium'>{customer.name}</Text>
                {customer.phone ? (
                  <Text className='text-xs text-gray-500'>
                    {customer.phone}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>

          <View className='flex-row items-center justify-between mb-2'>
            <Text className='font-bold text-gray-900'>Payment Method</Text>
            {isOffline && (
              <View className='flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200'>
                <WifiOff size={12} color='#b45309' />
                <Text className='text-[11px] font-bold tracking-widest text-amber-700'>
                  OFFLINE
                </Text>
              </View>
            )}
          </View>

          {isOffline && (
            <View className='bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 flex-row items-center gap-2'>
              <WifiOff size={14} color='#b45309' />
              <Text className='text-xs text-amber-800 flex-1'>
                M-Pesa and Card require internet. Only Cash is available
                offline.
              </Text>
            </View>
          )}

          <View className='flex-row gap-2 mb-4'>
            {[
              {
                id: 'mpesa',
                label: 'M-Pesa',
                icon: Smartphone,
                offline: true,
              },
              { id: 'cash', label: 'Cash', icon: Banknote, offline: false },
              { id: 'card', label: 'Card', icon: CreditCard, offline: true },
            ].map((method) => {
              const Icon = method.icon
              const active = props.paymentMethod === method.id
              const disabled = isOffline && method.offline
              return (
                <TouchableOpacity
                  key={method.id}
                  disabled={disabled}
                  className={`flex-1 p-3 rounded-lg flex-row items-center justify-center border ${
                    disabled
                      ? 'bg-gray-100 border-gray-200 opacity-50'
                      : active
                        ? 'bg-green-50 border-green-500'
                        : 'bg-white border-gray-200'
                  }`}
                  onPress={() => {
                    if (disabled) return
                    props.setPaymentMethod(method.id)
                  }}
                >
                  <Icon
                    size={16}
                    color={
                      disabled ? '#9ca3af' : active ? '#16a34a' : '#6b7280'
                    }
                  />
                  <Text
                    className={`ml-2 font-medium ${disabled ? 'text-gray-400' : active ? 'text-green-700' : 'text-gray-600'}`}
                  >
                    {method.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text className='font-bold text-gray-900 mb-2'>Products</Text>
          <Text className='text-xs text-gray-500 mb-2'>
            Tap product to see variants & prices. Beans example: same product,
            different size/price.
          </Text>
          <View className='bg-white border border-gray-200 rounded-lg mb-3 max-h-[220px]'>
            <ScrollView nestedScrollEnabled>
              {props.products.map((product) => {
                const isSelected = props.selectedProductId === product.id
                const vCount = product.variants?.length || 0
                return (
                  <TouchableOpacity
                    key={product.id}
                    className={`p-3 border-b border-gray-100 ${isSelected ? 'bg-blue-50' : ''}`}
                    onPress={() => {
                      props.setSelectedProductId(product.id)
                      if (props.setSelectedVariantId) {
                        props.setSelectedVariantId(null)
                      }
                    }}
                  >
                    <View className='flex-row justify-between items-start gap-2'>
                      <View className='flex-1'>
                        <Text className='font-medium'>{product.name}</Text>
                        <Text className='text-xs text-gray-500 mt-0.5'>
                          {vCount
                            ? `${vCount} variants • from ${formatCurrency(Math.min(...product.variants!.map((v) => toNumber(v.price))))} • base ${formatCurrency(product.price)}`
                            : `${formatCurrency(product.price)}`}{' '}
                          • Stock: {product.stockQuantity}
                        </Text>
                        {/* Attribute preview: show each variant name + price as chips */}
                        {vCount ? (
                          <View className='flex-row flex-wrap gap-1 mt-1.5'>
                            {product.variants!.slice(0, 4).map((v) => (
                              <View
                                key={v.id}
                                className='px-2 py-1 rounded-full bg-amber-50 border border-amber-100'
                              >
                                <Text className='text-[10px] font-bold text-amber-800'>
                                  {v.name} • {formatCurrency(toNumber(v.price))}
                                </Text>
                              </View>
                            ))}
                            {vCount > 4 ? (
                              <View className='px-2 py-1 rounded-full bg-gray-100 border border-gray-200'>
                                <Text className='text-[10px] text-gray-600'>
                                  +{vCount - 4} more
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                      {vCount ? (
                        <View className='px-2 py-1 rounded-full bg-amber-50 border border-amber-200'>
                          <Text className='text-[10px] font-bold text-amber-700'>
                            {vCount} options
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>

          {/* Variant selector — shows full attributes + price attribution */}
          {hasVariants ? (
            <View className='mb-3'>
              <View className='flex-row items-center gap-2 mb-2'>
                <Package size={14} color='#6b7280' />
                <Text className='font-bold text-gray-900 text-sm'>
                  Choose variant — price is per variant
                </Text>
                <Text className='text-xs text-gray-500'>
                  ({variants.length})
                </Text>
              </View>

              <View className='bg-white border border-gray-200 rounded-lg p-2 gap-2'>
                {variants.map((variant) => {
                  const isSelected = props.selectedVariantId === variant.id
                  const vPrice = toNumber(variant.price)
                  const basePrice = toNumber(selectedProduct?.price)
                  const diff = vPrice - basePrice
                  return (
                    <TouchableOpacity
                      key={variant.id}
                      onPress={() => props.setSelectedVariantId?.(variant.id)}
                      className={`p-3 rounded-xl border flex-row justify-between items-center ${
                        isSelected
                          ? 'bg-green-50 border-green-500'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <View className='flex-1 mr-3'>
                        <Text
                          className={`font-bold ${isSelected ? 'text-green-900' : 'text-gray-900'}`}
                        >
                          {variant.name}
                        </Text>
                        <View className='flex-row flex-wrap gap-1.5 mt-1'>
                          <View className='px-1.5 py-0.5 rounded bg-white border border-gray-200'>
                            <Text className='text-[10px] font-bold text-gray-600'>
                              {formatCurrency(vPrice)} each
                            </Text>
                          </View>
                          {diff !== 0 ? (
                            <View
                              className={`px-1.5 py-0.5 rounded border ${diff > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}
                            >
                              <Text
                                className={`text-[10px] font-bold ${diff > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                              >
                                {diff > 0 ? '+' : ''}
                                {formatCurrency(diff)} vs base
                              </Text>
                            </View>
                          ) : null}
                          {variant.sku ? (
                            <Text className='text-[11px] text-gray-500'>
                              SKU {variant.sku}
                            </Text>
                          ) : null}
                        </View>
                        {(variant as any).barcode ? (
                          <Text className='text-[11px] text-gray-400 mt-0.5'>
                            Barcode {(variant as any).barcode}
                          </Text>
                        ) : null}
                      </View>
                      <View className='items-end'>
                        <Text
                          className={`font-bold text-sm ${isSelected ? 'text-green-700' : 'text-gray-900'}`}
                        >
                          {formatCurrency(vPrice)}
                        </Text>
                        <Text className='text-[10px] text-gray-500'>
                          per unit
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {!props.selectedVariantId ? (
                <View className='bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2'>
                  <Text className='text-xs text-amber-800 text-center font-medium'>
                    Beans example: 500g @ KES 250 vs 1kg @ KES 450 — pick size
                    to attribute correct price.
                  </Text>
                </View>
              ) : (
                <View className='bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2 flex-row justify-between items-center'>
                  <Text className='text-xs text-green-800 font-medium'>
                    Selected: {selectedVariant?.name} •{' '}
                    {formatCurrency(effectivePrice)} each
                  </Text>
                  <Text className='text-xs font-bold text-green-900'>
                    × {props.quantity || '1'} ={' '}
                    {formatCurrency(
                      effectivePrice * (parseInt(props.quantity) || 1),
                    )}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          <View className='flex-row gap-2 mb-4'>
            <TextInput
              className='flex-1 bg-white border border-gray-300 rounded-lg p-3'
              placeholder='Qty'
              keyboardType='numeric'
              value={props.quantity}
              onChangeText={props.setQuantity}
            />
            <TouchableOpacity
              className={`w-14 rounded-lg items-center justify-center ${
                !selectedProduct || (hasVariants && !props.selectedVariantId)
                  ? 'bg-gray-300'
                  : 'bg-green-600'
              }`}
              onPress={props.addLine}
              disabled={
                !selectedProduct || (hasVariants && !props.selectedVariantId)
              }
            >
              <Plus size={22} color='white' />
            </TouchableOpacity>
          </View>

          {hasVariants && !props.selectedVariantId && selectedProduct ? (
            <View className='bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3'>
              <Text className='text-xs text-amber-800 text-center'>
                This product has variants — select one above before adding.
              </Text>
            </View>
          ) : null}

          {/* Cart lines — now removable per item */}
          {props.draftLines.length > 0 ? (
            <View className='mb-2'>
              <View className='flex-row justify-between items-center mb-2'>
                <Text className='font-bold text-gray-900'>
                  Cart • {props.draftLines.length} item
                  {props.draftLines.length === 1 ? '' : 's'}
                </Text>
                <Text className='text-xs text-gray-500'>
                  Tap trash to remove
                </Text>
              </View>
              {props.draftLines.map((line, index) => (
                <View
                  key={`${line.productId}-${line.variantId || 'base'}-${index}`}
                  className='flex-row justify-between items-center bg-white border border-gray-100 rounded-lg p-3 mb-2'
                >
                  <View className='flex-1 mr-3'>
                    <Text className='font-medium' numberOfLines={1}>
                      {line.productName}
                    </Text>
                    {line.variantName ? (
                      <View className='flex-row items-center gap-1 mt-0.5'>
                        <View className='px-1.5 py-0.5 rounded bg-amber-50 border border-amber-100'>
                          <Text className='text-[10px] font-bold text-amber-700'>
                            {line.variantName}
                          </Text>
                        </View>
                        <Text className='text-xs text-gray-500'>
                          Qty {line.quantity}
                        </Text>
                      </View>
                    ) : (
                      <Text className='text-xs text-gray-500'>
                        Qty {line.quantity}
                      </Text>
                    )}
                  </View>
                  <View className='items-end gap-1'>
                    <Text className='font-bold'>
                      {formatCurrency(
                        toNumber(line.unitPrice) * toNumber(line.quantity),
                      )}
                    </Text>
                    <TouchableOpacity
                      onPress={() => props.removeLine?.(index)}
                      className='w-7 h-7 rounded-full bg-red-50 border border-red-100 items-center justify-center'
                    >
                      <Trash2 size={12} color='#dc2626' />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View className='bg-white border border-dashed border-gray-200 rounded-xl py-6 items-center mb-3'>
              <Text className='text-sm text-gray-400'>Cart empty</Text>
              <Text className='text-xs text-gray-400 mt-1'>
                Select product {hasVariants ? '+ variant' : ''} and quantity
              </Text>
            </View>
          )}

          <View className='bg-blue-50 p-4 rounded-xl border border-blue-100 my-4'>
            <Text className='text-blue-900 font-bold text-center text-lg'>
              Total: {formatCurrency(props.total)}
            </Text>
          </View>

          <TouchableOpacity
            className='bg-gray-900 h-14 rounded-xl items-center justify-center'
            onPress={props.onSubmit}
            disabled={props.isSaving}
          >
            {props.isSaving ? (
              <ActivityIndicator color='white' />
            ) : (
              <Text className='text-white font-bold text-lg'>Save</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}
