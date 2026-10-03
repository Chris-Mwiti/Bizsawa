import React from 'react'
import { View, Text, Pressable, TextInput, type ViewProps } from 'react-native'
import { Mic, Search } from 'lucide-react-native'

/**
 * Soft clinical primitives — the shared language decoded from the reference.
 *
 * Reference traits: cool canvas, ultra-rounded (24–28px) borderless white
 * cards, pill filter chips, pill search bars, 3-up icon tile grids,
 * 2×2 stat cards, avatar transaction rows, dark-teal pill CTAs, floating
 * pill tab bar. All tokens come from the palette (paper/ink/accent/status);
 * no new hues, WCAG pairings unchanged.
 */

// ── Filter pill (category chips, "All Time / Change" filters) ──

export function Pill({
  label,
  active = false,
  onPress,
}: {
  label: string
  active?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='button'
      accessibilityState={{ selected: active }}
      className={`px-4 py-2 rounded-full border ${
        active
          ? 'bg-accent border-accent'
          : 'bg-surface border-hairline'
      }`}
    >
      <Text
        className={`text-xs font-semibold ${
          active ? 'text-on-accent' : 'text-ink-muted'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  )
}

// ── Pill search bar (rounded-full, mic slot like the reference) ──

export function SearchPill({
  value,
  onChangeText,
  placeholder = 'Search…',
  onMic,
  RightSlot,
}: {
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
  onMic?: () => void
  RightSlot?: React.ReactNode
}) {
  return (
    <View className='flex-row items-center gap-2 bg-surface rounded-full pl-4 pr-2 py-1 border border-hairline shadow-clinical-sm'>
      <Search size={16} color='#64746F' />
      <TextInput
        className='flex-1 py-3 text-sm text-ink'
        placeholder={placeholder}
        placeholderTextColor='#64746F'
        value={value}
        onChangeText={onChangeText}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          className='px-3 py-2'
          accessibilityRole='button'
          accessibilityLabel='Clear search'
        >
          <Text className='text-xs font-bold text-ink-muted'>Clear</Text>
        </Pressable>
      ) : null}
      {RightSlot ??
        (onMic ? (
          <Pressable
            onPress={onMic}
            className='w-10 h-10 rounded-full bg-paper items-center justify-center'
            accessibilityRole='button'
            accessibilityLabel='Voice search'
          >
            <Mic size={16} color='#64746F' />
          </Pressable>
        ) : null)}
    </View>
  )
}

// ── Icon tile grid (Sales Transactions / Purchase / Other pattern) ──

export function Tile({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: React.ReactNode
  label: string
  onPress?: () => void
  badge?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={label}
      className='flex-1 items-center bg-surface rounded-3xl py-4 px-2 border border-hairline shadow-clinical-sm min-w-[96px]'
    >
      <View className='w-11 h-11 rounded-full bg-accent-soft items-center justify-center mb-2'>
        {icon}
      </View>
      <Text
        className='text-xs font-semibold text-ink text-center'
        numberOfLines={2}
      >
        {label}
      </Text>
      {badge ? (
        <View className='mt-1 px-2 py-0.5 rounded-full bg-paper border border-hairline'>
          <Text className='text-xs font-bold text-ink-muted'>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export function TileRow({
  children,
  className,
}: ViewProps & { children: React.ReactNode }) {
  return (
    <View className={`flex-row gap-3 ${className || ''}`}>{children}</View>
  )
}

// ── Stat card (Sales Report 2×2: Total Sales / Total Amount …) ──

export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <View className='flex-1 bg-surface rounded-3xl p-4 border border-hairline shadow-clinical-sm min-w-[120px]'>
      <View className='flex-row items-center gap-1.5 mb-2'>
        {icon}
        <Text className='text-xs font-medium text-ink-muted flex-1' numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text className='text-base font-bold tracking-tight text-ink font-mono' numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text className='text-xs text-ink-subtle mt-0.5' numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  )
}

// ── Transaction row (avatar + name/date … amount + status) ──

export function TxnRow({
  avatar,
  title,
  subtitle,
  amount,
  status,
  statusTone = 'muted',
}: {
  avatar?: React.ReactNode
  title: string
  subtitle?: string
  amount: string
  status?: string
  statusTone?: 'paid' | 'unpaid' | 'muted'
}) {
  const statusColor =
    statusTone === 'paid'
      ? 'text-pos'
      : statusTone === 'unpaid'
        ? 'text-neg'
        : 'text-ink-subtle'
  return (
    <View className='flex-row items-center gap-3 py-3'>
      {avatar ?? (
        <View className='w-11 h-11 rounded-full bg-paper border border-hairline items-center justify-center'>
          <Text className='text-sm font-bold text-ink-muted'>
            {title.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View className='flex-1'>
        <Text className='text-sm font-semibold text-ink' numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className='text-xs text-ink-subtle' numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className='items-end'>
        <Text className='text-sm font-bold text-ink font-mono' numberOfLines={1}>
          {amount}
        </Text>
        {status ? (
          <Text className={`text-xs font-semibold ${statusColor}`}>
            {status}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

// ── Centered screen header (back chevron + title, reference style) ──

export function ScreenHeader({
  title,
  left,
  right,
}: {
  title: string
  left?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <View className='flex-row items-center justify-between py-2'>
      <View className='w-11 items-start'>{left}</View>
      <Text className='flex-1 text-center text-sm font-bold text-ink'>
        {title}
      </Text>
      <View className='w-11 items-end'>{right}</View>
    </View>
  )
}

// ── Section title inside a card ("Sales Transactions", "Transaction Lists") ──

export function SectionTitle({
  title,
  action,
}: {
  title: string
  action?: React.ReactNode
}) {
  return (
    <View className='flex-row items-center justify-between mb-3'>
      <Text className='text-sm font-bold text-ink'>{title}</Text>
      {action}
    </View>
  )
}
