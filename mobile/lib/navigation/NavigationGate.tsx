import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { router } from 'expo-router'

import { extractRouteId, resolveRouteGate, type RouteGate } from './routeGates'
import { perf } from '../perf'
import type { PerfSpanHandle } from '../perf'

/** Never trap the user on a slow or dead network — navigate anyway.
 * 2500ms: with the startup/query fixes the common case resolves in
 * hundreds of ms; the timeout only bounds the worst case per tap. */
const NAVIGATION_TIMEOUT_MS = 2500
/** Once the indicator is actually shown, hold it long enough to read. */
const MIN_VISIBLE_MS = 350
/** If the data resolves this fast it is a cache hit — don't flash the indicator. */
const INSTANT_MS = 120

type NavigationKind = 'push' | 'replace' | 'navigate'

interface PendingNav {
  href: string
  kind: NavigationKind
  gate: RouteGate
  id: string | null
  run: () => void
  /** Identifies this intent so timers from a superseded target can be ignored. */
  token: number
  /** Guards the ready signal against double delivery. */
  readySignalled: boolean
  /** Tracing span for the held navigation (tap → screen committed). */
  span: PerfSpanHandle
}

interface NavigationGateValue {
  /** True while a gated navigation is waiting on the destination's data. */
  isLoading: boolean
  /** Destination name shown in the indicator, e.g. "Stock". */
  label: string
  /** Route a navigation through the gate; ungated routes fall through immediately. */
  gate: (
    href: string,
    kind?: NavigationKind,
    run?: () => void,
    options?: unknown,
  ) => void
}

const NavigationGateContext = createContext<NavigationGateValue>({
  isLoading: false,
  label: '',
  gate: () => {},
})

export const useNavigationGate = () => useContext(NavigationGateContext)

interface BoundaryProps {
  onFailed: () => void
  children?: React.ReactNode
}

/**
 * The prefetcher runs speculative work on top of the screen the user is still
 * looking at, so a throw here must never take that screen down. We swallow the
 * error and release the gate: the destination screen will hit the same failure and
 * render its own error state, which is the behaviour the user had before.
 */
class PrefetchBoundary extends React.Component<
  BoundaryProps,
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onFailed()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Holds navigation on the current page until the destination screen's own data is
 * ready, so pages mount warm instead of flashing a skeleton.
 *
 * expo-router's exported `router` is the same mutable object `useRouter()` returns,
 * so wrapping `push`/`replace`/`navigate` once gates every call site in the app.
 * React Navigation's own transitions (hardware back, header back, deep links) are
 * left untouched and stay instant, which is what we want.
 */
export function NavigationGateProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [pending, setPending] = useState<PendingNav | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const pendingRef = useRef<PendingNav | null>(null)
  const tokenRef = useRef(0)
  const startedAtRef = useRef(0)
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const commit = useCallback(
    (nav: PendingNav, outcome: 'ready' | 'instant' | 'timeout') => {
      clearTimers()
      pendingRef.current = null
      setPending(null)
      setIsLoading(false)
      nav.span.end({ outcome, route: nav.gate.label })
      nav.run()
    },
    [clearTimers],
  )

  /**
   * A new intent supersedes any in-flight one: last tap wins, so mashing between tabs
   * settles on the most recent target instead of walking a queue of stale screens.
   */
  const request = useCallback(
    (href: string, kind: NavigationKind, run: () => void) => {
      const gate = resolveRouteGate(href)
      // Ungated route (auth, modals, sheets, back) — never hold the user.
      if (!gate) {
        run()
        return
      }
      clearTimers()
      // A superseded intent still held a span — close it so stats stay exact.
      pendingRef.current?.span.end({ outcome: 'superseded' })
      const nav: PendingNav = {
        href,
        kind,
        gate,
        id: extractRouteId(href),
        run,
        token: ++tokenRef.current,
        readySignalled: false,
        span: perf.start(`nav:${gate.label}`, { phase: 'nav', href }),
      }
      startedAtRef.current = Date.now()
      pendingRef.current = nav
      setPending(nav)
      setIsLoading(false)
      timersRef.current.push(
        setTimeout(() => {
          if (pendingRef.current?.token === nav.token) commit(nav, 'timeout')
        }, NAVIGATION_TIMEOUT_MS),
      )
    },
    [clearTimers, commit],
  )

  /** The destination's data is ready — show the bar only if this was real work. */
  const onPrefetchReady = useCallback(() => {
    const nav = pendingRef.current
    if (!nav || nav.readySignalled) return
    nav.readySignalled = true
    const elapsed = Date.now() - startedAtRef.current
    if (elapsed >= INSTANT_MS) {
      setIsLoading(true)
      timersRef.current.push(
        setTimeout(() => {
          if (pendingRef.current?.token === nav.token) commit(nav, 'ready')
        }, Math.max(0, MIN_VISIBLE_MS - elapsed)),
      )
    } else {
      // Cache hit — navigate immediately, no indicator flash.
      commit(nav, 'instant')
    }
  }, [commit])

  // Patch the imperative router once. Every `router.x` / `useRouter().x` call site in
  // the app goes through this object, so they are all gated.
  useEffect(() => {
    const original = {
      push: router.push,
      replace: router.replace,
      navigate: router.navigate,
    }
    const wrap =
      (kind: NavigationKind, fn: (href: any, ...rest: any[]) => void) =>
      (href: any, ...rest: any[]) => {
        // Object-form hrefs (pathname + params) are used only by the auth flows,
        // which must never be held — pass them straight through.
        if (typeof href !== 'string') {
          fn(href, ...rest)
          return
        }
        request(href, kind, () => fn(href, ...rest))
      }

    router.push = wrap('push', original.push) as typeof router.push
    router.replace = wrap('replace', original.replace) as typeof router.replace
    router.navigate = wrap('navigate', original.navigate) as typeof router.navigate

    return () => {
      router.push = original.push
      router.replace = original.replace
      router.navigate = original.navigate
    }
  }, [request])

  const value = useMemo<NavigationGateValue>(
    () => ({
      isLoading,
      label: pending?.gate.label ?? '',
      gate: (href, kind = 'push', run, options) => {
        if (run) {
          request(href, kind, run)
          return
        }
        const invoke = (router as any)[kind] as (h: any, o?: unknown) => void
        request(href, kind, () => invoke(href, options))
      },
    }),
    [isLoading, pending?.gate.label, request],
  )

  const GateComponent = pending?.gate.Prefetch

  return (
    <NavigationGateContext.Provider value={value}>
      {children}
      {/*
        Warms the destination's cache while the user stays on the current page.
        Remounting per target restarts the gate's ready signal cleanly.
      */}
      {GateComponent ? (
        <PrefetchBoundary
          key={`${pending!.token}:${pending!.href}`}
          onFailed={onPrefetchReady}
        >
          <GateComponent
            id={pending!.id ?? undefined}
            onReady={onPrefetchReady}
          />
        </PrefetchBoundary>
      ) : null}
    </NavigationGateContext.Provider>
  )
}
