// Offline-first SMS capture queue. Parsed SMS becomes an IngestItem stored
// in AsyncStorage, flushed in batches of ≤50 to POST /payments/ingest when
// online. Per-item client_event_id gives idempotent retry; backend merge
// semantics (created/duplicate/merged/disputed) all ack the item.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'
import { api } from '../api'
import type { SmsIngestItem } from './types'

const QUEUE_KEY = 'bizsawa_sms_capture_queue'
export const SMS_INGEST_BATCH = 50

export async function getSmsQueue(): Promise<SmsIngestItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function setSmsQueue(items: SmsIngestItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items))
}

export async function enqueueSmsItem(item: SmsIngestItem): Promise<void> {
  const q = await getSmsQueue()
  if (q.some((i) => i.client_event_id === item.client_event_id)) return
  q.push(item)
  await setSmsQueue(q)
}

export function newClientEventId(): string {
  try {
    return randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

interface IngestResultRow {
  client_event_id?: string
  clientEventId?: string
  result: string
}

function isAcked(result: string): boolean {
  // created/duplicate/merged/disputed: server has the record — drop locally.
  // rejected (validation): drop too, it will never succeed on retry.
  return ['created', 'duplicate', 'merged', 'disputed', 'rejected'].includes(result)
}

export async function flushSmsQueue(): Promise<{
  sent: number
  acked: number
  remaining: number
}> {
  const queue = await getSmsQueue()
  if (!queue.length) return { sent: 0, acked: 0, remaining: 0 }
  let acked = 0
  let sent = 0
  let remaining = [...queue]
  for (let i = 0; i < queue.length; i += SMS_INGEST_BATCH) {
    const batch = queue.slice(i, i + SMS_INGEST_BATCH)
    sent += batch.length
    const res = await api.post<{ results: IngestResultRow[] } | IngestResultRow[]>(
      '/payments/ingest',
      batch,
    )
    const data: any = res.data
    const results: IngestResultRow[] = Array.isArray(data) ? data : data.results || data.data || []
    const ackedIds = new Set(
      results.filter((r) => isAcked(r.result)).map((r) => r.client_event_id ?? r.clientEventId),
    )
    remaining = remaining.filter(
      (item) => !ackedIds.has(item.client_event_id) || !batch.some((b) => b.client_event_id === item.client_event_id),
    )
    // Items in this batch that the server acked are removed; anything else
    // (internal errors, network mid-batch) stays for the next flush.
    remaining = remaining.filter((item) => {
      if (!batch.some((b) => b.client_event_id === item.client_event_id)) return true
      return !ackedIds.has(item.client_event_id)
    })
    acked += ackedIds.size
    await setSmsQueue(remaining)
  }
  return { sent, acked, remaining: remaining.length }
}

export async function getSmsQueueCount(): Promise<number> {
  return (await getSmsQueue()).length
}
