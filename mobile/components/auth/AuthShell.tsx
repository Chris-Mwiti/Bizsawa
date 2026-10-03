import React from 'react'
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type TextInputProps,
  type TouchableOpacityProps,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Apple } from 'lucide-react-native'

/**
 * Shared auth shell emulating the reference taste: pale canvas, centered
 * ultra-rounded (28px) white card, centered brand mark + wordmark, bold
 * centered title + muted subtitle, small field labels, rounded-2xl inputs,
 * full-width teal pill CTA, OR divider, circular social row, footer switch.
 *
 * Screens own all logic; this file owns only the look.
 */

export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <View className='items-center'>
      <View
        className='bg-accent-soft items-center justify-center rounded-3xl'
        style={{ width: size, height: size }}
      >
        <Image
          source={require('../../assets/adaptive-icon.png')}
          style={{ width: size * 0.72, height: size * 0.72 }}
          resizeMode='contain'
        />
      </View>
      <Text
        className='font-geist-bold font-bold text-accent mt-2'
        style={{ letterSpacing: 4, fontSize: 13 }}
      >
        BIZSAWA
      </Text>
    </View>
  )
}

export function AuthShell({
  title,
  subtitle,
  onBack,
  footer,
  children,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <SafeAreaView className='flex-1 bg-paper'>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        className='flex-1'
      >
        <ScrollView
          className='flex-1'
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='interactive'
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: 20,
            paddingBottom: insets.bottom + 20,
          }}
        >
          <View className='bg-surface rounded-4xl p-6 border border-hairline shadow-clinical'>
            {onBack ? (
              <TouchableOpacity
                onPress={onBack}
                accessibilityRole='button'
                accessibilityLabel='Go back'
                className='w-10 h-10 rounded-full bg-paper border border-hairline items-center justify-center mb-2'
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ArrowLeft size={18} color='#0E1F1C' />
              </TouchableOpacity>
            ) : null}
            <BrandMark />
            <Text className='font-geist-bold text-xl font-bold text-ink text-center mt-4'>
              {title}
            </Text>
            {subtitle ? (
              <Text className='font-sans text-sm text-ink-muted text-center mt-1.5 px-2'>
                {subtitle}
              </Text>
            ) : null}
            <View className='mt-6'>{children}</View>
          </View>
          {footer ? <View className='mt-4 items-center'>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className='font-geist-semibold text-xs font-semibold text-ink-strong mb-1.5'>
      {children}
    </Text>
  )
}

export const AuthInput = React.forwardRef<TextInput, TextInputProps>(
  function AuthInput({ className, ...rest }, ref) {
    return (
      <TextInput
        ref={ref}
        className={`border border-hairline rounded-2xl px-4 py-4 text-[15px] text-ink bg-surface ${className || ''}`}
        placeholderTextColor='#64746F'
        {...rest}
      />
    )
  },
)

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <Text className='font-sans text-neg text-xs mt-1.5'>{message}</Text>
  )
}

export function PrimaryCta({
  label,
  loading,
  disabled,
  ...props
}: {
  label: string
  loading?: boolean
  disabled?: boolean
} & Omit<TouchableOpacityProps, 'children'>) {
  return (
    <TouchableOpacity
      disabled={disabled || loading}
      activeOpacity={0.9}
      className={`bg-accent rounded-full py-4 items-center shadow-clinical-sm ${disabled ? 'opacity-50' : ''}`}
      {...props}
    >
      <Text className='font-geist-bold text-white font-bold text-[15px]'>
        {loading ? 'Please wait…' : label}
      </Text>
    </TouchableOpacity>
  )
}

export function OrDivider() {
  return (
    <View className='flex-row items-center my-5'>
      <View className='flex-1 h-[1px] bg-hairline' />
      <Text className='font-geist-medium mx-4 text-ink-subtle text-xs font-medium tracking-widest'>
        OR
      </Text>
      <View className='flex-1 h-[1px] bg-hairline' />
    </View>
  )
}

function SocialCircle({
  onPress,
  label,
  children,
}: {
  onPress: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={label}
      className='w-[52px] h-[52px] rounded-full bg-surface border border-hairline items-center justify-center shadow-clinical-sm'
    >
      {children}
    </TouchableOpacity>
  )
}

export function SocialRow({
  onGoogle,
  onApple,
  onFacebook,
}: {
  onGoogle: () => void
  onApple: () => void
  onFacebook: () => void
}) {
  return (
    <View className='flex-row items-center justify-center gap-4'>
      <SocialCircle onPress={onGoogle} label='Continue with Google'>
        <Text className='font-geist-bold text-xl font-bold text-ink'>G</Text>
      </SocialCircle>
      <SocialCircle onPress={onApple} label='Continue with Apple'>
        <Apple size={22} color='#0E1F1C' />
      </SocialCircle>
      <SocialCircle onPress={onFacebook} label='Continue with Facebook'>
        <Text className='font-geist-bold text-xl font-bold text-accent'>f</Text>
      </SocialCircle>
    </View>
  )
}

export function SwitchLink({
  prompt,
  action,
  onPress,
}: {
  prompt: string
  action: string
  onPress: () => void
}) {
  return (
    <View className='flex-row justify-center items-center'>
      <Text className='font-sans text-sm text-ink-muted'>{prompt} </Text>
      <TouchableOpacity onPress={onPress}>
        <Text className='font-geist-bold text-sm font-bold text-accent'>
          {action}
        </Text>
      </TouchableOpacity>
    </View>
  )
}
