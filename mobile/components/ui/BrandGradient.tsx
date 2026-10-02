import React from 'react'
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient'
import { View, type ViewProps } from 'react-native'

import { gradientPresets, type GradientName } from '../../lib/theme/colors'

/**
 * The only sanctioned way to draw a gradient in this app.
 *
 * There are exactly three of them — the primary action, the FAB, and the active
 * tab indicator — and they are the three surfaces in the product that are
 * genuinely raised. Everything else gets a flat token. Routing through this
 * component is what makes that rule enforceable rather than aspirational: a
 * screen cannot reach a gradient without naming one of the three.
 *
 * Product.md bans the hero-metric cliché (a big number floating over a
 * gradient), not gradients. The distinction is *where*, not *whether*.
 *
 *   <BrandGradient name="action" className="rounded-xl">
 *     <Text className="text-on-accent font-semibold">Record sale</Text>
 *   </BrandGradient>
 */
type BrandGradientProps = ViewProps & {
  name: GradientName
  /** Forwarded to the underlying gradient. Use for `radius`, not colours. */
  gradientProps?: Partial<Omit<LinearGradientProps, 'colors' | 'start' | 'end'>>
}

export function BrandGradient({
  name,
  className,
  style,
  gradientProps,
  children,
  ...props
}: BrandGradientProps) {
  const preset = gradientPresets[name]

  return (
    <View className={className} style={style} {...props}>
      <LinearGradient
        colors={preset.colors}
        start={preset.start}
        end={preset.end}
        style={{ flex: 1 }}
        {...gradientProps}
      >
        {children}
      </LinearGradient>
    </View>
  )
}
