import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native'
import {
  Building2,
  ShoppingCart,
  Package,
  FileText,
  User,
  Smartphone,
  WifiOff,
  MapPin,
  ChevronRight,
  X,
  HelpCircle,
  Sparkles,
  BarChart3,
  Receipt,
} from 'lucide-react-native'

const TOUR_ENABLED_KEY = 'bizsawa_tour_enabled'
const TOUR_SEEN_KEY = 'bizsawa_tour_seen'

export interface TourStep {
  id: string
  title: string
  subtitle: string
  description: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  color: string
  bg: string
  route?: string
  tips?: string[]
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to BizSawa',
    subtitle: 'Your offline-first business companion',
    description:
      'BizSawa helps you run sales, orders, invoices and stock even without internet. This 60-second tour shows what happens when you tap each button and how to navigate.',
    icon: Sparkles,
    color: '#111827',
    bg: 'bg-gray-900',
    tips: [
      'Works offline — data syncs when you reconnect',
      'All amounts in KES, variant prices per size/color',
      'Tap "Next" to explore, or "Skip" anytime',
    ],
  },
  {
    id: 'sales',
    title: 'Sales — Record & Variants',
    subtitle: 'Tap "Record Sale" → pick product → pick variant',
    description:
      'Business owner creates products with variants (e.g., Beans 500g @ KES 250, 1kg @ KES 450). When you tap Sales → Record Sale, choose Beans, then variant chips appear with price/SKU. Price is taken from variant, not base. Cart shows variant badge (+trash to remove single item, not whole cart). Total is variant price × qty. Works offline; syncs later.',
    icon: ShoppingCart,
    color: '#059669',
    bg: 'bg-emerald-600',
    route: '/(tabs)/sales',
    tips: [
      'Product row shows "3 variants • from KES 250" preview chips',
      'Variant selector enforces choice for variant products',
      'Cart trash removes one line; Reset clears all',
    ],
  },
  {
    id: 'orders',
    title: 'Orders — Lifecycle',
    subtitle: 'Draft → Confirmed → Fulfilled',
    description:
      'Create Order picks customer, payment method, product+variant like Sales. Order statuses: draft (new), confirmed (inventory reserved), fulfilled (sale auto-created), cancelled. M-Pesa disabled when fulfilled. Tap order to see detail, confirm/fulfill there.',
    icon: Package,
    color: '#0369a1',
    bg: 'bg-sky-600',
    route: '/orders',
    tips: ['Variant price flows to order line', 'Pay via M-Pesa or Cash'],
  },
  {
    id: 'invoices',
    title: 'Invoices — Names & Settlement',
    subtitle: 'Customer & product names, not IDs',
    description:
      'List shows invoiceNumber, status badge, customerName (not UUID), total/due, due date. Detail shows customer avatar+phone, lines with productName (resolved via productMap, not UUID description), and summary. Record Payment opens modal: amount is distributed FIFO to oldest unpaid invoices for that customer — works for cash & M-Pesa via worker. Example: customer has INV-001 (due 1st) KES 1000 and INV-002 KES 500, paying KES 1200 settles INV-001 fully + KES 200 to INV-002.',
    icon: FileText,
    color: '#7c3aed',
    bg: 'bg-violet-600',
    route: '/invoices',
    tips: [
      'Backend joins customers/products for names',
      'Offline: lookup via Watermelon cache',
      'Worker settles FIFO for both cash/mpesa',
    ],
  },
  {
    id: 'stock',
    title: 'Stock — Products with Variants',
    subtitle: 'Define sizes/colors once, sell by variant',
    description:
      'Stock → Add: name*, category*, stock, price, SKU/barcode, supplier, then Variants section: Add → name (e.g., 500ml, Red), price*, cost, SKU/barcode. Variants are separate rows in product_variants table, synced. List shows product + variant count badge (e.g., "3 variants") and from price. Edit retains variants.',
    icon: Building2,
    color: '#b45309',
    bg: 'bg-amber-600',
    route: '/(tabs)/stock',
    tips: [
      'Variant price overrides base when selling',
      'Leave Variants empty for single-price product',
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics — Timeframe & KPIs',
    subtitle: 'Day / Week / Month / Year — ink pills',
    description:
      'Insights → Analytics: Tamagui Tabs Day/Week/Month/Year (activationMode manual) with single GET /analytics?timeframe. 2×2 KPIs: Total revenue (+growth), Total profit (margin), Categories tracked, Segments cohorts. Below: Revenue bar (last 7), Trend switchable line (sales/revenue/profit), Profit & margin chips, Category sales pie (top 6), Category performance bars, Customer segments growth + AOV. All DecimalString → KES via toNumber.',
    icon: BarChart3,
    color: '#0f766e',
    bg: 'bg-teal-700',
    route: '/(tabs)/insights/analytics',
    tips: [
      'Tap timeframe pill — queries refetch Snapshot',
      'Revenue bar slices last 7 dates',
      'Pie shows top 6 categories by revenue',
    ],
  },
  {
    id: 'expenses',
    title: 'Expenses — Spend Tracking',
    subtitle: 'Category • Amount • Date* → offline-first',
    description:
      'Insights → Expenses (also Overview quick Add): Hero Total spend KES + count. List: EXP-shortId, category pill, vendor, description, spentAt (en-KE), KES badge + delete. Tap Add → Category* Amount* Description Vendor Date* (Today sets ISO). Writes to Watermelon expenses with sync_version=1 → syncNow; offline count included. Overview aggregates expenses for weekly profit & expense breakdown pie.',
    icon: Receipt,
    color: '#dc2626',
    bg: 'bg-red-600',
    route: '/(tabs)/insights/expenses',
    tips: [
      'Category + amount + spentAt required by handler',
      'Offline adds appear instantly, sync later',
      'Overview shows profit = revenue − expenses',
    ],
  },
  {
    id: 'profile',
    title: 'Profile — Edit Credentials',
    subtitle: 'Business & personal, offline queued',
    description:
      'Profile header shows initials, business name, location. Business information card (phone, type, years) and M-Pesa card each have Edit pencil. Tap Edit Business → name/phone/email/address/taxPin/currency. Tap avatar Edit → first/last name, phone, and change password (current+new). All edits queue offline via AsyncStorage pending and sync on reconnect (BusinessContext).',
    icon: User,
    color: '#111827',
    bg: 'bg-gray-900',
    route: '/(tabs)/profile',
    tips: [
      'Offline edits show optimistic update',
      'Password change needs current password',
    ],
  },
  {
    id: 'navigation',
    title: 'Navigation',
    subtitle: 'Tabs + headers + back',
    description:
      'Bottom tabs: Sales/Stock/Profile. Top segmented control inside Sales screen switches Sales↔Orders↔Invoices. Headers have back chevron (router.back). Orders accessible via Sales tab or direct /orders. Profile has Credit/Profile/Rewards pills. OfflineBanner sticks to top when offline or when back online with pending changes (pending/conflicts).',
    icon: MapPin,
    color: '#6b7280',
    bg: 'bg-gray-600',
    tips: [
      'Swipe between onboarding steps; dots indicate progress',
      'Pull-to-refresh on Invoices triggers manualSync',
    ],
  },
  {
    id: 'offline',
    title: 'Offline & Auth',
    subtitle: 'Secure offline login + business capture',
    description:
      'Login caches SHA256(email:password) in expo-secure-store (Keychain) with 7-day grace. Offline → login verifies against cache, no server hash needed; biometric/PIN can unlock. Business onboarding is 4-step wizard (core → location → currency/tax → M-Pesa) capturing all backend-required fields (name*, slug auto, phone, currency KES, timezone Africa/Nairobi, taxPin, mpesa). Offline business creation queued in AsyncStorage pending and synced via BusinessContext when online.',
    icon: WifiOff,
    color: '#c2410c',
    bg: 'bg-orange-600',
    tips: [
      'First online login enables 7-day offline',
      'Offline business appears optimistic, synced later',
    ],
  },
]

