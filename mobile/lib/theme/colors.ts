import palette from './palette'

/**
 * The app-facing colour tokens.
 *
 * Values live in `palette.js` because `tailwind.config.js` reads the same file
 * with `require`. This module only adds types and the flat shape that inline
 * styles and icon props want (`colors.accent`, not `colors.accent.DEFAULT`).
 *
 * The rule this system is built on: **money is ink.** A counter book does not
 * colour its figures, it rules its columns. `accent` is reserved for our own
 * interface — the primary action, the active tab, the focus ring — and must not
 * be used to tint an amount. `status.pos` / `status.neg` are the only other
 * hues permitted, and only for settled / overdue.
 *
 * See `palette.js` for the full rationale and `colors.test.ts` for the
 * WCAG assertions that guard these values.
 */

const { paper, ink, surface, rule, accent, status, gradients, scale } = palette

export const paperColor = paper

export const inkRamp = {
  DEFAULT: ink.DEFAULT,
  strong: ink.strong,
  muted: ink.muted,
  subtle: ink.subtle,
  faint: ink.faint,
  inverse: ink.inverse,
}

export const surfaceRamp = {
  DEFAULT: surface.DEFAULT,
  sunken: surface.sunken,
}

export const ruleRamp = {
  hairline: rule.hairline,
  DEFAULT: rule.DEFAULT,
  strong: rule.strong,
}

export const accentRamp = {
  DEFAULT: accent.DEFAULT,
  hover: accent.hover,
  active: accent.active,
  soft: accent.soft,
  border: accent.border,
  onAccent: accent.onAccent,
}

export const statusRamp = {
  pos: status.pos,
  posSoft: status.posSoft,
  neg: status.neg,
  negSoft: status.negSoft,
  warn: status.warn,
  warnSoft: status.warnSoft,
}

/**
 * Flat, JSX-ready tokens. This is the shape to use for inline styles and for
 * `color` props on `lucide-react-native` icons, which cannot take a className.
 *
 * These same keys are registered in `tailwind.config.js`, so `text-ink-muted`
 * and `colors.inkMuted` resolve to the identical value. Prefer the className
 * form; use this when a component only accepts a colour prop.
 */
export const colors = {
  paper,
  surface: surface.DEFAULT,
  sunken: surface.sunken,

  hairline: rule.hairline,
  border: rule.DEFAULT,
  borderStrong: rule.strong,

  ink: ink.DEFAULT,
  inkStrong: ink.strong,
  inkMuted: ink.muted,
  inkSubtle: ink.subtle,
  inkFaint: ink.faint,
  inkInverse: ink.inverse,

  accent: accent.DEFAULT,
  accentHover: accent.hover,
  accentActive: accent.active,
  accentSoft: accent.soft,
  accentBorder: accent.border,
  onAccent: accent.onAccent,

  pos: status.pos,
  posSoft: status.posSoft,
  neg: status.neg,
  negSoft: status.negSoft,
  warn: status.warn,
  warnSoft: status.warnSoft,
} as const

export type ColorToken = keyof typeof colors

/**
 * The only three gradients in the product: the primary action, the FAB, and
 * the active tab indicator. Each is already shaped for `expo-linear-gradient`
 * (`colors` + `start`/`end`), so there is no angle maths at the call site.
 *
 * If you are reaching for a gradient anywhere else, you want a flat token.
 */
export type GradientName = keyof typeof gradients

export type GradientPreset = {
  readonly colors: readonly [string, string]
  readonly start: { readonly x: number; readonly y: number }
  readonly end: { readonly x: number; readonly y: number }
}

export const gradientPresets = gradients as Record<GradientName, GradientPreset>

/** Shared with `tailwind.config.js` so `primary-*` can never drift from `accent`. */
export const accentScale = scale
