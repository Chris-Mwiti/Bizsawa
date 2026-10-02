import React, { useState } from 'react'
import { View, Text, Modal, Pressable, TouchableOpacity } from 'react-native'
import { Slot, usePathname, useRouter } from 'expo-router'
import { useBusinessContext } from '../../../contexts/BusinessContext'
import { Tabs } from 'tamagui'
import { SwipeContainer } from '../../../components/SwipeContainer'
import { useSwipeNavigation } from '../../../hooks/useSwipeNavigation'
import {
  BarChart3,
  LayoutGrid,
  TrendingUp,
  Receipt,
  Wallet,
  MoreHorizontal,
  X,
  Check,
} from 'lucide-react-native'

type TabKey = 'overview' | 'analytics' | 'tax' | 'expenses'

type TabMeta = {
  key: TabKey
  label: string
  href: string
  subtitle: string
  icon: React.ComponentType<{ size?: number; color?: string }>
}

const TABS: TabMeta[] = [
  {
    key: 'overview',
    label: 'Overview',
    href: '/(tabs)/insights/overview',
    subtitle: 'Weekly growth & cash flow',
    icon: LayoutGrid,
  },
  {
    key: 'analytics',
    label: 'Analytics',
    href: '/(tabs)/insights/analytics',
    subtitle: 'Revenue, profit & segments',
    icon: TrendingUp,
  },
  {
    key: 'tax',
    label: 'Tax',
    href: '/(tabs)/insights/tax',
    subtitle: 'VAT 16% • KRA payable',
    icon: Receipt,
  },
  {
    key: 'expenses',
    label: 'Expenses',
    href: '/(tabs)/insights/expenses',
    subtitle: 'Spend by category',
    icon: Wallet,
  },
]

const VISIBLE_COUNT = 3 // squeeze-free: 3 pills visible, rest in floating More modal

