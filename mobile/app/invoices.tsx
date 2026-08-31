import React, { useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, Pressable, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { Plus, ChevronLeft, ChevronRight, Send, MessageSquare, Clock, CheckCircle, AlertCircle, XCircle } from "lucide-react-native";
import { router } from "expo-router";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { useInvoices } from "../hooks/api/useInvoices";
import { TAB_BAR_SCROLL_PADDING } from "../constants/tabBar";
import { toNumber } from "../lib/api-dtos";
function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")} ${d.toLocaleString("en-KE", { month: "short" })} ${d.getFullYear()}`;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-700", icon: Clock },
  sent: { bg: "bg-blue-100", text: "text-blue-700", icon: Send },
  viewed: { bg: "bg-cyan-100", text: "text-cyan-700", icon: CheckCircle },
  partial: { bg: "bg-yellow-100", text: "text-yellow-700", icon: AlertCircle },
  paid: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle },
  overdue: { bg: "bg-red-100", text: "text-red-700", icon: AlertCircle },
  cancelled: { bg: "bg-red-100", text: "text-red-700", icon: XCircle },
};

export default function Invoices() {
  const [refreshing, setRefreshing] = useState(false);
  const { invoices, isLoading, refetch, sendInvoice, isSending, sendWhatsApp, isSendingWhatsApp } = useInvoices();

  const formatCurrency = (amount: string | number) => `KES ${toNumber(amount).toLocaleString("en-KE")}`;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleCreatePress = () => {
    Alert.alert("Coming soon", "Invoice creation is not yet available. Please create an order first.");
  };

  const handleSend = async (id: string) => {
    try { await sendInvoice(id); Alert.alert("Sent", "Invoice sent via email"); } catch (e: any) { Alert.alert("Error", e.friendlyMessage || "Failed to send"); }
  };

  const handleWhatsApp = async (id: string) => {
    try { await sendWhatsApp(id); Alert.alert("Sent", "Invoice shared via WhatsApp"); } catch (e: any) { Alert.alert("Error", e.friendlyMessage || "Failed to share"); }
  };

  if (isLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#006b5f" /></View>;

  return (
    <View className="flex-1 bg-gray-50">
      <View className="px-4 pt-12 pb-3 bg-white border-b border-gray-200">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <ChevronLeft size={24} color="#374151" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-900">Invoices</Text>
            <Text className="text-xs text-gray-500">Track and share invoices</Text>
          </View>
          <TouchableOpacity className="flex-row items-center gap-2 bg-primary-600 px-4 py-2 rounded-lg" onPress={handleCreatePress}>
            <Plus size={18} color="white" />
            <Text className="text-white font-bold text-sm">Create</Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row bg-gray-200 rounded-lg w-full p-1">
          <Pressable className="flex-1 py-3 rounded-lg items-center" onPress={() => router.replace("/(tabs)/sales") }>
            <Text className="font-medium text-gray-500">Sales</Text>
          </Pressable>
          <Pressable className="flex-1 py-3 rounded-lg items-center" onPress={() => router.replace("/orders") }>
            <Text className="font-medium text-gray-500">Orders</Text>
          </Pressable>
          <View className="flex-1 py-3 rounded-lg items-center bg-white shadow">
            <Text className="font-medium text-gray-900">Invoices</Text>
          </View>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING + 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Card className="mb-4"><CardHeader className="flex-row justify-between items-center"><CardTitle>Invoices</CardTitle><Text className="text-xs text-gray-500">{invoices.length} total</Text></CardHeader><CardContent>
          {invoices.length === 0 ? (
            <View className="items-center py-12"><Text className="text-gray-500 mb-2">No invoices yet</Text><TouchableOpacity className="bg-primary-600 px-4 py-2 rounded-lg" onPress={handleCreatePress}><Text className="text-white font-bold text-sm">Create your first invoice</Text></TouchableOpacity></View>
          ) : (
            <View className="space-y-3">
              {invoices.map((inv) => {
                const s = STATUS_STYLE[inv.status] || { bg: "bg-gray-100", text: "text-gray-700", icon: Clock };
                const Icon = s.icon;
                return (
                  <TouchableOpacity key={inv.id} className="p-3 bg-white border border-gray-200 rounded-lg flex-row items-center justify-between" onPress={() => router.push(`/invoices/${inv.id}`)}>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text className="font-bold text-gray-900">{inv.invoiceNumber}</Text>
                        <View className={`px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}><Icon size={10} /><Text className="text-xs font-bold ml-1">{inv.status.toUpperCase()}</Text></View>
                      </View>
                      <View className="flex-row items-center gap-4 text-sm text-gray-500">
                        <Text>{inv.customerName}</Text>
                        <Text>{formatDate(inv.dueAt)}</Text>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-lg font-bold text-gray-900">{formatCurrency(inv.total)}</Text>
                      <ChevronRight size={20} color="#999" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </CardContent></Card>
      </ScrollView>
    </View>
  );
}
