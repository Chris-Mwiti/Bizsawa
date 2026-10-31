import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../../../modules/sms-capture', () => ({
  isAutoCaptureSupported: () => true,
  getPendingSms: vi.fn(async () => []),
}))

vi.mock('../index', () => ({
  handleIncomingSms: vi.fn(),
}))

import { drainPendingSms } from '../autoCapture'
import { handleIncomingSms } from '../index'
import { getPendingSms } from '../../../modules/sms-capture'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('drainPendingSms', () => {
  it('processes pending SMS bodies', async () => {
    ;(getPendingSms as Mock).mockResolvedValue(['body1'])
    ;(handleIncomingSms as Mock).mockResolvedValue({ stored: true, item: { mpesa_receipt: 'R1', amount_minor: 100 } })
    const results = await drainPendingSms()
    expect(handleIncomingSms).toHaveBeenCalledWith({ body: 'body1', sender: 'MPESA', requireConsent: false })
    expect(results).toEqual([{ stored: true, receipt: 'R1', amountMinor: 100 }])
  })
})
