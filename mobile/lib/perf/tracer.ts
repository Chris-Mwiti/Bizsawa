/**
 * Pluggable performance tracing — core tracer.
 *
 * Usage:
 *   import { perf } from '../lib/perf'
 *   const span = perf.start('startup.auth.check', { phase: 'startup' })
 *   // ... work ...
 *   span.end({ cached: true })
 *   // or:
 *   await perf.measure('sync.full', () => syncNow(), { phase: 'sync' })
 *   perf.mark('splash.hidden')
 *
 * Sinks are pluggable: memory (always, ring buffer + stats), console (dev),
 * or your own via perf.addSink() — e.g. an upload sink, Sentry, analytics.
 * See ./sinks.ts for built-ins and makeBatchSink().
 */
import type {
  PerfAttrs,
  PerfConfig,
  PerfMark,
  PerfSink,
  PerfSpan,
  PerfStatSummary,
} from './types'

export type { PerfAttrs, PerfConfig, PerfMark, PerfSink, PerfSpan, PerfStatSummary }

export function nowMs(): number {
  try {
    const p = (globalThis as any)?.performance
    if (p && typeof p.now === 'function') return p.now()
  } catch {}
  return Date.now()
}

export interface PerfSpanHandle {
  end: (attrs?: PerfAttrs) => void
  readonly name: string
}

const noopHandle: PerfSpanHandle = {
  end: () => {},
  name: 'noop',
}

type Listener = () => void

class Tracer {
  private sinks = new Map<string, PerfSink>()
  private listeners = new Set<Listener>()
  private nextId = 1
  private config: PerfConfig = {
    enabled: true,
    sampleRate: 1,
    maxSpans: 500,
  }

  configure(patch: Partial<PerfConfig>): void {
    this.config = { ...this.config, ...patch }
  }

  getConfig(): PerfConfig {
    return { ...this.config }
  }

  get maxSpans(): number {
    return this.config.maxSpans
  }

  addSink(sink: PerfSink): () => void {
    this.sinks.set(sink.id, sink)
    return () => {
      this.sinks.delete(sink.id)
    }
  }

  removeSink(id: string): void {
    this.sinks.delete(id)
  }

  /** Subscribe to span-end notifications (powers usePerfStats). */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  start(name: string, attrs?: PerfAttrs): PerfSpanHandle {
    if (!this.config.enabled) return noopHandle
    if (
      this.config.sampleRate < 1 &&
      Math.random() >= this.config.sampleRate
    ) {
      return noopHandle
    }
    const id = this.nextId++
    const startMs = nowMs()
    const phase =
      typeof attrs?.phase === 'string' ? (attrs.phase as string) : undefined
    let ended = false
    return {
      name,
      end: (endAttrs?: PerfAttrs) => {
        if (ended) return
        ended = true
        const endMs = nowMs()
        const span: PerfSpan = {
          id,
          name,
          phase,
          startMs,
          endMs,
          durationMs: Math.max(0, endMs - startMs),
          attrs: { ...(attrs ?? {}), ...(endAttrs ?? {}) },
        }
        this.emitSpan(span)
      },
    }
  }

  async measure<T>(
    name: string,
    fn: () => T | Promise<T>,
    attrs?: PerfAttrs,
  ): Promise<T> {
    const span = this.start(name, attrs)
    try {
      return await fn()
    } finally {
      span.end()
    }
  }

  mark(name: string, attrs?: PerfAttrs): void {
    if (!this.config.enabled) return
    const mark: PerfMark = { name, atMs: nowMs(), attrs: attrs ?? {} }
    for (const sink of this.sinks.values()) {
      try {
        sink.onMark?.(mark)
      } catch {}
    }
  }

  /** Instant zero-duration event recorded as a span (shows up in stats). */
  event(name: string, attrs?: PerfAttrs): void {
    const span = this.start(name, attrs)
    span.end()
  }

  private emitSpan(span: PerfSpan): void {
    for (const sink of this.sinks.values()) {
      try {
        sink.onSpanEnd?.(span)
      } catch {}
    }
    if (this.listeners.size > 0) {
      for (const fn of this.listeners) {
        try {
          fn()
        } catch {}
      }
    }
  }
}

export const perf = new Tracer()
