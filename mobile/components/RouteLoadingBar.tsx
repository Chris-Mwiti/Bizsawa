import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigationGate } from '../lib/navigation/NavigationGate'

const BRAND = '#006b5f'
const INK = '#111827'

const TRACK_HEIGHT = 2.5
const SEGMENT_RATIO = 0.34
const SWEEP_MS = 1150

/**
 * Top loading indicator shown while a gated navigation waits for its destination's
 * data. Non-interactive by design — the user stays on the current page and can keep
 * tapping, since a new tap simply retargets the pending navigation.
 */
export function RouteLoadingBar() {
  const { isLoading, label } = useNavigationGate()
  const insets = useSafeAreaInsets()
  const [trackWidth, setTrackWidth] = useState(0)
  const sweep = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isLoading ? 1 : 0,
      duration: isLoading ? 120 : 110,
      useNativeDriver: true,
    }).start()
  }, [isLoading, opacity])

  useEffect(() => {
    if (!isLoading) {
      sweep.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [isLoading, sweep])

  if (!isLoading) return null

  const segmentWidth = trackWidth * SEGMENT_RATIO
  const overshoot = segmentWidth + 8
  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-overshoot, trackWidth],
    extrapolate: 'clamp',
  })

  return (
    <View
      pointerEvents='none'
      accessibilityRole='progressbar'
      accessibilityLabel={label ? `Loading ${label}` : 'Loading'}
      style={{
        position: 'absolute',
        top: insets.top,
        left: 0,
        right: 0,
        zIndex: 50,
      }}
    >
      <View
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        style={{
          height: TRACK_HEIGHT,
          backgroundColor: 'rgba(17, 24, 39, 0.08)',
          overflow: 'hidden',
        }}
      >
        {trackWidth > 0 ? (
          <Animated.View
            style={{
              width: segmentWidth,
              height: '100%',
              backgroundColor: BRAND,
              transform: [{ translateX }],
              opacity,
            }}
          />
        ) : null}
      </View>
    </View>
  )
}

/**
 * The companion pill: a spinning "Loading <page>" chip that drops just under the
 * sweep so the user can see what they are waiting for.
 */
export function RouteLoadingChip() {
  const { isLoading, label } = useNavigationGate()
  const insets = useSafeAreaInsets()
  const spin = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(0)).current
  const lift = useRef(new Animated.Value(-6)).current

  useEffect(() => {
    if (!isLoading) {
      spin.setValue(0)
      opacity.setValue(0)
      lift.setValue(-6)
      return
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.spring(lift, {
        toValue: 0,
        useNativeDriver: true,
        tension: 90,
        friction: 12,
      }),
    ]).start()
    return () => loop.stop()
  }, [isLoading, spin, opacity, lift])

  if (!isLoading) return null

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.View
      pointerEvents='none'
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        position: 'absolute',
        top: insets.top + TRACK_HEIGHT + 8,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 50,
        opacity,
        transform: [{ translateY: lift }],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: 'rgba(17, 24, 39, 0.08)',
          ...Platform.select({
            ios: {
              shadowColor: INK,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 12,
            },
            android: { elevation: 6 },
          }),
        }}
      >
        <Animated.View
          style={{
            width: 13,
            height: 13,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: 'rgba(0, 107, 95, 0.22)',
            borderTopColor: BRAND,
            transform: [{ rotate }],
          }}
        />
        <Animated.Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 0.4,
            color: INK,
          }}
        >
          {label ? `Loading ${label}…` : 'Loading…'}
        </Animated.Text>
      </View>
    </Animated.View>
  )
}
