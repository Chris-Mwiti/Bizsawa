import React from 'react'
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
} from 'react-native'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'lg' | 'md' | 'sm'

interface ButtonProps extends Omit<TouchableOpacityProps, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** String labels get the matching text style automatically. */
  children: React.ReactNode
  textClassName?: string
}

const containerByVariant: Record<ButtonVariant, string> = {
  // Brand teal. Flat, not gradient — the ledger premise is ink on paper, and
  // `BrandGradient name="action"` stays reserved for the single raised action
  // per screen (FAB / hero CTA). Everything else uses this flat accent.
  // Soft clinical taste: pill CTAs (rounded-full) with a diffuse tinted lift
  // on primary, matching the reference "Next / Save Item / Continue" pills.
  primary: 'bg-accent active:bg-accent-active shadow-clinical-sm',
  secondary: 'bg-surface active:bg-gray-50 border border-hairline',
  ghost: 'bg-transparent active:bg-accent-soft',
  destructive: 'bg-neg active:opacity-90',
}

const textByVariant: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-gray-900',
  ghost: 'text-accent',
  destructive: 'text-white',
}

const containerBySize: Record<ButtonSize, string> = {
  // lg = 48pt+ touch target for primary screen actions.
  // All sizes are pills in the soft clinical language.
  lg: 'py-4 rounded-full px-5',
  md: 'py-3.5 rounded-full px-4',
  sm: 'py-2 px-4 rounded-full',
}

const textBySize: Record<ButtonSize, string> = {
  lg: 'font-geist-bold text-sm font-bold',
  md: 'font-geist-bold text-sm font-bold',
  sm: 'font-geist-bold text-xs font-bold',
}

/**
 * The single button in the product.
 *
 * Before this existed, every screen hand-rolled its CTA as
 * `bg-accent py-4 rounded-2xl` — a blue-black that has nothing to do with
 * the brand. `primary` here is the teal accent (`#006B5F`), so new screens get
 * the brand by default and old screens have one place to migrate toward.
 *
 * String children are wrapped in the matching Text style; pass a custom
 * element (icon + label row) when you need layout inside the button.
 */
export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled,
  className,
  textClassName,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading
  return (
    <TouchableOpacity
      disabled={isDisabled}
      activeOpacity={0.9}
      className={`flex-row items-center justify-center gap-2 ${containerByVariant[variant]} ${containerBySize[size]} ${isDisabled ? 'opacity-50' : ''} ${className || ''}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' ? '#111827' : 'white'}
        />
      ) : typeof children === 'string' || typeof children === 'number' ? (
        <Text
          className={`${textBySize[size]} ${textByVariant[variant]} ${textClassName || ''}`}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  )
}
