import React, { useRef, useState } from 'react'
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native'
import { Bot, Sparkles, X, Plus } from 'lucide-react-native'
import { router } from 'expo-router'
import { TAB_BAR_SCROLL_PADDING } from '../constants/tabBar'

interface TabWrapperProps {
  children: React.ReactNode
}

export const TabWrapper: React.FC<TabWrapperProps> = ({ children }) => {
  const [open, setOpen] = useState(false)
  const anim = useRef(new Animated.Value(0)).current

  const toggle = () => {
    const to = open ? 0 : 1
    setOpen(!open)
    Animated.timing(anim, {
      toValue: to,
      duration: 260,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start()
  }

  const close = () => {
    if (!open) return
    setOpen(false)
    Animated.timing(anim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start()
  }

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })
  const item1Translate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  })
  const item2Translate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  })
  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  })

  return (
    <View style={{ flex: 1 }}>
      {children}

      {/* Backdrop */}
      {open && (
        <Pressable
          onPress={close}
          style={StyleSheet.absoluteFill}
          className='bg-black/20'
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { opacity: backdropOpacity, backgroundColor: 'rgba(0,0,0,0.18)' },
            ]}
          />
        </Pressable>
      )}

      {/* Drawer items — impeccable spacing, labels with pill */}
      <View
        style={[styles.drawer, { bottom: TAB_BAR_SCROLL_PADDING + 78 }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Animated.View
          style={[
            styles.drawerItem,
            {
              opacity: anim,
              transform: [
                { translateY: item2Translate },
                {
                  scale: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            onPress={() => {
              close()
              setTimeout(() => router.push('/social'), 120)
            }}
            className='flex-row items-center gap-3'
            accessibilityRole='button'
            accessibilityLabel='Open Social Content Generator'
          >
            <View className='bg-white px-3 py-2 rounded-full border border-gray-200' style={{ shadowColor: '#006b5f', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 } }}>
              <Text className='text-xs font-bold text-gray-900 tracking-wide'>
                Social Studio
              </Text>
              <Text className='text-xs text-gray-500 -mt-0.5'>
                AI content • posts
              </Text>
            </View>
            <View style={[styles.miniFab, { backgroundColor: '#0ea5e9' }]}>
              <Sparkles size={20} color='white' />
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            styles.drawerItem,
            {
              opacity: anim,
              transform: [
                { translateY: item1Translate },
                {
                  scale: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            onPress={() => {
              close()
              setTimeout(() => router.push('/coach'), 120)
            }}
            className='flex-row items-center gap-3'
            accessibilityRole='button'
            accessibilityLabel='Open AI Coach'
          >
            <View className='bg-white px-3 py-2 rounded-full border border-gray-200' style={{ shadowColor: '#006b5f', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 2 } }}>
              <Text className='text-xs font-bold text-gray-900 tracking-wide'>
                AI Coach
              </Text>
              <Text className='text-xs text-gray-500 -mt-0.5'>
                Ask • Kiswahili & English
              </Text>
            </View>
            <View style={[styles.miniFab, { backgroundColor: '#059669' }]}>
              <Bot size={20} color='white' />
            </View>
          </Pressable>
        </Animated.View>
      </View>

      {/* Single unified FAB — impeccable: gray-900, rounded-full, shadow, rotate morph */}
      <Pressable
        onPress={toggle}
        accessibilityRole='button'
        accessibilityLabel={open ? 'Close quick actions' : 'Open quick actions'}
        style={[styles.fab, styles.mainFab, { bottom: TAB_BAR_SCROLL_PADDING }]}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          {open ? (
            <X size={24} color='white' />
          ) : (
            <Plus size={24} color='white' />
          )}
        </Animated.View>
        {!open && (
          <View style={styles.badge}>
            <View className='w-2 h-2 rounded-full bg-emerald-400' />
          </View>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    right: 16,
    gap: 16,
    alignItems: 'flex-end',
    zIndex: 999,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#006b5f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#006b5f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 4,
    zIndex: 1000,
  },
  mainFab: {
    backgroundColor: '#111827', // impeccable: ink, not brand-blue — matches invoice header FAB
    right: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
  },
})
