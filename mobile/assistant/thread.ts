import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'

const THREAD_KEY_PREFIX = 'bizsawa.assistant.thread.'

export async function getAssistantThreadId(businessId: string): Promise<string> {
  const key = `${THREAD_KEY_PREFIX}${businessId}`
  const existing = await AsyncStorage.getItem(key)
  if (existing) return existing

  const threadId = randomUUID()
  await AsyncStorage.setItem(key, threadId)

  return threadId
}
