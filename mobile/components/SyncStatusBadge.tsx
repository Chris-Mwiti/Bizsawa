import React from 'react'
import { View, Text } from 'react-native'
import { useSync } from '../sync/SyncProvider'

// Per-record sync status using Watermelon _status + conflicts table (§3.5, §4)
// _status: 'created'|'updated'|'deleted'|'synced' — we map to UI: synced / pending / conflict / failed
export function SyncStatusBadge({
  status,
}: {
  status: 'synced' | 'pending' | 'conflict' | 'failed'
}) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    synced: {
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-700',
      label: 'Synced',
    },
    pending: {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-700',
      label: 'Pending',
    },
    conflict: {
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      label: 'Conflict',
    },
    failed: {
      bg: 'bg-zinc-100 border-zinc-200',
      text: 'text-zinc-600',
      label: 'Failed',
    },
  }
  const s = map[status] || map.pending
  return (
    <View className={`px-2 py-1 rounded-full border ${s.bg}`}>
      <Text className={`font-geist-bold text-xs font-bold tracking-widest ${s.text}`}>
        {s.label}
      </Text>
    </View>
  )
}

export function GlobalSyncIndicator() {
  const { state, lastSyncAt } = useSync()
 return (
    <SyncStatusBadge
      status={state === 'online' && lastSyncAt ? 'synced' : (state as any)}
    />
  )
}
