import React, { useMemo } from "react";
import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator, Alert, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { ChevronLeft, CheckCircle, Clock, Package, User, Smartphone, Trash2, Check, XCircle, CreditCard } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { useOrders, OrderStatus } from "../../hooks/api/useOrders";
import { useCustomers } from "../../hooks/api/useCustomers";
import { useProducts } from "../../hooks/api/useProducts";
import { useInitiatePayment } from "../../hooks/api/usePayments";
import { TAB_BAR_SCROLL_PADDING } from "../../constants/tabBar";
import { toNumber } from "../../lib/api-dtos";
import { shortId } from "../../lib/ids";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")} ${d.toLocaleString("en-KE", { month: "short" })} ${d.getFullYear()}`;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string; icon: any }> = {
  draft: { bg: "bg-amber-50", text: "text-amber-700", label: "DRAFT", icon: Clock },
  confirmed: { bg: "bg-sky-50", text: "text-sky-700", label: "CONFIRMED", icon: Check },
  fulfilled: { bg: "bg-emerald-50", text: "text-emerald-700", label: "FULFILLED", icon: CheckCircle },
  cancelled: { bg: "bg-red-50", text: "text-red-700", label: "CANCELLED", icon: XCircle },
  paid: { bg: "bg-emerald-50", text: "text-emerald-700", label: "FULFILLED", icon: CheckCircle },
  failed: { bg: "bg-red-50", text: "text-red-700", label: "FAILED", icon: XCircle },
};

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getOrder, updateOrder, isUpdating } = useOrders();
  const { data: customers = [] } = useCustomers();
  const { products } = useProducts();
  const { mutateAsync: initiatePayment, isPending: isInitiating } = useInitiatePayment();

  const query = getOrder(id);
  const order: any = query.data;
  const isLoading = query.isLoading;

  const formatCurrency = (amount: string | number) => `KES ${toNumber(amount).toLocaleString("en-KE")}`;

  const productMap = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [products]);

  const getLineTitle = (line: any) => {
    if (line.productId && productMap.has(line.productId)) return productMap.get(line.productId)!;
    if (line.description) return line.description;
    return "Item";
  };

  const handleUpdateStatus = async (status: OrderStatus) => {
    try {
      const customer = order?.customerId ? customers.find((c: any) => c.id === order.customerId) : undefined;
      if (status === OrderStatus.confirmed && order.paymentMethod === "mpesa" && customer?.phone) {
        await updateOrder({ id, data: { status, customerPhone: customer.phone } });
      } else {
        await updateOrder({ id, data: { status } });
      }
      query.refetch();
    } catch (e: any) {
      Alert.alert("Error", e.friendlyMessage || e.message || "Failed to update order");
    }
  };

  const handleMpesa = async () => {
    const customer = order?.customerId ? customers.find((c: any) => c.id === order.customerId) : undefined;
    if (!customer?.phone) return Alert.alert("Missing phone", "This order needs a customer phone before M-Pesa.");
    try {
      const payment = await initiatePayment({ orderId: id, phone: customer.phone, amount: order.total, currency: "KES" });
      Alert.alert("Payment sent", `M-Pesa request sent (${payment.id.slice(0, 8)}…)`);
    } catch (e: any) {
      Alert.alert("Error", e.friendlyMessage || e.message || "Failed to initiate M-Pesa");
    }
  };

  if (isLoading) return <View className="flex-1 items-center justify-center bg-white"><ActivityIndicator size="large" color="#111827" /></View>;
  if (!order) return <View className="flex-1 items-center justify-center p-6 bg-gray-50"><Text className="text-gray-500">Order not found</Text><Pressable onPress={() => router.back()} className="mt-4 px-4 py-2 bg-gray-900 rounded-full"><Text className="text-white font-bold text-sm">Go back</Text></Pressable></View>;

  const s = STATUS_STYLE[String(order.status)] || STATUS_STYLE.draft;
  const Icon = s.icon;
  const customer = customers.find((c: any) => c.id === order.customerId);
  const isFulfilled = String(order.status) === "fulfilled" || String(order.status) === "paid";
  const isCancelled = String(order.status) === "cancelled" || String(order.status) === "failed";
  const isDraft = String(order.status) === "draft";
  const isConfirmed = String(order.status) === "confirmed";

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header — impeccable */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-200">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full active:bg-gray-100">
            <ChevronLeft size={22} color="#111827" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Order</Text>
            <Text className="text-lg font-bold text-gray-900" numberOfLines={1}>Order • {shortId(order.id, 6)}</Text>
          </View>
          <View className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${s.bg} ${s.bg.includes("emerald") ? "border-emerald-100" : s.bg.includes("red") ? "border-red-100" : s.bg.includes("sky") ? "border-sky-100" : "border-amber-100"}`}>
            <Icon size={13} color={s.text.includes("emerald") ? "#047857" : s.text.includes("red") ? "#b91c1c" : s.text.includes("sky") ? "#0369a1" : "#b45309"} />
            <Text className={`text-[11px] font-bold tracking-widest ${s.text}`}>{s.label}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING + 24, gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Card className="border border-gray-200">
          <CardContent className="p-5">
            <View className="flex-row justify-between items-start gap-4">
              <View className="flex-1">
                <Text className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">Total amount</Text>
                <Text className="text-3xl font-bold tracking-tight text-gray-900">{formatCurrency(order.total)}</Text>
                <Text className="text-xs text-gray-500 mt-1">{order.paymentMethod?.toUpperCase()} • {formatDate(order.createdAt)}</Text>
              </View>
              <View className="items-end">
                <Text className="text-xs text-gray-400">Status</Text>
                <Text className="text-sm font-bold text-gray-900 capitalize mt-1">{order.status}</Text>
              </View>
            </View>
            <View className="h-px bg-gray-100 my-4" />
            <View className="flex-row justify-between gap-4">
              <View className="flex-1">
                <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Subtotal</Text>
                <Text className="text-sm font-semibold text-gray-900 mt-1">{formatCurrency(order.subtotal)}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Tax</Text>
                <Text className="text-sm font-semibold text-gray-900 mt-1">{formatCurrency(order.taxAmount)}</Text>
              </View>
              <View className="flex-1 items-end">
                <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Items</Text>
                <Text className="text-sm font-bold text-gray-900 mt-1">{order.lines?.length || 0}</Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Customer */}
        <Card className="border border-gray-200">
          <CardHeader className="pb-2">
            <View className="flex-row items-center gap-2">
              <User size={16} color="#6b7280" />
              <CardTitle>Customer</CardTitle>
            </View>
          </CardHeader>
          <CardContent className="pt-0">
            <View className="flex-row items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <View className="w-10 h-10 rounded-full bg-gray-900 items-center justify-center">
                <Text className="text-white font-bold">{(customer?.name || "?").charAt(0).toUpperCase()}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-bold text-gray-900">{customer?.name || (order.customerId ? "Customer • " + shortId(order.customerId, 6) : "Walk-in")}</Text>
                <Text className="text-sm text-gray-500">{customer?.phone || "-"}</Text>
              </View>
              {customer?.email ? <Text className="text-xs text-gray-400" numberOfLines={1}>{customer.email}</Text> : null}
            </View>
            {!order.customerId && <Text className="text-xs text-gray-400 mt-2 text-center">No customer linked — walk-in order</Text>}
          </CardContent>
        </Card>

        {/* Items */}
        <Card className="border border-gray-200">
          <CardHeader>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Package size={16} color="#6b7280" />
                <CardTitle>Items</CardTitle>
              </View>
              <View className="px-2.5 py-1 rounded-full bg-gray-100">
                <Text className="text-xs font-bold text-gray-600">{order.lines?.length || 0} {(order.lines?.length || 0) === 1 ? "item" : "items"}</Text>
              </View>
            </View>
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              {(order.lines || []).map((line: any, i: number) => {
                const title = getLineTitle(line);
                const qty = toNumber(line.quantity);
                const unit = formatCurrency(line.unitPrice);
                const total = formatCurrency(toNumber(line.lineTotal) || qty * toNumber(line.unitPrice));
                return (
                  <View key={line.id || i} className="flex-row gap-3 p-4 bg-white rounded-xl border border-gray-200">
                    <View className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 items-center justify-center shrink-0">
                      <Package size={16} color="#6b7280" />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="font-bold text-gray-900 text-[14px] leading-4" numberOfLines={2}>{title}</Text>
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <View className="px-2 py-0.5 rounded-full bg-gray-100">
                          <Text className="text-[11px] font-bold text-gray-600">QTY {qty}</Text>
                        </View>
                        <Text className="text-xs text-gray-500">× {unit}</Text>
                      </View>
                    </View>
                    <View className="items-end justify-center shrink-0 ml-2">
                      <Text className="font-bold text-gray-900 text-sm">{total}</Text>
                      <Text className="text-[11px] text-gray-400">Line total</Text>
                    </View>
                  </View>
                );
              })}
              {(!order.lines || order.lines.length === 0) && (
                <View className="p-8 items-center border border-dashed border-gray-200 rounded-xl">
                  <Text className="text-sm text-gray-400">No items</Text>
                </View>
              )}
            </View>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="border border-gray-200">
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent>
            <View className="gap-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-sm text-gray-600">Subtotal</Text>
                <Text className="text-sm font-semibold text-gray-900">{formatCurrency(order.subtotal)}</Text>
              </View>
              <View className="flex-row justify-between items-center">
                <Text className="text-sm text-gray-600">Tax</Text>
                <Text className="text-sm font-semibold text-gray-900">{formatCurrency(order.taxAmount)}</Text>
              </View>
              <View className="h-px bg-gray-100" />
              <View className="flex-row justify-between items-center">
                <Text className="text-sm font-bold text-gray-900">Total</Text>
                <Text className="text-base font-bold text-gray-900">{formatCurrency(order.total)}</Text>
              </View>
              <View className="flex-row justify-between items-center">
                <Text className="text-xs text-gray-500">Payment</Text>
                <View className="px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200">
                  <Text className="text-[11px] font-bold tracking-widest text-gray-600">{(order.paymentMethod || "cash").toUpperCase()}</Text>
                </View>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Actions — impeccable 2x2 */}
        <Card className="border border-gray-200">
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent>
            <View className="gap-3">
              <View className="flex-row gap-3">
                {isDraft && (
                  <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 bg-gray-900 px-4 py-3.5 rounded-xl active:opacity-90" onPress={() => handleUpdateStatus(OrderStatus.confirmed)} disabled={isUpdating}>
                    <Check size={18} color="white" />
                    <Text className="text-white font-bold text-sm">{isUpdating ? "Updating…" : "Confirm Order"}</Text>
                  </TouchableOpacity>
                )}
                {isConfirmed && (
                  <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 bg-emerald-600 px-4 py-3.5 rounded-xl active:opacity-90" onPress={() => handleUpdateStatus(OrderStatus.fulfilled)} disabled={isUpdating}>
                    <CheckCircle size={18} color="white" />
                    <Text className="text-white font-bold text-sm">{isUpdating ? "Fulfilling…" : "Fulfill Order"}</Text>
                  </TouchableOpacity>
                )}
                {!isFulfilled && !isCancelled && isDraft === false && isConfirmed === false && (
                  <View className="flex-1 bg-gray-100 border border-gray-200 px-4 py-3.5 rounded-xl items-center">
                    <Text className="text-gray-500 font-bold text-sm">{order.status.toUpperCase()}</Text>
                  </View>
                )}
                {isFulfilled || isCancelled ? (
                  <View className="flex-1 bg-gray-50 border border-gray-200 px-4 py-3.5 rounded-xl items-center">
                    <Text className="text-gray-400 font-bold text-sm">No further status</Text>
                  </View>
                ) : null}
                {!isFulfilled && !isCancelled ? (
                  <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 bg-white border border-red-200 px-4 py-3.5 rounded-xl active:bg-red-50" onPress={() => handleUpdateStatus(OrderStatus.cancelled)} disabled={isUpdating}>
                    <Trash2 size={18} color="#dc2626" />
                    <Text className="text-red-600 font-bold text-sm">Cancel</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View className="flex-row gap-3">
                {!isFulfilled && !isCancelled ? (
                  <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 bg-white border border-gray-200 px-4 py-3.5 rounded-xl active:bg-gray-50" onPress={handleMpesa} disabled={isInitiating}>
                    <Smartphone size={18} color="#111827" />
                    <Text className="text-gray-900 font-bold text-sm">{isInitiating ? "Sending…" : "M-Pesa"}</Text>
                  </TouchableOpacity>
                ) : (
                  <View className="flex-1 flex-row items-center justify-center gap-2 bg-gray-100 border border-gray-200 px-4 py-3.5 rounded-xl opacity-50">
                    <Smartphone size={18} color="#9ca3af" />
                    <Text className="text-gray-400 font-bold text-sm">M-Pesa disabled</Text>
                  </View>
                )}
                <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 bg-white border border-gray-200 px-4 py-3.5 rounded-xl active:bg-gray-50" onPress={() => router.push("/invoices" as any)}>
                  <CreditCard size={18} color="#111827" />
                  <Text className="text-gray-900 font-bold text-sm">Invoices</Text>
                </TouchableOpacity>
              </View>
              {isFulfilled && <Text className="text-xs text-center text-gray-400">Fulfilled — M-Pesa and status changes disabled</Text>}
              {isCancelled && <Text className="text-xs text-center text-gray-400">Cancelled — no further actions</Text>}
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </View>
  );
}
