import { useEffect, useState } from 'react'
import { perf } from './tracer'
import { memorySink, summarizeSpans } from './sinks'
import type { PerfStatSummary } from './types'

/**
 * Live view of tracer stats for debug UI (e.g. a hidden diagnostics screen).
 * Refreshes whenever a span ends (throttled to `refreshMs`).
 *
 * Example:
 *   const stats = usePerfStats()
 *   const rows = Object.values(stats).sort((a, b) => b.p95Ms - a.p95Ms)
 */
export function usePerfStats(refreshMs = 2000): Record<string, PerfStatSummary> {
  const [stats, setStats] = useState<Record<string, PerfStatSummary>>(() =>
    summarizeSpans(memorySink.getSpans()),
  )

  useEffect(() => {
    let last = 0
    return perf.subscribe(() => {
      const now = Date.now()
      if (now - last < refreshMs) return
      last = now
      setStats(summarizeSpans(memorySink.getSpans()))
    })
  }, [refreshMs])

  return stats
}
