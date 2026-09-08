import { createTamagui } from 'tamagui'
import { config } from '@tamagui/config/v3'
import { createFont } from '@tamagui/core'

// Geist: premium sans, tight tracking, replaces banned Inter
const headingFont = createFont({
  family: 'Geist',
  size: {
    6: 15,
  },
  transform: {
    6: 'uppercase',
  },
  weight: {
    6: '400',
  },
  color: {
    6: '#000',
  },
  letterSpacing: {
    6: 0,
  },
  lineHeight: {
    6: 17,
  },
  face: {
    700: { normal: 'GeistBold' },
  },
})

const bodyFont = createFont({
  family: 'Geist',
  size: config.fonts.body.size,
  lineHeight: config.fonts.body.lineHeight,
  weight: config.fonts.body.weight,
  letterSpacing: config.fonts.body.letterSpacing,
  color: config.fonts.body.color,
  face: {
    700: { normal: 'GeistBold' },
  },
})

// Mono for metrics (prices, stats) per mobile-app-ui-design:44
const monoFont = createFont({
  family: 'GeistMono',
  size: config.fonts.body.size,
  lineHeight: config.fonts.body.lineHeight,
  weight: config.fonts.body.weight,
  letterSpacing: config.fonts.body.letterSpacing,
  color: config.fonts.body.color,
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
