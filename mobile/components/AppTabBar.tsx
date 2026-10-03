import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Receipt, Package, BarChart3, User, Home } from 'lucide-react-native'
import { useNavigationGate } from '../lib/navigation/NavigationGate'

const COLORS = {
  surface: '#FFFFFF',
  secondary: '#64746F',
  primary: '#006b5f',
  homeActiveBg: '#006b5f',
  homeIdleBg: '#E4EBEE',
  onPrimary: '#ffffff',
} as const

const ICON_SIZE = 22
const LABEL_SIZE = 11
const HOME_CIRCLE = 52

type RouteName = 'sales' | 'stock' | 'index' | 'insights' | 'profile'

/** Hrefs the gate warms before a tab switch, keyed by tab route name. */
const TAB_HREFS: Record<RouteName, string> = {
  sales: '/(tabs)/sales',
  stock: '/(tabs)/stock',
  index: '/(tabs)',
  insights: '/(tabs)/insights/overview',
  profile: '/(tabs)/profile',
}

function TabIcon({
  routeName,
  focused,
}: {
  routeName: RouteName
  focused: boolean
}) {
  const inactiveColor = COLORS.secondary
  const activeColor = COLORS.primary

  switch (routeName) {
    case 'sales':
      return <Receipt size={ICON_SIZE} color={focused ? activeColor : inactiveColor} />
    case 'stock':
      return <Package size={ICON_SIZE} color={focused ? activeColor : inactiveColor} />
    case 'insights':
      return <BarChart3 size={ICON_SIZE} color={focused ? activeColor : inactiveColor} />
    case 'profile':
      return <User size={ICON_SIZE} color={focused ? activeColor : inactiveColor} />
    default:
      return null
  }
}

export function AppTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  // Hold the current tab and show the top indicator until the destination is warm.
  const { gate } = useNavigationGate()
  /** Safe area + breathing room above system home indicator */
  const bottomPad = Math.max(insets.bottom, 12) + 10

  return (
    <View
      style={[
        styles.outer,
        {
          paddingBottom: bottomPad,
        },
      ]}
    >
      {/* Floating clinical pill — the reference bottom bar: white pill,
          centered dark-teal active home, soft diffuse lift off the canvas. */}
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]
          const routeName = route.name as RouteName
          const isFocused = state.index === index
          const label =
            typeof options.title === 'string'
              ? options.title
              : route.name === 'index'
                ? ''
                : route.name

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (isFocused || event.defaultPrevented) return
            const href = TAB_HREFS[routeName]
            if (href) {
              gate(href, 'navigate', () =>
                navigation.navigate(route.name, route.params),
              )
            } else {
              navigation.navigate(route.name, route.params)
            }
          }

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            })
          }

          if (routeName === 'index') {
            const homeFocused = isFocused
            return (
              <View key={route.key} style={styles.homeSlot}>
                <Pressable
                  accessibilityRole='button'
                  accessibilityState={{ selected: homeFocused }}
                  accessibilityLabel={options.title ?? 'Home'}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  android_ripple={
                    homeFocused
                      ? { color: 'rgba(255,255,255,0.22)', foreground: true }
                      : { color: 'rgba(0,0,0,0.08)', foreground: true }
                  }
                  style={styles.homePressable}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.homeCircle,
                        homeFocused
                          ? styles.homeCircleActive
                          : styles.homeCircleIdle,
                        pressed && styles.homePressed,
                      ]}
                    >
                      <Home
                        size={26}
                        color={homeFocused ? COLORS.onPrimary : COLORS.secondary}
                      />
                    </View>
                  )}
                </Pressable>
              </View>
            )
          }

          const secondaryFocused = isFocused
          return (
            <Pressable
              key={route.key}
              accessibilityRole='button'
              accessibilityState={{ selected: secondaryFocused }}
              accessibilityLabel={options.title}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.sideTab,
                secondaryFocused && styles.sideTabActive,
                !secondaryFocused && styles.sideTabInactive,
                pressed && styles.pressedDim,
              ]}
            >
              <View style={styles.sideTabContent}>
                <View style={styles.iconWrap}>
                  <TabIcon routeName={routeName} focused={secondaryFocused} />
                </View>
                <Text className="font-sans"
                  style={[
                    styles.label,
                    secondaryFocused
                      ? styles.labelActive
                      : styles.labelInactive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 68,
    backgroundColor: COLORS.surface,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: '#E4EBEE',
    ...Platform.select({
      ios: {
        shadowColor: '#0E1F1C',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.1,
        shadowRadius: 32,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  sideTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    maxWidth: 72,
    minHeight: 52,
    borderRadius: 26,
  },
  sideTabActive: {
    backgroundColor: '#E4F0ED',
  },
  sideTabInactive: {
    opacity: 0.85,
  },
  sideTabContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  iconWrap: {
    marginBottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: LABEL_SIZE,
    lineHeight: 16,
    letterSpacing: 0.2,
    fontWeight: '500',
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  labelActive: {
    color: COLORS.primary,
  },
  labelInactive: {
    color: COLORS.secondary,
  },
  homeSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 72,
  },
  homePressable: {
    borderRadius: HOME_CIRCLE / 2,
  },
  homeCircle: {
    width: HOME_CIRCLE,
    height: HOME_CIRCLE,
    borderRadius: HOME_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#006b5f',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  homeCircleIdle: {
    backgroundColor: COLORS.homeIdleBg,
  },
  homeCircleActive: {
    backgroundColor: COLORS.homeActiveBg,
  },
  homePressed: {
    opacity: 0.9,
  },
  pressedDim: {
    opacity: 0.92,
  },
})
