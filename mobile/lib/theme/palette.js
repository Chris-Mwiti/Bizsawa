/**
 * BizSawa — "Ink & Ledger" palette.
 *
 * This file is the single source of truth for every colour in the app. It is
 * CommonJS on purpose: `tailwind.config.js` reads it with `require`, and
 * `lib/theme/colors.ts` re-exports it with types for the app. There is no
 * second copy, so a value can only ever be changed in one place.
 *
 * The design premise: a shop counter book, not a dashboard. Money is written in
 * ink. A ledger does not colour its figures, it rules its columns. So the single
 * saturated hue in this system (accent) is reserved for *our* interface — the
 * primary action, the active tab, the focus ring — and never for an amount.
 * Status is carried by the only other two hues we allow: red for overdue,
 * green for settled.
 *
 * Every pairing asserted by `lib/theme/colors.test.ts` is verified against
 * WCAG 2.1 AA. Do not hand-edit a value without re-running that test.
 */

/** The app canvas. Teal-tinted, never pure white. */
const paper = '#F4F9F7'

/**
 * Text ramp. Four steps that all clear 4.5:1 on `paper`; `inkFaint` is
 * disabled-only and deliberately exempt.
 */
const ink = {
  DEFAULT: '#0E1F1C', // primary text, and every money figure
  strong: '#2C403B', // headings, emphasis
  muted: '#4F625E', // secondary text, labels
  subtle: '#64746F', // tertiary text, placeholders
  faint: '#8A9A96', // disabled only — exempt from AA
  inverse: '#FFFFFF', // text on an ink or accent fill
}

/**
 * Surfaces. Three levels, no more.
 *
 * `paper` → `surface` is only 1.06:1, which is deliberate: it means a white card
 * cannot announce itself, and hierarchy has to come from type, spacing and
 * hairlines. That is the whole point — it is what forces the ledger-row layout
 * instead of a stack of ghost cards. Do not "fix" this by adding a border and a
 * shadow to every card; PRODUCT.md bans exactly that.
 */
const surface = {
  DEFAULT: '#FFFFFF', // cards, sheets, tab bar, modals
  sunken: '#E1EBE8', // inputs, chart tracks, skeleton beds
}

/** Rules. `hairline` is decorative; `border` clears 3:1 for interactive edges. */
const rule = {
  hairline: '#DCE7E4', // 1px ledger separator — decorative, exempt from 1.4.11
  DEFAULT: '#7E918C', // input and control borders — 3.13:1
  strong: '#A8BDB7', // emphasised rules, active indicators
}

/**
 * The one accent. Monotonic scale: every step is perceptually darker than the
 * one before it. (The previous scale was inverted — `500` was lighter than
 * `600` — which is why mid-tones never matched anything.)
 */
const accent = {
  DEFAULT: '#006B5F', // 6.04:1 on paper. Primary action, active tab, focus.
  hover: '#005247',
  active: '#003B33',
  soft: '#E4F0ED', // tinted background behind an accent icon
  border: '#97C9BF', // accent-tinted input border
  onAccent: '#FFFFFF', // 6.43:1 — text on an accent fill
}

/** Exactly three status hues. Nothing else earns a colour. */
const status = {
  pos: '#1F6F4A', // 5.75:1 — paid, in stock, money in
  posSoft: '#E3F0E8',
  neg: '#A32C21', // 6.72:1 — overdue, out of stock, money out
  negSoft: '#FAE9E7',
  warn: '#8A5A0B', // 5.57:1 — low stock, pending
  warnSoft: '#F7EEDC',
}

/**
 * The three places a gradient is allowed to appear. Nowhere else.
 *
 * PRODUCT.md bans the hero-metric cliché (a big number over a gradient), not
 * gradients themselves. A duotone on a raised surface reads as material rather
 * than decoration, and these three are the only surfaces in the app that are
 * raised enough to justify it.
 *
 * Directions are stored as explicit normalised points, not as degrees. A bare
 * angle is ambiguous — CSS `linear-gradient` measures 0deg as "to top" while
 * SVG and `expo-linear-gradient` measure it as "to the right" — so a shared
 * number renders two different gradients depending on who reads it. Points
 * feed straight into `expo-linear-gradient` with no conversion.
 *
 * The JSDoc below is load-bearing: it pins `colors` to a 2-tuple so TypeScript
 * does not widen it to `string[]` when `colors.ts` reads this file.
 *
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ colors: [string, string], start: Point, end: Point }} GradientPreset
 */

/** @type {Record<'action' | 'fab' | 'active', GradientPreset>} */
const gradients = {
  /** Primary action. Reads as one colour with a lit edge. */
  action: {
    colors: ['#005247', '#006B5F'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  /** The FAB — the single brightest object on the screen. */
  fab: {
    colors: ['#0A7A6A', '#006B5F'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  /** Active tab indicator. The ink→teal duotone, the brand in miniature. */
  active: {
    colors: ['#0E1F1C', '#006B5F'],
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  },
}

/**
 * The full `primary-*` ramp, retained because ~25 call sites already use it.
 * Identical to the accent scale. Prefer the semantic names above in new code.
 */
const scale = {
  50: '#E4F0ED',
  100: '#C2E0D9',
  200: '#97C9BF',
  300: '#63AE9F',
  400: '#2E9182',
  500: '#0A7A6A',
  600: '#006B5F',
  700: '#005247',
  800: '#003B33',
  900: '#00241F',
}

module.exports = {
  paper,
  ink,
  surface,
  rule,
  accent,
  status,
  gradients,
  scale,
}
