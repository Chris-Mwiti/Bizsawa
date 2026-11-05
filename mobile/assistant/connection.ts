import { xhrHttpStream } from '@tanstack/ai-react'
import { getApiAuthHeaders, getApiRoot } from '../lib/api'
import type { AssistantLocale } from './types'

export function createAssistantConnection(locale: () => AssistantLocale) {
  return xhrHttpStream(
    () => `${getApiRoot()}/chat/stream`,
    async () => ({
      headers: await getApiAuthHeaders(),
      body: { language: locale() },
    }),
  )
}
