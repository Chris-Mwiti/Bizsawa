import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  message: string
  history: ChatMessage[]
  language?: 'en' | 'sw'
}

export interface ChatResponse {
  response: string
  history: ChatMessage[]
  businessId?: string
  success: boolean
}

export const useChat = () => {
  return useMutation({
    mutationFn: async (data: ChatRequest) => {
      // Free-tier LLM + tool loop can take a minute across model failovers;
      // the global 30s api timeout would abort healthy-but-slow replies.
      const response = await api.post<ChatResponse>('/chatbot/chat', data, {
        timeout: 90000,
      })
      return response.data
    },
  })
}
