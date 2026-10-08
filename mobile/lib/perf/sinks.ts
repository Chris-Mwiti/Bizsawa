/**
 * Pluggable performance tracing — built-in sinks + helpers.
 *
 * - memorySink: ring buffer of recent spans (powers getStats/export).
 * - consoleSink: dev logging, flags spans slower than slowThresholdMs.
 * - makeBatchSink(): generic batching wrapper — plug any uploader behind it:
 *
 *   import { perf, makeBatchSink } from '../lib/perf'
 *   perf.addSink(makeBatchSink({
 *     id: 'upload',
 *     batchSize: 50,
 *     flushIntervalMs: 30000,
 *     flush: async (spans) => {
 *       await fetch('https://telemetry.example.com/spans', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify(spans),
 *       })
 *     },
 *   }))
 */
import { perf } from './tracer'
import type { PerfMark, PerfSink, PerfSpan, PerfStatSummary } from './types'

const DEFAULT_RING = 500

class MemorySink implements PerfSink {
  readonly id = 'memory'
  private spans: PerfSpan[] = []
  private marks: PerfMark[] = []
  private capacity: number

  constructor(capacity = DEFAULT_RING) {
    this.capacity = capacity
  }

  onSpanEnd = (span: PerfSpan): void => {
    this.spans.push(span)
    if (this.spans.length > this.capacity) {
      this.spans.splice(0, this.spans.length - this.capacity)
    }
  }

  onMark = (mark: PerfMark): void => {
    this.marks.push(mark)
    if (this.marks.length > this.capacity) {
      this.marks.splice(0, this.marks.length - this.capacity)
    }
  }

  getSpans(): PerfSpan[] {
    return [...this.spans]
  }

  getMarks(): PerfMark[] {
    return [...this.marks]
  }

  clear(): void {
    this.spans = []
    this.marks = []
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

/** Aggregate retained spans by name → count/avg/min/max/p50/p95. */
export function summarizeSpans(spans: PerfSpan[]): Record<string, PerfStatSummary> {
  const byName = new Map<string, number[]>()
  const last = new Map<string, number>()
  for (const s of spans) {
    const arr = byName.get(s.name)
    if (arr) arr.push(s.durationMs)
    else byName.set(s.name, [s.durationMs])
    last.set(s.name, s.durationMs)
  }
  const out: Record<string, PerfStatSummary> = {}
  for (const [name, durations] of byName) {
    const sorted = [...durations].sort((a, b) => a - b)
    const total = sorted.reduce((a, b) => a + b, 0)
    out[name] = {
      name,
      count: sorted.length,
      avgMs: Math.round((total / sorted.length) * 10) / 10,
      minMs: Math.round(sorted[0] * 10) / 10,
      maxMs: Math.round(sorted[sorted.length - 1] * 10) / 10,
      p50Ms: Math.round(percentile(sorted, 50) * 10) / 10,
      p95Ms: Math.round(percentile(sorted, 95) * 10) / 10,
      lastMs: Math.round((last.get(name) ?? 0) * 10) / 10,
    }
  }
  return out
}

export interface ConsoleSinkOptions {
  id?: string
  /** Log every span slower than this (ms). Faster spans stay silent. */
  slowThresholdMs?: number
  /** Log marks too (default false — marks are visible via __bizPerf). */
  logMarks?: boolean
}

export function makeConsoleSink(options?: ConsoleSinkOptions): PerfSink {
  const slowThresholdMs = options?.slowThresholdMs ?? 500
  return {
    id: options?.id ?? 'console',
    onSpanEnd: (span) => {
      if (span.durationMs < slowThresholdMs) return
      const phase = span.phase ? `[${span.phase}] ` : ''
      console.log(
        `[perf-slow] ${phase}${span.name} ${Math.round(span.durationMs)}ms`,
        span.attrs,
      )
    },
    onMark: options?.logMarks
      ? (mark) => {
          console.log(`[perf-mark] ${mark.name}`, mark.attrs)
        }
      : undefined,
  }
}

export interface BatchSinkOptions {
  id: string
  batchSize?: number
  flushIntervalMs?: number
  /** Called with a batch; throw/reject to retry on the next flush (batch kept). */
  flush: (spans: PerfSpan[]) => void | Promise<void>
}

/**
 * Generic batching sink: buffers spans, flushes every N spans or M ms.
 * Timer is unref'd where supported so it never keeps the app alive.
 */
export function makeBatchSink(options: BatchSinkOptions): PerfSink & { flushNow: () => Promise<void>; dispose: () => void } {
  const batchSize = options.batchSize ?? 50
  const flushIntervalMs = options.flushIntervalMs ?? 30000
  let buffer: PerfSpan[] = []
  let flushing = false
  let timer: ReturnType<typeof setInterval> | null = null

  const flushNow = async (): Promise<void> => {
    if (flushing || buffer.length === 0) return
    flushing = true
    const batch = buffer
    buffer = []
    try {
      await options.flush(batch)
    } catch {
      // Keep the batch for the next flush — telemetry must not drop data
      // silently, and must never throw into the tracer.
      buffer = [...batch, ...buffer].slice(-batchSize * 4)
    } finally {
      flushing = false
    }
  }

  try {
    timer = setInterval(() => {
      void flushNow()
    }, flushIntervalMs)
    // Node/test envs: don't hold the process open for telemetry.
    ;(timer as any)?.unref?.()
  } catch {}

  return {
    id: options.id,
    onSpanEnd: (span) => {
      buffer.push(span)
      if (buffer.length >= batchSize) void flushNow()
    },
    flushNow,
    dispose: () => {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}

export const memorySink = new MemorySink()

/** Default wiring: memory always; console only in dev. Idempotent. */
let initialized = false
export function initPerf(): void {
  if (initialized) return
  initialized = true
  perf.addSink(memorySink)
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      perf.addSink(makeConsoleSink())
    }
  } catch {
    perf.addSink(makeConsoleSink())
  }
  try {
    ;(globalThis as any).__bizPerf = {
      stats: () => summarizeSpans(memorySink.getSpans()),
      spans: () => memorySink.getSpans(),
      marks: () => memorySink.getMarks(),
      export: () =>
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            stats: summarizeSpans(memorySink.getSpans()),
            spans: memorySink.getSpans(),
            marks: memorySink.getMarks(),
          },
          null,
          2,
        ),
      reset: () => memorySink.clear(),
      configure: (patch: Parameters<typeof perf.configure>[0]) =>
        perf.configure(patch),
    }
  } catch {}
}
