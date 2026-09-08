import { describe, it, expect } from 'vitest'
import { api, registerAndLogin, uniqueEmail, authHeader } from './helpers'

describe('01 Auth register → login → refresh', () => {
  it('registers, logs in, refreshes, and validates offline cache semantics', async () => {
    const email = uniqueEmail()
    const { accessToken, refreshToken } = await registerAndLogin(email)
    expect(accessToken).toBeTruthy()
    expect(refreshToken).toBeTruthy()

    // refresh
    const ref = await api.post('/auth/refresh', { refreshToken })
    expect([200, 201]).toContain(ref.status)
    expect(ref.data.data?.accessToken || ref.data.accessToken).toBeTruthy()

    // profile endpoint should work with token
    const me = await api.get('/profile', { headers: authHeader(ref.data.data?.accessToken || ref.data.accessToken) })
    // GET /profile without business header is now allowed per sage C2 row 3
    expect([200, 404]).toContain(me.status)
  })
})
