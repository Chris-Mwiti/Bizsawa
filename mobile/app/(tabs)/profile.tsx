import React, { useMemo, useState } from 'react'
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Modal,
  TextInput,
  Alert,
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
  Edit,
  Save,
  HelpCircle,
  Sparkles,
  Play,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Crown,
} from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card'
import { useAuth } from '../../contexts/AuthContext'
import { useBusiness } from '../../hooks/api/useBusiness'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { useTour } from '../../contexts/TourContext'
import { useSync } from '../../sync/SyncProvider'
import { api } from '../../lib/api'
import { TAB_BAR_SCROLL_PADDING } from '../../constants/tabBar'
import { useSubscription } from '../../hooks/api/useSubscription'
import { PaywallModal } from '../../components/PaywallModal'

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
  const { updateBusiness } = useBusinessContext()
  const { pendingCount, conflictCount, trigger: triggerSync } = (() => {
    try { return useSync() } catch { return { pendingCount: 0, conflictCount: 0, trigger: async()=>{} } as any }
  })()
  const {
    isEnabled: tourEnabled,
    setEnabled: setTourEnabled,
    startTour,
    resetTour,
    hasSeenTour,
  } = useTour()
  const [showBusinessEdit, setShowBusinessEdit] = useState(false)
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [businessForm, setBusinessForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    taxPin: '',
    currency: 'KES',
  })
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const { subscription, isPremium } = useSubscription()
  const [showPaywall, setShowPaywall] = useState(false)

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

  const openBusinessEdit = () => {
    setBusinessForm({
      name: business?.name || '',
      phone: (business as any)?.phone || (phone === 'Not set' ? '' : phone),
      email: (business as any)?.email || '',
      address:
        (business as any)?.address || (location === 'Not set' ? '' : location),
      taxPin: (business as any)?.taxPin || '',
      currency: (business as any)?.currency || 'KES',
    })
    setShowBusinessEdit(true)
  }

  const openProfileEdit = () => {
    const parts = (business?.ownerName || userData?.ownerName || '').split(' ')
    setProfileForm({
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      phone: phone === 'Not set' ? '' : phone,
    })
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    setShowProfileEdit(true)
  }

  const handleSaveBusiness = async () => {
    if (!business?.id) return Alert.alert('Error', 'No business selected')
    if (!businessForm.name.trim())
      return Alert.alert('Validation', 'Business name required')
    setSaving(true)
    try {
      await updateBusiness(business.id, {
        name: businessForm.name.trim(),
        phone: businessForm.phone.trim() || undefined,
        email: businessForm.email.trim() || undefined,
        address: businessForm.address.trim() || undefined,
        taxPin: businessForm.taxPin.trim() || undefined,
        currency: businessForm.currency,
      } as any)
      Alert.alert('Success', 'Business updated')
      setShowBusinessEdit(false)
      refetch()
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.friendlyMessage || e.message || 'Failed to update business',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      // Update user profile (first/last name, phone)
      await api.put('/profile', {
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phone: profileForm.phone.trim(),
      })
      // Password change if provided
      if (passwordForm.newPassword) {
        if (passwordForm.newPassword.length < 6)
          throw new Error('New password must be at least 6 characters')
        if (passwordForm.newPassword !== passwordForm.confirmPassword)
          throw new Error('Passwords do not match')
        // Try change-password endpoint, fallback to reset
        try {
          await api.post('/auth/change-password', {
            currentPassword: passwordForm.currentPassword,
            newPassword: passwordForm.newPassword,
          })
        } catch {
          await api.post('/auth/reset-password', {
            currentPassword: passwordForm.currentPassword,
            newPassword: passwordForm.newPassword,
          })
        }
      }
      Alert.alert('Success', 'Profile updated')
      setShowProfileEdit(false)
      refetch()
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.friendlyMessage || e.message || 'Failed to update profile',
      )
    } finally {
      setSaving(false)
    }
  }

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
            <TouchableOpacity
              onPress={openProfileEdit}
              className='w-8 h-8 rounded-full bg-white border border-gray-200 items-center justify-center'
            >
              <Edit size={14} color='#111827' />
            </TouchableOpacity>
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center justify-between'>
            <View className='flex-row items-center gap-2'>
              <User size={16} color='#111827' />
              <CardTitle>Business information</CardTitle>
            </View>
            <TouchableOpacity
              onPress={openBusinessEdit}
              className='w-8 h-8 rounded-full bg-gray-50 border border-gray-200 items-center justify-center'
            >
              <Edit size={14} color='#374151' />
            </TouchableOpacity>
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

        <Card className={`border ${isPremium?'border-emerald-200 bg-emerald-50/20':'border-gray-200'}`}>
          <CardHeader className='flex-row items-center justify-between'>
            <View className='flex-row items-center gap-2'>
              <Crown size={16} color={isPremium?'#059669':'#111827'} />
              <CardTitle>Subscription {isPremium?'• Premium':`• Free`}</CardTitle>
            </View>
            {!isPremium && (
              <TouchableOpacity onPress={() => setShowPaywall(true)} className='px-3 py-1.5 rounded-full bg-gray-900'>
                <Text className='text-xs font-bold text-white'>Upgrade</Text>
              </TouchableOpacity>
            )}
          </CardHeader>
          <CardContent className='pt-0 gap-2'>
            <View className='flex-row justify-between items-center p-3 rounded-xl bg-white border border-gray-200'>
              <Text className='text-sm font-semibold text-gray-900'>{subscription?.planCode ? subscription.planCode.toUpperCase() : 'FREE'}</Text>
              <Text className='text-xs text-gray-500'>{subscription?.endsAt ? `Ends ${new Date(subscription.endsAt).toLocaleDateString('en-KE')}` : isPremium ? 'Active' : '1 biz • basic reports'}</Text>
            </View>
            <Text className='text-xs text-gray-500'>{isPremium ? 'Premium: 5 businesses, AI + full analytics, WAHA' : 'Free: 1 business, 50 products, week analytics only. Unlock premium for KES 399/mo via M-Pesa STK — isolated from business payments.'}</Text>
            <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} feature="Premium — unlock everything" />
          </CardContent>
        </Card>

        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center justify-between'>
            <View className='flex-row items-center gap-2'>
              <Smartphone size={16} color='#111827' />
              <CardTitle>Mobile money</CardTitle>
            </View>
            <TouchableOpacity
              onPress={openBusinessEdit}
              className='w-8 h-8 rounded-full bg-gray-50 border border-gray-200 items-center justify-center'
            >
              <Edit size={14} color='#374151' />
            </TouchableOpacity>
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

        <Card className={`border ${conflictCount>0?'border-amber-300 bg-amber-50/60':'border-gray-200'}`}>
          <CardHeader className='flex-row items-center gap-2'>
            <ShieldAlert size={16} color={conflictCount>0?'#b45309':'#111827'} />
            <CardTitle>Sync & conflicts</CardTitle>
            {conflictCount>0 && <View className='ml-auto bg-amber-500 rounded-full px-2.5 py-1'><Text className='text-xs font-bold text-white'>{conflictCount} conflict{conflictCount>1?'s':''}</Text></View>}
            {conflictCount===0 && pendingCount>0 && <View className='ml-auto bg-gray-900 rounded-full px-2.5 py-1'><Text className='text-xs font-bold text-white'>{pendingCount} pending</Text></View>}
          </CardHeader>
          <CardContent className='pt-0 gap-3'>
            <Text className='text-xs leading-4 text-gray-600'>
              Owner-only: review and resolve sync conflicts when the same record was edited offline on two devices. Pending shows local changes not yet pushed.
            </Text>
            <View className='flex-row gap-2'>
              <TouchableOpacity
                onPress={() => router.push('/sync-conflicts' as any)}
                className={`flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border ${conflictCount>0?'bg-amber-500 border-amber-600':'bg-white border-gray-200'}`}
              >
                <AlertTriangle size={16} color={conflictCount>0?'white':'#111827'} />
                <Text className={`text-sm font-bold ${conflictCount>0?'text-white':'text-gray-900'}`}>
                  {conflictCount>0?'Resolve conflicts':'View conflicts'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => { try { await triggerSync(); Alert.alert('Sync', 'Sync completed')} catch(e:any){ Alert.alert('Sync failed', e?.message||'Failed')} }}
                className='w-[112px] flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-gray-900'
              >
                <RefreshCw size={14} color='white' />
                <Text className='text-sm font-bold text-white'>Sync now</Text>
              </TouchableOpacity>
            </View>
            {(pendingCount>0 || conflictCount>0) && <Text className='text-[11px] text-gray-500 text-center'>Tap Sync now to push {pendingCount} pending, or View conflicts when push returns version mismatch.</Text>}
          </CardContent>
        </Card>

        <Card className='border border-amber-200 bg-amber-50/40'>
          <CardHeader className='flex-row items-center gap-2'>
            <HelpCircle size={16} color='#b45309' />
            <CardTitle>User Journey & Tour</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 gap-3'>
            <View className='bg-white rounded-xl border border-amber-100 p-3'>
              <View className='flex-row items-center gap-2 mb-1'>
                <Sparkles size={14} color='#b45309' />
                <Text className='text-sm font-bold text-gray-900'>
                  Briefing
                </Text>
              </View>
              <Text className='text-xs leading-4 text-gray-700'>
                Pop-up menus brief you on each button and page: what
                Sales/Orders/Invoices do, how variants change price, how cart
                removal works, how to navigate tabs, and how offline sync
                recovers. Tour is shown on first launch and stays on for testing
                — toggle off when familiar.
              </Text>
            </View>

            <View className='flex-row items-center justify-between p-3 bg-white rounded-xl border border-gray-200'>
              <View>
                <Text className='text-sm font-bold text-gray-900'>
                  Interactive tour
                </Text>
                <Text className='text-xs text-gray-500'>
                  {tourEnabled
                    ? hasSeenTour
                      ? 'Enabled • will auto-show for new users'
                      : 'Enabled • constant for testing'
                    : 'Disabled'}
                </Text>
              </View>
              <Pressable
                onPress={() => setTourEnabled(!tourEnabled)}
                className={`w-12 h-7 rounded-full p-1 ${tourEnabled ? 'bg-gray-900' : 'bg-gray-200'}`}
              >
                <View
                  className={`w-5 h-5 rounded-full bg-white ${tourEnabled ? 'ml-5' : 'ml-0'}`}
                />
              </Pressable>
            </View>

            <View className='flex-row gap-2'>
              <TouchableOpacity
                onPress={startTour}
                className='flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-gray-900'
              >
                <Play size={14} color='white' />
                <Text className='text-sm font-bold text-white'>Start tour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={resetTour}
                className='flex-1 py-3 rounded-xl bg-white border border-gray-200 items-center'
              >
                <Text className='text-sm font-bold text-gray-700'>
                  Reset & replay
                </Text>
              </TouchableOpacity>
            </View>
            <Text className='text-[11px] text-gray-500 text-center'>
              Toggle off in profile when you understand the app. Tour covers
              Sales variants, cart, Invoices settlement, Stock, Profile edits,
              navigation and offline.
            </Text>
          </CardContent>
        </Card>
      </ScrollView>

      {/* Business Edit Modal */}
      <Modal
        visible={showBusinessEdit}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={() => setShowBusinessEdit(false)}
      >
        <View className='flex-1 bg-gray-50'>
          <View className='flex-row justify-between items-center p-4 bg-white border-b border-gray-200'>
            <Text className='text-lg font-bold'>Edit Business</Text>
            <TouchableOpacity
              onPress={() => setShowBusinessEdit(false)}
              className='w-8 h-8 rounded-full bg-gray-100 items-center justify-center'
            >
              <Text className='font-bold'>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Business name *
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                value={businessForm.name}
                onChangeText={(t) =>
                  setBusinessForm({ ...businessForm, name: t })
                }
              />
            </View>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Phone
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                keyboardType='phone-pad'
                value={businessForm.phone}
                onChangeText={(t) =>
                  setBusinessForm({ ...businessForm, phone: t })
                }
              />
            </View>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Email
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                keyboardType='email-address'
                autoCapitalize='none'
                value={businessForm.email}
                onChangeText={(t) =>
                  setBusinessForm({ ...businessForm, email: t })
                }
              />
            </View>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Address
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                value={businessForm.address}
                onChangeText={(t) =>
                  setBusinessForm({ ...businessForm, address: t })
                }
              />
            </View>
            <View className='flex-row gap-3'>
              <View className='flex-1'>
                <Text className='text-sm font-semibold text-gray-700 mb-2'>
                  Currency
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                  value={businessForm.currency}
                  onChangeText={(t) =>
                    setBusinessForm({ ...businessForm, currency: t })
                  }
                />
              </View>
              <View className='flex-1'>
                <Text className='text-sm font-semibold text-gray-700 mb-2'>
                  Tax PIN
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                  value={businessForm.taxPin}
                  onChangeText={(t) =>
                    setBusinessForm({ ...businessForm, taxPin: t })
                  }
                  autoCapitalize='characters'
                />
              </View>
            </View>
            <TouchableOpacity
              onPress={handleSaveBusiness}
              disabled={saving}
              className='bg-gray-900 py-4 rounded-xl items-center flex-row justify-center gap-2'
            >
              {saving ? (
                <ActivityIndicator color='white' />
              ) : (
                <>
                  <Save size={16} color='white' />
                  <Text className='text-white font-bold'>Save Business</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Profile Edit Modal */}
      <Modal
        visible={showProfileEdit}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={() => setShowProfileEdit(false)}
      >
        <View className='flex-1 bg-gray-50'>
          <View className='flex-row justify-between items-center p-4 bg-white border-b border-gray-200'>
            <Text className='text-lg font-bold'>Edit Profile</Text>
            <TouchableOpacity
              onPress={() => setShowProfileEdit(false)}
              className='w-8 h-8 rounded-full bg-gray-100 items-center justify-center'
            >
              <Text className='font-bold'>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View className='flex-row gap-3'>
              <View className='flex-1'>
                <Text className='text-sm font-semibold text-gray-700 mb-2'>
                  First name
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                  value={profileForm.firstName}
                  onChangeText={(t) =>
                    setProfileForm({ ...profileForm, firstName: t })
                  }
                />
              </View>
              <View className='flex-1'>
                <Text className='text-sm font-semibold text-gray-700 mb-2'>
                  Last name
                </Text>
                <TextInput
                  className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                  value={profileForm.lastName}
                  onChangeText={(t) =>
                    setProfileForm({ ...profileForm, lastName: t })
                  }
                />
              </View>
            </View>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Phone
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                keyboardType='phone-pad'
                value={profileForm.phone}
                onChangeText={(t) =>
                  setProfileForm({ ...profileForm, phone: t })
                }
              />
            </View>
            <View className='h-px bg-gray-200 my-2' />
            <Text className='text-sm font-bold text-gray-900'>
              Change password
            </Text>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Current password
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                secureTextEntry
                value={passwordForm.currentPassword}
                onChangeText={(t) =>
                  setPasswordForm({ ...passwordForm, currentPassword: t })
                }
              />
            </View>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                New password
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                secureTextEntry
                value={passwordForm.newPassword}
                onChangeText={(t) =>
                  setPasswordForm({ ...passwordForm, newPassword: t })
                }
              />
            </View>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Confirm new password
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-xl px-4 py-3.5'
                secureTextEntry
                value={passwordForm.confirmPassword}
                onChangeText={(t) =>
                  setPasswordForm({ ...passwordForm, confirmPassword: t })
                }
              />
            </View>
            <TouchableOpacity
              onPress={handleSaveProfile}
              disabled={saving}
              className='bg-gray-900 py-4 rounded-xl items-center flex-row justify-center gap-2'
            >
              {saving ? (
                <ActivityIndicator color='white' />
              ) : (
                <>
                  <Save size={16} color='white' />
                  <Text className='text-white font-bold'>Save Profile</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}
