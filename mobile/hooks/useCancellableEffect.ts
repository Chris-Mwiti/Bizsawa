import { useEffect } from 'react'

/**
 * useCancellableEffect — for non-Query manual fetches (e.g. direct api.get in a screen).
 * Creates an AbortController on mount, aborts on unmount / deps change.
 * Pass `signal` to axios: `api.get('/sales', { signal })`.
 *
 * Example:
 *   useCancellableEffect((signal) => {
 *     api.get('/products', { signal }).then(setData)
 *   }, [bid])
 */
export function useCancellableEffect(
  effect: (signal: AbortSignal) => void | Promise<void>,
  deps: React.DependencyList,
) {
  useEffect(() => {
    const ctrl = new AbortController()
    void effect(ctrl.signal)
    return () => ctrl.abort('unmount')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
