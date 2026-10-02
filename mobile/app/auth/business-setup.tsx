import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  MapPin,
  CreditCard,
  Check,
  Smartphone,
} from 'lucide-react-native'
import { useBusinessContext } from '../../contexts/BusinessContext'
import NetInfo from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STEPS = [
  { title: 'Business core', icon: Building2 },
  { title: 'Location', icon: MapPin },
  { title: 'Currency & Tax', icon: CreditCard },
  { title: 'M-Pesa', icon: Smartphone },
]

export default function BusinessSetup() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { createBusiness } = useBusinessContext()
  const [step, setStep] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    category: '',
    phone: '',
    email: '',
    address: '',
    currency: 'KES',
    timezone: 'Africa/Nairobi',
    taxPin: '',
    yearsInBusiness: '',
    mpesaPaymentType: '' as '' | 'paybill' | 'pochi_biashara' | 'buy_goods',
    mpesaShortcode: '',
  })

  useEffect(() => {
    AsyncStorage.getItem('bizsawa_pending_business_prefill').then((raw) => {
      if (raw) {
        try {
          const p = JSON.parse(raw)
          setForm((f) => ({
            ...f,
            name: p.name || f.name,
            phone: p.phone || f.phone,
            email: p.email || f.email,
          }))
        } catch {}
      }
    })
  }, [])

  const businessTypes = [
    'Retail Shop',
    'Restaurant',
    'Service Business',
    'Manufacturing',
    'Agriculture',
    'Technology',
    'Other',
  ]

  const currencies = ['KES', 'USD', 'EUR', 'UGX', 'TZS']

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

  const next = () => {
    if (step === 0) {
      if (!form.name.trim())
        return Alert.alert('Validation', 'Business name is required')
      if (!form.phone.trim())
        return Alert.alert('Validation', 'Business phone is required')
    }
    if (step < STEPS.length - 1) setStep(step + 1)
  }
  const back = () => setStep(Math.max(0, step - 1))

  const handleCreate = async () => {
    if (!form.name.trim())
      return Alert.alert('Validation', 'Business name required')
    setIsSaving(true)
    const payload: any = {
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      category: form.category || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      currency: form.currency,
      timezone: form.timezone,
      taxPin: form.taxPin.trim() || undefined,
      mpesaPaymentType: form.mpesaPaymentType || undefined,
      mpesaShortcode: form.mpesaShortcode.trim() || undefined,
    }

    // Offline queue: if offline, store pending and navigate
    const net = await NetInfo.fetch()
    if (!net.isConnected) {
      const pending = JSON.stringify({
        ...payload,
        _offlinePending: true,
        createdAt: Date.now(),
      })
      await AsyncStorage.setItem('bizsawa_pending_business', pending)
      Alert.alert(
        'Offline saved',
        'Business will be created when you are back online. You can continue offline.',
        [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }],
      )
      setIsSaving(false)
      return
    }

    try {
      await createBusiness(payload)
      await AsyncStorage.removeItem('bizsawa_pending_business_prefill')
      Alert.alert('Success', 'Business created')
      router.replace('/(tabs)')
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.friendlyMessage || e.message || 'Failed to create business',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SafeAreaView edges={['top']} className='flex-1 bg-white'>
      <View className='px-6 pt-6 pb-4 border-b border-gray-100'>
        <View className='flex-row items-center justify-between mb-4'>
          <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
            Step {step + 1} of {STEPS.length}
          </Text>
          <Text className='font-sans text-xs text-gray-500'>{STEPS[step].title}</Text>
        </View>
        <View className='flex-row gap-2'>
          {STEPS.map((s, i) => {
            const active = i === step
            const done = i < step
            return (
              <View
                key={s.title}
                className={`flex-1 h-1.5 rounded-full ${done ? 'bg-emerald-500' : active ? 'bg-accent' : 'bg-gray-200'}`}
              />
            )
          })}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            className='flex-1 px-6'
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}
            keyboardShouldPersistTaps='handled'
            keyboardDismissMode='interactive'
            showsVerticalScrollIndicator={false}
          >
        {step === 0 && (
          <View className='gap-4'>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Business name *
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                placeholder='e.g., Juma Retail'
                value={form.name}
                onChangeText={(t) =>
                  setForm({ ...form, name: t, slug: slugify(t) })
                }
              />
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Slug (auto)
              </Text>
              <TextInput
                className='bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-sm text-gray-600'
                placeholder='auto from name'
                value={form.slug}
                onChangeText={(t) => setForm({ ...form, slug: t })}
                autoCapitalize='none'
              />
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Category
              </Text>
              <View className='flex-row flex-wrap gap-2'>
                {businessTypes.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setForm({ ...form, category: cat })}
                    className={`px-3 py-2 rounded-full border ${form.category === cat ? 'bg-accent border-accent' : 'bg-white border-gray-200'}`}
                  >
                    <Text
                      className={`font-geist-bold text-xs font-bold ${form.category === cat ? 'text-white' : 'text-gray-700'}`}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Business phone *
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                placeholder='+254...'
                keyboardType='phone-pad'
                value={form.phone}
                onChangeText={(t) => setForm({ ...form, phone: t })}
              />
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Business email
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                placeholder='biz@example.com'
                keyboardType='email-address'
                autoCapitalize='none'
                value={form.email}
                onChangeText={(t) => setForm({ ...form, email: t })}
              />
            </View>
          </View>
        )}

        {step === 1 && (
          <View className='gap-4'>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Address
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                placeholder='Street, town, county'
                value={form.address}
                onChangeText={(t) => setForm({ ...form, address: t })}
              />
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Years in business (for analytics)
              </Text>
              <View className='flex-row flex-wrap gap-2'>
                {[
                  '<1 year',
                  '1-3 years',
                  '3-5 years',
                  '5-10 years',
                  '>10 years',
                ].map((y) => (
                  <Pressable
                    key={y}
                    onPress={() => setForm({ ...form, yearsInBusiness: y })}
                    className={`px-3 py-2 rounded-full border ${form.yearsInBusiness === y ? 'bg-accent border-accent' : 'bg-white border-gray-200'}`}
                  >
                    <Text
                      className={`font-geist-bold text-xs font-bold ${form.yearsInBusiness === y ? 'text-white' : 'text-gray-700'}`}
                    >
                      {y}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View className='gap-4'>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Currency
              </Text>
              <View className='flex-row flex-wrap gap-2'>
                {currencies.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setForm({ ...form, currency: c })}
                    className={`px-4 py-3 rounded-full border ${form.currency === c ? 'bg-accent border-accent' : 'bg-white border-gray-200'}`}
                  >
                    <Text
                      className={`font-geist-bold text-xs font-bold ${form.currency === c ? 'text-white' : 'text-gray-700'}`}
                    >
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Timezone
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                value={form.timezone}
                onChangeText={(t) => setForm({ ...form, timezone: t })}
              />
              <Text className='font-sans text-xs text-gray-500 mt-1'>
                Default Africa/Nairobi
              </Text>
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                KRA Tax PIN (optional)
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                placeholder='A123456789B'
                autoCapitalize='characters'
                value={form.taxPin}
                onChangeText={(t) => setForm({ ...form, taxPin: t })}
              />
            </View>
          </View>
        )}

        {step === 3 && (
          <View className='gap-4'>
            <Text className='font-geist-semibold text-sm font-semibold text-gray-700'>
              M-Pesa (optional)
            </Text>
            <View className='flex-row gap-2'>
              {[
                { id: 'paybill', label: 'Paybill' },
                { id: 'pochi_biashara', label: 'Pochi' },
                { id: 'buy_goods', label: 'Buy Goods' },
              ].map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() =>
                    setForm({ ...form, mpesaPaymentType: m.id as any })
                  }
                  className={`flex-1 py-3 rounded-2xl border items-center ${form.mpesaPaymentType === m.id ? 'bg-green-50 border-green-500' : 'bg-white border-gray-200'}`}
                >
                  <Text
                    className={`font-geist-bold text-xs font-bold ${form.mpesaPaymentType === m.id ? 'text-green-700' : 'text-gray-700'}`}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View>
              <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>
                Shortcode / Till
              </Text>
              <TextInput
                className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-sm'
                placeholder='e.g., 123456'
                keyboardType='numeric'
                value={form.mpesaShortcode}
                onChangeText={(t) => setForm({ ...form, mpesaShortcode: t })}
              />
              <Text className='font-sans text-xs text-gray-500 mt-1'>
                Encrypted on server
              </Text>
            </View>
            <View className='bg-amber-50 border border-amber-200 rounded-2xl p-3'>
              <Text className='font-sans text-xs text-amber-800'>
                You can skip and configure later in Business Profile.
              </Text>
            </View>
          </View>
        )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Thumb-zone CTA: lifted off bottom edge + min 48dp hit target. Was flush to edge (16 + insets.bottom+12) → hard thumb reach */}
      <View
        className='px-6 border-t border-gray-100 bg-white flex-row gap-3'
        style={{
          paddingTop: 16,
          paddingBottom: Math.max(24, insets.bottom + 20),
          // subtle lift + shadow so bar feels floating, not glued to nav
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        {step > 0 ? (
          <TouchableOpacity
            onPress={back}
            className='flex-1 py-4 rounded-2xl border border-gray-300 items-center flex-row justify-center gap-2'
            style={{ minHeight: 56 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={16} color='#374151' />
            <Text className='font-geist-bold font-bold text-gray-700'>Back</Text>
          </TouchableOpacity>
        ) : (
          <View className='flex-1' />
        )}
        {step < STEPS.length - 1 ? (
          <TouchableOpacity
            onPress={next}
            className='flex-1 py-4 rounded-2xl bg-accent items-center flex-row justify-center gap-2'
            style={{ minHeight: 56 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text className='font-geist-bold font-bold text-white'>Next</Text>
            <ArrowRight size={16} color='white' />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleCreate}
            disabled={isSaving}
            className='flex-1 py-4 rounded-2xl bg-emerald-600 items-center flex-row justify-center gap-2'
            style={{ minHeight: 56, opacity: isSaving ? 0.85 : 1 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isSaving ? (
              <ActivityIndicator color='white' />
            ) : (
              <>
                <Check size={16} color='white' />
                <Text className='font-geist-bold font-bold text-white'>Create Business</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}
