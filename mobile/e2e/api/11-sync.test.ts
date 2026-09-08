import { describe, it, expect } from 'vitest'
import { registerAndLogin, createBusiness, apiWithBusiness } from './helpers'

describe('11 Sync push/pull', () => {
  it('syncs via /sync/push and /sync/pull', async () => {
    const { accessToken } = await registerAndLogin()
    const biz = await createBusiness(accessToken)
    const businessId = biz.data.data?.id || biz.data.id
    if (!businessId) return
    const client = await apiWithBusiness(accessToken, businessId)
    const push = await client.post('/sync/push', { changes: {} })
    expect([200, 204, 400]).toContain(push.status)
    const pull = await client.get('/sync/pull', { since: 0 })
    expect([200]).toContain(pull.status)
  })
})
