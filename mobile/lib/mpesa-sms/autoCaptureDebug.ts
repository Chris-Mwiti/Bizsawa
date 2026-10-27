// Pure listener-liveness tracker for auto-capture diagnostics.
// The Consent API fails silently (missed popup, dead process, expired
// window), so the test screen renders this state next to Status: if the
// numbers never move, the listener is dead; if heartbeats advance but no
// message ever lands, the Allow popup is being missed/denied or the SMS
// arrived outside a live window.

import type { AutoCaptureResult } from './autoCapture'

export const HEARTBEAT_REASON = 'consent_window_expired_rearmed'

export interface AutoCaptureDebug {
  /** Epoch ms of the last successful arm, null if never armed. */
  armedAt: number | null
  /** Successful initial arms + foreground re-arms. */
  arms: number
  /** Heartbeat (timeout re-arm) events observed. */
  heartbeats: number
  /** Epoch ms of the last heartbeat, null if none yet. */
  lastHeartbeatAt: number | null
  /** Message (non-heartbeat result) events observed. */
  messages: number
  /** Epoch ms of the last message event, null if none yet. */
  lastMessageAt: number | null
}

export function emptyAutoCaptureDebug(): AutoCaptureDebug {
  return {
    armedAt: null,
    arms: 0,
    heartbeats: 0,
    lastHeartbeatAt: null,
    messages: 0,
    lastMessageAt: null,
  }
}

export function noteArmed(prev: AutoCaptureDebug, now: number): AutoCaptureDebug {
  return { ...prev, armedAt: now, arms: prev.arms + 1 }
}

export function noteAutoCaptureResult(
  prev: AutoCaptureDebug,
  result: AutoCaptureResult,
  now: number,
): AutoCaptureDebug {
  if (!result.stored && result.reason === HEARTBEAT_REASON) {
    return { ...prev, heartbeats: prev.heartbeats + 1, lastHeartbeatAt: now }
  }
  return { ...prev, messages: prev.messages + 1, lastMessageAt: now }
}

function fmtTime(ms: number | null): string {
  if (ms === null) return '—'
  return new Date(ms).toLocaleTimeString()
}

/** One-line summary for the sms-test screen. */
export function formatAutoCaptureDebug(d: AutoCaptureDebug): string {
  return (
    `armed ${fmtTime(d.armedAt)} · arms ${d.arms} · ` +
    `heartbeats ${d.heartbeats} (last ${fmtTime(d.lastHeartbeatAt)}) · ` +
    `messages ${d.messages} (last ${fmtTime(d.lastMessageAt)})`
  )
}
