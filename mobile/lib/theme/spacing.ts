// Spacing scale — the single source of truth for layout dimensionality.
// Every screen composes from these values so padding reads evenly across
// the app. Tailwind class + numeric (StyleSheet) forms are both exported
// because scroll containers use style objects while views use classNames.
//
// Scale (4pt grid):
//   screen padding  16  — outer inset of every scroll container
//   section gap     16  — vertical rhythm between cards/sections
//   card padding    24  — body padding inside cards (p-6)
//   inner gap       12  — stacking inside a card / sheet
//   row gap          8  — tight inline rows (chips, icon + label)
// Tab screens add TAB_BAR_SCROLL_PADDING + 96 below content so the last
// card never hides under the tab bar, raised home indicator or sticky CTA.
import { TAB_BAR_SCROLL_PADDING } from '../../constants/tabBar'

export const SPACING = {
  screenPad: 16,
  sectionGap: 16,
  cardPad: 24,
  innerGap: 12,
  rowGap: 8,
  /** Bottom inset for scroll content on tab-bar screens. */
  tabScrollBottom: TAB_BAR_SCROLL_PADDING + 96,
} as const

export const SPACING_CLASS = {
  screenPad: 'p-4',
  sectionGap: 'gap-4',
  cardPad: 'p-6',
  innerGap: 'gap-3',
  rowGap: 'gap-2',
} as const
