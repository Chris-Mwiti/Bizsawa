/**
 * Pluggable performance tracing.
 *
 *   import { perf, initPerf } from './lib/perf'
 *
 * `initPerf()` is called once from app/_layout (idempotent): memory sink
 * always on, console sink in dev, `__bizPerf` debug handle registered.
 *
 * Add your own sink any time (upload, Sentry, analytics):
 *   perf.addSink(makeBatchSink({ id: 'upload', flush: sendToServer }))
 *
 * Read stats in UI: `usePerfStats()` from './usePerfStats'.
 * In prod builds / console: `__bizPerf.stats()`, `__bizPerf.export()`.
 */
export { perf, nowMs } from './tracer'
export type {
  PerfAttrs,
  PerfConfig,
  PerfMark,
  PerfSink,
  PerfSpan,
  PerfSpanHandle,
  PerfStatSummary,
} from './tracer'
export {
  initPerf,
  makeBatchSink,
  makeConsoleSink,
  memorySink,
  summarizeSpans,
} from './sinks'
export type { BatchSinkOptions, ConsoleSinkOptions } from './sinks'
export { usePerfStats } from './usePerfStats'
