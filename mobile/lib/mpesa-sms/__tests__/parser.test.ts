import { describe, expect, it } from 'vitest'
import { parseMpesaSms } from '../parser'

describe('mpesa-sms parser (TS mirror of Kotlin MpesaParser v1)', () => {
  it('parses a Till receive', () => {
    const res = parseMpesaSms(
      'QHX7K2M9AB Confirmed. Ksh1,234.50 received from JOHN DOE 0712345678 on 08/10/2026 at 09:41 AM. Till No. 567890.',
    )
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.payment.receiptCode).toBe('QHX7K2M9AB')
    expect(res.payment.amountMinor).toBe(123450)
    expect(res.payment.channelType).toBe('till')
    expect(res.rawPayerPhone).toBe('254712345678')
  })

  it('parses a Paybill receive', () => {
    const res = parseMpesaSms(
      'QJ2M8XZ4PL Confirmed. Ksh2,500.00 received from JANE DOE 0722000111 on 08/10/2026 at 11:02 AM. Paybill No. 600100, Account No. SHOP12.',
    )
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.payment.amountMinor).toBe(250000)
    expect(res.payment.channelType).toBe('paybill')
  })

  it('parses a Pochi receive', () => {
    const res = parseMpesaSms(
      'PK7T2M9QW1 Confirmed. You have received Ksh350.00 from 0733000222 MARY WANJIKU on 08/10/2026 at 01:15 PM. Pochi La Biashara balance is Ksh5,200.00.',
    )
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.payment.amountMinor).toBe(35000)
    expect(res.payment.channelType).toBe('pochi')
  })

  it('rejects sent-money, airtime, fuliza and reversals', () => {
    expect(
      parseMpesaSms('QK9R4T2M7Z Confirmed. Ksh1,000.00 sent to PETER 0711222333 on 08/10/2026 at 02:00 PM.').kind,
    ).toBe('rejected')
    expect(
      parseMpesaSms('QM8N3P5Q7R Confirmed. You bought airtime worth Ksh100.00 on 08/10/2026 at 04:00 PM.').kind,
    ).toBe('rejected')
    expect(parseMpesaSms('Dear customer, your Fuliza limit is Ksh1,000.00.').kind).toBe('rejected')
    expect(
      parseMpesaSms('Reversal: Transaction QHX7K2M9AB of Ksh1,234.50 has been reversed on 08/10/2026 at 05:00 PM.').kind,
    ).toBe('reversal')
  })

  it('rejects garbage without throwing', () => {
    expect(parseMpesaSms('lorem ipsum 12345 !!!').kind).toBe('rejected')
    expect(parseMpesaSms('').kind).toBe('rejected')
    expect(parseMpesaSms('QHX7K2M9AB').kind).toBe('rejected')
  })

  it('exposes no payer name or balance fields', () => {
    const res = parseMpesaSms(
      'QHX7K2M9AB Confirmed. Ksh1,234.50 received from JOHN DOE 0712345678 on 08/10/2026 at 09:41 AM. Till No. 1. New balance is Ksh10,000.00.',
    )
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(Object.keys(res.payment).sort()).toEqual(
      ['amountMinor', 'channelType', 'currency', 'occurredAtMillis', 'receiptCode'].sort(),
    )
    expect(JSON.stringify(res)).not.toContain('JOHN')
  })
})
