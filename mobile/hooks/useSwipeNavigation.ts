import { useCallback } from 'react'
import { usePathname } from 'expo-router'
import { useNavigationGate } from '../lib/navigation/NavigationGate'

export type SwipeDirection = 'left' | 'right'

export interface SwipeRoute {
  key: string
  href: string
  name: string
}

/**
 * useSwipeNavigation — maps current pathname to ordered routes and navigates on swipe.
 * left  = next route (finger swipes left, content moves left)
 * right = prev route
 */
export function useSwipeNavigation(routes: SwipeRoute[]) {
  const pathname = usePathname()
  // Swipes are page navigations like any other — hold the current page and show the
  // top indicator while the destination warms up.
  const { gate } = useNavigationGate()

  const currentIndex = (() => {
    // Match by pathname inclusion — handles nested routes like /insights/analytics
    // Prefer exact match, fallback to prefix
    let idx = routes.findIndex((r) => pathname === r.href)
    if (idx !== -1) return idx
    // insights sub-routes: match first segment
    const seg = pathname.split('/').filter(Boolean).join('/')
    idx = routes.findIndex((r) => pathname.includes(r.key))
    if (idx !== -1) return idx
    // tabs: / (tabs)/index renders as "/" or "/(tabs)" — map to index slot
    if (pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/') {
      return routes.findIndex((r) => r.key === 'index' || r.key === 'overview')
    }
    return -1
  })()

  const canSwipeLeft = currentIndex >= 0 && currentIndex < routes.length - 1
  const canSwipeRight = currentIndex > 0

  const swipe = useCallback(
    (dir: SwipeDirection) => {
      if (dir === 'left' && canSwipeLeft) {
        const next = routes[currentIndex + 1]
        gate(next.href, 'replace')
        return true
      }
      if (dir === 'right' && canSwipeRight) {
        const prev = routes[currentIndex - 1]
        gate(prev.href, 'replace')
        return true
      }
      return false
    },
    [canSwipeLeft, canSwipeRight, currentIndex, gate, routes],
  )

  return { swipe, canSwipeLeft, canSwipeRight, currentIndex }
}
