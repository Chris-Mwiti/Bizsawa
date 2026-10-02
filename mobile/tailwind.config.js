/** @type {import('tailwindcss').Config} */

// Single source of truth. lib/theme/palette.js is CommonJS precisely so this
// file can require it — there is no second copy of any colour value.
const {
  paper,
  ink,
  surface,
  rule,
  accent,
  status,
  scale,
} = require('./lib/theme/palette')

/** Derive an rgba() string from a token so shadows cannot drift from the palette. */
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Surfaces. `paper` is the app canvas; `surface` is the single elevated
        // level. Their 1.06:1 closeness is deliberate — see palette.js.
        paper,
        surface: surface.DEFAULT,
        sunken: surface.sunken,

        // Rules. `hairline` separates ledger rows (decorative);
        // `border` is for interactive edges and clears 3:1.
        hairline: rule.hairline,
        border: rule.DEFAULT,
        'border-strong': rule.strong,

        // Text ramp. All four steps clear 4.5:1 on paper and on surface.
        ink: ink.DEFAULT,
        'ink-strong': ink.strong,
        'ink-muted': ink.muted,
        'ink-subtle': ink.subtle,
        'ink-faint': ink.faint,
        'ink-inverse': ink.inverse,

        // The one accent. Reserved for our interface, never for an amount.
        accent: accent.DEFAULT,
        'accent-hover': accent.hover,
        'accent-active': accent.active,
        'accent-soft': accent.soft,
        'accent-border': accent.border,
        'on-accent': accent.onAccent,

        // Exactly three status hues.
        pos: status.pos,
        'pos-soft': status.posSoft,
        neg: status.neg,
        'neg-soft': status.negSoft,
        warn: status.warn,
        'warn-soft': status.warnSoft,

        // The numeric ramp, kept for existing call sites. Now monotonic — the
        // previous scale had `500` lighter than `600`, so mid-tones matched
        // nothing. Identical to the accent scale; prefer semantic names.
        primary: scale,
      },
      fontFamily: {
        // Single names, deliberately NOT CSS stacks.
        //
        // React Native's `fontFamily` takes one family name. A stack like
        // `['Geist', 'system-ui', 'sans-serif']` compiles to
        // `font-family: Geist, system-ui, sans-serif`, which RN cannot resolve —
        // it looks up the whole string as one family, fails, and silently falls
        // back to the system face. A one-element array keeps the overridable
        // array shape while emitting a resolvable `font-family: Geist`.
        //
        // Names match the registry keys in lib/theme/fonts.ts.
        sans: ['Geist'],
        mono: ['GeistMono'],

        // Weight-bearing families. These are NOT redundant with `font-bold` and
        // friends: Tailwind's `font-bold` sets `font-weight: 700`, but a bundled
        // static family ships one file per registered name, so iOS has no bold
        // face to reach for and synthesises one (or drops to the system font).
        // Pointing `fontFamily` at the real face is the only way to get a true
        // 700. See the note in lib/theme/fonts.ts.
        //
        // They carry distinct utility names because `font-bold` is already a core
        // weight utility — defining it here would be shadowed, not overridden.
        'geist-medium': ['GeistMedium'], // 500
        'geist-semibold': ['GeistSemiBold'], // 600
        'geist-bold': ['GeistBold'], // 700
        'geist-mono-bold': ['GeistMonoBold'], // 700 mono
      },
      fontSize: {
        // 4-size system: 11 (eyebrow), 13 (meta), 16 (body), 22 (display) — 60/30/10 hierarchy
        xs: ['11px', { lineHeight: '16px', letterSpacing: '0.02em' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['22px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        // Shape lock: cards 2xl (16), pills full, buttons xl (12) unified
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        // Tinted to the accent hue, not black — a black drop shadow on a
        // teal-tinted paper reads as dirt. 16 raw `shadowColor: '#006b5f'`
        // strings elsewhere in the app are the same value and should become
        // `colors.accent`.
        soft: `0 2px 16px ${hexToRgba(accent.DEFAULT, 0.06)}`,
        'soft-lg': `0 8px 32px ${hexToRgba(accent.DEFAULT, 0.08)}`,
      },
    },
  },
  plugins: [],
}
