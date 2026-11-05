import React from 'react'
import { Text, View } from 'react-native'
import { BarChart } from 'react-native-gifted-charts'
import type { AssistantAnswer } from '../../assistant/types'

function shortLabel(label: string): string {
  return label.length > 10 ? `${label.slice(0, 9)}…` : label
}

export function AssistantCards({ answer }: { answer: AssistantAnswer }) {
  if (answer.cards.length === 0 && !answer.chart) return null

  const metrics = answer.cards.filter((card) => card.kind === 'metric')
  const lists = answer.cards.filter((card) => card.kind === 'list')

  return (
    <View className='mt-2 gap-2'>
      {metrics.length > 0 && (
        <View className='flex-row flex-wrap gap-2'>
          {metrics.map((card, index) => (
            <View
              key={`${card.label}-${index}`}
              className='min-w-[96px] flex-1 rounded-xl border border-hairline bg-paper px-3 py-2'
            >
              <Text className='font-sans text-[11px] text-ink-muted'>
                {card.label}
              </Text>
              <Text className='font-geist-bold text-base font-bold text-ink'>
                {card.value}
              </Text>
              {card.hint ? (
                <Text className='font-sans text-[10px] text-ink-muted'>
                  {card.hint}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {lists.map((card, index) => (
        <View
          key={`${card.title}-${index}`}
          className='rounded-xl border border-hairline bg-paper px-3 py-2'
        >
          <Text className='font-geist-bold text-xs font-bold text-ink'>
            {card.title}
          </Text>
          {card.items.length === 0 ? (
            <Text className='mt-1 font-sans text-xs text-ink-muted'>
              No records
            </Text>
          ) : (
            card.items.map((item, itemIndex) => (
              <View
                key={`${item.label}-${itemIndex}`}
                className='mt-1.5 flex-row items-start justify-between gap-3'
              >
                <View className='flex-1'>
                  <Text className='font-sans text-xs text-ink'>
                    {item.label}
                  </Text>
                  {item.meta ? (
                    <Text className='font-sans text-[10px] text-ink-muted'>
                      {item.meta}
                    </Text>
                  ) : null}
                </View>
                {item.value ? (
                  <Text className='font-geist-medium text-xs font-medium text-ink'>
                    {item.value}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      ))}

      {answer.chart && answer.chart.series.length > 0 && (
        <View className='rounded-xl border border-hairline bg-paper px-2 py-3'>
          <Text className='mb-2 px-1 font-geist-bold text-xs font-bold text-ink'>
            {answer.chart.title}
          </Text>
          <BarChart
            data={answer.chart.series.map((point) => ({
              value: point.value,
              label: shortLabel(point.label),
            }))}
            height={150}
            barWidth={22}
            spacing={14}
            initialSpacing={10}
            frontColor='#006B5F'
            noOfSections={3}
            yAxisThickness={0}
            xAxisThickness={0}
            rulesColor='#E5EEEB'
            yAxisTextStyle={{ color: '#64746F', fontSize: 9 }}
            xAxisLabelTextStyle={{ color: '#64746F', fontSize: 9 }}
            isAnimated
          />
        </View>
      )}
    </View>
  )
}
