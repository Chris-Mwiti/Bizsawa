// Offline SMS consent gate. Capture is opt-in; every stored record carries
// the consent version so a later policy change can re-gate history.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { SMS_CONSENT_VERSION } from './types'

const CONSENT_KEY = 'bizsawa_sms_capture_consent'

export async function getSmsConsent(): Promise<string | null> {
  return AsyncStorage.getItem(CONSENT_KEY)
}

export async function hasSmsConsent(): Promise<boolean> {
  return (await getSmsConsent()) === SMS_CONSENT_VERSION
}

export async function grantSmsConsent(): Promise<void> {
  await AsyncStorage.setItem(CONSENT_KEY, SMS_CONSENT_VERSION)
}

export async function revokeSmsConsent(): Promise<void> {
  await AsyncStorage.removeItem(CONSENT_KEY)
}
