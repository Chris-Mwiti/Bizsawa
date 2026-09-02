import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SyncStatusBadge } from "../components/SyncStatusBadge";

export default function SyncConflictsScreen() {
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.get("/sync/conflicts");
      setConflicts(res.data.conflicts || []);
    } catch (e: any) {
      Alert.alert("Error", e.friendlyMessage || "Failed to load conflicts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const resolve = async (id: string, resolution: "kept_client" | "kept_server") => {
    try {
      await api.post(`/sync/conflicts/${id}/resolve`, { resolution });
      Alert.alert("Resolved", `Kept ${resolution === "kept_client" ? "your version" : "server version"}`);
      fetch();
    } catch (e: any) {
      Alert.alert("Error", e.friendlyMessage || "Failed");
    }
  };

  if (loading) return <View className="flex-1 bg-gray-50 items-center justify-center"><ActivityIndicator color="#111827" /><Text className="text-sm text-gray-500 mt-2">Loading conflicts…</Text></View>;

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold tracking-widest text-gray-400 uppercase">{conflicts.length} unresolved</Text>
          <SyncStatusBadge status={conflicts.length ? "conflict" : "synced"} />
        </View>
        {conflicts.length === 0 ? (
          <Card className="border border-gray-200">
            <CardContent className="items-center py-12">
              <Text className="font-bold text-gray-900">No conflicts</Text>
              <Text className="text-sm text-gray-500 mt-1">All records in sync — no manual resolution needed.</Text>
            </CardContent>
          </Card>
        ) : (
          conflicts.map((c) => (
            <Card key={c.id} className="border border-amber-200">
              <CardHeader><CardTitle className="text-amber-900">Conflict • {c.table_name} • {c.record_id.slice(0, 6).toUpperCase()}</CardTitle></CardHeader>
              <CardContent className="gap-3">
                <View className="flex-row gap-2">
                  <View className="flex-1 p-3 bg-white rounded-xl border border-gray-200">
                    <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Your version (v{c.client_version})</Text>
                    <Text className="text-xs font-mono text-gray-700 mt-1" numberOfLines={6}>{JSON.stringify(c.client_payload, null, 2)}</Text>
                  </View>
                  <View className="flex-1 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Server version (v{c.server_version})</Text>
                    <Text className="text-xs font-mono text-gray-700 mt-1" numberOfLines={6}>{JSON.stringify(c.server_payload, null, 2)}</Text>
                  </View>
                </View>
                <View className="flex-row gap-3">
                  <TouchableOpacity onPress={() => resolve(c.id, "kept_client")} className="flex-1 py-3 rounded-xl bg-gray-900 items-center"><Text className="text-white font-bold text-sm">Keep mine</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => resolve(c.id, "kept_server")} className="flex-1 py-3 rounded-xl bg-white border border-gray-200 items-center"><Text className="font-bold text-sm text-gray-900">Keep server</Text></TouchableOpacity>
                </View>
              </CardContent>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}
