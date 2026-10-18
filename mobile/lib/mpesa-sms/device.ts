// Capture device identity. Backend requires a known device_id per ingest
// item (unknown devices are rejected with device_unknown). The id is
// created once via POST /devices and cached in SecureStore.

import { secureStorage } from '../secureStorage'
import { api } from '../api'
import { PARSER_VERSION } from './parser'

const DEVICE_KEY = 'bizsawa_sms_capture_device_id'

export async function getDeviceId(): Promise<string | null> {
  return secureStorage.getSecure(DEVICE_KEY)
}

export async function getOrRegisterDevice(): Promise<string> {
  const existing = await getDeviceId()
  if (existing) return existing
  const res = await api.post<{ id: string } | { data: { id: string } }>(
    '/devices',
    { platform: 'android', parserVersion: PARSER_VERSION },
  )
  const data: any = res.data
  const id = data?.id ?? data?.data?.id
  if (!id) throw new Error('Device registration returned no id')
  await secureStorage.setSecure(DEVICE_KEY, id)
  return id
}
