import React, { useEffect, useRef } from 'react'
import { Animated, Easing, Modal, Text, View, TouchableOpacity } from 'react-native'
import { Sparkles, Check } from 'lucide-react-native'

export function SuccessCelebration({
  visible,
  title = 'Success!',
  message,
  onClose,
}: {
  visible: boolean
  title?: string
  message: string
  onClose: () => void
}) {
  const scale = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(0)).current
  const sparkle = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      scale.setValue(0)
      opacity.setValue(0)
      sparkle.setValue(0)
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(sparkle, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(sparkle, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ])
        ),
      ]).start()
    }
  }, [visible, scale, opacity, sparkle])

  const sparkleScale = sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] })
  const sparkleOpacity = sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })

  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={onClose}>
      <View className='flex-1 bg-black/40 items-center justify-center px-6'>
        <Animated.View
          style={{ transform: [{ scale }], opacity }}
          className='bg-white rounded-[32px] p-8 items-center w-full max-w-[320px]'
        >
          {/* Glow behind badge */}
          <View className='absolute top-6 w-24 h-24 rounded-full bg-accent/10' style={{ opacity: 0.6 }} />
          <View className='w-16 h-16 rounded-full bg-accent items-center justify-center mb-4 border border-white/20'>
            <Check size={28} color='white' />
          </View>
          <Animated.View style={{ transform: [{ scale: sparkleScale }], opacity: sparkleOpacity }} className='absolute top-4 right-8'>
            <Sparkles size={20} color='#006b5f' />
          </Animated.View>
          <Animated.View style={{ transform: [{ scale: sparkleScale }], opacity: sparkleOpacity }} className='absolute top-8 left-6'>
            <Sparkles size={14} color='#006b5f' />
          </Animated.View>
          <Text className='font-geist-bold text-lg font-bold text-gray-900 tracking-tight'>{title}</Text>
          <Text className='font-sans text-sm text-gray-500 text-center mt-2 leading-5'>{message}</Text>
          <View className='mt-6 w-full'>
            <TouchableOpacity
              onPress={onClose}
              className='bg-accent py-4 rounded-full items-center active:opacity-90'
              style={{ shadowColor: '#006b5f', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
            >
              <Text className='font-geist-bold text-white font-bold text-sm'>Continue</Text>
            </TouchableOpacity>
          </View>
          <View className='mt-3 px-3 py-1 rounded-full bg-accent/5 border border-accent/10'>
            <Text className='font-geist-bold text-xs font-bold text-accent'>✦ Keep it up!</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}