export default function InsightsLayout() {
  const pathname = usePathname()
  const router = useRouter()
  const { activeBusiness } = useBusinessContext()
  const [showMore, setShowMore] = useState(false)

  const active: TabKey = pathname.includes('/analytics')
    ? 'analytics'
    : pathname.includes('/tax')
      ? 'tax'
      : pathname.includes('/expenses')
        ? 'expenses'
        : 'overview'

  const visibleTabs = TABS.slice(0, VISIBLE_COUNT)
  const overflowTabs = TABS.slice(VISIBLE_COUNT)
  const isOverflowActive = overflowTabs.some((t) => t.key === active)
  const activeOverflowLabel = overflowTabs.find((t) => t.key === active)?.label

  const navigate = (href: string) => {
    setShowMore(false)
    router.replace(href as any)
  }

  // Tamagui Tabs value: when overflow active, highlight More pill
  const tabsValue = isOverflowActive ? '__more' : active

  const { swipe: swipeInsight } = useSwipeNavigation(
    TABS.map((t) => ({ key: t.key, href: t.href, name: t.key })),
  )

  return (
    <SwipeContainer
      onSwipeLeft={() => swipeInsight('left')}
      onSwipeRight={() => swipeInsight('right')}
      style={{ flex: 1, backgroundColor: '#f9fafb' } as any}
    >
      <View className='flex-1 bg-gray-50'>
      {/* Header */}
      <View className='bg-white border-b border-gray-200'>
        <View className='px-4 pt-12 pb-3'>
          <View className='flex-row items-start justify-between gap-3'>
            <View className='flex-1'>
              <View className='flex-row items-center gap-2'>
                <View className='w-11 h-11 rounded-2xl bg-accent items-center justify-center'>
                  <BarChart3 size={14} color='white' />
                </View>
                <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                  Insights
                </Text>
                {activeBusiness?.name ? (
                  <View className='ml-1 px-2 py-1 rounded-full bg-gray-50 border border-gray-200'>
                    <Text className='font-geist-bold text-xs font-bold text-gray-600' numberOfLines={1}>
                      {activeBusiness.name.slice(0, 18)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className='font-geist-bold text-lg font-bold tracking-tight text-gray-900 mt-1'>
                {active === 'analytics'
                  ? 'Analytics'
                  : active === 'tax'
                    ? 'Tax'
                    : active === 'expenses'
                      ? 'Expenses'
                      : 'Overview'}
              </Text>
              <Text className='font-sans text-xs leading-4 text-gray-500' numberOfLines={1}>
                {active === 'analytics'
                  ? 'Revenue, profit & segments • tap timeframe to filter'
                  : active === 'tax'
                    ? 'VAT 16% • products, categories & KRA payable'
                    : active === 'expenses'
                      ? 'Spend by category • add & delete'
                      : 'Weekly growth & cash flow • at a glance'}
              </Text>
            </View>
          </View>
        </View>

        {/* Tamagui Tabs — battle-tested, no Pressable hang, squeeze-free via overflow */}
        <View className='px-4 pb-3'>
          <Tabs
            value={tabsValue}
            onValueChange={(v) => {
              if (v === '__more') {
                setShowMore(true)
                return
              }
              const t = TABS.find((t) => t.key === v)
              if (t) router.replace(t.href as any)
            }}
            orientation='horizontal'
            defaultValue='overview'
            activationMode='manual'
          >
            <Tabs.List
              style={{
                backgroundColor: '#f3f4f6',
                borderRadius: 999,
                padding: 4,
                gap: 6,
                flexDirection: 'row',
              }}
            >
              {visibleTabs.map((t) => {
                const isActive = active === t.key
                return (
                  <Tabs.Tab
                    key={t.key}
                    value={t.key}
                    flex={1}
                    justifyContent='center'
                    alignItems='center'
                    paddingVertical={10}
                    borderRadius={999}
                    backgroundColor={isActive ? 'white' : 'transparent'}
                    borderWidth={isActive ? 1 : 0}
                    borderColor={isActive ? '#e5e7eb' : 'transparent'}
                    style={{
                      flex: 1,
                      backgroundColor: isActive ? 'white' : 'transparent',
                      borderRadius: 999,
                      borderWidth: isActive ? 1 : 0,
                      borderColor: isActive ? '#e5e7eb' : 'transparent',
                      shadowColor: isActive ? '#111827' : 'transparent',
                      shadowOpacity: isActive ? 0.06 : 0,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: isActive ? 1 : 0,
                    }}
                  >
                    <Text className="font-sans"
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? '700' : '500',
                        color: isActive ? '#111827' : '#6b7280',
                        letterSpacing: -0.1,
                      }}
                      numberOfLines={1}
                    >
                      {t.label}
                    </Text>
                  </Tabs.Tab>
                )
              })}

              {overflowTabs.length > 0 && (
                <Tabs.Tab
                  key='__more'
                  value='__more'
                  flex={1}
                  justifyContent='center'
                  alignItems='center'
                  paddingVertical={10}
                  borderRadius={999}
                  backgroundColor={isOverflowActive ? 'white' : 'transparent'}
                  borderWidth={isOverflowActive ? 1 : 0}
                  borderColor={isOverflowActive ? '#e5e7eb' : 'transparent'}
                  style={{
                    flex: 1,
                    backgroundColor: isOverflowActive ? 'white' : 'transparent',
                    borderRadius: 999,
                    borderWidth: isOverflowActive ? 1 : 0,
                    borderColor: isOverflowActive ? '#e5e7eb' : 'transparent',
                    shadowColor: isOverflowActive ? '#111827' : 'transparent',
                    shadowOpacity: isOverflowActive ? 0.06 : 0,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: isOverflowActive ? 1 : 0,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MoreHorizontal size={14} color={isOverflowActive ? '#111827' : '#6b7280'} />
                    <Text className="font-sans"
                      style={{
                        fontSize: 13,
                        fontWeight: isOverflowActive ? '700' : '500',
                        color: isOverflowActive ? '#111827' : '#6b7280',
                      }}
                      numberOfLines={1}
                    >
                      {isOverflowActive ? activeOverflowLabel : 'More'}
                    </Text>
                    {overflowTabs.length > 1 && !isOverflowActive ? (
                      <View
                        style={{
                          minWidth: 18,
                          height: 18,
                          borderRadius: 999,
                          backgroundColor: '#111827',
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingHorizontal: 4,
                          marginLeft: 2,
                        }}
                      >
                        <Text className="font-sans" style={{ fontSize: 10, fontWeight: '700', color: 'white' }}>
                          {overflowTabs.length}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Tabs.Tab>
              )}
            </Tabs.List>
          </Tabs>
        </View>
      </View>

      {/* Floating modal — overflow switcher */}
      <Modal
        visible={showMore}
        transparent
        animationType='fade'
        statusBarTranslucent
        onRequestClose={() => setShowMore(false)}
      >
        <Pressable
          onPress={() => setShowMore(false)}
          style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.32)' }}
        >
          <View
            style={{
              flex: 1,
              justifyContent: 'flex-start',
              paddingTop: 148,
              paddingHorizontal: 16,
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: 'white',
                borderRadius: 20,
                borderWidth: 1,
                borderColor: '#f3f4f6',
                padding: 8,
                shadowColor: '#111827',
                shadowOpacity: 0.12,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
                elevation: 12,
              }}
            >
              <View className='items-center pt-1 pb-2'>
                <View className='w-9 h-1 rounded-full bg-gray-200' />
              </View>
              <View className='flex-row items-center justify-between px-2 pb-2'>
                <View>
                  <Text className='font-geist-bold text-sm font-bold tracking-tight text-gray-900'>
                    More sections
                  </Text>
                  <Text className='font-sans text-xs text-gray-500 mt-0.5'>
                    {overflowTabs.length} more • tap to switch
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowMore(false)}
                  className='w-9 h-9 rounded-full bg-gray-50 border border-gray-200 items-center justify-center'
                >
                  <X size={16} color='#6b7280' />
                </TouchableOpacity>
              </View>

              <View className='h-px bg-gray-100 mx-2 mb-2' />

              {overflowTabs.map((t) => {
                const isActive = active === t.key
                const Icon = t.icon
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => navigate(t.href)}
                    activeOpacity={0.86}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 16,
                      backgroundColor: isActive ? '#111827' : 'white',
                      borderWidth: 1,
                      borderColor: isActive ? '#111827' : '#f3f4f6',
                      marginBottom: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        backgroundColor: isActive ? 'rgba(255,255,255,0.12)' : '#f9fafb',
                        borderWidth: 1,
                        borderColor: isActive ? 'rgba(255,255,255,0.14)' : '#f3f4f6',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={16} color={isActive ? 'white' : '#6b7280'} />
                    </View>
                    <View className='flex-1'>
                      <Text className="font-sans"
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: isActive ? 'white' : '#111827',
                          letterSpacing: -0.1,
                        }}
                      >
                        {t.label}
                      </Text>
                      <Text className="font-sans"
                        style={{
                          fontSize: 12,
                          color: isActive ? 'rgba(255,255,255,0.72)' : '#6b7280',
                          marginTop: 2,
                        }}
                      >
                        {t.subtitle}
                      </Text>
                    </View>
                    {isActive ? (
                      <View className='w-8 h-8 rounded-full bg-white items-center justify-center'>
                        <Check size={16} color='#111827' />
                      </View>
                    ) : (
                      <View className='w-8 h-8 rounded-full bg-gray-50 border border-gray-200 items-center justify-center'>
                        <Text className='font-geist-bold text-gray-500 font-bold text-xs'>›</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}

              {/* Peek visible tabs for fast switch */}
              <View className='flex-row gap-2 mt-1 px-1'>
                {visibleTabs.map((t) => {
                  const isActive = active === t.key
                  return (
                    <TouchableOpacity
                      key={`peek-${t.key}`}
                      onPress={() => navigate(t.href)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 999,
                        backgroundColor: isActive ? '#f3f4f6' : 'white',
                        borderWidth: 1,
                        borderColor: isActive ? '#e5e7eb' : '#f3f4f6',
                        alignItems: 'center',
                      }}
                    >
                      <Text className="font-sans"
                        style={{
                          fontSize: 12,
                          fontWeight: isActive ? '700' : '500',
                          color: isActive ? '#111827' : '#6b7280',
                        }}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text className='font-sans text-center text-[11px] text-gray-500 mt-3 mb-1'>
                Tamagui tabs • squeeze-free • 3 pills + More
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Slot />
      </View>
    </SwipeContainer>
  )
}
