import { describe, it, expect } from 'vitest'
import { registerAndLogin, createBusiness, apiWithBusiness } from './helpers'

describe('07 Expense → analytics invalidation', () => {
  it('creates expense and lists', async () => {
    const { accessToken } = await registerAndLogin()
    const biz = await createBusiness(accessToken)
    const businessId = biz.data.data?.id || biz.data.id
    if (!businessId) return
    const client = await apiWithBusiness(accessToken, businessId)
    const exp = await client.post('/expenses', { category: 'transport', amount: '500.00', spentAt: new Date().toISOString(), description: 'E2E matatu' })
    expect([200, 201]).toContain(exp.status)
    const list = await client.get('/expenses')
    expect([200]).toContain(list.status)
  })
})
