import React, { useState } from 'react'
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
} from 'lucide-react-native'
import { router } from 'expo-router'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { useInvoices } from '../hooks/api/useInvoices'
import { useCustomers } from '../hooks/api/useCustomers'
import { TAB_BAR_SCROLL_PADDING } from '../constants/tabBar'
import { toNumber } from '../lib/api-dtos'
import { SyncStatusBadge } from '../components/SyncStatusBadge'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { manualSync } from '../sync/client'

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')} ${d.toLocaleString('en-KE', { month: 'short' })} ${d.getFullYear()}`
}

const STATUS_STYLE: Record<
  string,
  {
    bg: string
    text: string
    icon: React.ComponentType<{ size?: number; color?: string }>
  }
> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-700', icon: Clock },
  sent: { bg: 'bg-sky-100', text: 'text-sky-700', icon: Send },
  viewed: { bg: 'bg-cyan-100', text: 'text-cyan-700', icon: CheckCircle },
  partial: { bg: 'bg-amber-100', text: 'text-amber-700', icon: AlertCircle },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle },
  cancelled: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: XCircle },
}

export default function Invoices() {
  const [refreshing, setRefreshing] = useState(false)
  const { invoices, isLoading, refetch } = useInvoices()
  const { data: customers = [] } = useCustomers() as any

  const getCustomerName = (inv: any) => {
    const cid = inv.customerId || inv.customer_id
    if (cid) {
      const c: any = (customers as any[]).find((x) => x.id === cid)
      if (c?.name) return c.name
    }
    // inv.customerName may already be a name (API enriched) or a UUID — detect UUID
    const name = inv.customerName
    if (
      name &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(name).trim(),
      )
    ) {
      return 'Customer'
    }
    return name || 'Customer'
  }

  const getCustomerInitial = (inv: any) => {
    const name = getCustomerName(inv)
    return name?.charAt(0)?.toUpperCase() || '?'
  }

  const formatCurrency = (amount: string | number) =>
    `KES ${toNumber(amount).toLocaleString('en-KE')}`

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await manualSync()
    } catch {}
    await refetch()
    setRefreshing(false)
  }

  const InvoiceSyncBadge = ({ id }: { id: string }) => {
    const s = useSyncStatus('invoices', id)
    return <SyncStatusBadge status={s} />
  }

  const handleCreatePress = () => {
    Alert.alert(
      'Coming soon',
      'Invoice creation is not yet available. Please create an order first.',
    )
  }

  if (isLoading)
    return (
      <View className='flex-1 items-center justify-center bg-white'>
        <ActivityIndicator size='large' color='#006b5f' />
      </View>
    )

  return (
    <View className='flex-1 bg-gray-50'>
      {/* Header with back + title + segmented control */}
      <View className='px-4 pt-12 pb-4 bg-white border-b border-gray-200'>
        <View className='flex-row items-center mb-4'>
          <TouchableOpacity
            onPress={() => router.back()}
            className='mr-3 p-2 -ml-2 rounded-full active:bg-gray-100'
          >
            <ChevronLeft size={22} color='#374151' />
          </TouchableOpacity>
          <View className='flex-1'>
            <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
              Billing
            </Text>
            <Text className='text-xl font-bold text-gray-900 -mt-0.5'>
              Invoices
            </Text>
            <Text className='text-xs text-gray-500'>
              Track and share invoices
            </Text>
          </View>
          <TouchableOpacity
            className='flex-row items-center gap-2 bg-gray-900 px-4 py-3 rounded-full active:opacity-90'
            onPress={handleCreatePress}
          >
            <Plus size={16} color='white' />
            <Text className='text-white font-bold text-sm'>Create</Text>
          </TouchableOpacity>
        </View>

        <View className='flex-row bg-gray-100 rounded-full p-1'>
          <Pressable
            className='flex-1 py-3 rounded-full items-center'
            onPress={() => router.replace('/(tabs)/sales')}
          >
            <Text className='font-medium text-gray-500 text-sm'>Sales</Text>
          </Pressable>
          <Pressable
            className='flex-1 py-3 rounded-full items-center'
            onPress={() => router.replace('/orders')}
          >
            <Text className='font-medium text-gray-500 text-sm'>Orders</Text>
          </Pressable>
          <View className='flex-1 py-3 rounded-full items-center bg-white shadow-sm border border-gray-200'>
            <Text className='font-bold text-gray-900 text-sm'>Invoices</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor='#006b5f'
          />
        }
      >
        {/* Summary header */}
        <View className='flex-row items-center justify-between px-1 py-1'>
          <Text className='text-sm text-gray-500'>
            {invoices.length === 0
              ? 'No invoices'
              : `${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}`}
          </Text>
          {invoices.length > 0 && (
            <Text className='text-xs font-medium text-gray-400'>
              Tap to view detail
            </Text>
          )}
        </View>

        {invoices.length === 0 ? (
          <Card className='border-dashed'>
            <CardContent className='items-center py-14'>
              <View className='w-14 h-14 rounded-full bg-gray-100 items-center justify-center mb-3'>
                <Send size={20} color='#9ca3af' />
              </View>
              <Text className='text-gray-900 font-bold mb-1'>
                No invoices yet
              </Text>
              <Text className='text-gray-500 text-sm mb-5 text-center px-6'>
                Invoices appear here after you confirm an order.
              </Text>
              <TouchableOpacity
                className='bg-gray-900 px-5 py-3 rounded-full'
                onPress={handleCreatePress}
              >
                <Text className='text-white font-bold text-sm'>
                  Create your first invoice
                </Text>
              </TouchableOpacity>
            </CardContent>
          </Card>
        ) : (
          invoices.map((inv) => {
            const s = STATUS_STYLE[inv.status] || STATUS_STYLE.draft
            const Icon = s.icon
            const isPaid = inv.status === 'paid'
            return (
              <Pressable
                key={inv.id}
                onPress={() => router.push(`/invoices/${inv.id}`)}
                className='active:opacity-80'
              >
                <Card className='border border-gray-200'>
                  <CardContent className='p-4'>
                    {/* Top row: number + amount — generous separation */}
                    <View className='flex-row items-start justify-between gap-4 mb-3'>
                      <View className='flex-1'>
                        <Text
                          className='font-bold text-gray-900 text-base'
                          numberOfLines={1}
                        >
                          {inv.invoiceNumber}
                        </Text>
                        <View className='flex-row items-center gap-2 mt-1.5 flex-wrap'>
                          <View
                            className={`flex-row items-center gap-1 px-3 py-1 rounded-full ${s.bg}`}
                          >
                            <Icon
                              size={11}
                              color={
                                s.text.includes('emerald')
                                  ? '#047857'
                                  : s.text.includes('red')
                                    ? '#b91c1c'
                                    : s.text.includes('sky')
                                      ? '#0369a1'
                                      : '#475569'
                              }
                            />
                            <Text
                              className={`text-xs font-bold tracking-widest ${s.text}`}
                            >
                              {inv.status.toUpperCase()}
                            </Text>
                          </View>
                          <InvoiceSyncBadge id={inv.id} />
                          <Text className='text-xs text-gray-400'>•</Text>
                          <Text
                            className='text-xs text-gray-500'
                            numberOfLines={1}
                          >
                            {getCustomerName(inv)}
                          </Text>
                        </View>
                      </View>

                      <View className='items-end shrink-0 ml-2'>
                        <Text
                          className={`text-base font-bold tracking-tight font-mono ${isPaid ? 'text-emerald-700' : 'text-gray-900'}`}
                        >
                          {formatCurrency(inv.total)}
                        </Text>
                        <Text className='text-xs text-gray-400 mt-0.5'>
                          Due {formatDate(inv.dueAt)}
                        </Text>
                      </View>
                    </View>

                    {/* Bottom row: divider + meta + chevron — not crowding the amount */}
                    <View className='flex-row items-center justify-between pt-3 mt-1 border-t border-gray-100'>
                      <View className='flex-row items-center gap-2'>
                        <View className='w-6 h-6 rounded-full bg-gray-900 items-center justify-center'>
                          <Text className='text-white text-xs font-bold'>
                            {getCustomerInitial(inv)}
                          </Text>
                        </View>
                        <Text
                          className='text-xs font-medium text-gray-600'
                          numberOfLines={1}
                        >
                          {toNumber(inv.amountDue) > 0
                            ? `${formatCurrency(inv.amountDue)} due`
                            : 'Fully paid'}
                        </Text>
                      </View>
                      <View className='flex-row items-center gap-1'>
                        <Text className='text-xs font-bold text-gray-400'>
                          VIEW
                        </Text>
                        <ChevronRight size={16} color='#9ca3af' />
                      </View>
                    </View>
                  </CardContent>
                </Card>
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}
