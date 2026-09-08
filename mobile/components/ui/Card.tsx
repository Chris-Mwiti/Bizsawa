import React from 'react'
import { View, Text, ViewProps } from 'react-native'

export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      className={`bg-white rounded-2xl border border-gray-200 ${className || ''}`}
      style={{
        shadowColor: '#006b5f',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
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

export function CardTitle({
  className,
  children,
  ...props
}: ViewProps & { children: React.ReactNode }) {
  return (
    <Text
      className={`flex-row items-center justify-between ${className || ''}`}
      {...props}
    >
      {children}
    </Text>
  )
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={`p-6 pt-2 ${className || ''}`} {...props} />
}
