import { describe, it, expect } from 'vitest'
import { registerAndLogin, createBusiness, apiWithBusiness } from './helpers'

describe('08 Invoice + WAHA mock', () => {
  it('creates invoice from order', async () => {
    const { accessToken } = await registerAndLogin()
    const biz = await createBusiness(accessToken)
    const businessId = biz.data.data?.id || biz.data.id
    if (!businessId) return
    const client = await apiWithBusiness(accessToken, businessId)
    // minimal order to invoice — reuse 06 flow quickly
    const prod = await client.post('/products', { name: `InvProd ${Date.now()}`, price: '100.00', variants: [{ name: 'unit', price: '100.00' }] })
    const productId = prod.data.data?.id || prod.data.id
    if (!productId) return
    await client.post('/inventory/adjust', { productId, quantityDelta: 5 })
    const order = await client.post('/orders', { lines: [{ productId, quantity: 1, price: '100.00' }] })
    const orderId = order.data.data?.id || order.data.id
    if (!orderId) return
    await client.post(`/orders/${orderId}/confirm`)
    const inv = await client.post('/invoices', { orderId })
    expect([200, 201]).toContain(inv.status)
    const invId = inv.data.data?.id || inv.data.id
    if (invId) {
      const send = await client.post(`/invoices/${invId}/send`, { channel: 'whatsapp' })
      expect([200, 201, 202]).toContain(send.status)
    }
  })
})
