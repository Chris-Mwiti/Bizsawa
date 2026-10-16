import { describe, expect, it } from 'vitest'
import {
  emptyAutoCaptureDebug,
  formatAutoCaptureDebug,
  noteArmed,
  noteAutoCaptureResult,
} from '../autoCaptureDebug'

describe('autoCaptureDebug tracker', () => {
  it('starts empty', () => {
    const d = emptyAutoCaptureDebug()
    expect(d.arms).toBe(0)
    expect(d.heartbeats).toBe(0)
    expect(d.messages).toBe(0)
    expect(formatAutoCaptureDebug(d)).toContain('arms 0')
  })

  it('counts arms, heartbeats and messages separately', () => {
    let d = emptyAutoCaptureDebug()
    d = noteArmed(d, 1000)
    d = noteArmed(d, 2000)
    d = noteAutoCaptureResult(d, { stored: false, reason: 'consent_window_expired_rearmed' }, 3000)
    d = noteAutoCaptureResult(d, { stored: true, receipt: 'X', amountMinor: 100 }, 4000)
    d = noteAutoCaptureResult(d, { stored: false, reason: 'non_mpesa_sender' }, 5000)
    expect(d.arms).toBe(2)
    expect(d.armedAt).toBe(2000)
    expect(d.heartbeats).toBe(1)
    expect(d.lastHeartbeatAt).toBe(3000)
    expect(d.messages).toBe(2)
    expect(d.lastMessageAt).toBe(5000)
    expect(formatAutoCaptureDebug(d)).toContain('heartbeats 1')
    expect(formatAutoCaptureDebug(d)).toContain('messages 2')
  })
})
