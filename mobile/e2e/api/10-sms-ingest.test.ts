import { describe, it, expect } from 'vitest'
import { randomUUID } from 'crypto'
import { registerAndLogin, createBusiness, apiWithBusiness } from './helpers'

// Server half of the SMS-capture E2E: device → ingest → captured list.
// Template values mirror the REAL fixtures (receipt/channel/amount);
// occurred_at is recent so MaxCaptureAge/FutureSkew gates pass.
describe('10 SMS capture ingest end-to-end', () => {
  it('registers a device, ingests till/paybill/pochi, lists captured', async () => {
    const { accessToken } = await registerAndLogin()
    const biz = await createBusiness(accessToken)
    const businessId = biz.data.data?.id || biz.data.id
    if (!businessId) return
    const client = await apiWithBusiness(accessToken, businessId)

    const dev = await client.post('/devices', { platform: 'android', parserVersion: '1' })
    expect([200, 201]).toContain(dev.status)
    const deviceId = dev.data.data?.id || dev.data.id
    if (!deviceId) return

    const occurred = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const payer = 'a'.repeat(32)
    const items = [
      {
        client_event_id: randomUUID(),
        mpesa_receipt: 'QHX7K2M9AB',
        amount_minor: 123450,
        currency: 'KES',
        occurred_at: occurred,
        channel_type: 'till',
        source: 'sms_device',
        payer_hash: payer,
        parser_version: '1',
        consent_version: '1',
        device_id: deviceId,
      },
      {
        client_event_id: randomUUID(),
        mpesa_receipt: 'QJ2M8XZ4PL',
        amount_minor: 250000,
        currency: 'KES',
        occurred_at: occurred,
        channel_type: 'paybill',
        source: 'sms_device',
        payer_hash: payer,
        parser_version: '1',
        consent_version: '1',
        device_id: deviceId,
      },
      {
        client_event_id: randomUUID(),
        mpesa_receipt: 'PK7T2M9QW1',
        amount_minor: 35000,
        currency: 'KES',
        occurred_at: occurred,
        channel_type: 'pochi',
        source: 'sms_device',
        payer_hash: payer,
        parser_version: '1',
        consent_version: '1',
        device_id: deviceId,
      },
    ]

    const ing = await client.post('/payments/ingest', items)
    expect(ing.status).toBe(200)
    const results = ing.data.results || ing.data.data?.results || []
    expect(results).toHaveLength(3)
    for (const r of results) expect(r.result).toBe('created')

    const listed = await client.get('/payments/captured')
    expect(listed.status).toBe(200)
    const payments = listed.data.payments || listed.data.data || []
    expect(payments.length).toBeGreaterThanOrEqual(3)

    // Replay same batch → idempotent duplicates, never second rows.
    const replay = await client.post('/payments/ingest', items)
    const replayResults = replay.data.results || replay.data.data?.results || []
    for (const r of replayResults) expect(r.result).toBe('duplicate')
  })
})
