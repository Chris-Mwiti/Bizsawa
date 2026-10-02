import React from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'

interface SheetProps {
  visible: boolean
  onClose: () => void
  /** Small caps eyebrow above the title, e.g. "New" / "Step 2 of 3". */
  eyebrow?: string
  title: string
  subtitle?: string
  /** Pinned to the bottom, inside the thumb zone. Total + CTA lives here. */
  footer?: React.ReactNode
  children: React.ReactNode
}

/**
 * The single sheet in the product.
 *
 * Why this exists: every data-entry modal was a full `pageSheet` with a text
 * "X" stranded at the top edge — out of thumb reach, no scrim to tap, and the
 * CTA scrolled away with the content. The research consensus (Material 3 caps
 * modal sheets at 50% initial / 90% max, NN/g requires a real Close target,
 * Baymard/Stripe demand the action stay visible) points at one shape:
 *
 * - bottom-anchored card, capped at 92% of the screen, rounded top;
 * - drag handle + 44pt X button side by side in the header;
 * - scrim tap and Back both dismiss;
 * - `footer` stays pinned in the thumb zone while `children` scroll.
 */
export function Sheet({
  visible,
  onClose,
  eyebrow,
  title,
  subtitle,
  footer,
  children,
}: SheetProps) {
  const insets = useSafeAreaInsets()

  return (
    <Modal
      visible={visible}
      transparent
      animationType='slide'
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className='flex-1 justify-end bg-black/50'>
        <Pressable className='absolute inset-0' onPress={onClose} />
        {/* flex-1 + justify-end is load-bearing: without it the view sizes to
            content and the keyboard-avoiding shift never engages, leaving the
            focused field buried under the keyboard. */}
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View
              className='bg-paper rounded-t-[28px] overflow-hidden'
              style={{ maxHeight: '92%' }}
            >
              {/* Drag handle */}
              <View className='items-center pt-2.5 bg-white'>
                <View className='w-10 h-1.5 rounded-full bg-gray-300' />
              </View>
              {/* Header: title left, 44pt close right */}
              <View className='flex-row justify-between items-center px-5 py-3 bg-white border-b border-gray-200'>
                <View className='flex-1 pr-3'>
                  {eyebrow ? (
                    <Text className='font-geist-bold text-xs font-bold tracking-widest text-gray-500 uppercase'>
                      {eyebrow}
                    </Text>
                  ) : null}
                  <Text className='font-geist-bold text-lg font-bold text-gray-900 -mt-0.5'>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text className='font-sans text-xs text-gray-500 mt-0.5'>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  accessibilityRole='button'
                  accessibilityLabel='Close'
                  className='w-11 h-11 rounded-full bg-gray-100 items-center justify-center'
                >
                  <X size={18} color='#374151' />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={{
                  padding: 16,
                  paddingBottom: 16,
                  gap: 12,
                }}
                keyboardShouldPersistTaps='handled'
                keyboardDismissMode='interactive'
                automaticallyAdjustKeyboardInsets
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>

              {footer ? (
                <View
                  className='bg-white border-t border-gray-200 px-4 pt-3'
                  style={{ paddingBottom: Math.max(insets.bottom, 12) + 4 }}
                >
                  {footer}
                </View>
              ) : null}
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}
