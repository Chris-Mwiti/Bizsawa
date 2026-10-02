import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist'
import {
  GeistMono_500Medium,
  GeistMono_700Bold,
} from '@expo-google-fonts/geist-mono'

/**
 * Font registry.
 *
 * Weights are registered under *distinct family names* rather than relying on
 * `fontWeight`. When an app bundles static font files, iOS does not have a bold
 * face to reach for when you only ship one weight per family — it synthesises one,
 * or silently falls back to the system font, and you lose the weight entirely.
 * Putting the weight in the family name is the only way to get a real 700.
 *
 * The four names Tamagui already references (`Geist`, `GeistBold`, `GeistMono`,
 * `GeistMonoBold`) now resolve to real files instead of falling back to system-ui.
 */
export const fonts = {
  Geist: Geist_400Regular,
  GeistMedium: Geist_500Medium,
  GeistSemiBold: Geist_600SemiBold,
  GeistBold: Geist_700Bold,
  GeistMono: GeistMono_500Medium,
  GeistMonoBold: GeistMono_700Bold,
} as const

/** The family every `<Text>` inherits unless a screen opts into a weight. */
export const FONT_SANS = 'Geist'
export const FONT_MONO = 'GeistMono'

/**
 * Money is rendered in a monospace family, which is inherently tabular: every digit
 * occupies the same advance width, so a column of amounts scans straight down
 * without the jitter proportional figures cause. This is why prices and totals use
 * mono while prose uses sans.
 */
export const MONEY_STYLE = {
  fontFamily: FONT_MONO,
  fontVariant: ['tabular-nums'] as const,
}
