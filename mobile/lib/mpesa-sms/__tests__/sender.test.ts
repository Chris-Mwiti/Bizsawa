import { describe, expect, it } from 'vitest'
import { isMpesaSender } from '../sender'

describe('sms sender gate', () => {
  it('accepts M-PESA senders only', () => {
    expect(isMpesaSender('MPESA')).toBe(true)
    expect(isMpesaSender('M-PESA')).toBe(true)
    expect(isMpesaSender('Safaricom')).toBe(true)
    expect(isMpesaSender('0712345678')).toBe(false)
    expect(isMpesaSender(undefined)).toBe(false)
    expect(isMpesaSender('Promo')).toBe(false)
  })
})
