import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { drainPendingSms, isAutoCaptureSupported } from '../../lib/mpesa-sms/autoCapture'
import {
  emptyAutoCaptureDebug,
  noteAutoCaptureResult,
  type AutoCaptureDebug,
} from '../../lib/mpesa-sms/autoCaptureDebug'

export type AutoCaptureStatus = 'unsupported' | 'off' | 'listening' | 'error'

export const useSmsAutoCapture = (enabled: boolean) => {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AutoCaptureStatus>(
    isAutoCaptureSupported() ? 'off' : 'unsupported',
  )
  const [lastResult, setLastResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [debug, setDebug] = useState<AutoCaptureDebug>(emptyAutoCaptureDebug)

  useEffect(() => {
    if (!enabled || !isAutoCaptureSupported()) {
      setStatus(isAutoCaptureSupported() ? 'off' : 'unsupported')
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const results = await drainPendingSms()
        for (const r of results) {
          setLastResult(r)
          setDebug((d) => noteAutoCaptureResult(d, r as any, Date.now()))
        }
        if (results.some((r) => r.stored)) queryClient.invalidateQueries({ queryKey: ['capturedPayments'] })
        setStatus('listening')
        setError(null)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setStatus('error')
        }
      }
    }
    run()
    const interval = setInterval(run, 15000)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !cancelled) run()
    })
    return () => {
      cancelled = true
      clearInterval(interval)
      sub.remove()
      setStatus('off')
    }
  }, [enabled, queryClient])

  return { status, lastResult, error, debug }
}
