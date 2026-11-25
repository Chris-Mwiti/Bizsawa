import { randomUUID } from 'expo-crypto'
import type {
  ChatClientPersistence,
  ChatPersistedState,
} from '@tanstack/ai-react'
import { getPowerSyncDatabase } from '../sync/powersync'
import { isPowerSyncEnabledForPlatform } from '../sync/powersync/config'

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
  const db = getPowerSyncDatabase()

  async function findState(threadId: string): Promise<string | null> {
    if (!isPowerSyncEnabledForPlatform()) return null
    const rows: any[] = await db.getAll(
      'SELECT state FROM assistant_threads WHERE business_id = ? AND thread_id = ?',
      [businessId, threadId],
    )
    return rows[0]?.state ?? null
  }

  return {
    async getItem(threadId) {
      try {
        const raw = await findState(threadId)
        return raw ? reviveState(raw) : undefined
      } catch {
        return undefined
      }
    },

    async setItem(threadId, state) {
      try {
        if (!isPowerSyncEnabledForPlatform()) return
        const serialized = JSON.stringify(state)
        const now = Date.now()
        const existing = await findState(threadId)
        if (existing !== null) {
          await db.execute(
            'UPDATE assistant_threads SET state = ?, updated_at_ms = ? WHERE business_id = ? AND thread_id = ?',
            [serialized, now, businessId, threadId],
          )
        } else {
          await db.execute(
            'INSERT INTO assistant_threads (id, business_id, thread_id, state, updated_at_ms) VALUES (?, ?, ?, ?, ?)',
            [randomUUID(), businessId, threadId, serialized, now],
          )
        }
      } catch {
        // Persistence is best-effort; a failed write must not break the chat.
      }
    },

    async removeItem(threadId) {
      try {
        if (!isPowerSyncEnabledForPlatform()) return
        await db.execute(
          'DELETE FROM assistant_threads WHERE thread_id = ? AND business_id = ?',
          [threadId, businessId],
        )
      } catch {
        // Best-effort.
      }
    },
  }
}
