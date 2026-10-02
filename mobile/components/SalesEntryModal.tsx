import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  Banknote,
  CreditCard,
  Minus,
  Plus,
  Search,
  Smartphone,
  Trash2,
  WifiOff,
  Package,
  X,
} from 'lucide-react-native'
import NetInfo from '@react-native-community/netinfo'
import { useEffect } from 'react'
import { toNumber } from '../lib/api-dtos'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'

export interface DraftLine {
  productId: string
  variantId?: string | null
  productName: string
  variantName?: string | null
  quantity: string
  unitPrice: string
}

export interface SaleProduct {
  id: string
  name: string
  price: number
  stockQuantity: number
  category?: string
  variants?: Array<{
    id: string
    name: string
    price: string | number
    sku?: string
  }>
}

export function SalesEntryModal(props: {
  visible: boolean
  title: string
  /** Label for the sticky footer CTA. Defaults to "Save sale". */
  submitLabel?: string
  products: SaleProduct[]
  customers: Array<{
    id: string
    name: string
    phone?: string
  }>
  customersLoading?: boolean
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
  /** One-tap add (qty 1, merged when the line exists). Falls back to addLine. */
  quickAddLine?: (productId: string, variantId?: string | null) => void
  /** Stepper writes. Without it the cart rows are read-only + removable. */
  updateLineQty?: (index: number, quantity: string) => void
  total: number
  isSaving: boolean
  error?: string | null
  onAddCustomer: () => void
  onClose: () => void
  onSubmit: () => void
}) {
  const [isOffline, setIsOffline] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [customerQuery, setCustomerQuery] = useState('')

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

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of props.products) {
      const c = (p.category || '').trim()
      if (c) set.add(c)
    }
    return ['All', ...Array.from(set).sort(), 'Low stock']
  }, [props.products])

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    return props.products.filter((p) => {
      if (activeCategory === 'Low stock' && p.stockQuantity > 5) return false
      if (
        activeCategory !== 'All' &&
        activeCategory !== 'Low stock' &&
        (p.category || '').trim() !== activeCategory
      )
        return false
      if (!q) return true
      const hay = `${p.name} ${(p.category || '')} ${(p.variants || []).map((v) => v.name).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [props.products, productQuery, activeCategory])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return props.customers
    return props.customers.filter((c) =>
      `${c.name} ${c.phone || ''}`.toLowerCase().includes(q),
    )
  }, [props.customers, customerQuery])

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

  const canAdd =
    !!selectedProduct && (!hasVariants || !!props.selectedVariantId)

  const fireQuickAdd = (productId: string, variantId?: string | null) => {
    if (props.quickAddLine) {
      props.quickAddLine(productId, variantId ?? null)
      return
    }
    // Fallback when the host screen hasn't wired quick-add: select the row so
    // the existing qty + Add path below can finish the job.
    props.setSelectedProductId(productId)
    props.setSelectedVariantId?.(variantId ?? null)
  }

  const itemCount = props.draftLines.reduce(
    (n, l) => n + (toNumber(l.quantity) || 0),
    0,
  )

  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      eyebrow={itemCount > 0 ? `${itemCount} in cart` : 'New transaction'}
      title={props.title}
      subtitle={
        props.draftLines.length > 0
          ? `${formatCurrency(props.total)} so far`
          : 'Search, tap +, done'
      }
      footer={
        <View className='gap-2.5'>
          {props.error ? (
            <View className='bg-red-50 border border-red-200 rounded-2xl px-4 py-2.5 flex-row items-center gap-2'>
              <Text className='font-sans text-xs text-red-700 flex-1'>
                {props.error}
              </Text>
            </View>
          ) : null}
          <View className='flex-row items-center justify-between px-1'>
            <Text className='font-geist-medium text-xs font-medium text-gray-500'>
              {props.draftLines.length === 0
                ? 'Cart empty'
                : `${props.draftLines.length} line${props.draftLines.length === 1 ? '' : 's'} • ${itemCount} items`}
            </Text>
            <Text className='font-geist-mono-bold text-base font-bold text-gray-900'>
              {formatCurrency(props.total)}
            </Text>
          </View>
          <Button
            onPress={props.onSubmit}
            loading={props.isSaving}
            disabled={props.draftLines.length === 0}
          >
            {props.isSaving
              ? 'Saving…'
              : `${props.submitLabel || 'Save sale'} • ${formatCurrency(props.total)}`}
          </Button>
        </View>
      }
    >
      {/* Customer — searchable, not an endless scroll */}
      <View>
        <Text className='font-geist-bold text-sm font-bold text-gray-900 mb-2'>
          Customer
        </Text>
        <View className='bg-white border border-gray-200 rounded-2xl overflow-hidden'>
          <View className='flex-row items-center gap-2 px-3 border-b border-gray-100'>
            <Search size={14} color='#6b7280' />
            <TextInput
              className='flex-1 py-3 text-sm text-gray-900'
              placeholder='Search customers…'
              placeholderTextColor='#9ca3af'
              value={customerQuery}
              onChangeText={setCustomerQuery}
            />
            {customerQuery ? (
              <Pressable onPress={() => setCustomerQuery('')}>
                <X size={14} color='#6b7280' />
              </Pressable>
            ) : null}
          </View>
          <TouchableOpacity
            className='px-3 py-3 border-b border-gray-100 flex-row items-center gap-2'
            onPress={props.onAddCustomer}
          >
            <Plus size={14} color='#006B5F' />
            <Text className='font-geist-bold text-sm font-bold text-accent'>
              New customer
            </Text>
          </TouchableOpacity>
          {props.customerId ? (
            <TouchableOpacity
              className='px-3 py-2 border-b border-gray-100'
              onPress={() => props.setCustomerId(null)}
            >
              <Text className='font-geist-medium text-xs font-medium text-gray-500'>
                Walk-in (clear selection)
              </Text>
            </TouchableOpacity>
          ) : null}
          {props.customersLoading && props.customers.length === 0 ? (
            <View className='p-4 items-center gap-2'>
              <ActivityIndicator size='small' color='#6b7280' />
              <Text className='font-sans text-xs text-gray-500'>
                Loading customers…
              </Text>
            </View>
          ) : filteredCustomers.length === 0 ? (
            <View className='p-3'>
              <Text className='font-sans text-xs text-gray-400 text-center'>
                {props.customers.length === 0
                  ? 'No customers yet. Add one above.'
                  : `No match for "${customerQuery}".`}
              </Text>
            </View>
          ) : (
            <View className='max-h-[148px]'>
              {filteredCustomers.slice(0, 20).map((customer) => {
                const active = props.customerId === customer.id
                return (
                  <TouchableOpacity
                    key={customer.id}
                    className={`px-3 py-2.5 border-b border-gray-100 flex-row items-center justify-between ${active ? 'bg-accent-soft' : ''}`}
                    onPress={() =>
                      props.setCustomerId(active ? null : customer.id)
                    }
                  >
                    <View className='flex-1'>
                      <Text
                        className={`font-geist-semibold text-sm font-semibold ${active ? 'text-accent' : 'text-gray-900'}`}
                      >
                        {customer.name}
                      </Text>
                      {customer.phone ? (
                        <Text className='font-sans text-xs text-gray-500'>
                          {customer.phone}
                        </Text>
                      ) : null}
                    </View>
                    {active ? (
                      <View className='w-6 h-6 rounded-full bg-accent items-center justify-center'>
                        <Text className='font-geist-bold text-xs font-bold text-white'>
                          ✓
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>
      </View>

      {/* Payment */}
      <View>
        <View className='flex-row items-center justify-between mb-2'>
          <Text className='font-geist-bold text-sm font-bold text-gray-900'>
            Payment
          </Text>
          {isOffline && (
            <View className='flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200'>
              <WifiOff size={11} color='#b45309' />
              <Text className='font-geist-bold text-xs font-bold text-amber-700'>
                OFFLINE
              </Text>
            </View>
          )}
        </View>
        <View className='flex-row gap-2'>
          {[
            { id: 'mpesa', label: 'M-Pesa', icon: Smartphone, offline: true },
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
                className={`flex-1 py-3 rounded-2xl flex-row items-center justify-center border ${
                  disabled
                    ? 'bg-gray-100 border-gray-200 opacity-50'
                    : active
                      ? 'bg-accent-soft border-accent'
                      : 'bg-white border-gray-200'
                }`}
                onPress={() => {
                  if (disabled) return
                  props.setPaymentMethod(method.id)
                }}
              >
                <Icon
                  size={15}
                  color={
                    disabled ? '#9ca3af' : active ? '#006B5F' : '#6b7280'
                  }
                />
                <Text
                  className={`ml-1.5 font-geist-semibold text-xs font-semibold ${disabled ? 'text-gray-400' : active ? 'text-accent' : 'text-gray-600'}`}
                >
                  {method.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* Products — search + quick filters + one-tap add */}
      <View>
        <Text className='font-geist-bold text-sm font-bold text-gray-900 mb-2'>
          Products
        </Text>
        <View className='flex-row items-center gap-2 bg-white border border-gray-300 rounded-2xl px-3 mb-2'>
          <Search size={15} color='#6b7280' />
          <TextInput
            className='flex-1 py-3.5 text-sm text-gray-900'
            placeholder='Search products, category, size…'
            placeholderTextColor='#9ca3af'
            value={productQuery}
            onChangeText={setProductQuery}
            autoCorrect={false}
          />
          {productQuery ? (
            <Pressable
              onPress={() => setProductQuery('')}
              className='w-8 h-8 items-center justify-center'
            >
              <X size={15} color='#6b7280' />
            </Pressable>
          ) : null}
        </View>
        <View className='flex-row flex-wrap gap-1.5 mb-2'>
          {categories.map((c) => {
            const active = activeCategory === c
            return (
              <Pressable
                key={c}
                onPress={() => setActiveCategory(c)}
                className={`px-3 py-1.5 rounded-full border ${active ? 'bg-accent border-accent' : 'bg-white border-gray-200'}`}
              >
                <Text
                  className={`font-geist-bold text-xs font-bold ${active ? 'text-white' : 'text-gray-600'}`}
                >
                  {c}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <View className='bg-white border border-gray-200 rounded-2xl overflow-hidden'>
          {filteredProducts.length === 0 ? (
            <View className='p-5 items-center'>
              <Package size={20} color='#9ca3af' />
              <Text className='font-geist-semibold text-sm font-semibold text-gray-500 mt-2'>
                {props.products.length === 0
                  ? 'No products yet — add stock first'
                  : `No match for "${productQuery}"`}
              </Text>
            </View>
          ) : (
            filteredProducts.slice(0, 30).map((product) => {
              const isSelected = props.selectedProductId === product.id
              const vCount = product.variants?.length || 0
              const low = product.stockQuantity <= 5
              return (
                <View
                  key={product.id}
                  className={`flex-row items-center gap-2 px-3 py-2.5 border-b border-gray-100 ${isSelected ? 'bg-accent-soft' : ''}`}
                >
                  <TouchableOpacity
                    className='flex-1'
                    onPress={() => {
                      props.setSelectedProductId(
                        isSelected ? '' : product.id,
                      )
                      props.setSelectedVariantId?.(null)
                    }}
                  >
                    <Text
                      className='font-geist-semibold text-sm font-semibold text-gray-900'
                      numberOfLines={1}
                    >
                      {product.name}
                    </Text>
                    <Text className='font-sans text-xs text-gray-500 mt-0.5'>
                      {formatCurrency(toNumber(product.price))} • Stock:{' '}
                      {product.stockQuantity}
                      {vCount ? ` • ${vCount} sizes` : ''}
                      {low ? ' • Low' : ''}
                    </Text>
                  </TouchableOpacity>
                  {/* One-tap add: variant-less products go straight to cart */}
                  <TouchableOpacity
                    accessibilityRole='button'
                    accessibilityLabel={`Add ${product.name} to cart`}
                    onPress={() =>
                      vCount
                        ? (props.setSelectedProductId(product.id),
                          props.setSelectedVariantId?.(null))
                        : fireQuickAdd(product.id, null)
                    }
                    className={`w-11 h-11 rounded-full items-center justify-center ${vCount ? 'bg-white border border-gray-300' : 'bg-accent'}`}
                  >
                    <Plus
                      size={17}
                      color={vCount ? '#006B5F' : 'white'}
                    />
                  </TouchableOpacity>
                </View>
              )
            })
          )}
        </View>
      </View>

      {/* Variant picker — only when the selected product has sizes */}
      {hasVariants ? (
        <View>
          <View className='flex-row items-center gap-2 mb-2'>
            <Package size={14} color='#6b7280' />
            <Text className='font-geist-bold text-sm font-bold text-gray-900'>
              {selectedProduct?.name} — pick size
            </Text>
          </View>
          <View className='bg-white border border-gray-200 rounded-2xl p-2 gap-1.5'>
            {variants.map((variant) => {
              const isSelected = props.selectedVariantId === variant.id
              const vPrice = toNumber(variant.price)
              return (
                <View
                  key={variant.id}
                  className={`flex-row items-center gap-2 p-2.5 rounded-2xl border ${
                    isSelected
                      ? 'bg-accent-soft border-accent'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <TouchableOpacity
                    className='flex-1'
                    onPress={() =>
                      props.setSelectedVariantId?.(
                        isSelected ? null : variant.id,
                      )
                    }
                  >
                    <Text
                      className={`font-geist-semibold text-sm font-semibold ${isSelected ? 'text-accent' : 'text-gray-900'}`}
                    >
                      {variant.name}
                    </Text>
                    <Text className='font-sans text-xs text-gray-500'>
                      {formatCurrency(vPrice)} each
                      {variant.sku ? ` • ${variant.sku}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityLabel={`Add ${variant.name} to cart`}
                    onPress={() => {
                      props.setSelectedProductId(selectedProduct!.id)
                      fireQuickAdd(selectedProduct!.id, variant.id)
                    }}
                    className='w-11 h-11 rounded-full bg-accent items-center justify-center'
                  >
                    <Plus size={17} color='white' />
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>
        </View>
      ) : null}

      {/* Qty + detailed add (kept for weighed / bulk entries) */}
      <View className='flex-row gap-2 items-center'>
        <View className='flex-row items-center bg-white border border-gray-300 rounded-2xl overflow-hidden'>
          <Pressable
            onPress={() =>
              props.setQuantity(
                String(Math.max(1, (parseInt(props.quantity) || 1) - 1)),
              )
            }
            className='w-12 h-14 items-center justify-center'
          >
            <Minus size={16} color='#374151' />
          </Pressable>
          <TextInput
            className='w-14 text-center font-geist-bold text-base font-bold text-gray-900'
            keyboardType='numeric'
            value={props.quantity}
            onChangeText={props.setQuantity}
          />
          <Pressable
            onPress={() =>
              props.setQuantity(String((parseInt(props.quantity) || 0) + 1))
            }
            className='w-12 h-14 items-center justify-center'
          >
            <Plus size={16} color='#374151' />
          </Pressable>
        </View>
        <Button
          onPress={props.addLine}
          disabled={!canAdd}
          className='flex-1'
        >
          {canAdd
            ? `Add • ${formatCurrency(effectivePrice * (parseInt(props.quantity) || 1))}`
            : hasVariants && selectedProduct
              ? 'Pick a size first'
              : 'Select a product'}
        </Button>
      </View>

      {/* Cart — steppers, not just trash */}
      <View>
        <View className='flex-row justify-between items-center mb-2'>
          <Text className='font-geist-bold text-sm font-bold text-gray-900'>
            Cart • {props.draftLines.length} line
            {props.draftLines.length === 1 ? '' : 's'}
          </Text>
          <Text className='font-sans text-xs text-gray-500'>
            Step qty or trash to remove
          </Text>
        </View>
        {props.draftLines.length === 0 ? (
          <View className='bg-white border border-dashed border-gray-200 rounded-2xl py-6 items-center'>
            <Text className='font-sans text-sm text-gray-400'>
              Cart empty
            </Text>
            <Text className='font-sans text-xs text-gray-400 mt-1'>
              Search above and tap + — no scrolling needed
            </Text>
          </View>
        ) : (
          props.draftLines.map((line, index) => {
            const qty = toNumber(line.quantity) || 0
            return (
              <View
                key={`${line.productId}-${line.variantId || 'base'}-${index}`}
                className='flex-row justify-between items-center bg-white border border-gray-100 rounded-2xl p-3 mb-2'
              >
                <View className='flex-1 mr-2'>
                  <Text
                    className='font-geist-semibold text-sm font-semibold text-gray-900'
                    numberOfLines={1}
                  >
                    {line.productName}
                  </Text>
                  {line.variantName ? (
                    <Text className='font-sans text-xs text-gray-500'>
                      {line.variantName}
                    </Text>
                  ) : null}
                  <Text className='font-geist-mono-bold text-sm font-bold text-gray-900 mt-0.5'>
                    {formatCurrency(toNumber(line.unitPrice) * qty)}
                  </Text>
                </View>
                <View className='flex-row items-center gap-1.5'>
                  <View className='flex-row items-center bg-gray-50 border border-gray-200 rounded-full'>
                    <Pressable
                      onPress={() => {
                        if (qty <= 1) {
                          props.removeLine?.(index)
                          return
                        }
                        if (props.updateLineQty)
                          props.updateLineQty(index, String(qty - 1))
                      }}
                      className='w-9 h-9 items-center justify-center'
                    >
                      <Minus size={13} color='#374151' />
                    </Pressable>
                    <Text className='font-geist-bold text-sm font-bold text-gray-900 min-w-[20px] text-center'>
                      {line.quantity}
                    </Text>
                    <Pressable
                      onPress={() => {
                        if (props.updateLineQty)
                          props.updateLineQty(index, String(qty + 1))
                      }}
                      className='w-9 h-9 items-center justify-center'
                    >
                      <Plus size={13} color='#374151' />
                    </Pressable>
                  </View>
                  <TouchableOpacity
                    onPress={() => props.removeLine?.(index)}
                    className='w-9 h-9 rounded-full bg-red-50 border border-red-100 items-center justify-center'
                  >
                    <Trash2 size={13} color='#dc2626' />
                  </TouchableOpacity>
                </View>
              </View>
            )
          })
        )}
      </View>
    </Sheet>
  )
}
