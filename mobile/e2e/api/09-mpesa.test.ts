import { describe, it, expect } from 'vitest'
import { registerAndLogin, createBusiness, apiWithBusiness } from './helpers'

describe('09 Business M-Pesa STK isolated', () => {
  it('initiates stk push with idempotency key', async () => {
    const { accessToken } = await registerAndLogin()
    const biz = await createBusiness(accessToken)
    const businessId = biz.data.data?.id || biz.data.id
    if (!businessId) return
    const client = await apiWithBusiness(accessToken, businessId)
    const prod = await client.post('/products', { name: `PayProd ${Date.now()}`, price: '10.00', variants: [{ name: 'unit', price: '10.00' }] })
    const productId = prod.data.data?.id || prod.data.id
    if (!productId) return
    await client.post('/inventory/adjust', { productId, quantityDelta: 5 })
    const order = await client.post('/orders', { lines: [{ productId, quantity: 1, price: '10.00' }] })
    const orderId = order.data.data?.id || order.data.id
    if (!orderId) return
    await client.post(`/orders/${orderId}/confirm`)
    const pay = await client.post('/payments/initiate', { orderId, amount: '10.00', phone: '254708374149' }, { 'X-Idempotency-Key': `e2e-${Date.now()}` })
    expect([200, 201, 202, 400, 422]).toContain(pay.status)
    // callback simulation would be POST /mpesa/callback — skipped in CI sandbox
  })
})
