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
  Wifi,
  WifiOff,
  CheckCircle2,
  X,
  RefreshCw,
  Trash2,
  AlertTriangle,
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
  const [expanded, setExpanded] = useState(false)
  const slideAnim = useRef(new Animated.Value(-60)).current
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
        toValue: -60,
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

  // Toast mode: compact floating pill centered at the top of each page.
  // Overlays content (absolute) instead of pushing layout down, single-line
  // text, small icon. Tap to expand details + recovery actions.
  const topOffset = Math.max(insets.top, Platform.OS === 'ios' ? 12 : 8) + 4

  const pillTone = isOffline
    ? 'bg-ink text-ink-inverse'
    : showRecovery
      ? 'bg-white border border-orange-200'
      : 'bg-white border border-hairline'
  const pillIcon = isOffline ? (
    <WifiOff size={14} color='#FFFFFF' />
  ) : showRecovery ? (
    <AlertTriangle size={14} color='#c2410c' />
  ) : (
    <CheckCircle2 size={14} color='#047857' />
  )
  const pillText = isOffline
    ? pendingCount > 0
      ? `Offline • ${pendingCount} saved locally`
      : 'Offline • saving locally'
    : showRecovery
      ? pendingCount > 0 && conflictCount > 0
        ? `Back online • ${pendingCount} to sync • ${conflictCount} conflicts`
        : pendingCount > 0
          ? `Back online • ${pendingCount} to sync`
          : `Back online • ${conflictCount} conflict${conflictCount === 1 ? '' : 's'}`
      : 'Offline mode ready'
  const pillTextColor = isOffline
    ? 'text-ink-inverse'
    : showRecovery
      ? 'text-orange-900'
      : 'text-ink'

  const dismiss = () => {
    if (isOffline) setDismissed(true)
    if (showRecovery) setShowRecovery(false)
    setShowOfflineCapabilities(false)
    setExpanded(false)
  }

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: topOffset,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 50,
        transform: [{ translateY: slideAnim }],
        opacity: slideAnim.interpolate({
          inputRange: [-60, 0],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }) as any,
      }}
      pointerEvents='box-none'
    >
      <View className='px-4 w-full items-center' pointerEvents='box-none'>
        <View
          className={`flex-row items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full shadow-clinical-sm ${pillTone}`}
          style={{ maxWidth: 360 }}
        >
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole='button'
            accessibilityLabel={pillText}
            className='flex-row items-center gap-2 flex-1'
            style={{ minHeight: 32 }}
          >
            <View
              className={`w-7 h-7 rounded-full items-center justify-center shrink-0 ${
                isOffline
                  ? 'bg-white/15'
                  : showRecovery
                    ? 'bg-orange-100'
                    : 'bg-emerald-100'
              }`}
            >
              {pillIcon}
            </View>
            <Text
              className={`font-geist-bold text-xs font-bold flex-1 ${pillTextColor}`}
              numberOfLines={1}
            >
              {pillText}
            </Text>
          </Pressable>
          <Pressable
            onPress={dismiss}
            accessibilityRole='button'
            accessibilityLabel='Dismiss'
            className='w-8 h-8 rounded-full items-center justify-center'
            hitSlop={8}
          >
            <X
              size={13}
              color={
                isOffline ? '#FFFFFF' : showRecovery ? '#7c2d12' : '#4F625E'
              }
            />
          </Pressable>
        </View>

        {/* Expanded details — only on tap, keeps the toast compact */}
        {expanded ? (
          <View className='mt-2 bg-surface rounded-3xl border border-hairline shadow-clinical-sm px-4 py-3 w-full' style={{ maxWidth: 360 }}>
            {isOffline ? (
              <Text className='font-sans text-xs text-ink-muted'>
                Changes are saved on this device and will sync when you
                reconnect.
                {syncState === 'syncing'
                  ? ' Syncing…'
                  : syncState === 'conflict'
                    ? ' Some items need review.'
                    : ''}
              </Text>
            ) : showRecovery ? (
              <>
                <Text className='font-sans text-xs text-ink-muted'>
                  {pendingCount > 0 && conflictCount > 0
                    ? `${pendingCount} local change${pendingCount === 1 ? '' : 's'} to push • ${conflictCount} conflict${conflictCount === 1 ? '' : 's'} to resolve.`
                    : pendingCount > 0
                      ? `${pendingCount} local change${pendingCount === 1 ? '' : 's'} waiting to sync to the server.`
                      : `${conflictCount} conflict${conflictCount === 1 ? '' : 's'} need${conflictCount === 1 ? 's' : ''} resolution.`}
                </Text>
                <View className='flex-row gap-2 mt-2'>
                  {conflictCount > 0 ? (
                    <Pressable
                      onPress={() => {
                        try { router?.push('/sync-conflicts' as any) } catch {}
                        setShowRecovery(false)
                        setExpanded(false)
                      }}
                      className='flex-1 py-2.5 rounded-full bg-neg flex-row items-center justify-center gap-1.5'
                    >
                      <AlertTriangle size={13} color='#fff' />
                      <Text className='font-geist-bold text-xs font-bold text-white'>
                        Resolve ({conflictCount})
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={handleRefresh}
                    disabled={isRefreshing || isResetting}
                    className={`flex-1 py-2.5 rounded-full flex-row items-center justify-center gap-1.5 ${
                      isRefreshing ? 'bg-orange-200' : 'bg-orange-600 active:bg-orange-700'
                    }`}
                  >
                    {isRefreshing ? (
                      <ActivityIndicator size='small' color='#fff' />
                    ) : (
                      <RefreshCw size={13} color='#fff' />
                    )}
                    <Text className='font-geist-bold text-xs font-bold text-white'>
                      {isRefreshing ? 'Refreshing…' : 'Refresh'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleReset}
                    disabled={isRefreshing || isResetting}
                    className='py-2.5 px-3 rounded-full bg-white border border-orange-200 flex-row items-center justify-center gap-1.5'
                  >
                    {isResetting ? (
                      <ActivityIndicator size='small' color='#c2410c' />
                    ) : (
                      <Trash2 size={13} color='#c2410c' />
                    )}
                    <Text className='font-geist-bold text-xs font-bold text-orange-700'>
                      {isResetting ? '…' : 'Reset'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text className='font-sans text-xs text-ink-muted'>
                Your data is available offline. Edits made without internet
                sync automatically on reconnect.
              </Text>
            )}
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
