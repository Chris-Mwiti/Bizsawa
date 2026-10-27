import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const listeners = vi.hoisted(() => ({
  msg: [] as Array<(e: { message: string }) => void>,
  timeout: [] as Array<() => void>,
}))

vi.mock('../../../modules/sms-capture', () => ({
  isAutoCaptureSupported: () => true,
  startSmsUserConsent: vi.fn(async (_sender: string | null) => {}),
  stopSmsUserConsent: vi.fn(async () => {}),
  addSmsReceivedListener: vi.fn((cb: (e: { message: string }) => void) => {
    listeners.msg.push(cb)
    return { remove: () => {} }
  }),
  addSmsTimeoutListener: vi.fn((cb: () => void) => {
    listeners.timeout.push(cb)
    return { remove: () => {} }
  }),
}))

vi.mock('../index', () => ({
  handleIncomingSms: vi.fn(),
}))

vi.mock('../consent', () => ({
  hasSmsConsent: vi.fn(async () => true),
}))

import { armAutoCapture } from '../autoCapture'
import { handleIncomingSms } from '../index'
import { hasSmsConsent } from '../consent'
import { addSmsReceivedListener, startSmsUserConsent } from '../../../modules/sms-capture'

const POCHI_NOPHONE =
  'UJEEIA0XPR Confirmed.You have received Ksh10.00 from JOHN  DOE on 14/10/26 at 2:24 PM  New Pochi balance is Ksh10.00. To access your funds, Dial *334#,select Pochi la Biashara & Withdraw funds.'

beforeEach(() => {
  listeners.msg.length = 0
  listeners.timeout.length = 0
  vi.clearAllMocks()
})

describe('armAutoCapture', () => {
  it('maps a stored message to receipt/amount and re-arms', async () => {
    ;(handleIncomingSms as Mock).mockResolvedValue({
      stored: true,
      item: { mpesa_receipt: 'UJEEIA0XPR', amount_minor: 1000 },
    })
    const results: unknown[] = []
    await armAutoCapture((r) => results.push(r))
    // Unfiltered by default: any sender triggers the popup (sender-ID
    // variants must never silently swallow a payment); the strict parse
    // filters non-payment texts. The gate sees the fallback verified ID.
    expect(startSmsUserConsent).toHaveBeenCalledWith(null)
    expect(startSmsUserConsent).toHaveBeenCalledTimes(1)

    listeners.msg[0]({ message: POCHI_NOPHONE })
    await new Promise((r) => setTimeout(r, 0))

    expect(handleIncomingSms).toHaveBeenCalledWith({ body: POCHI_NOPHONE, sender: 'MPESA' })
    expect(results).toEqual([{ stored: true, receipt: 'UJEEIA0XPR', amountMinor: 1000 }])
    // finally(rearm): initial arm + one re-arm after the message.
    expect(startSmsUserConsent).toHaveBeenCalledTimes(2)
  })

  it('reports timeout as a re-arm heartbeat and re-arms', async () => {
    const results: unknown[] = []
    const stop = await armAutoCapture((r) => results.push(r))
    listeners.timeout[0]()
    expect(results).toEqual([{ stored: false, reason: 'consent_window_expired_rearmed' }])
    expect(startSmsUserConsent).toHaveBeenCalledTimes(2)
    stop()
  })

  it('surfaces re-arm failures instead of dying silently', async () => {
    const results: unknown[] = []
    const errors: string[] = []
    await armAutoCapture(
      (r) => results.push(r),
      'MPESA',
      (m) => errors.push(m),
    )
    ;(startSmsUserConsent as Mock).mockRejectedValueOnce(new Error('play services down'))
    listeners.timeout[0]()
    await new Promise((r) => setTimeout(r, 0))
    expect(errors).toEqual(['play services down'])
    // Heartbeat still reported; listener teardown is the caller's job.
    expect(results).toEqual([{ stored: false, reason: 'consent_window_expired_rearmed' }])
  })

  it('throws when in-app consent is missing', async () => {
    ;(hasSmsConsent as Mock).mockResolvedValueOnce(false)
    await expect(armAutoCapture(() => {})).rejects.toThrow('SMS capture consent not granted')
  })

  it('fails loudly when the event emitter is unavailable (never a silent no-op)', async () => {
    ;(addSmsReceivedListener as Mock).mockImplementationOnce(() => {
      throw new Error('SMS event emitter unavailable on this device')
    })
    await expect(armAutoCapture(() => {})).rejects.toThrow('SMS event emitter unavailable')
  })
})
