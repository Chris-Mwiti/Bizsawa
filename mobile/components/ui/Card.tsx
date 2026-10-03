import React from 'react'
import { View, Text, ViewProps } from 'react-native'

export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      // Soft clinical taste: ultra-rounded (24px), borderless white, large
      // diffuse tinted shadow — matches the reference card language.
      // Border + tight 16px radius was the old ledger look.
      className={`bg-surface rounded-3xl ${className || ''}`}
      style={{
        shadowColor: '#0E1F1C',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 2,
      }}
      {...props}
    />
  )
}

// Double-bezel variant per high-end-visual-design: outer p-1.5 rounded-[2rem] + inner rounded 26
export function BezelCard({ className, children, ...props }: ViewProps & { children: React.ReactNode }) {
  return (
    <View className={`bg-black/5 p-1.5 rounded-[32px] ${className || ''}`} {...props}>
      <View
        className='bg-white rounded-[26px] border border-black/5 overflow-hidden'
        style={{
          shadowColor: '#006b5f',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.06,
          shadowRadius: 24,
          elevation: 3,
        }}
      >
        {children}
      </View>
    </View>
  )
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={`p-6 pb-2 ${className || ''}`} {...props} />
}

/**
 * The single card header in the product.
 *
 * Before this existed, every screen hand-rolled `icon + title` rows and the
 * tiles drifted: 44px boxes against small-caps labels with `items-start`,
 * bare 16px glyphs sitting on the text baseline next to `CardTitle` (which is
 * a Text and cannot center a sibling). One tile size, one gap, one center
 * line — `items-center` on the row and a fixed 36px tile do all the work.
 */
export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  iconColor = '#006B5F',
}: {
  icon: React.ComponentType<{ size?: number | string; color?: string }>
  title: string
  subtitle?: string
  action?: React.ReactNode
  iconColor?: string
}) {
  return (
    <View className='flex-row items-center gap-2.5'>
      <View className='w-11 h-11 rounded-2xl bg-accent-soft items-center justify-center shrink-0'>
        <Icon size={18} color={iconColor} />
      </View>
      <View className='flex-1'>
        <Text className='font-geist-bold text-sm font-bold text-gray-900 leading-5'>
          {title}
        </Text>
        {subtitle ? (
          <Text className='font-sans text-xs text-gray-500'>{subtitle}</Text>
        ) : null}
      </View>
      {action}
    </View>
  )
}

export function CardTitle({
  className,
  children,
  ...props
}: ViewProps & { children: React.ReactNode }) {
  return (
    <Text
      className={`font-sans flex-row items-center justify-between ${className || ''}`}
      {...props}
    >
      {children}
    </Text>
  )
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={`p-6 pt-2 ${className || ''}`} {...props} />
}
