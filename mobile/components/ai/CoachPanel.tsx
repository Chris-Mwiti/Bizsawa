import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useChat, type UIMessage } from '@tanstack/ai-react'
import { Q } from '@nozbe/watermelondb'
import { Bot, Mic, MicOff, Send, User } from 'lucide-react-native'
import Toast from 'react-native-toast-message'

import { answer } from '../../assistant/answer'
import { presentTool } from '../../assistant/present'
import type {
  AssistantAnswer,
  AssistantLocale,
  AssistantToolName,
} from '../../assistant/types'
import { createAssistantConnection } from '../../assistant/connection'
import { createWatermelonStore } from '../../assistant/watermelonStore'
import { createWatermelonChatPersistence } from '../../assistant/persistence'
import { getAssistantThreadId } from '../../assistant/thread'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { database } from '../../db/database'
import { CoachMessageMarkdown } from '../CoachMessageMarkdown'
import { AssistantCards } from './AssistantCards'

const recommendedQuestions = [
  { id: '1', label: 'Department overview', query: 'Give me an overview of my business performance' },
  { id: '2', label: 'Sales this month', query: 'How are my sales this month?' },
  { id: '3', label: 'Best performing product', query: 'Which is my best performing product?' },
  { id: '4', label: 'Profit & margins', query: 'What are my profit margins?' },
  { id: '5', label: 'Expenses by category', query: 'Show my expenses by category' },
  { id: '6', label: 'Losses', query: 'Where am I losing money?' },
  { id: '7', label: 'Best day of the week', query: 'Which day of the week performs best?' },
  { id: '8', label: 'Low stock alerts', query: 'What products are running low in stock?' },
]

function greeting(locale: AssistantLocale): string {
  return locale === 'sw'
    ? 'Habari! Mimi ni msaidizi wako wa biashara. Niulize kuhusu mauzo, matumizi, stoo, ankara, au wateja.'
    : "Hi! I'm your business assistant. Ask me about sales, expenses, inventory, invoices, or customers."
}

