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
    subtitle: 'Your shop, sorted — even offline',
    description:
      'BizSawa helps you make sales, take orders, send invoices and track stock — with or without internet. Take a quick 60-second look to see where everything is.',
    icon: Sparkles,
    color: '#111827',
    bg: 'bg-gray-900',
    tips: [
      'Works without internet — updates when you are back online',
      'All prices show in Kenya Shillings (KES)',
      'Tap Next to continue or Skip anytime',
    ],
  },
  {
    id: 'sales',
    title: 'Make a Sale',
    subtitle: 'Add items, pick a size, and save',
    description:
      'Selling is simple. Tap Record Sale, choose a product like Beans, pick the size you want to sell — for example 500g or 1kg — and the price updates on its own. Choose how many you are selling, check your cart, and tap Save. You can sell even without internet.',
    icon: ShoppingCart,
    color: '#059669',
    bg: 'bg-emerald-600',
    route: '/(tabs)/sales',
    tips: [
      'See all sizes and prices at a glance',
      'Pick a size and the price changes automatically',
      'Remove one item without clearing the whole cart',
    ],
  },
  {
    id: 'orders',
    title: 'Track Orders',
    subtitle: 'From new order to delivery',
    description:
      'Take orders the same way you make sales. Choose a customer, how they will pay, and what they want. You can follow each order from New to Confirmed to Completed, so you always know what needs your attention.',
    icon: Package,
    color: '#0369a1',
    bg: 'bg-sky-600',
    route: '/orders',
    tips: ['See what each customer ordered', 'Accept M-Pesa or Cash', 'Follow each order until it is done'],
  },
  {
    id: 'invoices',
    title: 'Send Invoices',
    subtitle: 'Clear bills for your customers',
    description:
      'Create neat invoices with customer names, products and amounts. When a customer pays, the payment is automatically used for their oldest unpaid bill first — so you do not have to do the maths. It works the same for cash and M-Pesa.',
    icon: FileText,
    color: '#7c3aed',
    bg: 'bg-violet-600',
    route: '/invoices',
    tips: [
      'See names, not confusing codes',
      'One payment can clear several bills',
      'See at a glance what is still owed',
    ],
  },
  {
    id: 'stock',
    title: 'Manage Your Stock',
    subtitle: 'Add products and their sizes',
    description:
      'Add a product once, then add its options if it comes in different sizes or colours. For example, add Beans once, then add 500g and 1kg with their own prices. In your list you will see how many options each product has and the starting price.',
    icon: Building2,
    color: '#b45309',
    bg: 'bg-amber-600',
    route: '/(tabs)/stock',
    tips: [
      'Each size can have its own price',
      'Leave sizes empty if a product has one price',
    ],
  },
  {
    id: 'analytics',
    title: 'See How Your Business Is Doing',
    subtitle: 'Your numbers, made simple',
    description:
      'Check your sales, profit, best-selling products and customer groups. Choose Today, This Week, This Month or This Year to see totals, trends and what is selling best.',
    icon: BarChart3,
    color: '#0f766e',
    bg: 'bg-teal-700',
    route: '/(tabs)/insights/analytics',
    tips: [
      'Switch between Today, Week, Month and Year',
      'See your top products',
      'Understand who buys the most',
    ],
  },
  {
    id: 'expenses',
    title: 'Track What You Spend',
    subtitle: 'Keep costs under control',
    description:
      'Add what you spent with a category, amount and date. See your total spend and each expense with who you paid. Your profit is simply sales minus these expenses.',
    icon: Receipt,
    color: '#dc2626',
    bg: 'bg-red-600',
    route: '/(tabs)/insights/expenses',
    tips: [
      'Add a category, amount and date to save',
      'New expenses appear right away, even offline',
      'See your profit clearly',
    ],
  },
  {
    id: 'profile',
    title: 'Your Business & Account',
    subtitle: 'Keep your details up to date',
    description:
      'See your business name and location at the top. Tap Edit to update business details like phone or address, and tap your avatar to update your name or password. Changes are saved even when offline and update when you are back online.',
    icon: User,
    color: '#111827',
    bg: 'bg-gray-900',
    route: '/(tabs)/profile',
    tips: [
      'Update business info in one tap',
      'Change your password when you need to',
    ],
  },
  {
    id: 'navigation',
    title: 'Get Around Easily',
    subtitle: 'Find everything quickly',
    description:
      'Use the bottom menu to move between Sales, Stock and Profile. Inside Sales you can quickly switch between Sales, Orders and Invoices at the top. Use the back arrow to go back, and pull down to refresh.',
    icon: MapPin,
    color: '#6b7280',
    bg: 'bg-gray-600',
    tips: [
      'The bottom menu is always there',
      'Switch sections with one tap',
      'Pull down to refresh your data',
    ],
  },
  {
    id: 'offline',
    title: 'Works Offline Too',
    subtitle: 'Stay safe, always in control',
    description:
      'Log in once while you have internet, and you can still use BizSawa for 7 days without it. Create businesses, make sales and add expenses offline — everything is saved safely on your phone and updates when you reconnect. Your information stays protected.',
    icon: WifiOff,
    color: '#c2410c',
    bg: 'bg-orange-600',
    tips: [
      'Log in once, use offline for 7 days',
      'Everything you do offline is saved',
      'Updates automatically when you are back online',
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

  const friendlyRouteName = (route?: string) => {
    if (!route) return null
    const map: Record<string, string> = {
      '/(tabs)/sales': 'Sales',
      '/orders': 'Orders',
      '/invoices': 'Invoices',
      '/(tabs)/stock': 'Stock',
      '/(tabs)/insights/analytics': 'Insights',
      '/(tabs)/insights/expenses': 'Expenses',
      '/(tabs)/profile': 'Profile',
    }
    return map[route] || route.replace('/(tabs)/', '').replace('/', '')
  }
  const friendlyName = friendlyRouteName(step.route)

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
                <View className='w-11 h-11 rounded-full bg-gray-900 items-center justify-center'>
                  <HelpCircle size={16} color='white' />
                </View>
                <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
                  Step {currentStep + 1} of {TOUR_STEPS.length}
                </Text>
              </View>
              <TouchableOpacity
                onPress={skip}
                className='w-11 h-11 rounded-full bg-gray-100 items-center justify-center'
              >
                <X size={14} color='#6b7280' />
              </TouchableOpacity>
            </View>
            <View className='flex-row gap-2'>
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
              <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
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
              <View className='bg-gray-50 border border-gray-200 rounded-2xl p-3 gap-2'>
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
            {friendlyName ? (
              <View className='flex-row items-center gap-2 px-3 py-2 rounded-full bg-gray-900 self-start'>
                <Smartphone size={12} color='white' />
                <Text className='text-xs font-bold text-white'>
                  Find it in {friendlyName}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View className='px-6 pb-8 pt-4 border-t border-gray-100 bg-white flex-row gap-3'>
            {!isFirst ? (
              <TouchableOpacity
                onPress={prev}
                className='flex-1 py-4 rounded-2xl border border-gray-300 items-center'
              >
                <Text className='font-bold text-gray-700'>Back</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={skip}
                className='flex-1 py-4 rounded-2xl border border-gray-300 items-center'
              >
                <Text className='font-bold text-gray-700'>Skip</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={next}
              className='flex-[2] py-4 rounded-2xl bg-gray-900 items-center flex-row justify-center gap-2'
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
