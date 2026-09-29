import axios from 'axios'

export const API_URL = process.env.E2E_API_URL || 'http://localhost:5504/api/v1'

export const api = axios.create({ baseURL: API_URL, timeout: 15000, validateStatus: () => true })

export function uniqueEmail() {
  return `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@bizsawa.test`
}

export async function registerAndLogin(email = uniqueEmail(), password = 'Test1234!') {
  const reg = await api.post('/auth/register', {
    email,
    password,
    ownerName: 'E2E Tester',
    phone: '254700000000',
  })
  if (reg.status !== 201 && reg.status !== 200) throw new Error(`register failed ${reg.status} ${JSON.stringify(reg.data)}`)
  const login = await api.post('/auth/login', { email, password })
  if (login.status !== 200) throw new Error(`login failed ${login.status} ${JSON.stringify(login.data)}`)
  const { accessToken, refreshToken, userId } = login.data.data ?? login.data
  return { email, password, accessToken, refreshToken, userId }
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function createBusiness(token: string, name = `Biz ${Date.now()}`) {
  const res = await api.post('/businesses', { name, businessType: 'retail', location: 'Nairobi' }, { headers: authHeader(token) })
  return res
}

export async function apiWithBusiness(token: string, businessId: string) {
  const headers = { ...authHeader(token), 'X-Business-ID': businessId }
  return {
    get: (url: string, params?: any) => api.get(url, { headers, params: { ...params, businessId } }),
    post: (url: string, body?: any, extraHeaders?: any) => api.post(url, body, { headers: { ...headers, ...extraHeaders } }),
    put: (url: string, body?: any) => api.put(url, body, { headers }),
    delete: (url: string) => api.delete(url, { headers }),
    patch: (url: string, body?: any) => api.patch(url, body, { headers }),
  }
}
