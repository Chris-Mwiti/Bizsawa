import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Bot, Sparkles, X } from 'lucide-react-native'
import { router } from 'expo-router'
import { CoachPanel } from './CoachPanel'
import { SocialPanel } from './SocialPanel'

export type AiTab = 'coach' | 'social'

function AiTabButton({
  label,
  active,
  icon: Icon,
  onPress,
}: {
  label: string
  active: boolean
  icon: React.ComponentType<{ size?: number; color?: string }>
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='tab'
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-2.5 ${
        active ? 'bg-surface shadow-clinical-sm' : ''
      }`}
      style={{ minHeight: 44 }}
    >
      <Icon size={15} color={active ? '#006B5F' : '#64746F'} />
      <Text
        className={`font-geist-bold text-xs font-bold ${
          active ? 'text-ink' : 'text-ink-muted'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * One AI workspace, two modes.
 *
 * Coach and Create post are both business-context tools, so they share a
 * single entry point and a single shell. Both panels stay mounted while the
 * inactive one is hidden, preserving chat history and the social draft when
 * the user switches tabs.
 */
export function AiWorkspace({ initialTab = 'coach' }: { initialTab?: AiTab }) {
  const [tab, setTab] = useState<AiTab>(initialTab)

  const close = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/(tabs)')
    }
  }

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ flex: 1, backgroundColor: '#F4F9F7' }}
    >
      <View className='flex-1 bg-surface overflow-hidden rounded-t-[20px]'>
        <View className='flex-row items-center justify-between px-4 pt-3 pb-3 bg-surface border-b border-hairline'>
          <View className='flex-row items-center gap-3'>
            <View className='w-10 h-10 rounded-full bg-accent items-center justify-center'>
              <Sparkles size={18} color='white' />
            </View>
            <View>
              <Text className='font-geist-bold text-lg font-bold text-ink'>
                AI assistant
              </Text>
              <Text className='font-sans text-xs text-ink-muted'>
                Msaidizi wa biashara
              </Text>
            </View>
          </View>
          <Pressable
            onPress={close}
            hitSlop={8}
            accessibilityRole='button'
            accessibilityLabel='Close AI assistant'
            className='w-11 h-11 rounded-full bg-paper items-center justify-center border border-hairline'
          >
            <X size={18} color='#374151' />
          </Pressable>
        </View>

        <View className='px-4 pt-3 pb-3 bg-surface border-b border-hairline'>
          <View
            className='flex-row bg-sunken rounded-full p-1'
            accessibilityRole='tablist'
          >
            <AiTabButton
              label='Coach'
              active={tab === 'coach'}
              icon={Bot}
              onPress={() => setTab('coach')}
            />
            <AiTabButton
              label='Create post'
              active={tab === 'social'}
              icon={Sparkles}
              onPress={() => setTab('social')}
            />
          </View>
        </View>

        <View className='flex-1'>
          <View style={{ flex: 1, display: tab === 'coach' ? 'flex' : 'none' }}>
            <CoachPanel />
          </View>
          <View style={{ flex: 1, display: tab === 'social' ? 'flex' : 'none' }}>
            <SocialPanel />
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}
