import { describe, expect, it } from 'vitest'
import { TAB_BAR_SCROLL_PADDING } from '../../../constants/tabBar'
import { SPACING, SPACING_CLASS } from '../spacing'

// Locks the spacing scale so padding stops drifting per screen.
describe('spacing scale', () => {
  it('stays on the 4pt grid with matching class forms', () => {
    expect(SPACING.screenPad).toBe(16)
    expect(SPACING.sectionGap).toBe(16)
    expect(SPACING.cardPad).toBe(24)
    expect(SPACING.innerGap).toBe(12)
    expect(SPACING.rowGap).toBe(8)
    expect(SPACING_CLASS.cardPad).toBe('p-6')
    expect(SPACING_CLASS.sectionGap).toBe('gap-4')
  })

  it('derives the tab scroll bottom from the shared constant', () => {
    expect(SPACING.tabScrollBottom).toBe(TAB_BAR_SCROLL_PADDING + 96)
  })
})
