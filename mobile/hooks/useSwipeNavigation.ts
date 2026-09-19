import { useCallback } from 'react'
import { usePathname, useRouter } from 'expo-router'

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
  const router = useRouter()
  const pathname = usePathname()

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
        router.replace(next.href as any)
        return true
      }
      if (dir === 'right' && canSwipeRight) {
        const prev = routes[currentIndex - 1]
        router.replace(prev.href as any)
        return true
      }
      return false
    },
    [canSwipeLeft, canSwipeRight, currentIndex, router, routes],
  )

  return { swipe, canSwipeLeft, canSwipeRight, currentIndex }
}
