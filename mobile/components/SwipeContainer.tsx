import React, { useRef } from 'react'
import { PanResponder, View, ViewStyle } from 'react-native'

interface SwipeContainerProps {
  children: React.ReactNode
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  enabled?: boolean
  threshold?: number
  style?: ViewStyle
}

// Thresholds tuned for tabs: avoid triggering on vertical scroll or short drags
const DEFAULT_THRESHOLD = 72
const VERTICAL_TOLERANCE = 65

export const SwipeContainer: React.FC<SwipeContainerProps> = ({
  children,
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
  threshold = DEFAULT_THRESHOLD,
  style,
}) => {
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        if (!enabled) return false
        const dx = Math.abs(gs.dx)
        const dy = Math.abs(gs.dy)
        // Claim only when horizontal dominates and exceeds minimal drag
        return dx > dy * 1.4 && dx > 18
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_, gs) => {
        if (!enabled) return
        const { dx, dy, vx } = gs
        // Require sufficient distance OR velocity to avoid accidental taps
        const fast = Math.abs(vx) > 0.55
        const far = Math.abs(dx) > threshold
        if (!fast && !far) return
        if (Math.abs(dy) > VERTICAL_TOLERANCE) return

        if (dx < -threshold || (dx < -30 && vx < -0.55)) {
          onSwipeLeft?.()
        } else if (dx > threshold || (dx > 30 && vx > 0.55)) {
          onSwipeRight?.()
        }
      },
    }),
  ).current

  return (
    <View style={[{ flex: 1 }, style]} {...(enabled ? responder.panHandlers : {})}>
      {children}
    </View>
  )
}
