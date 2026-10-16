import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { armAutoCapture, AUTO_CAPTURE_SENDER, isAutoCaptureSupported, type AutoCaptureResult } from '../../lib/mpesa-sms/autoCapture'
import {
  emptyAutoCaptureDebug,
  noteArmed,
  noteAutoCaptureResult,
  type AutoCaptureDebug,
} from '../../lib/mpesa-sms/autoCaptureDebug'

export type AutoCaptureStatus = 'unsupported' | 'off' | 'listening' | 'error'

/**
 * Option 1 auto-capture (Android SMS User Consent API).
 * Pass enabled=false (or render nothing) on iOS — status reports
 * 'unsupported' and no native calls are made.
 */
export const useSmsAutoCapture = (enabled: boolean) => {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AutoCaptureStatus>(
    isAutoCaptureSupported() ? 'off' : 'unsupported',
  )
  const [lastResult, setLastResult] = useState<AutoCaptureResult | null>(null)
  // Human-readable arm failure (native consent start, missing consent…).
  // Never blank when status === 'error' — the sms-test screen renders it.
  const [error, setError] = useState<string | null>(null)
  // Listener-liveness counters — the Consent API fails silently, so the
  // test screen renders these next to Status for field diagnostics.
  const [debug, setDebug] = useState<AutoCaptureDebug>(emptyAutoCaptureDebug)

  useEffect(() => {
    if (!enabled || !isAutoCaptureSupported()) {
      setStatus(isAutoCaptureSupported() ? 'off' : 'unsupported')
      setError(null)
      return
    }
    let stop: (() => void) | null = null
    let cancelled = false
    const onResult = (r: AutoCaptureResult) => {
      setLastResult(r)
      setDebug((d) => noteAutoCaptureResult(d, r, Date.now()))
      if (r.stored) queryClient.invalidateQueries({ queryKey: ['capturedPayments'] })
    }
    const onRearmError = (message: string) => {
      if (cancelled) return
      // The periodic re-arm died: no further timeout/message events will
      // arrive, so 'listening' would be a lie. Flip to error with the cause.
      setError(`re-arm failed: ${message}`)
      setStatus('error')
    }
    const arm = () => {
      armAutoCapture(onResult, AUTO_CAPTURE_SENDER, onRearmError)
        .then((s) => {
          if (cancelled) return s()
          stop = s
          setError(null)
          setDebug((d) => noteArmed(d, Date.now()))
          setStatus('listening')
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e))
            setStatus('error')
          }
        })
    }
    arm()
    // Consent expires (~5 min): re-arm on every foreground.
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || cancelled) return
      stop?.()
      stop = null
      arm()
    })
    return () => {
      cancelled = true
      sub.remove()
      stop?.()
      setStatus('off')
    }
  }, [enabled, queryClient])

  return { status, lastResult, error, debug }
}