function initialMessages(locale: AssistantLocale): UIMessage[] {
  return [
    {
      id: 'assistant-greeting',
      role: 'assistant',
      createdAt: new Date(),
      parts: [{ type: 'text', content: greeting(locale) }],
    },
  ]
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function unwrapToolOutput(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value

  const record = value as Record<string, unknown>
  if ('status' in record && 'data' in record) return record.data

  return value
}

function parseToolContent(value: unknown): unknown {
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function toolAnswers(
  message: UIMessage,
  options: { locale: AssistantLocale; productNames: Record<string, string> },
): AssistantAnswer[] {
  const answers: AssistantAnswer[] = []
  const seen = new Set<string>()

  for (const part of message.parts) {
    if (part.type === 'tool-call' && part.output !== undefined) {
      seen.add(part.id)
      answers.push(
        presentTool(
          part.name as AssistantToolName,
          parseArgs(part.arguments),
          unwrapToolOutput(part.output),
          options,
        ),
      )
      continue
    }

    if (part.type === 'tool-result' && !seen.has(part.toolCallId)) {
      seen.add(part.toolCallId)
      answers.push(
        presentTool(
          (part.name ?? '') as AssistantToolName,
          {},
          unwrapToolOutput(parseToolContent(part.content)),
          options,
        ),
      )
    }
  }

  return answers.filter((answer) => answer.cards.length > 0 || answer.chart)
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join('\n')
    .trim()
}

export function CoachPanel() {
  const insets = useSafeAreaInsets()
  const { activeBusinessId } = useBusinessContext()
  const [inputMessage, setInputMessage] = useState('')
  const [language, setLanguage] = useState<AssistantLocale>('en')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [productNames, setProductNames] = useState<Record<string, string>>({})
  const [isListening] = useState(false)
  const scrollViewRef = useRef<ScrollView>(null)
  const languageRef = useRef(language)

  languageRef.current = language

  useEffect(() => {
    if (!activeBusinessId) {
      setThreadId(null)
      return
    }

    let cancelled = false
    getAssistantThreadId(activeBusinessId)
      .then((id) => {
        if (!cancelled) setThreadId(id)
      })
      .catch(() => {
        if (!cancelled) setThreadId(null)
      })

    return () => {
      cancelled = true
    }
  }, [activeBusinessId])

  useEffect(() => {
    if (!activeBusinessId) {
      setProductNames({})
      return
    }

    let cancelled = false
    database
      .get('products')
      .query(Q.where('business_id', activeBusinessId))
      .fetch()
      .then((rows: any[]) => {
        if (cancelled) return
        setProductNames(
          Object.fromEntries(rows.map((row) => [row.id, row.name])),
        )
      })
      .catch(() => {
        if (!cancelled) setProductNames({})
      })

    return () => {
      cancelled = true
    }
  }, [activeBusinessId])

  const connection = useMemo(
    () => createAssistantConnection(() => languageRef.current),
    [],
  )
  const persistence = useMemo(
    () =>
      activeBusinessId
        ? createWatermelonChatPersistence(activeBusinessId)
        : undefined,
    [activeBusinessId],
  )

  const { messages, sendMessage, append, isLoading, error } = useChat({
    connection,
    threadId: threadId ?? 'pending',
    persistence,
    initialMessages: initialMessages(language),
  })

  useEffect(() => {
    if (!error) return

    Toast.show({
      type: 'error',
      text1: 'Assistant unavailable',
      text2: error.message || 'Failed to get a response',
    })
  }, [error])

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true })
    }, 100)

    return () => clearTimeout(timeout)
  }, [messages, isLoading])

  const store = useMemo(
    () =>
      activeBusinessId
        ? createWatermelonStore(database, activeBusinessId)
        : null,
    [activeBusinessId],
  )

  const handleSend = async () => {
    const text = inputMessage.trim()
    if (!text || isLoading) return

    setInputMessage('')

    try {
      await sendMessage(text, { body: { language } })
    } catch (sendError: any) {
      // The deterministic core answers from the local mirror when the
      // network or LLM is unavailable. The cards ride in message metadata so
      // they survive a reload with the transcript.
      if (store) {
        try {
          const offline = await answer(text, { store, locale: language })
          await append({
            id: `offline-${Date.now()}`,
            role: 'assistant',
            createdAt: new Date(),
            metadata: { assistantAnswer: offline },
            parts: [{ type: 'text', content: offline.text }],
          })
          Toast.show({
            type: 'info',
            text1: 'Offline answer',
            text2: 'Showing the latest data saved on this device.',
          })

          return
        } catch {
          // Fall through to the transport error below.
        }
      }

      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: sendError?.message || 'Failed to send message',
      })
    }
  }

  const handleQuickAction = (query: string) => {
    setInputMessage(query)
    void handleSend()
  }

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'sw' : 'en'))
    Toast.show({
      type: 'success',
      text1: 'Language changed',
      text2:
        language === 'en' ? 'Switched to Kiswahili' : 'Switched to English',
    })
  }

  const handleVoiceInput = () => {
    Toast.show({
      type: 'info',
      text1: 'Voice input',
      text2: 'Voice input is coming in a later update. Please type for now.',
    })
  }

  const renderToolAnswers = (message: UIMessage) => {
    const answers = toolAnswers(message, { locale: language, productNames })

    return answers.map((answer, index) => (
      <AssistantCards key={`${message.id}-tool-${index}`} answer={answer} />
    ))
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f9fafb' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View className='flex-row justify-center space-x-2 border-b border-gray-100 bg-white py-2'>
        <TouchableOpacity
          onPress={toggleLanguage}
          accessibilityRole='button'
          accessibilityState={{ selected: language === 'en' }}
          className={`rounded-full px-4 py-1.5 ${language === 'en' ? 'bg-accent' : 'bg-gray-100'}`}
        >
          <Text
            className={`font-geist-medium text-xs font-medium ${language === 'en' ? 'text-white' : 'text-gray-900'}`}
          >
            English
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleLanguage}
          accessibilityRole='button'
          accessibilityState={{ selected: language === 'sw' }}
          className={`rounded-full px-4 py-1.5 ${language === 'sw' ? 'bg-accent' : 'bg-gray-100'}`}
        >
          <Text
            className={`font-geist-medium text-xs font-medium ${language === 'sw' ? 'text-white' : 'text-gray-900'}`}
          >
            Kiswahili
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        className='flex-1 px-4 pt-4'
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
        keyboardShouldPersistTaps='handled'
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        bounces
        overScrollMode='never'
        decelerationRate='normal'
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior='automatic'
        automaticallyAdjustKeyboardInsets
        automaticallyAdjustContentInsets={false}
        alwaysBounceVertical={false}
      >
        {messages.map((message) => {
          const isBot = message.role === 'assistant'
          const text = messageText(message)

          return (
            <View
              key={message.id}
              className={`mb-4 flex-row ${isBot ? 'justify-start' : 'justify-end'}`}
            >
              {isBot && (
                <View className='mr-2 h-11 w-11 items-center justify-center rounded-full bg-accent'>
                  <Bot size={16} color='white' />
                </View>
              )}
              <View
                className={`max-w-[84%] rounded-2xl p-3 ${
                  isBot
                    ? 'rounded-tl-none border border-gray-200 bg-white'
                    : 'rounded-tr-none bg-accent'
                }`}
              >
                {text ? (
                  isBot ? (
                    <CoachMessageMarkdown content={text} />
                  ) : (
                    <Text className='font-sans text-sm text-white'>{text}</Text>
                  )
                ) : null}
                {isBot ? renderToolAnswers(message) : null}
                {isBot && message.metadata?.assistantAnswer ? (
                  <AssistantCards
                    answer={message.metadata.assistantAnswer as AssistantAnswer}
                  />
                ) : null}
                <Text
                  className={`mt-1 font-sans text-xs ${
                    isBot ? 'text-gray-500' : 'text-right text-primary-200'
                  }`}
                >
                  {new Date(message.createdAt ?? Date.now()).toLocaleTimeString(
                    'en-KE',
                    { hour: '2-digit', minute: '2-digit' },
                  )}
                </Text>
              </View>
              {!isBot && (
                <View className='ml-2 h-11 w-11 items-center justify-center rounded-full bg-gray-500'>
                  <User size={16} color='white' />
                </View>
              )}
            </View>
          )
        })}

        {isLoading && (
          <View className='mb-4 flex-row justify-start'>
            <View className='mr-2 h-11 w-11 items-center justify-center rounded-full bg-accent'>
              <Bot size={16} color='white' />
            </View>
            <View className='rounded-2xl rounded-tl-none border border-gray-200 bg-white p-4'>
              <ActivityIndicator size='small' color='#006B5F' />
            </View>
          </View>
        )}
      </ScrollView>

      <View className='pb-2 px-4 border-b border-gray-100 bg-white'>
        <Text className='font-sans text-[10px] font-bold text-ink-muted mb-1.5 ml-1'>
          Recommended questions
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
        >
          {recommendedQuestions.map((q) => (
            <TouchableOpacity
              key={q.id}
              onPress={() => handleQuickAction(q.query)}
              disabled={isLoading}
              className={`rounded-full border border-hairline bg-paper px-3 py-1.5 ${
                isLoading ? 'opacity-60' : ''
              }`}
            >
              <Text
                className={`font-sans text-xs font-medium ${
                  isLoading ? 'text-gray-400' : 'text-ink'
                }`}
              >
                {q.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View
        className='flex-row items-center border-t border-gray-200 bg-white p-3'
        style={{
          paddingBottom: Math.max(12, insets.bottom + 8),
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          elevation: 8,
        }}
      >
        <TouchableOpacity
          onPress={handleVoiceInput}
          accessibilityRole='button'
          accessibilityLabel='Voice input'
          className='mr-2 h-10 w-10 items-center justify-center rounded-full bg-gray-100'
        >
          {isListening ? (
            <MicOff size={18} color='#ef4444' />
          ) : (
            <Mic size={18} color='#6b7280' />
          )}
        </TouchableOpacity>
        <TextInput
          className='mr-2 flex-1 rounded-full bg-gray-100 px-4 py-3 text-sm text-gray-800'
          placeholder={
            language === 'sw'
              ? 'Andika ujumbe wako...'
              : 'Type your message...'
          }
          value={inputMessage}
          onChangeText={setInputMessage}
          onSubmitEditing={handleSend}
          multiline
          blurOnSubmit={false}
          returnKeyType='send'
          editable={!isLoading}
          accessibilityLabel='Message'
        />
        <TouchableOpacity
          onPress={handleSend}
          accessibilityRole='button'
          accessibilityLabel='Send message'
          disabled={isLoading || inputMessage.trim().length === 0}
          className={`h-12 w-12 items-center justify-center rounded-full shadow-md ${
            isLoading || inputMessage.trim().length === 0
              ? 'bg-gray-300'
              : 'bg-accent active:opacity-90'
          }`}
        >
          <Send size={18} color='white' />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
