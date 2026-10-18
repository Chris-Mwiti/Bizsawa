import React, { useMemo, useState } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { AlertTriangle, ArrowUpRight, CloudOff, Receipt } from 'lucide-react-native'
import { Card, CardContent } from '../../../components/ui/Card'
import { DashboardSkeleton } from '../../../components/ui/Skeleton'
import { TAB_BAR_SCROLL_PADDING } from '../../../constants/tabBar'
import {
  useCapturedPayments,
  useSmsQueue,
  type CapturedPaymentDto,
} from '../../../hooks/api/useSmsCaptures'
import {
  DISPUTED_STATUS,
  filterByChannel,
  formatCaptureDate,
  formatKesMinor,
  mergeCaptures,
  PENDING_STATUS,
  statusPill,
  sumMinor,
} from '../../../lib/captureSummary'

const CHANNELS = [
  { key: 'all', label: 'All' },
  { key: 'till', label: 'Till' },
  { key: 'paybill', label: 'Paybill' },
  { key: 'pochi', label: 'Pochi' },
] as const

export default function CapturesTab() {
  const [channel, setChannel] = useState<string>('all')
  const pendingQuery = useCapturedPayments({ status: PENDING_STATUS })
  const disputedQuery = useCapturedPayments({ status: DISPUTED_STATUS })
  const { pending: queuedCount, flush } = useSmsQueue()

  const loading = pendingQuery.isLoading || disputedQuery.isLoading
  const loadError = pendingQuery.error ?? disputedQuery.error
  const refreshing = pendingQuery.isFetching || disputedQuery.isFetching
  const onRefresh = () => {
    pendingQuery.refetch()
    disputedQuery.refetch()
  }

  const { rows, pendingRows, disputedRows } = useMemo(() => {
    const merged = mergeCaptures(
      (pendingQuery.data ?? []) as CapturedPaymentDto[],
      (disputedQuery.data ?? []) as CapturedPaymentDto[],
    )
    const rows = filterByChannel(merged, channel)
    return {
      rows,
      pendingRows: rows.filter((r) => r.verificationStatus === PENDING_STATUS),
      disputedRows: rows.filter((r) => r.verificationStatus === DISPUTED_STATUS),
    }
  }, [pendingQuery.data, disputedQuery.data, channel])

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <View className='flex-1 bg-paper'>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 96,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Quarantine banner — unverified rows must never read as revenue */}
        <View className='bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex-row items-center gap-2'>
          <AlertTriangle size={16} color='#b45309' />
          <Text className='font-sans text-xs text-amber-800 flex-1'>
            Unverified M-PESA reports. Pending verification — excluded from revenue, analytics and tax.
          </Text>
        </View>

        {loadError ? (
          <Card className='border border-red-200'>
            <CardContent className='items-center py-8'>
              <Text className='font-geist-bold font-bold text-ink'>Couldn't load captures</Text>
              <Text className='font-sans text-sm text-ink-muted text-center mt-1 px-6'>
                Check your connection and pull to retry.
              </Text>
            </CardContent>
          </Card>
        ) : null}

        {/* Metrics — same 2-up language as the Sales tab */}
        <View className='flex-row gap-3'>
          <Card className='flex-1'>
            <CardContent className='p-6'>
              <Text className='font-geist-medium text-xs font-medium text-ink-muted'>
                Pending total
              </Text>
              <Text className='font-geist-mono-bold text-lg font-bold tracking-tight text-ink mt-1'>
                {formatKesMinor(sumMinor(pendingRows))}
              </Text>
              <View className='flex-row items-center gap-1 mt-1'>
                <ArrowUpRight size={12} color='#4F625E' />
                <Text className='font-sans text-xs text-ink-muted'>
                  {pendingRows.length} payment{pendingRows.length === 1 ? '' : 's'}
                </Text>
              </View>
            </CardContent>
          </Card>
          <Card className='flex-1'>
            <CardContent className='p-6'>
              <Text className='font-geist-medium text-xs font-medium text-ink-muted'>
                Disputed
              </Text>
              <Text className='font-geist-mono-bold text-lg font-bold tracking-tight text-ink mt-1'>
                {formatKesMinor(sumMinor(disputedRows))}
              </Text>
              <Text className='font-sans text-xs text-ink-muted mt-1'>
                {disputedRows.length} need{disputedRows.length === 1 ? 's' : ''} review
              </Text>
            </CardContent>
          </Card>
        </View>

        {/* Device queue — messages captured on this phone, not yet uploaded */}
        {queuedCount > 0 ? (
          <View className='bg-white border border-hairline rounded-2xl px-4 py-3 flex-row items-center gap-2'>
            <CloudOff size={16} color='#4F625E' />
            <Text className='font-sans text-xs text-ink-muted flex-1'>
              {queuedCount} message{queuedCount === 1 ? '' : 's'} still on this device, waiting to upload.
            </Text>
            <Pressable
              onPress={() => flush.mutate()}
              className='px-3 py-1 rounded-full bg-gray-900'
            >
              <Text className='font-geist-bold text-xs font-bold text-white'>Sync now</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Channel filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className='flex-row gap-2'>
            {CHANNELS.map((c) => {
              const active = channel === c.key
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setChannel(c.key)}
                  className={
                    active
                      ? 'px-4 py-2 rounded-full bg-gray-900'
                      : 'px-4 py-2 rounded-full bg-white border border-hairline'
                  }
                >
                  <Text
                    className={
                      active
                        ? 'font-geist-bold text-xs font-bold text-white'
                        : 'font-geist-medium text-xs font-medium text-ink-muted'
                    }
                  >
                    {c.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </ScrollView>

        {/* List */}
        {rows.length === 0 ? (
          <Card className='border border-dashed border-hairline'>
            <CardContent className='items-center py-12'>
              <View className='w-12 h-12 rounded-full bg-paper border border-hairline items-center justify-center mb-3'>
                <Receipt size={20} color='#4F625E' />
              </View>
              <Text className='font-geist-bold font-bold text-ink'>No captures here</Text>
              <Text className='font-sans text-sm text-ink-muted text-center mt-1 px-6'>
                M-PESA payments captured on device appear here once uploaded. Pull to refresh.
              </Text>
            </CardContent>
          </Card>
        ) : (
          <View className='gap-3'>
            {rows.map((item) => {
              const disputed = item.verificationStatus === DISPUTED_STATUS
              return (
                <Card key={item.id}>
                  <CardContent className='p-6'>
                    <View className='flex-row justify-between gap-3'>
                      <View className='flex-1'>
                        <Text
                          className='font-geist-mono-bold text-sm font-bold tracking-tight text-ink'
                          numberOfLines={1}
                        >
                          {item.mpesaReceipt ?? 'NO RECEIPT'}
                        </Text>
                        <Text className='font-sans text-xs text-ink-muted mt-1'>
                          {formatCaptureDate(item.occurredAt)} • {item.channelType.toUpperCase()}
                        </Text>
                      </View>
                      <View className='items-end gap-1'>
                        <Text className='font-geist-mono-bold text-sm font-bold tracking-tight text-ink'>
                          {formatKesMinor(item.amountMinor)}
                        </Text>
                        <View
                          className={
                            disputed
                              ? 'px-2 py-1 rounded-full bg-red-50 border border-red-200'
                              : 'px-2 py-1 rounded-full bg-amber-50 border border-amber-200'
                          }
                        >
                          <Text
                            className={
                              disputed
                                ? 'font-geist-bold text-xs font-bold tracking-wide text-red-700'
                                : 'font-geist-bold text-xs font-bold tracking-wide text-amber-700'
                            }
                          >
                            {statusPill(item.verificationStatus)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </CardContent>
                </Card>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
