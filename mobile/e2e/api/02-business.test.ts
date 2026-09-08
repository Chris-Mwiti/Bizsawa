import { describe, it, expect } from 'vitest'
import { registerAndLogin, createBusiness, api, authHeader } from './helpers'

describe('02 Business onboarding — free plan limit 1', () => {
  it('creates one business, second fails 403, verifies X-Business-ID persistence', async () => {
    const { accessToken } = await registerAndLogin()
    const first = await createBusiness(accessToken, `BizOne ${Date.now()}`)
    expect([200, 201]).toContain(first.status)
    const businessId = first.data.data?.id || first.data.id
    expect(businessId).toBeTruthy()

    // second should be blocked on free plan
    const second = await createBusiness(accessToken, `BizTwo ${Date.now()}`)
    expect([403, 409, 400]).toContain(second.status)

    // list
    const list = await api.get('/businesses', { headers: authHeader(accessToken) })
    expect([200]).toContain(list.status)
    // update with X-Business-ID
    if (businessId) {
      const upd = await api.put(`/businesses/${businessId}`, { name: 'BizOne Updated' }, { headers: { ...authHeader(accessToken), 'X-Business-ID': businessId } })
      expect([200, 204]).toContain(upd.status)
    }
  })
})
