import React, { useState } from 'react'
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Pressable,
} from 'react-native'
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  TrendingUp,
  Edit,
  Trash2,
} from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
} from '../../components/ui/Card'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { TAB_BAR_SCROLL_PADDING } from '../../constants/tabBar'
import { SuccessCelebration } from '../../components/ui/SuccessCelebration'
import { DashboardSkeleton } from '../../components/ui/Skeleton'
import { useProducts } from '../../hooks/api/useProducts'
import { useInventory } from '../../hooks/api/useInventory'
import { shortId } from '../../lib/ids'
import { formatCompactCurrency } from '../../lib/format'

interface InventoryItem {
  id: string
  productId: string
  name: string
  category: string
  currentStock: number
  minimumThreshold: number
  maximumCapacity: number
  unitPrice: number
  supplier: string
  lastRestocked: string
}

export default function StockTab() {
  const {
    products,
    isLoading: isLoadingProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    isDeleting,
  } = useProducts()
  const {
    inventory: inventoryData,
    isLoadingInventory,
    adjustStock,
    isAdjustingStock,
  } = useInventory()

  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'low'>('all')
  const [showItemModal, setShowItemModal] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [step, setStep] = useState(0)
  const [formState, setFormState] = useState({
    name: '',
    category: '',
    currentStock: '0',
    minimumThreshold: '0',
    maximumCapacity: '0',
    unitPrice: '0',
    buyingPrice: '',
    supplier: '',
    sku: '',
    barcode: '',
    variants: [] as Array<{
      id?: string
      name: string
      sku: string
      barcode: string
      price: string
      cost: string
    }>,
  })

  // cleanup unused dropdown state removed — category now free-text

  // derived categories for picker — includes existing product categories + defaults, de-duplicated
  const allCategories = Array.from(
    new Set([
      'Dairy Feed',
      'Poultry Feed',
      'Swine Feed',
      'Aquaculture',
      'Other',
      ...products.map((p) => (p.category || '').trim()).filter(Boolean),
    ]),
  )

  const combinedInventory: InventoryItem[] = products.map((p) => {
    const invItem = inventoryData.find((inv) => inv.productId === p.id)
    const stockQty = invItem ? invItem.quantity : p.stockQuantity || 0
    const minThreshold = invItem
      ? invItem.lowStockThreshold
      : p.minStockLevel || 0
    const minT =
      minThreshold > 0 ? minThreshold : Math.max(1, Math.floor(stockQty * 0.2))
    const maxCap =
      p.maxStockLevel != null && p.maxStockLevel > 0
        ? p.maxStockLevel
        : Math.max(stockQty * 2, 1)
    return {
      id: p.id.toString(),
      productId: p.id.toString(),
      name: p.name,
      category: p.category || 'Uncategorized',
      currentStock: stockQty,
      minimumThreshold: minT,
      maximumCapacity: maxCap,
      unitPrice: p.price,
      supplier: p.supplier?.trim() || '—',
      lastRestocked: p.lastRestockedAt
        ? new Date(p.lastRestockedAt).toLocaleDateString()
        : new Date(p.createdAt).toLocaleDateString(),
      _status: (p as any)._status,
      _changed: (p as any)._changed,
    } as any
  })

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString('en-KE')}`
  const getStockStatus = (item: InventoryItem) => {
    const cap = Math.max(item.maximumCapacity, 1)
    const pct = (item.currentStock / cap) * 100
    const low = item.currentStock <= item.minimumThreshold
    if (low)
      return {
        label: 'Low stock',
        color: 'bg-red-500',
        text: 'text-red-700',
        bg: 'bg-red-50 border-red-200',
      }
    if (pct <= 50)
      return {
        label: 'Medium',
        color: 'bg-amber-500',
        text: 'text-amber-700',
        bg: 'bg-amber-50 border-amber-100',
      }
    return {
      label: 'In stock',
      color: 'bg-emerald-500',
      text: 'text-emerald-700',
      bg: 'bg-emerald-50 border-emerald-100',
    }
  }

  const filteredInventory = combinedInventory.filter(
    (item) =>
      (filter === 'all' || item.currentStock <= item.minimumThreshold) &&
      (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())),
  )
  const lowStockItems = combinedInventory.filter(
    (item) => item.currentStock <= item.minimumThreshold,
  )
  const totalValue = combinedInventory.reduce(
    (sum, item) => sum + item.currentStock * item.unitPrice,
    0,
  )
  const totalItems = combinedInventory.reduce(
    (sum, item) => sum + item.currentStock,
    0,
  )

  // Live margin math for the pricing step — no estimates, only typed values.
  const buyNum = parseFloat(formState.buyingPrice)
  const sellNum = parseFloat(formState.unitPrice)
  const buyValid = !isNaN(buyNum) && buyNum >= 0 && formState.buyingPrice.trim() !== ''
  const sellValid = !isNaN(sellNum) && sellNum > 0
  const profit = sellValid ? sellNum - (buyValid ? buyNum : 0) : 0
  const marginPct = sellValid && sellNum > 0 ? (profit / sellNum) * 100 : 0
  const stockNum = parseInt(formState.currentStock) || 0

  const handleOpenAddModal = () => {
    setEditingItem(null)
    setStep(0)
    setFormState({
      name: '',
      category: '',
      currentStock: '0',
      minimumThreshold: '0',
      maximumCapacity: '0',
      unitPrice: '0',
      buyingPrice: '',
      supplier: '',
      sku: '',
      barcode: '',
      variants: [],
    })
    setShowItemModal(true)
  }
  const handleOpenEditModal = (item: InventoryItem) => {
    setEditingItem(item)
    setStep(0)
    const prod = products.find((p: any) => p.id === item.productId) as any
    setFormState({
      name: item.name,
      category: item.category,
      currentStock: item.currentStock.toString(),
      minimumThreshold: item.minimumThreshold.toString(),
      maximumCapacity: item.maximumCapacity.toString(),
      unitPrice: item.unitPrice.toString(),
      buyingPrice:
        prod?.cost != null && Number(prod.cost) > 0
          ? String(prod.cost)
          : (prod?.buyingPrice != null && Number(prod.buyingPrice) > 0
            ? String(prod.buyingPrice)
            : ''),
      supplier: item.supplier === '—' ? '' : item.supplier,
      sku: prod?.sku || '',
      barcode: prod?.barcode || '',
      variants: (prod?.variants || []).map((v: any) => ({
        id: v.id,
        name: v.name,
        sku: v.sku || '',
        barcode: v.barcode || '',
        price: String(v.price),
        cost: String(v.cost || v.price),
      })),
    })
    setShowItemModal(true)
  }
  const handleSaveItem = async () => {
    setInlineError(null)
    if (!formState.name.trim() || !formState.category.trim()) {
      setInlineError('Name and category are required.')
      return
    }
    // Offline-first UX: check connectivity for immediate feedback
    const net = await (await import('@react-native-community/netinfo')).default.fetch().catch(() => ({ isConnected: true } as any))
    const isOffline = !net.isConnected

    // Validate variants if any: each must have name and price
    for (const v of formState.variants) {
      if (!v.name.trim()) {
        setInlineError('Each variant needs a name (e.g., 500ml, Red)')
        return
      }
      if (!v.price || isNaN(parseFloat(v.price))) {
        setInlineError(`Variant "${v.name}" needs a valid price`)
        return
      }
    }

    const stock = parseInt(formState.currentStock) || 0
    const min = parseInt(formState.minimumThreshold) || 0
    const max = parseInt(formState.maximumCapacity) || 0
    const price = parseFloat(formState.unitPrice) || 0
    if (price <= 0) {
      setInlineError('Set a selling price above zero — margin needs it.')
      setStep(1)
      return
    }
    // Real buying price, captured on the pricing step. Falls back to the
    // variant cost, then to zero — never a silent 0.7 estimate again.
    const buying = parseFloat(formState.buyingPrice)
    const buyingPrice =
      !isNaN(buying) && buying >= 0
        ? buying
        : 0
    const variantsPayload = formState.variants
      .filter((v) => v.name.trim())
      .map((v) => ({
        name: v.name.trim(),
        sku: v.sku.trim() || undefined,
        barcode: v.barcode.trim() || undefined,
        price: parseFloat(v.price) || 0,
        cost: parseFloat(v.cost) || parseFloat(v.price) || 0,
      }))

    try {
      if (editingItem) {
        await updateProduct({
          id: editingItem.productId,
          data: {
            name: formState.name.trim(),
            category: formState.category,
            price,
            buyingPrice,
            supplier: formState.supplier.trim(),
            maxStockLevel: max > 0 ? max : null,
            sku: formState.sku.trim() || undefined,
            barcode: formState.barcode.trim() || undefined,
            variants: variantsPayload,
          } as any,
        })
        const delta = stock - editingItem.currentStock
        await adjustStock({
          productId: editingItem.productId,
          quantityDelta: delta,
          lowStockThreshold: min,
          notes: 'Manual adjustment',
        })
        if (isOffline) {
          setSuccessMsg('Updated offline — will sync when online 📱'); setShowSuccess(true)
        } else {
          setSuccessMsg('Product updated — stock refreshed ✨'); setShowSuccess(true)
        }
      } else {
        const created = await createProduct({
          name: formState.name.trim(),
          category: formState.category,
          price,
          buyingPrice,
          supplier: formState.supplier.trim(),
          maxStockLevel: max > 0 ? max : null,
          sku: formState.sku.trim() || undefined,
          barcode: formState.barcode.trim() || undefined,
          variants: variantsPayload,
        } as any)
        if (created?.id)
          await adjustStock({
            productId: created.id,
            quantityDelta: stock,
            lowStockThreshold: min,
            notes: 'Initial stock',
          })
        if (isOffline) {
          setSuccessMsg('Saved offline — will sync when online 📱'); setShowSuccess(true)
        } else {
          setSuccessMsg('Product added — ready to sell ✨'); setShowSuccess(true)
        }
      }
      setShowItemModal(false)
    } catch (e: any) {
      setInlineError(e.message || 'Failed to save')
    }
  }
  const handleDeleteItem = (item: InventoryItem) => {
    Alert.alert('Delete product', `Delete "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProduct(item.productId)
            setSuccessMsg('Product removed'); setShowSuccess(true)
          } catch (e: any) {
            Alert.alert('Error', e.message)
          }
        },
      },
    ])
  }

  if (isLoadingProducts || isLoadingInventory) {
    return <DashboardSkeleton />
  }

  return (
    <View className='flex-1 bg-paper'>
      {/* Header — soft clinical card with pill Add */}
      <View className='px-4 pt-12 pb-3'>
        <View className='bg-surface rounded-4xl p-5 border border-hairline shadow-clinical-sm flex-row justify-between items-start gap-3'>
          <View className='flex-1'>
            <Text className='font-geist-bold text-xs font-bold tracking-widest text-ink-subtle uppercase'>
              Stock
            </Text>
            <Text className='font-geist-bold text-xl font-bold tracking-tight text-ink -mt-0.5'>
              Inventory
            </Text>
            <Text className='font-sans text-xs text-ink-muted'>
              Mfumo wa kuhifadhi bidhaa
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleOpenAddModal}
            className='flex-row items-center gap-2 bg-accent px-4 py-3 rounded-full shadow-clinical-sm'
          >
            <Plus size={16} color='white' />
            <Text className='font-geist-bold text-white text-sm font-bold'>Add</Text>
          </TouchableOpacity>
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
        {/* Metrics */}
        <View className='flex-row gap-3'>
          {[
            {
              label: 'Total items',
              value: String(totalItems),
              sub: 'units',
              icon: Package,
            },
            {
              label: 'Total value',
              value: formatCompactCurrency(totalValue),
              sub: 'stock value',
              icon: TrendingUp,
            },
            {
              label: 'Low stock',
              value: String(lowStockItems.length),
              sub: 'need restock',
              icon: AlertTriangle,
              alert: lowStockItems.length > 0,
            },
          ].map((m) => (
            <View key={m.label} className='flex-1'>
              <Card>
                <CardContent className='p-3 items-center'>
                  <View
                    className={`w-11 h-11 rounded-full items-center justify-center mb-2 ${m.alert ? 'bg-warn-soft border border-hairline' : 'bg-paper border border-hairline'}`}
                  >
                    <m.icon size={18} color={m.alert ? '#8A5A0B' : '#4F625E'} />
                  </View>
                  <Text
                    className='font-geist-mono-bold text-sm font-bold tracking-tight text-gray-900'
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {m.value}
                  </Text>
                  <Text className='font-geist-medium text-xs font-medium text-gray-500 text-center'>
                    {m.label}
                  </Text>
                  <Text className='font-sans text-xs text-gray-500'>{m.sub}</Text>
                </CardContent>
              </Card>
            </View>
          ))}
        </View>

        {/* Search — pill like the reference */}
        <View className='flex-row items-center gap-2 bg-surface border border-hairline rounded-full px-4 shadow-clinical-sm'>
          <Search size={16} color='#64746F' />
          <TextInput
            className='flex-1 py-4 text-sm text-gray-900'
            placeholder='Search products or category…'
            placeholderTextColor='#64746F'
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm ? (
            <Pressable onPress={() => setSearchTerm('')}>
              <Text className='font-geist-bold text-xs font-bold text-gray-500'>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Low stock banner */}
        {lowStockItems.length > 0 && (
          <Card className='border border-amber-200 bg-amber-50/60'>
            <CardHeader className='flex-row items-center gap-2'>
              <AlertTriangle size={16} color='#b45309' />
              <Text className='font-geist-bold text-sm font-bold text-amber-900'>
                Stock alert • {lowStockItems.length} items low
              </Text>
            </CardHeader>
            <CardContent className='pt-0 gap-2'>
              {lowStockItems.slice(0, 3).map((it) => (
                <View
                  key={it.id}
                  className='flex-row justify-between items-center'
                >
                  <Text className='font-geist-medium text-sm font-medium text-gray-900'>
                    {it.name}
                  </Text>
                  <Text className='font-geist-bold text-xs font-bold text-amber-800'>
                    {it.currentStock} left • min {it.minimumThreshold}
                  </Text>
                </View>
              ))}
              {lowStockItems.length > 3 && (
                <Text className='font-sans text-xs text-amber-700'>
                  +{lowStockItems.length - 3} more
                </Text>
              )}
            </CardContent>
          </Card>
        )}

        {/* List */}
        <View className='gap-3'>
          {filteredInventory.map((item) => {
            const st = getStockStatus(item)
            const pct = Math.min(
              (item.currentStock / Math.max(item.maximumCapacity, 1)) * 100,
              100,
            )
            return (
              <Card key={item.id} className='border border-gray-200'>
                <CardContent className='p-4'>
                  <View className='flex-row justify-between items-start gap-3 mb-3'>
                    <View className='flex-1'>
                      <View className='flex-row items-center gap-2 flex-wrap'>
                        <Text className='font-geist-bold text-sm font-bold text-gray-900'>
                          {item.name}
                        </Text>
                        <View className='px-2 py-1 rounded-full bg-white border border-gray-200'>
                          <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500'>
                            {shortId(item.productId, 6)}
                          </Text>
                        </View>
                        <View className='px-2 py-1 rounded-full bg-gray-100 border border-gray-200'>
                          <Text className='font-geist-bold text-xs font-bold text-gray-600'>
                            {item.category}
                          </Text>
                        </View>
                        {(item as any)._status === 'created' || (item as any)._status === 'updated' ? (
                          <View className='px-2 py-1 rounded-full bg-amber-50 border border-amber-200 flex-row items-center gap-1'>
                            <View className='w-1.5 h-1.5 rounded-full bg-amber-500' />
                            <Text className='font-geist-bold text-xs font-bold text-amber-700'>Pending</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className='font-sans text-xs text-gray-500 mt-1'>
                        Supplier • {item.supplier} • Last {item.lastRestocked}
                      </Text>
                      <Text className='font-geist-semibold text-xs font-semibold text-gray-900 mt-1'>
                        {formatCurrency(item.unitPrice)} / unit
                      </Text>
                      {(() => {
                        const prod = products.find(
                          (p: any) => p.id === item.productId,
                        ) as any
                        const vcount = prod?.variants?.length || 0
                        if (vcount === 0) return null
                        return (
                          <View className='flex-row items-center gap-2 mt-1'>
                            <View className='px-2 py-1 rounded-full bg-amber-50 border border-amber-200'>
                              <Text className='font-geist-bold text-xs font-bold text-amber-700'>
                                {vcount} variant{vcount === 1 ? '' : 's'}
                              </Text>
                            </View>
                            <Text className='font-sans text-xs text-gray-500'>
                              from{' '}
                              {formatCurrency(
                                Math.min(
                                  ...prod.variants.map((v: any) =>
                                    parseFloat(String(v.price)),
                                  ),
                                ),
                              )}
                            </Text>
                          </View>
                        )
                      })()}
                    </View>
                    <View className='items-end'>
                      <View className='flex-row items-center gap-2'>
                        <View
                          className={`w-2.5 h-2.5 rounded-full ${st.color}`}
                        />
                        <Text className='font-geist-bold text-sm font-bold text-gray-900'>
                          {item.currentStock}
                        </Text>
                      </View>
                      <Text className='font-sans text-xs text-gray-500'>
                        of {item.maximumCapacity}
                      </Text>
                      <View
                        className={`mt-1 px-2 py-1 rounded-full border ${st.bg}`}
                      >
                        <Text className={`font-geist-bold text-xs font-bold ${st.text}`}>
                          {st.label}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className='gap-2'>
                    <View className='flex-row justify-between'>
                      <Text className='font-sans text-xs text-gray-500'>Stock level</Text>
                      <Text className='font-geist-medium text-xs font-medium text-gray-700'>
                        {Math.round(pct)}%
                      </Text>
                    </View>
                    <View className='h-2 bg-gray-100 rounded-full overflow-hidden'>
                      <View
                        style={{ width: `${pct}%` }}
                        className={`h-2 rounded-full ${item.currentStock <= item.minimumThreshold ? 'bg-red-500' : pct <= 50 ? 'bg-amber-500' : 'bg-accent'}`}
                      />
                    </View>
                    <View className='flex-row justify-between'>
                      <Text className='font-sans text-xs text-gray-500'>
                        Min {item.minimumThreshold}
                      </Text>
                      <Text className='font-geist-bold text-xs font-bold text-gray-700'>
                        Value{' '}
                        {formatCurrency(item.currentStock * item.unitPrice)}
                      </Text>
                    </View>
                  </View>

                  <View className='flex-row justify-end gap-2 mt-3 pt-3 border-t border-gray-100'>
                    <TouchableOpacity
                      onPress={() => handleOpenEditModal(item)}
                      className='flex-row items-center gap-2 px-3 py-2 rounded-full bg-white border border-gray-200'
                    >
                      <Edit size={14} color='#374151' />
                      <Text className='font-geist-semibold text-xs font-semibold text-gray-700'>
                        Edit
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteItem(item)}
                      disabled={!!isDeleting}
                      className='flex-row items-center gap-2 px-3 py-2 rounded-full bg-white border border-red-200'
                    >
                      <Trash2 size={14} color='#dc2626' />
                      <Text className='font-geist-bold text-xs font-bold text-red-600'>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </CardContent>
              </Card>
            )
          })}
          {filteredInventory.length === 0 && (
            <Card className='border border-dashed border-gray-300'>
              <CardContent className='items-center py-12'>
                <Package size={28} color='#6b7280' />
                <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mt-3'>
                  {searchTerm ? 'No matches' : filter === 'low' ? 'All stocked up' : 'No inventory'}
                </Text>
                <Text className='font-sans text-xs text-gray-500 mt-1'>
                  Try a different search or add a product
                </Text>
              </CardContent>
            </Card>
          )}
        </View>
      </ScrollView>

      <Sheet
        visible={showItemModal}
        onClose={() => setShowItemModal(false)}
        eyebrow={`Step ${step + 1} of 3 • ${['Basics', 'Pricing', 'Stock & sizes'][step]}${editingItem ? ' • editing' : ''}`}
        title={editingItem ? 'Edit item' : 'Add item'}
        subtitle={
          [
            'Name it like the shelf tag reads',
            'Cost vs price — margin updates live',
            'Quantities, sizes, review and save',
          ][step]
        }
        footer={
          <View className='flex-row gap-2'>
            {step > 0 ? (
              <Button
                variant='secondary'
                onPress={() => {
                  setInlineError(null)
                  setStep(step - 1)
                }}
                className='flex-1'
              >
                Back
              </Button>
            ) : (
              <Button
                variant='secondary'
                onPress={() => setShowItemModal(false)}
                className='flex-1'
              >
                Cancel
              </Button>
            )}
            {step < 2 ? (
              <Button
                onPress={() => {
                  if (step === 0) {
                    if (
                      !formState.name.trim() ||
                      !formState.category.trim()
                    ) {
                      setInlineError(
                        'Give the product a name and category first.',
                      )
                      return
                    }
                  }
                  setInlineError(null)
                  setStep(step + 1)
                }}
                className='flex-[2]'
              >
                Next
              </Button>
            ) : (
              <Button
                onPress={handleSaveItem}
                loading={!!isAdjustingStock}
                className='flex-[2]'
              >
                {editingItem ? 'Update product' : 'Save item'}
              </Button>
            )}
          </View>
        }
      >
        {inlineError ? (
          <View className='bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex-row items-center gap-2'>
            <Text className='font-sans text-sm text-red-700 flex-1'>
              {inlineError}
            </Text>
            <Pressable
              onPress={() => setInlineError(null)}
              className='px-3 py-1 rounded-full bg-white border border-red-200'
            >
              <Text className='font-geist-bold text-xs font-bold text-red-700'>
                Dismiss
              </Text>
            </Pressable>
          </View>
        ) : null}
        {/* Step dots */}
        <View className='flex-row gap-1.5 px-1'>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-accent' : 'bg-gray-200'}`}
            />
          ))}
        </View>
        {step === 0 && (
          <View className='gap-4'>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Product name *
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                placeholder='e.g., Dairy Meal 50kg'
                value={formState.name}
                onChangeText={(t) => setFormState({ ...formState, name: t })}
              />
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Category *
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                placeholder='Type or choose — e.g., Dairy Feed'
                value={formState.category}
                onChangeText={(t) =>
                  setFormState({ ...formState, category: t })
                }
                autoCapitalize='words'
              />
              <View className='flex-row flex-wrap gap-2 mt-2'>
                {allCategories
                  .filter(
                    (c) =>
                      !formState.category ||
                      c
                        .toLowerCase()
                        .includes(formState.category.toLowerCase()),
                  )
                  .slice(0, 6)
                  .map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() =>
                        setFormState({ ...formState, category: cat })
                      }
                      className={`px-3 py-1.5 rounded-full border ${formState.category === cat ? 'bg-accent border-accent' : 'bg-white border-gray-200'}`}
                    >
                      <Text
                        className={`font-geist-bold text-xs font-bold ${formState.category === cat ? 'text-white' : 'text-gray-700'}`}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
              </View>
              <Text className='font-sans text-xs text-gray-500 mt-1'>
                You can create a new category — just type it. Existing
                categories are suggested above.
              </Text>
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Supplier
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                placeholder='e.g., Kenchic Ltd'
                value={formState.supplier}
                onChangeText={(t) =>
                  setFormState({ ...formState, supplier: t })
                }
              />
            </View>
            <View className='flex-row gap-3'>
              <View className='flex-1'>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                  SKU (optional)
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                  placeholder='e.g., DAIRY-50'
                  value={formState.sku}
                  onChangeText={(t) => setFormState({ ...formState, sku: t })}
                  autoCapitalize='characters'
                />
              </View>
              <View className='flex-1'>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                  Barcode
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                  placeholder='Scan or type'
                  value={formState.barcode}
                  onChangeText={(t) =>
                    setFormState({ ...formState, barcode: t })
                  }
                />
              </View>
            </View>
          </View>
        )}
        {step === 1 && (
          <View className='gap-4'>
            <View className='flex-row gap-3'>
              <View className='flex-1'>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                  Buying price *
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                  keyboardType='numeric'
                  placeholder='What you paid'
                  value={formState.buyingPrice}
                  onChangeText={(t) =>
                    setFormState({ ...formState, buyingPrice: t })
                  }
                />
              </View>
              <View className='flex-1'>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                  Selling price *
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                  keyboardType='numeric'
                  placeholder='What you charge'
                  value={formState.unitPrice}
                  onChangeText={(t) =>
                    setFormState({ ...formState, unitPrice: t })
                  }
                />
              </View>
            </View>
            {/* Live margin — the reason buying price exists */}
            <View
              className={`rounded-2xl border p-4 ${!sellValid ? 'bg-gray-50 border-gray-200' : profit < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}
            >
              <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                Margin preview
              </Text>
              {!sellValid ? (
                <Text className='font-sans text-sm text-gray-500 mt-1'>
                  Enter a selling price to see your margin.
                </Text>
              ) : (
                <View className='flex-row gap-3 mt-2'>
                  <View className='flex-1'>
                    <Text className='font-geist-mono-bold text-base font-bold text-gray-900'>
                      {formatCurrency(profit)}
                    </Text>
                    <Text className='font-sans text-xs text-gray-500'>
                      profit / unit
                    </Text>
                  </View>
                  <View className='flex-1'>
                    <Text
                      className={`font-geist-mono-bold text-base font-bold ${profit < 0 ? 'text-red-700' : 'text-emerald-700'}`}
                    >
                      {marginPct.toFixed(1)}%
                    </Text>
                    <Text className='font-sans text-xs text-gray-500'>
                      margin
                    </Text>
                  </View>
                  <View className='flex-1'>
                    <Text className='font-geist-mono-bold text-base font-bold text-gray-900'>
                      {buyValid
                        ? formatCurrency(stockNum * profit)
                        : '—'}
                    </Text>
                    <Text className='font-sans text-xs text-gray-500'>
                      on current stock
                    </Text>
                  </View>
                </View>
              )}
              {sellValid && buyValid && profit < 0 ? (
                <Text className='font-sans text-xs text-red-700 mt-2'>
                  Below cost — you lose {formatCurrency(-profit)} per unit.
                </Text>
              ) : null}
            </View>
          </View>
        )}
        {step === 2 && (
          <View className='gap-4'>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Current stock
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                keyboardType='numeric'
                placeholder='How many on the shelf right now'
                value={formState.currentStock}
                onChangeText={(t) =>
                  setFormState({ ...formState, currentStock: t })
                }
              />
            </View>
            <View className='flex-row gap-3'>
              <View className='flex-1'>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                  Min threshold
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                  keyboardType='numeric'
                  value={formState.minimumThreshold}
                  onChangeText={(t) =>
                    setFormState({ ...formState, minimumThreshold: t })
                  }
                />
              </View>
              <View className='flex-1'>
                <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                  Max capacity
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                  keyboardType='numeric'
                  value={formState.maximumCapacity}
                  onChangeText={(t) =>
                    setFormState({ ...formState, maximumCapacity: t })
                  }
                />
              </View>
            </View>

            {/* Variants — sizes/colors with per-variant pricing */}
            <View className='bg-white border border-gray-200 rounded-2xl p-4 gap-3'>
              <View className='flex-row justify-between items-center'>
                <View className='flex-row items-center gap-2'>
                  <Package size={16} color='#6b7280' />
                  <Text className='font-geist-bold text-sm font-bold text-gray-900'>
                    Variants
                  </Text>
                  <View className='px-2 py-1 rounded-full bg-gray-100 border border-gray-200'>
                    <Text className='font-geist-bold text-xs font-bold text-gray-600'>
                      {formState.variants.length} options
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    setFormState({
                      ...formState,
                      variants: [
                        ...formState.variants,
                        {
                          name: '',
                          sku: '',
                          barcode: '',
                          price: formState.unitPrice || '0',
                          // Prefill from the pricing step, not an estimate.
                          cost: formState.buyingPrice || '0',
                        },
                      ],
                    })
                  }
                  className='px-3 py-1.5 rounded-full bg-accent flex-row items-center gap-2'
                >
                  <Plus size={12} color='white' />
                  <Text className='font-geist-bold text-xs font-bold text-white'>Add</Text>
                </TouchableOpacity>
              </View>

              <Text className='font-sans text-xs text-gray-500'>
                Define sizes, colors, or packs — each can have its own price.
                Example: Unga 1kg / 2kg / 5kg. Sales will let customer pick
                variant.
              </Text>

              {formState.variants.length === 0 ? (
                <View className='border border-dashed border-gray-200 rounded-2xl py-6 items-center bg-gray-50/50'>
                  <Text className='font-geist-medium text-sm font-medium text-gray-500'>
                    No variants
                  </Text>
                  <Text className='font-sans text-xs text-gray-500 mt-1 text-center px-4'>
                    Leave empty for single-price product. Add variants if same
                    product sells in different sizes/colors.
                  </Text>
                </View>
              ) : (
                <View className='gap-3'>
                  {formState.variants.map((variant, idx) => (
                    <View
                      key={idx}
                      className='border border-gray-200 rounded-2xl p-3 gap-2 bg-gray-50/50'
                    >
                      <View className='flex-row justify-between items-center'>
                        <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                          Variant {idx + 1}
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            setFormState({
                              ...formState,
                              variants: formState.variants.filter(
                                (_, i) => i !== idx,
                              ),
                            })
                          }
                          className='w-11 h-11 rounded-full bg-white border border-red-100 items-center justify-center'
                        >
                          <Trash2 size={12} color='#dc2626' />
                        </TouchableOpacity>
                      </View>

                      <View>
                        <Text className='font-geist-semibold text-xs font-semibold text-gray-700 mb-1'>
                          Name * (e.g., 500ml, Red, Small)
                        </Text>
                        <TextInput
                          className='bg-white border border-gray-300 rounded-2xl px-3 py-3 text-sm'
                          placeholder='e.g., 1kg'
                          value={variant.name}
                          onChangeText={(t) => {
                            const next = [...formState.variants]
                            next[idx] = { ...next[idx], name: t }
                            setFormState({ ...formState, variants: next })
                          }}
                        />
                      </View>

                      <View className='flex-row gap-2'>
                        <View className='flex-1'>
                          <Text className='font-geist-semibold text-xs font-semibold text-gray-700 mb-1'>
                            Price *
                          </Text>
                          <TextInput
                            className='bg-white border border-gray-300 rounded-2xl px-3 py-3 text-sm'
                            keyboardType='numeric'
                            placeholder='0'
                            value={variant.price}
                            onChangeText={(t) => {
                              const next = [...formState.variants]
                              next[idx] = { ...next[idx], price: t }
                              setFormState({ ...formState, variants: next })
                            }}
                          />
                        </View>
                        <View className='flex-1'>
                          <Text className='font-geist-semibold text-xs font-semibold text-gray-700 mb-1'>
                            Cost
                          </Text>
                          <TextInput
                            className='bg-white border border-gray-300 rounded-2xl px-3 py-3 text-sm'
                            keyboardType='numeric'
                            placeholder='0'
                            value={variant.cost}
                            onChangeText={(t) => {
                              const next = [...formState.variants]
                              next[idx] = { ...next[idx], cost: t }
                              setFormState({ ...formState, variants: next })
                            }}
                          />
                        </View>
                      </View>

                      <View className='flex-row gap-2'>
                        <View className='flex-1'>
                          <Text className='font-geist-semibold text-xs font-semibold text-gray-700 mb-1'>
                            SKU
                          </Text>
                          <TextInput
                            className='bg-white border border-gray-300 rounded-2xl px-3 py-3 text-sm'
                            placeholder='Optional'
                            value={variant.sku}
                            onChangeText={(t) => {
                              const next = [...formState.variants]
                              next[idx] = { ...next[idx], sku: t }
                              setFormState({ ...formState, variants: next })
                            }}
                            autoCapitalize='characters'
                          />
                        </View>
                        <View className='flex-1'>
                          <Text className='font-geist-semibold text-xs font-semibold text-gray-700 mb-1'>
                            Barcode
                          </Text>
                          <TextInput
                            className='bg-white border border-gray-300 rounded-2xl px-3 py-3 text-sm'
                            placeholder='Optional'
                            value={variant.barcode}
                            onChangeText={(t) => {
                              const next = [...formState.variants]
                              next[idx] = { ...next[idx], barcode: t }
                              setFormState({ ...formState, variants: next })
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
            {/* Review — what this product earns before it exists */}
            <View className='bg-white border border-gray-200 rounded-2xl p-4 gap-2'>
              <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                Review
              </Text>
              <View className='flex-row justify-between items-center'>
                <Text
                  className='font-geist-semibold text-sm font-semibold text-gray-900 flex-1'
                  numberOfLines={1}
                >
                  {formState.name.trim() || 'Unnamed product'}
                </Text>
                <Text className='font-sans text-xs text-gray-500'>
                  {formState.category.trim() || 'No category'}
                </Text>
              </View>
              <View className='flex-row gap-3 mt-1'>
                <View className='flex-1'>
                  <Text className='font-geist-mono-bold text-sm font-bold text-gray-900'>
                    {sellValid
                      ? `${formatCurrency(buyValid ? buyNum : 0)} → ${formatCurrency(sellNum)}`
                      : '—'}
                  </Text>
                  <Text className='font-sans text-xs text-gray-500'>
                    cost → price
                  </Text>
                </View>
                <View className='flex-1'>
                  <Text
                    className={`font-geist-mono-bold text-sm font-bold ${sellValid && profit < 0 ? 'text-red-700' : 'text-emerald-700'}`}
                  >
                    {sellValid
                      ? `${marginPct.toFixed(1)}% margin`
                      : '—'}
                  </Text>
                  <Text className='font-sans text-xs text-gray-500'>
                    per unit
                  </Text>
                </View>
                <View className='flex-1'>
                  <Text className='font-geist-mono-bold text-sm font-bold text-gray-900'>
                    {formatCurrency(
                      stockNum * (sellValid ? sellNum : 0),
                    )}
                  </Text>
                  <Text className='font-sans text-xs text-gray-500'>
                    potential revenue
                  </Text>
                </View>
              </View>
              {formState.variants.length > 0 ? (
                <Text className='font-sans text-xs text-gray-500 mt-1'>
                  + {formState.variants.length} variant
                  {formState.variants.length === 1 ? '' : 's'} with
                  own prices
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </Sheet>
      <SuccessCelebration visible={showSuccess} title='Stock updated!' message={successMsg} onClose={() => setShowSuccess(false)} />
    </View>
  )
}
