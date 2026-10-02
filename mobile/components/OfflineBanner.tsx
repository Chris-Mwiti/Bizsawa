import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  Animated,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import NetInfo from '@react-native-community/netinfo'
import {
  WifiOff,
  Wifi,
  CloudOff,
  CheckCircle2,
  X,
  RefreshCw,
  Trash2,
  AlertTriangle,
  ArrowLeftRight,
} from 'lucide-react-native'
import { useSync } from '../sync/SyncProvider'
import { resetLocalDatabase, syncNow, refreshFromRemote } from '../sync/client'
import { useRouter } from 'expo-router'

export function OfflineBanner() {
  const router = (() => { try { return useRouter() } catch { return null as any } })()
  const insets = useSafeAreaInsets()
  const [isConnected, setIsConnected] = useState<boolean | null>(true)
  const [showOfflineCapabilities, setShowOfflineCapabilities] = useState(true)
  const [showRecovery, setShowRecovery] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const slideAnim = useRef(new Animated.Value(-100)).current
  const prevConnectedRef = useRef<boolean | null>(true)

  const {
    state: syncState,
    pendingCount,
    conflictCount,
    refreshCounts,
  } = useSync()

  // Track connectivity + detect reconnect
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const now = state.isConnected ?? false
      const wasOffline = prevConnectedRef.current === false
      prevConnectedRef.current = now
      setIsConnected(now)

      // When coming back online, check for pending/conflicts and show recovery banner
      if (now && wasOffline) {
        refreshCounts().then(() => {
          // Delay to let counts update
          setTimeout(async () => {
            const { getPendingChangesCount, getConflictsCount } = await import(
              '../sync/client'
            )
            const [pending, conflicts] = await Promise.all([
              getPendingChangesCount(),
              getConflictsCount(),
            ])
            if (pending > 0 || conflicts > 0) {
              setShowRecovery(true)
              setDismissed(false)
            }
          }, 400)
        })
      }
    })

    NetInfo.fetch().then((s) => setIsConnected(s.isConnected ?? false))

    return () => unsub()
  }, [isConnected, refreshCounts])

  // Also show recovery if pending/conflicts exist while online (e.g. after failed sync)
  useEffect(() => {
    if (isConnected && (pendingCount > 0 || conflictCount > 0)) {
      // Don't auto-show on first mount if user never went offline — only after reconnect or conflict state
      if (syncState === 'conflict' || showRecovery) {
        setShowRecovery(true)
      }
    }
  }, [isConnected, pendingCount, conflictCount, syncState, showRecovery])

  useEffect(() => {
    if (showOfflineCapabilities) {
      const t = setTimeout(() => setShowOfflineCapabilities(false), 8000)
      return () => clearTimeout(t)
    }
  }, [showOfflineCapabilities])

  useEffect(() => {
    const shouldShow =
      isConnected === false || showOfflineCapabilities || showRecovery

    if (shouldShow) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start()
    } else {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }).start()
    }
  }, [isConnected, showOfflineCapabilities, showRecovery, slideAnim])

  // Reset dismissed when recovery appears
  useEffect(() => {
    if (showRecovery) setDismissed(false)
  }, [showRecovery])

  if (
    dismissed &&
    isConnected !== false &&
    !showOfflineCapabilities &&
    !showRecovery
  )
    return null

  const isOffline = isConnected === false
  const showBanner = isOffline || showOfflineCapabilities || showRecovery

  if (!showBanner) return null

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshFromRemote()
      await refreshCounts()
      Alert.alert(
        'Refreshed',
        'Data refreshed from server. Local changes were kept and will sync.',
      )
      if (pendingCount === 0 && conflictCount === 0) {
        setShowRecovery(false)
      }
    } catch (e: any) {
      Alert.alert(
        'Sync failed',
        e?.message || 'Could not refresh from server. Try again.',
      )
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleReset = () => {
    Alert.alert(
      'Reset local store?',
      `This clears all offline data and re-pulls from the server.\n\n` +
        `Pending: ${pendingCount} change${pendingCount === 1 ? '' : 's'}\n` +
        `Conflicts: ${conflictCount}\n\n` +
        `Offline changes not yet synced will be lost. Continue?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true)
            try {
              await resetLocalDatabase()
              await syncNow()
              await refreshCounts()
              Alert.alert(
                'Done',
                'Local store cleared and re-synced from server.',
              )
              setShowRecovery(false)
            } catch (e: any) {
              Alert.alert('Failed', e?.message || 'Reset failed')
            } finally {
              setIsResetting(false)
            }
          },
        },
      ],
    )
  }

  // Inline mode: flows in layout, pushes content down instead of overlaying
  const topPadding = Math.max(insets.top, Platform.OS === 'ios' ? 12 : 8)
  return (
    <Animated.View
      style={{
        transform: [{ translateY: slideAnim }],
        position: 'relative',
        zIndex: 1,
        width: '100%',
        // Collapse when hidden via height animation - keep transform for slide
        opacity: slideAnim.interpolate({
          inputRange: [-100, 0],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }) as any,
      }}
      className='px-4 pb-3'
      pointerEvents='auto'
    >
      <View style={{ height: topPadding }} />
      <View
        className={`rounded-2xl border px-4 py-3 shadow-sm ${
          isOffline
            ? 'bg-amber-50 border-amber-200'
            : showRecovery
              ? 'bg-orange-50 border-orange-200'
              : 'bg-emerald-50 border-emerald-200'
        }`}
      >
        {/* Header row */}
        <View className='flex-row items-center gap-3'>
          <View
            className={`w-11 h-11 rounded-2xl items-center justify-center ${
              isOffline
                ? 'bg-amber-100'
                : showRecovery
                  ? 'bg-orange-100'
                  : 'bg-emerald-100'
            }`}
          >
            {isOffline ? (
              <WifiOff size={18} color='#b45309' />
            ) : showRecovery ? (
              <AlertTriangle size={18} color='#c2410c' />
            ) : (
              <CheckCircle2 size={18} color='#047857' />
            )}
          </View>

          <View className='flex-1'>
            {isOffline ? (
              <>
                <Text className='font-geist-bold text-sm font-bold text-amber-900'>
                  You are offline
                </Text>
                <Text className='font-sans text-xs text-amber-700 mt-0.5'>
                  Offline mode enabled — changes are saved locally and will sync
                  when you reconnect.
                </Text>
                {syncState === 'syncing' || syncState === 'conflict' ? (
                  <View className='flex-row items-center gap-2 mt-1'>
                    <CloudOff size={12} color='#b45309' />
                    <Text className='font-geist-bold text-xs font-bold tracking-widest text-amber-700 uppercase'>
                      {syncState === 'syncing'
                        ? 'Syncing…'
                        : 'Conflicts need review'}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : showRecovery ? (
              <>
                <Text className='font-geist-bold text-sm font-bold text-orange-900'>
                  Back online — sync needed
                </Text>
                <Text className='font-sans text-xs text-orange-700 mt-0.5'>
                  {pendingCount > 0 && conflictCount > 0
                    ? `${pendingCount} local change${pendingCount === 1 ? '' : 's'} to push • ${conflictCount} conflict${conflictCount === 1 ? '' : 's'} to resolve`
                    : pendingCount > 0
                      ? `${pendingCount} local change${pendingCount === 1 ? '' : 's'} waiting to sync to server`
                      : `${conflictCount} conflict${conflictCount === 1 ? '' : 's'} need${conflictCount === 1 ? 's' : ''} resolution`}
                </Text>
                <View className='flex-row items-center gap-2 mt-1'>
                  <ArrowLeftRight size={12} color='#c2410c' />
                  <Text className='font-geist-bold text-xs font-bold tracking-widest text-orange-600 uppercase'>
                    Choose how to continue
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text className='font-geist-bold text-sm font-bold text-emerald-900'>
                  Offline capabilities enabled
                </Text>
                <Text className='font-sans text-xs text-emerald-700 mt-0.5'>
                  Your data is available offline. Edits made without internet
                  will sync automatically on reconnect.
                </Text>
                <View className='flex-row items-center gap-2 mt-1'>
                  <Wifi size={12} color='#047857' />
                  <Text className='font-geist-bold text-xs font-bold tracking-widest text-emerald-600 uppercase'>
                    Back online • Synced
                  </Text>
                </View>
              </>
            )}
          </View>

          <Pressable
            onPress={() => {
              if (isOffline) setDismissed(true)
              if (showRecovery) setShowRecovery(false)
              setShowOfflineCapabilities(false)
            }}
            className='w-11 h-11 rounded-full bg-white/60 items-center justify-center'
          >
            <X
              size={14}
              color={
                isOffline ? '#92400e' : showRecovery ? '#7c2d12' : '#065f46'
              }
            />
          </Pressable>
        </View>

        {/* Recovery actions — only when back online with pending/conflicts */}
        {showRecovery && !isOffline ? (
          <View className='mt-3 pt-3 border-t border-orange-200 gap-2'>
            {conflictCount > 0 ? (
              <Pressable
                onPress={() => {
                  try { router?.push('/sync-conflicts' as any) } catch {}
                  setShowRecovery(false)
                }}
                className='py-3 rounded-full bg-red-600 flex-row items-center justify-center gap-2 active:bg-red-700'
              >
                <AlertTriangle size={14} color='#fff' />
                <Text className='font-geist-bold text-xs font-bold text-white'>
                  Resolve {conflictCount} conflict{conflictCount === 1 ? '' : 's'} →
                </Text>
              </Pressable>
            ) : null}
            <View className='flex-row gap-2'>
              <Pressable
                onPress={handleRefresh}
                disabled={isRefreshing || isResetting}
                className={`flex-1 py-3 rounded-full flex-row items-center justify-center gap-2 ${
                  isRefreshing
                    ? 'bg-orange-200'
                    : 'bg-orange-600 active:bg-orange-700'
                }`}
              >
                {isRefreshing ? (
                  <ActivityIndicator size='small' color='#fff' />
                ) : (
                  <RefreshCw size={14} color='#fff' />
                )}
                <Text className='font-geist-bold text-xs font-bold text-white'>
                  {isRefreshing ? 'Refreshing…' : 'Refresh from server'}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleReset}
                disabled={isRefreshing || isResetting}
                className={`flex-1 py-3 rounded-full border flex-row items-center justify-center gap-2 ${
                  isResetting
                    ? 'bg-gray-100 border-gray-200'
                    : 'bg-white border-orange-200 active:bg-orange-50'
                }`}
              >
                {isResetting ? (
                  <ActivityIndicator size='small' color='#c2410c' />
                ) : (
                  <Trash2 size={14} color='#c2410c' />
                )}
                <Text className='font-geist-bold text-xs font-bold text-orange-700'>
                  {isResetting ? 'Resetting…' : 'Reset local store'}
                </Text>
              </Pressable>
            </View>

            <Text className='font-sans text-xs text-orange-600 text-center'>
              Refresh pulls latest server data and pushes pending changes. Reset
              clears local and re-pulls — use if data looks corrupted.
            </Text>
          </View>
        ) : null}
        {conflictCount > 0 && !showRecovery && !isOffline ? (
          <Pressable
            onPress={() => { try { router?.push('/sync-conflicts' as any) } catch {} }}
            className='mt-2 py-2 rounded-full bg-red-50 border border-red-200 flex-row items-center justify-center gap-2'
          >
            <AlertTriangle size={12} color='#dc2626' />
            <Text className='font-geist-bold text-xs font-bold tracking-widest text-red-700'>
              {conflictCount} CONFLICT{conflictCount===1?'':'S'} — TAP TO RESOLVE
            </Text>
          </Pressable>
        ) : null}

        {/* Gentle offline heal actions (always when online, no pending) */}
        {!showRecovery && !isOffline ? (
          <View className='flex-row gap-2 mt-2'>
            <Pressable
              onPress={async () => {
                try {
                  await syncNow()
                  Alert.alert('Synced', 'Offline data refreshed from server')
                } catch (e: any) {
                  Alert.alert('Sync failed', e?.message || 'Try again')
                }
              }}
              className='px-3 py-1.5 rounded-full bg-emerald-600 flex-row items-center gap-2'
            >
              <RefreshCw size={12} color='#fff' />
              <Text className='font-geist-bold text-xs font-bold text-white'>Refresh</Text>
            </Pressable>

            <Pressable
              onPress={() =>
                Alert.alert(
                  'Reset offline data?',
                  'This clears local data and re-pulls from server. Offline changes not yet synced will be lost.',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                    },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await resetLocalDatabase()
                          await syncNow()
                          Alert.alert('Done', 'Local data cleared')
                        } catch (e: any) {
                          Alert.alert('Failed', e?.message)
                        }
                      },
                    },
                  ],
                )
              }
              className='px-3 py-1.5 rounded-full bg-white border border-emerald-200 flex-row items-center gap-2'
            >
              <Trash2 size={12} color='#047857' />
              <Text className='font-geist-bold text-xs font-bold text-emerald-700'>
                Reset local
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

// Compact inline indicator for header or card — shows sync status per connectivity
export function OfflineCapabilitiesChip() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true)

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsConnected(s.isConnected))
    return () => unsub()
  }, [])

  const isOffline = isConnected === false

  return (
    <View
      className={`px-3 py-1 rounded-full border flex-row items-center gap-2 ${
        isOffline ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
      }`}
    >
      {isOffline ? (
        <WifiOff size={12} color='#b45309' />
      ) : (
        <Wifi size={12} color='#6b7280' />
      )}
      <Text
        className={`font-geist-bold text-xs font-bold tracking-widest ${
          isOffline ? 'text-amber-700' : 'text-gray-500'
        }`}
      >
        {isOffline ? 'OFFLINE' : 'ONLINE'}
      </Text>
    </View>
  )
}
