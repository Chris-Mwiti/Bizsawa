import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { Slot, usePathname, useRouter } from 'expo-router'

type SubTab = 'sales' | 'orders' | 'invoices'

const TABS: { key: SubTab; label: string; href: string }[] = [
  { key: 'sales', label: 'Sales', href: '/(tabs)/sales' },
  { key: 'orders', label: 'Orders', href: '/(tabs)/sales/orders' },
  { key: 'invoices', label: 'Invoices', href: '/(tabs)/sales/invoices' },
]

function activeTab(pathname: string): SubTab {
  if (pathname.endsWith('/orders') || pathname.includes('/sales/orders'))
    return 'orders'
  if (pathname.endsWith('/invoices') || pathname.includes('/sales/invoices'))
    return 'invoices'
  return 'sales'
}

const META: Record<SubTab, { eyebrow: string; title: string; sub: string }> = {
  sales: {
    eyebrow: 'Workspace',
    title: 'Sales Tracker',
    sub: "Today's sales & orders",
  },
  orders: { eyebrow: 'Workspace', title: 'Orders', sub: 'Confirm, fulfill & collect' },
  invoices: {
    eyebrow: 'Billing',
    title: 'Invoices',
    sub: 'Track and share invoices',
  },
}

export default function SalesSubTabsLayout() {
  const pathname = usePathname()
  const router = useRouter()
  const active = activeTab(pathname)
  const meta = META[active]

  return (
    <View className='flex-1 bg-gray-50'>
      <View className='px-4 pt-12 pb-4 bg-white border-b border-gray-200'>
        <View className='items-start mb-4'>
          <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
            {meta.eyebrow}
          </Text>
          <Text className='font-geist-bold text-xl font-bold tracking-tight text-gray-900 -mt-0.5'>
            {meta.title}
          </Text>
          <Text className='font-sans text-xs text-gray-500'>{meta.sub}</Text>
        </View>
        <View className='flex-row bg-gray-100 rounded-full p-1'>
          {TABS.map((t) => {
            const isActive = active === t.key
            if (isActive) {
              return (
                <View
                  key={t.key}
                  className='flex-1 py-3 rounded-full items-center bg-white shadow-sm border border-gray-200'
                >
                  <Text className='font-geist-bold font-bold text-gray-900 text-sm'>
                    {t.label}
                  </Text>
                </View>
              )
            }
            return (
              <Pressable
                key={t.key}
                onPress={() => router.replace(t.href as any)}
                className='flex-1 py-3 rounded-full items-center'
              >
                <Text className='font-geist-medium font-medium text-gray-500 text-sm'>
                  {t.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
      <Slot />
    </View>
  )
}
