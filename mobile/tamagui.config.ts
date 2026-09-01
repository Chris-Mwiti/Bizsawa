import { createTamagui } from 'tamagui'
import { config } from '@tamagui/config/v3'
import { createInterFont } from '@tamagui/font-inter'

const headingFont = createInterFont({
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
  face: {
    700: { normal: 'InterBold' },
  },
})

const bodyFont = createInterFont()

export const tamaguiConfig = createTamagui({
  ...config,
  fonts: {
    heading: headingFont,
    body: bodyFont,
  },
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
