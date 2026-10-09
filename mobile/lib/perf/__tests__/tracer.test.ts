import { describe, expect, it, vi } from 'vitest'
import { perf } from '../tracer'
import { makeBatchSink, summarizeSpans } from '../sinks'
import type { PerfSpan } from '../types'

function span(name: string, durationMs: number): PerfSpan {
  return {
    id: 1,
    name,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    attrs: {},
  }
}

describe('perf tracer', () => {
  it('start/end delivers spans to sinks and never throws on broken sinks', () => {
    const seen: PerfSpan[] = []
    const unsub = perf.addSink({
      id: 'test-ok',
      onSpanEnd: (s) => seen.push(s),
    })
    perf.addSink({
      id: 'test-broken',
      onSpanEnd: () => {
        throw new Error('sink boom')
      },
    })
    try {
      const s = perf.start('test.op', { phase: 'test' })
      s.end({ ok: true })
      s.end({ ok: true }) // second end is a no-op
      expect(seen).toHaveLength(1)
      expect(seen[0].name).toBe('test.op')
      expect(seen[0].phase).toBe('test')
      expect(seen[0].attrs.ok).toBe(true)
      expect(seen[0].durationMs).toBeGreaterThanOrEqual(0)
    } finally {
      unsub()
      perf.removeSink('test-broken')
    }
  })

  it('measure awaits fn and ends the span on throw', async () => {
    const seen: PerfSpan[] = []
    const unsub = perf.addSink({ id: 'test-m', onSpanEnd: (s) => seen.push(s) })
    try {
      await expect(
        perf.measure('test.fail', async () => {
          throw new Error('x')
        }),
      ).rejects.toThrow('x')
      expect(seen.map((s) => s.name)).toContain('test.fail')
    } finally {
      unsub()
    }
  })

  it('disabled tracer is a no-op', () => {
    const seen: PerfSpan[] = []
    const unsub = perf.addSink({ id: 'test-d', onSpanEnd: (s) => seen.push(s) })
    try {
      perf.configure({ enabled: false })
      perf.start('test.nope').end()
      perf.mark('test.mark')
      expect(seen).toHaveLength(0)
    } finally {
      perf.configure({ enabled: true })
      unsub()
    }
  })

  it('summarizeSpans computes count/avg/min/max/p50/p95', () => {
    const stats = summarizeSpans([
      span('a', 10),
      span('a', 20),
      span('a', 30),
      span('a', 40),
      span('b', 5),
    ])
    expect(stats.a.count).toBe(4)
    expect(stats.a.avgMs).toBe(25)
    expect(stats.a.minMs).toBe(10)
    expect(stats.a.maxMs).toBe(40)
    expect(stats.a.p50Ms).toBe(20)
    expect(stats.a.p95Ms).toBe(40)
    expect(stats.b.count).toBe(1)
  })

  it('makeBatchSink batches and flushes', async () => {
    const flushed: PerfSpan[][] = []
    const sink = makeBatchSink({
      id: 'test-batch',
      batchSize: 3,
      flushIntervalMs: 50,
      flush: (spans) => {
        flushed.push(spans)
      },
    })
    try {
      sink.onSpanEnd?.(span('x', 1))
      sink.onSpanEnd?.(span('x', 2))
      expect(flushed).toHaveLength(0)
      sink.onSpanEnd?.(span('x', 3))
      await vi.waitFor(() => expect(flushed).toHaveLength(1))
      expect(flushed[0]).toHaveLength(3)
    } finally {
      sink.dispose()
    }
  })
})
