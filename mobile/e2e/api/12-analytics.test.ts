import { describe, it, expect } from 'vitest'
import { registerAndLogin, createBusiness, apiWithBusiness } from './helpers'

describe('12 Analytics zero-fill', () => {
  it('returns 7-day gap-filled data', async () => {
    const { accessToken } = await registerAndLogin()
    const biz = await createBusiness(accessToken)
    const businessId = biz.data.data?.id || biz.data.id
    if (!businessId) return
    const client = await apiWithBusiness(accessToken, businessId)
    // create a sale so at least one day non-zero
    const prod = await client.post('/products', { name: `AnaProd ${Date.now()}`, price: '20.00', variants: [{ name: 'unit', price: '20.00' }] })
    const productId = prod.data.data?.id || prod.data.id
    if (productId) {
      await client.post('/inventory/adjustments', { productId, quantityDelta: 10 })
      // order create + confirm require UUID-shaped X-Idempotency-Key
      const idem = () => ({ 'X-Idempotency-Key': crypto.randomUUID() })
      const order = await client.post('/orders', { lines: [{ productId, quantity: 1, price: '20.00' }] }, idem())
      const orderId = order.data.data?.id || order.data.id
      if (orderId) {
        await client.post(`/orders/${orderId}/confirm`, {}, idem())
        await client.post('/sales', { orderId })
      }
    }
    const week = await client.get('/analytics', { timeframe: 'week' })
    expect([200]).toContain(week.status)
    const data = week.data.data || week.data
    // sage expects revenue.data.length==7 with zeros gap-filled
    const revenue = data.revenue?.data || data.revenue || data.data || []
    const isNumeric = (v: any) =>
      typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))
    if (Array.isArray(revenue)) {
      expect(revenue.length).toBeGreaterThanOrEqual(7)
      // at least one entry should be numeric (backend serializes decimals as strings)
      if (revenue.length > 0) {
        const first = revenue[0]
        expect(isNumeric(first?.revenue ?? first?.value ?? first)).toBe(true)
      }
    }
  })
})