interface TourContextType {
  isEnabled: boolean
  isActive: boolean
  currentStep: number
  hasSeenTour: boolean
  startTour: () => void
  next: () => void
  prev: () => void
  skip: () => void
  close: () => void
  setEnabled: (v: boolean) => Promise<void>
  resetTour: () => Promise<void>
}

const TourContext = createContext<TourContextType | undefined>(undefined)

export const useTour = () => {
  const c = useContext(TourContext)
  if (!c) throw new Error('useTour must be within TourProvider')
  return c
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [isEnabled, setIsEnabled] = useState(true)
  const [hasSeenTour, setHasSeenTour] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    ;(async () => {
      const enabled = await AsyncStorage.getItem(TOUR_ENABLED_KEY)
      const seen = await AsyncStorage.getItem(TOUR_SEEN_KEY)
      if (enabled !== null) setIsEnabled(enabled === '1')
      if (seen === '1') setHasSeenTour(true)
      // Constant for testing: show whenever enabled (default true) — user toggles off in profile when familiar
      const shouldShow = enabled === null || enabled === '1'
      if (shouldShow) {
        setTimeout(() => setIsActive(true), 1200)
      }
    })()
  }, [])

  const setEnabled = async (v: boolean) => {
    setIsEnabled(v)
    await AsyncStorage.setItem(TOUR_ENABLED_KEY, v ? '1' : '0')
    if (!v) setIsActive(false)
  }

  const startTour = async () => {
    setCurrentStep(0)
    setIsActive(true)
  }

  const next = () => {
    if (currentStep < TOUR_STEPS.length - 1) setCurrentStep((s) => s + 1)
    else {
      setIsActive(false)
      AsyncStorage.setItem(TOUR_SEEN_KEY, '1')
      setHasSeenTour(true)
    }
  }

  const prev = () => setCurrentStep((s) => Math.max(0, s - 1))

  const skip = async () => {
    setIsActive(false)
    await AsyncStorage.setItem(TOUR_SEEN_KEY, '1')
    setHasSeenTour(true)
  }

  const close = () => setIsActive(false)

  const resetTour = async () => {
    await AsyncStorage.removeItem(TOUR_SEEN_KEY)
    setHasSeenTour(false)
    setCurrentStep(0)
    setIsActive(true)
  }

  return (
    <TourContext.Provider
      value={{
        isEnabled,
        isActive: isEnabled && isActive,
        currentStep,
        hasSeenTour,
        startTour,
        next,
        prev,
        skip,
        close,
        setEnabled,
        resetTour,
      }}
    >
      {children}
      <TourOverlay />
    </TourContext.Provider>
  )
}

