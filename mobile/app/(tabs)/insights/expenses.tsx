import React, { useState } from 'react'
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native'
import {
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  Receipt,
  Tag,
} from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { useExpenses } from '../../../hooks/api/useExpenses'
import { TAB_BAR_SCROLL_PADDING } from '../../../constants/tabBar'
import { toNumber } from '../../../lib/api-dtos'
import { shortId } from '../../../lib/ids'

export default function InsightsExpenses() {
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    vendor: '',
    amount: '',
    spentAt: new Date().toISOString(),
  })

  const { expenses, isLoading, createExpense, deleteExpense, isCreating } =
    useExpenses()

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString('en-KE')}`
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-KE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  const totalExpenses = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0)

  const resetForm = () =>
    setFormData({
      category: '',
      description: '',
      vendor: '',
      amount: '',
      spentAt: new Date().toISOString(),
    })

  const handleSubmit = async () => {
    const category = formData.category.trim()
    const amountStr = formData.amount.trim()
    const amountNum = Number(amountStr)

    if (!category) {
      Alert.alert(
        'Validation',
        'Category is required — e.g., Feed, Rent, Transport',
      )
      return
    }
    if (!amountStr || !Number.isFinite(amountNum) || amountNum <= 0) {
      Alert.alert('Validation', 'Enter a valid amount greater than 0')
      return
    }
    // Backend ExpenseRequest requires category, amount, spentAt (ISO), plus optional description/vendor/taxAmount
    // toExpenseRequest() in useExpenses.ts maps these correctly via toDecimalString
    try {
      await createExpense({
        category,
        description: formData.description.trim() || undefined,
        vendor: formData.vendor.trim() || undefined,
        amount: amountStr, // hook converts to DecimalString
        spentAt: new Date(formData.spentAt).toISOString(),
      })
      Alert.alert('Success', 'Expense recorded')
      setShowModal(false)
      resetForm()
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.friendlyMessage || e.message || 'Failed to create expense',
      )
    }
  }

  const handleDelete = async (id: string) => {
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(id)
          } catch (e: any) {
            Alert.alert('Error', e.friendlyMessage || 'Failed to delete')
          }
        },
      },
    ])
  }

  const handleNew = () => {
    resetForm()
    setShowModal(true)
  }

  return (
    <View className='flex-1 bg-gray-50'>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero total — impeccable: generous padding, hierarchy */}
        <Card className='border border-gray-200'>
          <CardContent className='p-5'>
            <Text className='text-xs font-bold font-mono tracking-widest text-gray-400 uppercase'>
              Total spend
            </Text>
            <View className='flex-row items-end justify-between mt-1'>
              <Text className='text-3xl font-bold font-mono tracking-tight text-gray-900'>
                {formatCurrency(totalExpenses)}
              </Text>
              <View className='w-11 h-11 rounded-2xl bg-red-50 border border-red-100 items-center justify-center'>
                <Receipt size={20} color='#dc2626' />
              </View>
            </View>
            <Text className='text-xs text-gray-500 mt-2'>
              {expenses.length} {expenses.length === 1 ? 'record' : 'records'} •{' '}
              {totalExpenses > 0 ? 'Tap + to add' : 'No spend yet'}
            </Text>
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader className='flex-row justify-between items-center'>
            <View className='flex-row items-center gap-2'>
              <Tag size={16} color='#6b7280' />
              <CardTitle>Expenses</CardTitle>
              <View className='ml-1 px-2 py-1 rounded-full bg-gray-100'>
                <Text className='text-xs font-bold text-gray-600'>
                  {expenses.length}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              className='flex-row items-center gap-2 bg-gray-900 px-4 py-3 rounded-full active:opacity-90'
              onPress={handleNew}
            >
              <Plus size={16} color='white' />
              <Text className='text-white font-bold text-sm'>Add</Text>
            </TouchableOpacity>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <View className='items-center py-12'>
                <ActivityIndicator size='small' color='#111827' />
                <Text className='text-gray-500 mt-2 text-sm'>
                  Loading expenses…
                </Text>
              </View>
            ) : expenses.length === 0 ? (
              <View className='items-center py-12 px-4'>
                <View className='w-14 h-14 rounded-full bg-gray-100 items-center justify-center mb-3'>
                  <DollarSign size={22} color='#9ca3af' />
                </View>
                <Text className='font-bold text-gray-900'>No expenses yet</Text>
                <Text className='text-sm text-gray-500 text-center mt-1'>
                  Record feed, rent, transport… they will appear here and in
                  analytics.
                </Text>
                <TouchableOpacity
                  className='mt-5 bg-white border border-gray-200 px-5 py-3 rounded-full'
                  onPress={handleNew}
                >
                  <Text className='font-bold text-gray-900 text-sm'>
                    Add first expense
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className='gap-3'>
                {expenses.map((e) => (
                  <View
                    key={e.id}
                    className='p-4 bg-white rounded-2xl border border-gray-200'
                  >
                    <View className='flex-row items-start justify-between gap-3'>
                      <View className='flex-1 gap-2'>
                        <View className='flex-row items-center gap-2 flex-wrap'>
                          <View className='px-2 py-1 rounded-full bg-white border border-gray-200'>
                            <Text className='text-xs font-bold tracking-widest text-gray-500'>
                              EXP-{shortId(e.id, 6)}
                            </Text>
                          </View>
                          <View className='px-3 py-1 rounded-full bg-slate-100 border border-slate-200'>
                            <Text className='text-xs font-bold tracking-widest text-slate-700'>
                              {e.category.toUpperCase()}
                            </Text>
                          </View>
                          {e.vendor ? (
                            <Text className='text-xs text-gray-500'>
                              • {e.vendor}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          className='font-bold text-gray-900 text-[14px] leading-4'
                          numberOfLines={2}
                        >
                          {e.description?.trim()
                            ? e.description
                            : 'No description'}
                        </Text>
                        <View className='flex-row items-center gap-2 mt-1'>
                          <Calendar size={12} color='#9ca3af' />
                          <Text className='text-xs text-gray-500'>
                            {formatDate(e.spentAt)}
                          </Text>
                          <Text className='text-xs text-gray-300'>•</Text>
                          <Badge className='bg-emerald-50 border border-emerald-100 px-2 py-0'>
                            <Text className='text-xs font-bold font-mono text-emerald-700'>
                              KES {toNumber(e.amount).toLocaleString('en-KE')}
                            </Text>
                          </Badge>
                        </View>
                      </View>
                      <View className='items-end gap-2 shrink-0 ml-2'>
                        <Text className='font-bold font-mono text-red-600 text-sm'>
                          {formatCurrency(toNumber(e.amount))}
                        </Text>
                        <View className='flex-row gap-1'>
                          <Pressable
                            onPress={() => handleDelete(e.id)}
                            className='w-11 h-11 rounded-full bg-red-50 border border-red-100 items-center justify-center active:bg-red-100'
                          >
                            <Trash2 size={14} color='#dc2626' />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </ScrollView>

      {/* Create modal — captures all backend-required fields: category*, amount*, spentAt (+ optional description/vendor) */}
      <Modal
        visible={showModal}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={() => setShowModal(false)}
      >
        <View className='flex-1 bg-gray-50'>
          <View className='flex-row justify-between items-center p-4 bg-white border-b border-gray-200'>
            <View>
              <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
                New
              </Text>
              <Text className='text-lg font-bold text-gray-900 -mt-0.5'>
                Add Expense
              </Text>
            </View>
            <Pressable
              onPress={() => setShowModal(false)}
              className='w-11 h-11 rounded-full bg-gray-100 items-center justify-center'
            >
              <Text className='text-gray-600 font-bold'>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View className='p-4 bg-amber-50 rounded-2xl border border-amber-100'>
              <Text className='text-xs font-bold text-amber-800'>
                Required by backend
              </Text>
              <Text className='text-xs text-amber-700 mt-1'>
                Category • Amount • Date (ISO via spentAt). Sent as
                X-Business-ID header + body; handler validates category.
              </Text>
            </View>

            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Category *
              </Text>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
                placeholder='e.g., Feed, Rent, Utilities, Transport'
                value={formData.category}
                onChangeText={(v) => setFormData({ ...formData, category: v })}
                autoCapitalize='words'
              />
            </View>

            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Amount (KES) *
              </Text>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-base'
                placeholder='0.00'
                keyboardType='numeric'
                value={formData.amount}
                onChangeText={(v) => setFormData({ ...formData, amount: v })}
              />
              <Text className='text-xs text-gray-400 mt-1'>
                Sent as DecimalString via toDecimalString()
              </Text>
            </View>

            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Description
              </Text>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
                placeholder='Optional — e.g., 5 bags Layers Mash'
                value={formData.description}
                onChangeText={(v) =>
                  setFormData({ ...formData, description: v })
                }
                multiline
              />
            </View>

            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Vendor
              </Text>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-sm'
                placeholder='Optional — supplier / shop'
                value={formData.vendor}
                onChangeText={(v) => setFormData({ ...formData, vendor: v })}
              />
            </View>

            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Date *
              </Text>
              <View className='flex-row gap-3'>
                <View className='flex-1 border border-gray-300 rounded-2xl px-4 py-4 bg-white flex-row items-center gap-2'>
                  <Calendar size={16} color='#6b7280' />
                  <Text className='text-sm text-gray-900'>
                    {formData.spentAt.split('T')[0]}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setFormData({
                      ...formData,
                      spentAt: new Date().toISOString(),
                    })
                  }
                  className='px-4 py-4 rounded-2xl bg-white border border-gray-200'
                >
                  <Text className='font-bold text-sm text-gray-900'>Today</Text>
                </Pressable>
              </View>
              <Text className='text-xs text-gray-400 mt-1'>
                Stored as ISO spentAt — handler parses time.RFC3339
              </Text>
            </View>

            <TouchableOpacity
              className='mt-2 bg-gray-900 py-4 rounded-2xl items-center active:opacity-90 disabled:opacity-50'
              onPress={handleSubmit}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color='white' />
              ) : (
                <Text className='text-white font-bold'>Save Expense</Text>
              )}
            </TouchableOpacity>

            <Text className='text-xs text-center text-gray-400'>
              POST /api/v1/expenses with X-Business-ID — creates Expense +
              optional tax record
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}
