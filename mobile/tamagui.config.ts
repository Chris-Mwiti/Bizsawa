import { createTamagui } from 'tamagui'
import { config } from '@tamagui/config/v3'
import { createFont } from '@tamagui/core'

// Geist: premium sans, tight tracking, replaces banned Inter
const headingFont = createFont({
  family: 'Geist',
  size: {
    5: 13,
    6: 15,
    9: 32,
    10: 44,
  },
  transform: {
    6: 'uppercase',
    7: 'none',
  },
  weight: {
    6: '400',
    7: '700',
  },
  color: {
    6: '$colorFocus',
    7: '$color',
  },
  letterSpacing: {
    5: 2,
    6: 1,
    7: 0,
    8: 0,
    9: -1,
    10: -1.5,
  },
  face: {
    700: { normal: 'GeistBold' },
    800: { normal: 'GeistBold' },
  },
})

const bodyFont = createFont({
  family: 'Geist',
  weight: {
    1: '400',
    7: '700',
  },
  size: {
    1: 11,
    2: 12,
    3: 13,
    4: 14,
    5: 16,
    6: 18,
    7: 20,
    8: 22,
    9: 30,
    10: 42,
  },
  lineHeight: {
    1: 17,
    2: 18,
    3: 20,
    4: 22,
    5: 24,
    6: 26,
    7: 28,
    8: 30,
    9: 38,
    10: 50,
  },
  letterSpacing: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  },
  face: {
    700: { normal: 'GeistBold' },
  },
})

// Mono for metrics (prices, stats) per mobile-app-ui-design:44
const monoFont = createFont({
  family: 'GeistMono',
  weight: {
    1: '500',
    7: '700',
  },
  size: {
    1: 11,
    2: 12,
    3: 13,
    4: 14,
    5: 16,
    6: 18,
    7: 20,
    8: 22,
    9: 30,
    10: 42,
  },
  lineHeight: {
    1: 17,
    2: 18,
    3: 20,
    4: 22,
    5: 24,
    6: 26,
    7: 28,
    8: 30,
    9: 38,
    10: 50,
  },
  face: {
    700: { normal: 'GeistMonoBold' },
  },
})

export const tamaguiConfig = createTamagui({
  ...config,
  fonts: {
    heading: headingFont,
    body: bodyFont,
    mono: monoFont,
  },
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
