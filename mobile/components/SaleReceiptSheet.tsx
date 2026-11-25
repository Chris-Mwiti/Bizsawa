import React from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { Business } from '../lib/api-dtos'
import { toNumber } from '../lib/api-dtos'
import { useBusinessContext } from '../contexts/BusinessContext'
import { useSaleReceipt, type SaleReceiptData } from '../hooks/api/useSaleReceipt'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'

interface SaleReceiptSheetProps {
  visible: boolean
  saleId: string | null
  onClose: () => void
}

function formatMoney(value: string | number, currency: string) {
  return `${currency} ${toNumber(value).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatQuantity(value: string | number) {
  return toNumber(value).toLocaleString('en-KE', {
    maximumFractionDigits: 3,
  })
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusContainerClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'completed' || normalized === 'paid') {
    return 'bg-emerald-50'
  }
  if (normalized === 'voided' || normalized === 'cancelled') {
    return 'bg-red-50'
  }
  return 'bg-amber-50'
}

function statusTextClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'completed' || normalized === 'paid') {
    return 'text-emerald-700'
  }
  if (normalized === 'voided' || normalized === 'cancelled') {
    return 'text-red-700'
  }
  return 'text-amber-700'
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <View className='flex-row items-center justify-between gap-3'>
      <Text className='font-sans text-xs text-ink-muted'>{label}</Text>
      <Text
        className={`text-xs text-ink text-right ${mono ? 'font-geist-mono' : 'font-sans'}`}
      >
        {value}
      </Text>
    </View>
  )
}

export function SaleReceiptView({
  receipt,
  business,
}: {
  receipt: SaleReceiptData
  business: Business | null
}) {
  const currency = business?.currency || 'KES'
  const { sale, lines, customerName } = receipt

  return (
    <View className='bg-surface rounded-3xl border border-hairline p-6'>
      <View className='items-center'>
        <Text className='font-geist-bold text-lg font-bold text-ink text-center'>
          {business?.name || 'Bizsawa'}
        </Text>
        {business?.address ? (
          <Text className='font-sans text-xs text-ink-muted text-center mt-1'>
            {business.address}
          </Text>
        ) : null}
        {business?.phone ? (
          <Text className='font-sans text-xs text-ink-muted text-center mt-0.5'>
            {business.phone}
          </Text>
        ) : null}
        {business?.taxPin ? (
          <Text className='font-sans text-xs text-ink-muted text-center mt-0.5'>
            PIN: {business.taxPin}
          </Text>
        ) : null}
      </View>

      <View className='border-t border-dashed border-hairline my-5' />

      <View className='gap-2'>
        <MetaRow label='Receipt' value={sale.receiptNumber} mono />
        <MetaRow label='Date' value={formatDateTime(sale.soldAt)} />
        <MetaRow
          label='Payment'
          value={sale.paymentMethod.replace(/_/g, ' ').toUpperCase()}
        />
        {customerName ? (
          <MetaRow label='Customer' value={customerName} />
        ) : null}
        <View className='flex-row items-center justify-between gap-3'>
          <Text className='font-sans text-xs text-ink-muted'>Status</Text>
          <View
            className={`px-2 py-1 rounded-full ${statusContainerClass(sale.status)}`}
          >
            <Text
              className={`font-geist-bold text-[10px] font-bold tracking-wide uppercase ${statusTextClass(sale.status)}`}
            >
              {sale.status}
            </Text>
          </View>
        </View>
      </View>

      <View className='border-t border-dashed border-hairline my-5' />

      <View className='flex-row items-center pb-2'>
        <Text className='flex-1 font-geist-bold text-xs font-bold text-ink-muted uppercase tracking-wide'>
          Item
        </Text>
        <Text className='w-12 text-center font-geist-bold text-xs font-bold text-ink-muted uppercase tracking-wide'>
          Qty
        </Text>
        <Text className='w-24 text-right font-geist-bold text-xs font-bold text-ink-muted uppercase tracking-wide'>
          Amount
        </Text>
      </View>

      {lines.length === 0 ? (
        <Text className='font-sans text-sm text-ink-muted py-4'>
          No line items recorded for this sale.
        </Text>
      ) : (
        lines.map((line) => (
          <View
            key={line.id}
            className='flex-row items-start py-3 border-t border-hairline'
          >
            <View className='flex-1 pr-2'>
              <Text className='font-sans text-sm text-ink'>
                {line.productName || 'Item'}
              </Text>
              {line.variantName ? (
                <Text className='font-sans text-xs text-ink-muted mt-0.5'>
                  {line.variantName}
                </Text>
              ) : null}
              <Text className='font-geist-mono text-[11px] text-ink-muted mt-0.5'>
                {formatMoney(line.unitPrice, currency)} each
              </Text>
            </View>
            <Text className='w-12 text-center font-geist-mono text-sm text-ink'>
              {formatQuantity(line.quantity)}
            </Text>
            <Text className='w-24 text-right font-geist-mono text-sm text-ink'>
              {formatMoney(line.lineTotal, currency)}
            </Text>
          </View>
        ))
      )}

      <View className='border-t border-dashed border-hairline my-5' />

      <View className='gap-2'>
        <View className='flex-row items-center justify-between'>
          <Text className='font-sans text-sm text-ink-muted'>Subtotal</Text>
          <Text className='font-geist-mono text-sm text-ink'>
            {formatMoney(sale.subtotal, currency)}
          </Text>
        </View>
        {toNumber(sale.taxAmount) > 0 ? (
          <View className='flex-row items-center justify-between'>
            <Text className='font-sans text-sm text-ink-muted'>Tax</Text>
            <Text className='font-geist-mono text-sm text-ink'>
              {formatMoney(sale.taxAmount, currency)}
            </Text>
          </View>
        ) : null}
        <View className='flex-row items-center justify-between pt-3 border-t border-hairline'>
          <Text className='font-geist-bold text-base font-bold text-ink'>
            Total
          </Text>
          <Text className='font-geist-mono-bold text-lg font-bold text-ink'>
            {formatMoney(sale.total, currency)}
          </Text>
        </View>
      </View>

      <View className='items-center mt-6'>
        <Text className='font-sans text-xs text-ink-muted'>
          Thank you for your business
        </Text>
        <Text className='font-sans text-[10px] text-ink-faint mt-1'>
          Powered by Bizsawa
        </Text>
      </View>
    </View>
  )
}

export function SaleReceiptSheet({
  visible,
  saleId,
  onClose,
}: SaleReceiptSheetProps) {
  const { activeBusiness } = useBusinessContext()
  const { receipt, isLoading, error } = useSaleReceipt(saleId)

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow='Sale receipt'
      title={receipt?.sale.receiptNumber || 'Receipt'}
      subtitle={activeBusiness?.name}
      footer={<Button onPress={onClose}>Done</Button>}
    >
      {isLoading ? (
        <View className='items-center justify-center py-16'>
          <ActivityIndicator color='#006B5F' />
          <Text className='font-sans text-sm text-ink-muted mt-3'>
            Loading receipt…
          </Text>
        </View>
      ) : error ? (
        <View className='items-center justify-center py-16 px-6'>
          <Text className='font-geist-bold text-sm font-bold text-ink text-center'>
            Could not load receipt
          </Text>
          <Text className='font-sans text-sm text-ink-muted text-center mt-1'>
            {error}
          </Text>
        </View>
      ) : receipt ? (
        <SaleReceiptView receipt={receipt} business={activeBusiness} />
      ) : (
        <View className='items-center justify-center py-16 px-6'>
          <Text className='font-geist-bold text-sm font-bold text-ink text-center'>
            Receipt not found
          </Text>
          <Text className='font-sans text-sm text-ink-muted text-center mt-1'>
            This sale may have been removed or has not synced yet.
          </Text>
        </View>
      )}
    </Sheet>
  )
}
