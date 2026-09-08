import { describe, it, expect } from 'vitest'
import { registerAndLogin, createBusiness, apiWithBusiness } from './helpers'

describe('05 Customer CRM', () => {
  it('creates and lists customers', async () => {
    const { accessToken } = await registerAndLogin()
    const biz = await createBusiness(accessToken)
    const businessId = biz.data.data?.id || biz.data.id
    if (!businessId) return
    const client = await apiWithBusiness(accessToken, businessId)
    const c = await client.post('/customers', { name: 'E2E Customer', phone: '254722000000', email: 'cust@test.com' })
    expect([200, 201]).toContain(c.status)
    const list = await client.get('/customers')
    expect([200]).toContain(list.status)
    expect(Array.isArray(list.data.data || list.data)).toBe(true)
  })
})
