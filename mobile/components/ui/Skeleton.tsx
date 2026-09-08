import React, { useEffect, useRef } from 'react'
import { Animated, View, ViewStyle } from 'react-native'

export function Skeleton({ style, className }: { style?: ViewStyle; className?: string }) {
  const opacity = useRef(new Animated.Value(0.6)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])
  return (
    <Animated.View
      className={`bg-gray-100 rounded-2xl ${className || ''}`}
      style={[{ opacity }, style]}
    />
  )
}

export function DashboardSkeleton() {
  return (
    <View className='flex-1 bg-gray-50 p-4 gap-4'>
      <View className='gap-2'>
        <Skeleton style={{ height: 12, width: 90 }} />
        <Skeleton style={{ height: 24, width: 180 }} />
        <Skeleton style={{ height: 14, width: 220 }} />
      </View>
      <View className='flex-row gap-3'>
        <Skeleton style={{ flex: 1, height: 48, borderRadius: 16 }} />
        <Skeleton style={{ flex: 1, height: 48, borderRadius: 16 }} />
      </View>
      <View className='flex-row flex-wrap gap-3'>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className='w-[48%]'>
            <Skeleton style={{ height: 110, borderRadius: 16 }} />
          </View>
        ))}
      </View>
      <Skeleton style={{ height: 100, borderRadius: 16 }} />
      <Skeleton style={{ height: 140, borderRadius: 16 }} />
    </View>
  )
}
