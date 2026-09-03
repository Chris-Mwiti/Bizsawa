import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, Animated, Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff, Wifi, CloudOff, CheckCircle2, X, RefreshCw, Trash2 } from 'lucide-react-native';
import { useSync } from '../sync/SyncProvider';
import { resetLocalDatabase, syncNow } from '../sync/client';

export function OfflineBanner() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [showOfflineCapabilities, setShowOfflineCapabilities] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const { state: syncState } = useSync();

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    NetInfo.fetch().then(s => setIsConnected(s.isConnected));
    return () => unsub();
  }, []);

  useEffect(() => {
    // Auto-hide offline capabilities hint after 8s
    if (showOfflineCapabilities) {
      const t = setTimeout(() => setShowOfflineCapabilities(false), 8000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (isConnected === false || showOfflineCapabilities) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: -100, duration: 250, useNativeDriver: true }).start();
    }
  }, [isConnected, showOfflineCapabilities]);

  if (dismissed && isConnected !== false && !showOfflineCapabilities) return null;

  const isOffline = isConnected === false;
  const showBanner = isOffline || showOfflineCapabilities;

  if (!showBanner) return null;

  return (
    <Animated.View
      style={{ transform: [{ translateY: slideAnim }], position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999 }}
      className="px-4 pt-12 pb-3"
      pointerEvents="auto"
    >
      <View
        className={`rounded-2xl border px-4 py-3 flex-row items-center gap-3 shadow-sm ${
          isOffline ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
        }`}
      >
        <View className={`w-9 h-9 rounded-xl items-center justify-center ${isOffline ? 'bg-amber-100' : 'bg-emerald-100'}`}>
          {isOffline ? (
            <WifiOff size={18} color="#b45309" />
          ) : (
            <CheckCircle2 size={18} color="#047857" />
          )}
        </View>

        <View className="flex-1">
          {isOffline ? (
            <>
              <Text className="text-sm font-bold text-amber-900">You are offline</Text>
              <Text className="text-xs text-amber-700 mt-0.5">Offline mode enabled — changes are saved locally and will sync when you reconnect.</Text>
              {syncState === 'syncing' || syncState === 'conflict' ? (
                <View className="flex-row items-center gap-1.5 mt-1">
                  <CloudOff size={12} color="#b45309" />
                  <Text className="text-[11px] font-bold tracking-widest text-amber-700 uppercase">
                    {syncState === 'syncing' ? 'Syncing…' : 'Conflicts need review'}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text className="text-sm font-bold text-emerald-900">Offline capabilities enabled</Text>
              <Text className="text-xs text-emerald-700 mt-0.5">Your data is available offline. Edits made without internet will sync automatically on reconnect.</Text>
              <View className="flex-row items-center gap-1.5 mt-1">
                <Wifi size={12} color="#047857" />
                <Text className="text-[11px] font-bold tracking-widest text-emerald-600 uppercase">Back online • Synced</Text>
              </View>
              {/* One-tap heal for 0/NaN corruption — local was poisoned by old pull bug, server is clean */}
              <View className="flex-row gap-2 mt-2">
                <Pressable
                  onPress={async () => {
                    try { await syncNow(); Alert.alert('Synced', 'Offline data refreshed from server'); } catch (e: any) { Alert.alert('Sync failed', e?.message || 'Try again'); }
                  }}
                  className="px-3 py-1.5 rounded-full bg-emerald-600 flex-row items-center gap-1.5"
                >
                  <RefreshCw size={12} color="#fff" />
                  <Text className="text-[11px] font-bold text-white">Refresh</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Alert.alert('Reset offline data?', 'This clears corrupted local data (0/NaN) and re-pulls from server. Offline changes not yet synced will be lost.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Reset', style: 'destructive', onPress: async () => {
                        try { await resetLocalDatabase(); await syncNow(); Alert.alert('Done', 'Local data cleared — display should now show correct values'); } catch (e: any) { Alert.alert('Failed', e?.message); }
                      }},
                    ]);
                  }}
                  className="px-3 py-1.5 rounded-full bg-white border border-emerald-200 flex-row items-center gap-1.5"
                >
                  <Trash2 size={12} color="#047857" />
                  <Text className="text-[11px] font-bold text-emerald-700">Reset local</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        <Pressable
          onPress={() => {
            if (isOffline) setDismissed(true);
            setShowOfflineCapabilities(false);
          }}
          className="w-8 h-8 rounded-full bg-white/60 items-center justify-center"
        >
          <X size={14} color={isOffline ? '#92400e' : '#065f46'} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// Compact inline indicator for header or card — shows sync status per connectivity
export function OfflineCapabilitiesChip() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener(s => setIsConnected(s.isConnected));
    return () => unsub();
  }, []);
  const isOffline = isConnected === false;
  return (
    <View className={`px-2.5 py-1 rounded-full border flex-row items-center gap-1.5 ${isOffline ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
      {isOffline ? <WifiOff size={12} color="#b45309" /> : <Wifi size={12} color="#6b7280" />}
      <Text className={`text-[10px] font-bold tracking-widest ${isOffline ? 'text-amber-700' : 'text-gray-500'}`}>
        {isOffline ? 'OFFLINE' : 'ONLINE'}
      </Text>
    </View>
  );
}
