import React from 'react'
import { View, TouchableOpacity, Text } from 'react-native'
import type { Timeframe } from '../../hooks/api/useAnalytics'

export interface TimeframeSelectorProps {
  value: Timeframe
  onChange: (value: Timeframe) => void
  className?: string
}

const TIMEFRAMES: Timeframe[] = ['day', 'week', 'month', 'year']
const LABELS: Record<Timeframe, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  all: 'All',
  custom: 'Custom',
}

export function TimeframeSelector({
  value,
  onChange,
  className = '',
}: TimeframeSelectorProps) {
  return (
    <View className={className}>
      <View className='flex-row gap-2 flex-wrap'>
        {TIMEFRAMES.map((tf) => (
          <TouchableOpacity
            key={tf}
            className={`px-3 py-2 rounded-full text-sm font-medium $
              value === tf ? "bg-primary-600 text-white" : "bg-gray-200 text-gray-700"
            }`}
            onPress={() => onChange(tf)}
          >
            {LABELS[tf]}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}
