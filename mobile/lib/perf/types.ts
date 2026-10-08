/**
 * Pluggable performance tracing — types.
 *
 * A span is one timed operation (e.g. `startup.auth.check`, `nav:Sales`,
 * `http.GET /products`). A mark is an instant event (e.g. `splash.hidden`).
 * Sinks receive finished spans; the tracer never throws, so a broken sink
 * can't break the app.
 */

export type PerfAttrs = Record<string, string | number | boolean | null | undefined>

export interface PerfSpan {
  id: number
  name: string
  phase?: string
  /** Monotonic ms (performance.now, Date.now fallback). */
  startMs: number
  endMs: number
  durationMs: number
  attrs: PerfAttrs
}

export interface PerfMark {
  name: string
  atMs: number
  attrs: PerfAttrs
}

export interface PerfSink {
  id: string
  onSpanEnd?: (span: PerfSpan) => void
  onMark?: (mark: PerfMark) => void
}

export interface PerfStatSummary {
  name: string
  count: number
  avgMs: number
  minMs: number
  maxMs: number
  p50Ms: number
  p95Ms: number
  lastMs: number
}

export interface PerfConfig {
  /** Master switch. When false, start()/mark() are no-ops (near-zero cost). */
  enabled: boolean
  /** 0..1 — fraction of spans to keep. Marks are always kept. */
  sampleRate: number
  /** Ring-buffer cap for retained spans (memory sink). */
  maxSpans: number
}