function TourOverlay() {
  const { isActive, currentStep, next, prev, skip, close } = useTour()
  if (!isActive) return null
  const step = TOUR_STEPS[currentStep]
  const Icon = step.icon
  const isLast = currentStep === TOUR_STEPS.length - 1
  const isFirst = currentStep === 0

  return (
    <Modal
      visible={isActive}
      transparent
      animationType='fade'
      onRequestClose={close}
      statusBarTranslucent
    >
      <View className='flex-1 bg-black/60 justify-end'>
        <Pressable className='absolute inset-0' onPress={skip} />
        <View className='bg-white rounded-t-3xl overflow-hidden max-h-[82%]'>
          {/* Progress */}
          <View className='px-6 pt-4'>
            <View className='flex-row items-center justify-between mb-3'>
              <View className='flex-row items-center gap-2'>
                <View className='w-8 h-8 rounded-full bg-gray-900 items-center justify-center'>
                  <HelpCircle size={16} color='white' />
                </View>
                <Text className='text-[11px] font-bold tracking-widest text-gray-400 uppercase'>
                  User Journey • {currentStep + 1} / {TOUR_STEPS.length}
                </Text>
              </View>
              <TouchableOpacity
                onPress={skip}
                className='w-8 h-8 rounded-full bg-gray-100 items-center justify-center'
              >
                <X size={14} color='#6b7280' />
              </TouchableOpacity>
            </View>
            <View className='flex-row gap-1.5'>
              {TOUR_STEPS.map((_, i) => (
                <View
                  key={i}
                  className={`flex-1 h-1.5 rounded-full ${i <= currentStep ? 'bg-gray-900' : 'bg-gray-200'}`}
                />
              ))}
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 24, gap: 16 }}
            showsVerticalScrollIndicator={false}
          >
            <View
              className={`w-14 h-14 rounded-2xl items-center justify-center ${step.bg}`}
            >
              <Icon size={24} color='white' />
            </View>
            <View>
              <Text className='text-[11px] font-bold tracking-widest text-gray-400 uppercase'>
                {step.subtitle}
              </Text>
              <Text className='text-2xl font-bold tracking-tight text-gray-900 mt-1'>
                {step.title}
              </Text>
            </View>
            <Text className='text-sm leading-5 text-gray-700'>
              {step.description}
            </Text>
            {step.tips ? (
              <View className='bg-gray-50 border border-gray-200 rounded-xl p-3 gap-2'>
                {step.tips.map((tip, idx) => (
                  <View key={idx} className='flex-row gap-2 items-start'>
                    <View className='w-1.5 h-1.5 rounded-full bg-gray-400 mt-2' />
                    <Text className='flex-1 text-xs text-gray-600 leading-4'>
                      {tip}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {step.route ? (
              <View className='flex-row items-center gap-1.5 px-3 py-2 rounded-full bg-gray-900 self-start'>
                <Smartphone size={12} color='white' />
                <Text className='text-xs font-bold text-white'>
                  {step.route}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View className='px-6 pb-8 pt-4 border-t border-gray-100 bg-white flex-row gap-3'>
            {!isFirst ? (
              <TouchableOpacity
                onPress={prev}
                className='flex-1 py-3.5 rounded-xl border border-gray-300 items-center'
              >
                <Text className='font-bold text-gray-700'>Back</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={skip}
                className='flex-1 py-3.5 rounded-xl border border-gray-300 items-center'
              >
                <Text className='font-bold text-gray-700'>Skip</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={next}
              className='flex-[2] py-3.5 rounded-xl bg-gray-900 items-center flex-row justify-center gap-2'
            >
              <Text className='font-bold text-white'>
                {isLast ? 'Finish tour' : 'Next'}
              </Text>
              <ChevronRight size={16} color='white' />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}
