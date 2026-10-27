import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { router } from 'expo-router'
import { TAB_BAR_SCROLL_PADDING } from '../constants/tabBar'

interface TabWrapperProps {
  children: React.ReactNode
}

/**
 * Shell for the tab screens plus the single AI entry point.
 *
 * There used to be a drawer with two floating actions (Coach / Social) behind
 * a Plus button. That meant two taps, a transient menu, and a "create"
 * affordance for what is really one assistant. The workspace handles the
 * Coach / Create post split internally with tabs, so this is now one direct
 * action.
 */
export const TabWrapper: React.FC<TabWrapperProps> = ({ children }) => {
  return (
    <View style={{ flex: 1 }}>
      {children}

      <Pressable
        onPress={() => router.push('/coach')}
        accessibilityRole='button'
        accessibilityLabel='Open AI assistant'
        accessibilityHint='Chat with the coach or create a social post'
        hitSlop={8}
        style={{
          position: 'absolute',
          right: 16,
          bottom: TAB_BAR_SCROLL_PADDING,
          zIndex: 1000,
          minHeight: 52,
          shadowColor: '#006b5f',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.16,
          shadowRadius: 16,
          elevation: 5,
        }}
        className='flex-row items-center gap-2 pl-4 pr-5 rounded-full bg-ink active:opacity-90'
      >
        <Sparkles size={18} color='white' />
        <Text className='font-geist-bold text-white text-xs font-bold tracking-widest'>
          AI
        </Text>
      </Pressable>
    </View>
  )
}
