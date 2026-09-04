import React, { useMemo } from 'react'
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  User,
  Phone,
  MapPin,
  Building,
  Calendar,
  LogOut,
  CheckCircle,
  Smartphone,
} from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card'
import { useAuth } from '../../contexts/AuthContext'
import { useBusiness } from '../../hooks/api/useBusiness'
import { TAB_BAR_SCROLL_PADDING } from '../../constants/tabBar'

function metadataLocation(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const m = metadata as Record<string, unknown>
  const loc = (m.location ?? m.address ?? m.city) as unknown
  if (typeof loc === 'string' && loc.trim()) return loc.trim()
  return null
}

export default function ProfileTab() {
  const router = useRouter()
  const { userData, logout } = useAuth()
  const { data: business, isLoading, isError, refetch } = useBusiness(null)

  const ownerParts = useMemo(() => {
    const name = business?.ownerName || userData?.ownerName || ''
    const parts = name.trim().split(/\s+/)
    return {
      first: parts[0] || '—',
      last: parts.slice(1).join(' '),
      initials: `${(parts[0]?.[0] || '?').toUpperCase()}${(parts[1]?.[0] || '?').toUpperCase()}`,
    }
  }, [business?.ownerName, userData?.ownerName])

  const businessName = business?.name || userData?.name || '—'
  const phone =
    business?.ownerPhone?.trim() ||
    business?.whatsappNumber?.trim() ||
    'Not set'
  const mpesaDisplay =
    business?.whatsappNumber?.trim() || business?.ownerPhone?.trim() || '—'
  const location = metadataLocation(business?.metadata) || 'Not set'
  const businessType = business?.businessType?.trim() || '—'
  const years = business?.yearsInBusiness?.trim() || '—'

  return (
    <View className='flex-1 bg-gray-50'>
      <View className='px-4 pt-12 pb-4 bg-white border-b border-gray-200'>
        <Text className='text-[11px] font-bold tracking-widest text-gray-400 uppercase'>
          Account
        </Text>
        <Text className='text-xl font-bold tracking-tight text-gray-900 -mt-0.5'>
          Profile
        </Text>
        <Text className='text-xs text-gray-500'>
          Dhibiti maelezo yako • Manage your details
        </Text>

        <View className='flex-row bg-gray-100 rounded-full p-1 mt-4'>
          <Pressable
            onPress={() => router.push('/credit-preview')}
            className='flex-1 py-2.5 rounded-full items-center'
          >
            <Text className='text-sm font-medium text-gray-500'>Credit</Text>
          </Pressable>
          <View className='flex-1 py-2.5 rounded-full items-center bg-white shadow-sm border border-gray-200'>
            <Text className='text-sm font-bold text-gray-900'>Profile</Text>
          </View>
          <Pressable
            onPress={() => router.push('/rewards')}
            className='flex-1 py-2.5 rounded-full items-center'
          >
            <Text className='text-sm font-medium text-gray-500'>Rewards</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <View className='py-8 items-center bg-white rounded-xl border border-gray-200'>
            <ActivityIndicator color='#111827' />
            <Text className='text-sm text-gray-500 mt-2'>
              Loading business profile…
            </Text>
          </View>
        )}
        {isError && (
          <Pressable
            onPress={() => refetch()}
            className='p-4 bg-amber-50 rounded-xl border border-amber-200'
          >
            <Text className='text-sm font-semibold text-amber-900'>
              Could not load profile
            </Text>
            <Text className='text-xs text-amber-700 mt-1'>Tap to retry</Text>
          </Pressable>
        )}

        <Card className='border border-gray-200'>
          <CardContent className='p-5 flex-row items-center gap-4'>
            <View className='w-14 h-14 rounded-xl bg-gray-900 items-center justify-center'>
              <Text className='text-base font-bold text-white'>
                {ownerParts.initials}
              </Text>
            </View>
            <View className='flex-1'>
              <Text className='text-base font-bold text-gray-900'>
                {ownerParts.first} {ownerParts.last}
              </Text>
              <Text className='text-sm text-gray-600'>{businessName}</Text>
              <View className='flex-row items-center gap-1 mt-1'>
                <MapPin size={12} color='#9ca3af' />
                <Text className='text-xs text-gray-500' numberOfLines={1}>
                  {location}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center gap-2'>
            <User size={16} color='#111827' />
            <CardTitle>Business information</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 gap-3'>
            <View className='flex-row items-center gap-3 py-2'>
              <View className='w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 items-center justify-center'>
                <Phone size={14} color='#6b7280' />
              </View>
              <View>
                <Text className='text-[11px] font-bold tracking-widest text-gray-400 uppercase'>
                  Phone
                </Text>
                <Text className='text-sm font-medium text-gray-900'>
                  {phone}
                </Text>
              </View>
            </View>
            <View className='h-px bg-gray-100' />
            <View className='flex-row items-center gap-3 py-2'>
              <View className='w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 items-center justify-center'>
                <Building size={14} color='#6b7280' />
              </View>
              <View>
                <Text className='text-[11px] font-bold tracking-widest text-gray-400 uppercase'>
                  Business type
                </Text>
                <Text className='text-sm font-medium text-gray-900'>
                  {businessType}
                </Text>
              </View>
            </View>
            <View className='h-px bg-gray-100' />
            <View className='flex-row items-center gap-3 py-2'>
              <View className='w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 items-center justify-center'>
                <Calendar size={14} color='#6b7280' />
              </View>
              <View>
                <Text className='text-[11px] font-bold tracking-widest text-gray-400 uppercase'>
                  In business
                </Text>
                <Text className='text-sm font-medium text-gray-900'>
                  {years === '—' ? 'Not set' : `${years} years`}
                </Text>
              </View>
            </View>
            {business?.ownerEmail ? (
              <>
                <View className='h-px bg-gray-100' />
                <Text className='text-xs text-gray-500'>
                  Email • {business.ownerEmail}
                </Text>
              </>
            ) : null}

            <TouchableOpacity
              onPress={logout}
              className='flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-white border border-red-200 mt-2'
            >
              <LogOut size={16} color='#dc2626' />
              <Text className='font-bold text-red-700 text-sm'>Sign out</Text>
            </TouchableOpacity>
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center gap-2'>
            <Smartphone size={16} color='#111827' />
            <CardTitle>Mobile money</CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            <View className='flex-row items-center justify-between p-3.5 rounded-xl bg-gray-50 border border-gray-200'>
              <View className='flex-row items-center gap-3'>
                <View className='w-10 h-10 rounded-xl bg-emerald-600 items-center justify-center'>
                  <Text className='text-white font-bold text-xs'>MP</Text>
                </View>
                <View>
                  <Text className='text-sm font-bold text-gray-900'>
                    M-Pesa
                  </Text>
                  <Text className='text-xs text-gray-500'>{mpesaDisplay}</Text>
                </View>
              </View>
              <CheckCircle size={18} color='#059669' />
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </View>
  )
}
