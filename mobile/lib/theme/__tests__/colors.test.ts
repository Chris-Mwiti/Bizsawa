import { describe, expect, it } from 'vitest'

import palette from '../palette'
import { colors, gradientPresets } from '../colors'

/**
 * Guards the palette against silent regression.
 *
 * PRODUCT.md commits to WCAG 2.1 AA, and the "Ink & Ledger" premise only works
 * if the accents stay at their current lightness. A hex tweak that looks fine
 * in isolation will break one of these pairings, so the pairings are asserted
 * here rather than left to review.
 */

const linearise = (channel: number) =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const luminance = (hex: string) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) =>
    linearise(parseInt(h.slice(i, i + 2), 16) / 255),
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = 4.5
const LARGE_OR_UI = 3

/** Every surface a user can actually read text on. */
const BACKGROUNDS: [string, string][] = [
  ['paper', colors.paper],
  ['surface', colors.surface],
]

describe('palette contrast (WCAG 2.1 AA)', () => {
  it.each(BACKGROUNDS)('ink ramp clears 4.5:1 on %s', (_name, bg) => {
    for (const step of ['ink', 'inkStrong', 'inkMuted', 'inkSubtle']) {
      expect(
        contrast(colors[step], bg),
        `${step} on ${_name}`,
      ).toBeGreaterThanOrEqual(TEXT)
    }
  })

  it.each(BACKGROUNDS)('accent and status clear 4.5:1 on %s', (_name, bg) => {
    for (const step of ['accent', 'pos', 'neg', 'warn']) {
      expect(
        contrast(colors[step], bg),
        `${step} on ${_name}`,
      ).toBeGreaterThanOrEqual(TEXT)
    }
  })

  it('text on filled surfaces clears 4.5:1', () => {
    expect(contrast(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(
      TEXT,
    )
    expect(contrast(colors.inkInverse, colors.ink)).toBeGreaterThanOrEqual(TEXT)
    expect(contrast(colors.inkInverse, colors.pos)).toBeGreaterThanOrEqual(TEXT)
  })

  it('interactive borders clear 3:1 (WCAG 1.4.11)', () => {
    expect(contrast(colors.border, colors.paper)).toBeGreaterThanOrEqual(
      LARGE_OR_UI,
    )
    expect(contrast(colors.border, colors.surface)).toBeGreaterThanOrEqual(
      LARGE_OR_UI,
    )
  })
})

describe('accent scale', () => {
  const steps = [
    palette.scale[50],
    palette.scale[100],
    palette.scale[200],
    palette.scale[300],
    palette.scale[400],
    palette.scale[500],
    palette.scale[600],
    palette.scale[700],
    palette.scale[800],
    palette.scale[900],
  ]

  it('is strictly monotonic in luminance', () => {
    // The previous scale had 500 (#389589) lighter than 600 (#006b5f), so
    // `bg-primary-500` rendered lighter than `bg-primary-600`. That inversion
    // is why mid-tones never matched anything they were meant to pair with.
    for (let i = 1; i < steps.length; i++) {
      expect(
        luminance(steps[i]),
        `step ${i} must be darker than step ${i - 1}`,
      ).toBeLessThan(luminance(steps[i - 1]))
    }
  })

  it('anchors 600 on the brand teal', () => {
    expect(palette.scale[600]).toBe(colors.accent)
  })
})

describe('gradients', () => {
  it('exposes only the three sanctioned surfaces', () => {
    // PRODUCT.md bans the hero-metric gradient, not gradients. Confining them
    // to raised surfaces is the mechanism.
    expect(Object.keys(gradientPresets).sort()).toEqual([
      'action',
      'active',
      'fab',
    ])
  })

  it('keeps every stop legible as a surface fill', () => {
    for (const [name, preset] of Object.entries(gradientPresets)) {
      for (const stop of preset.colors) {
        expect(
          contrast(colors.inkInverse, stop),
          `${name} stop ${stop} against inverse text`,
        ).toBeGreaterThanOrEqual(TEXT)
      }
    }
  })

  it('declares points within the normalised unit square', () => {
    // Guards the ambiguity that motivated storing points instead of degrees.
    for (const [name, preset] of Object.entries(gradientPresets)) {
      for (const point of [preset.start, preset.end]) {
        for (const axis of [point.x, point.y]) {
          expect(axis, `${name} point axis`).toBeGreaterThanOrEqual(0)
          expect(axis, `${name} point axis`).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('single source of truth', () => {
  it('has no duplicate brand greens', () => {
    // The app previously carried five brand colours: #006b5f (theme), #22825f
    // (logo), #023c69 (Android colorPrimary), #131b2e (onboarding), and
    // sky/emerald (FABs). The logo and Android values are reconciled in this
    // pass; onboarding is tracked separately.
    const unique = new Set(
      Object.values(colors).filter((c) => typeof c === 'string'),
    )
    expect(unique.has('#22825f')).toBe(false)
    expect(unique.has('#023c69')).toBe(false)
  })

  it('exposes paper and surface as the only two elevation levels', () => {
    expect(colors.paper).toBe('#F4F9F7')
    expect(colors.surface).toBe('#FFFFFF')
  })
})
