import React from 'react'
import { View, Text, ViewProps } from 'react-native'

export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className || ''}`}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={`p-4 pb-2 ${className || ''}`} {...props} />
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
  return <View className={`p-4 pt-2 ${className || ''}`} {...props} />
}
