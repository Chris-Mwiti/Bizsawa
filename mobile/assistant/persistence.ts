import { Q } from '@nozbe/watermelondb'
import type {
  ChatClientPersistence,
  ChatPersistedState,
} from '@tanstack/ai-react'
import { database } from '../db/database'
import AssistantThread from '../db/models/AssistantThread'

function reviveState(raw: string): ChatPersistedState | null {
  try {
    const parsed = JSON.parse(raw) as ChatPersistedState
    if (!Array.isArray(parsed?.messages)) return null

    parsed.messages = parsed.messages.map((message) => ({
      ...message,
      createdAt: message.createdAt
        ? new Date(message.createdAt as unknown as string)
        : undefined,
      parts: message.parts?.map((part) =>
        'createdAt' in part && part.createdAt
          ? { ...part, createdAt: new Date(part.createdAt as unknown as string) }
          : part,
      ),
    })) as ChatPersistedState['messages']

    return parsed
  } catch {
    return null
  }
}

export function createWatermelonChatPersistence(
  businessId: string,
): ChatClientPersistence {
  const collection = database.get<AssistantThread>('assistant_threads')

  async function find(threadId: string): Promise<AssistantThread | undefined> {
    const rows = await collection
      .query(
        Q.where('business_id', businessId),
        Q.where('thread_id', threadId),
      )
      .fetch()

    return rows[0]
  }

  return {
    async getItem(threadId) {
      try {
        const row = await find(threadId)
        return row ? reviveState(row.state) : undefined
      } catch {
        return undefined
      }
    },

    async setItem(threadId, state) {
      try {
        const serialized = JSON.stringify(state)
        const existing = await find(threadId)

        await database.write(async () => {
          if (existing) {
            await existing.update((record) => {
              record.state = serialized
              record.updatedAtMs = Date.now()
            })
            return
          }

          await collection.create((record) => {
            record.businessId = businessId
            record.threadId = threadId
            record.state = serialized
            record.updatedAtMs = Date.now()
          })
        })
      } catch {
        // Persistence is best-effort; a failed write must not break the chat.
      }
    },

    async removeItem(threadId) {
      try {
        const row = await find(threadId)
        if (!row) return

        await database.write(async () => {
          await row.destroyPermanently()
        })
      } catch {
        // Best-effort.
      }
    },
  }
}
