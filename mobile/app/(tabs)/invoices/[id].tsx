import React, { useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Send, MessageSquare, Download, ChevronRight, CreditCard, CheckCircle, AlertCircle, XCircle, Clock } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/Card";
import { useInvoices } from "../../../hooks/api/useInvoices";
import { useCustomers } from "../../../hooks/api/useCustomers";
import { TAB_BAR_SCROLL_PADDING } from "../../../constants/tabBar";
import { toNumber } from "../../../lib/api-dtos";
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

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentRef, setPaymentRef] = useState("");

  const { getInvoice, sendInvoice, isSending, sendWhatsApp, isSendingWhatsApp, recordPayment, isRecordingPayment } = useInvoices();
  const { data: customers = [] } = useCustomers();

  const query = getInvoice(id);
  const invoice = query.data;
  const isLoading = query.isLoading;

  const formatCurrency = (amount: string | number) => `KES ${toNumber(amount).toLocaleString("en-KE")}`;
  const formatDate = (iso: string) => format(new Date(iso), "dd MMM yyyy");

  const handleSend = async () => {
    try { await sendInvoice(id); Alert.alert("Sent", "Invoice sent via email"); query.refetch(); } catch (e: any) { Alert.alert("Error", e.friendlyMessage || "Failed to send"); }
  };

  const handleWhatsApp = async () => {
    try { await sendWhatsApp(id); Alert.alert("Shared", "Invoice shared via WhatsApp"); query.refetch(); } catch (e: any) { Alert.alert("Error", e.friendlyMessage || "Failed to share"); }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount) { Alert.alert("Error", "Amount required"); return; }
    try {
      await recordPayment({ id, amount: paymentAmount, method: paymentMethod, reference: paymentRef });
      Alert.alert("Success", "Payment recorded");
      setShowPaymentModal(false);
      setPaymentAmount(""); setPaymentRef("");
      query.refetch();
    } catch (e: any) { Alert.alert("Error", e.friendlyMessage || "Failed to record payment"); }
  };

  const handleDownloadPDF = () => {
    Alert.alert("PDF", "PDF download would open here");
  };

  if (isLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#006b5f" /></View>;
  if (!invoice) return <View className="flex-1 items-center justify-center p-4"><Text className="text-gray-500">Invoice not found</Text></View>;

  const s = STATUS_STYLE[invoice.status] || { bg: "bg-gray-100", text: "text-gray-700", icon: Clock };
  const Icon = s.icon;
  const customer = customers.find((c) => c.id === (invoice as any).customerId);

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING + 20 }} showsVerticalScrollIndicator={false}>
        <Card className="mb-4"><CardContent className="py-3">
          <View className="flex-row justify-between items-start">
            <View>
              <Text className="text-lg font-bold text-gray-900">{invoice.invoiceNumber}</Text>
              <View className="flex-row items-center gap-2 mt-1">
                <View className={`px-3 py-1 rounded-full ${s.bg} ${s.text}`}><Icon size={12} /><Text className="text-xs font-bold ml-1">{invoice.status.toUpperCase()}</Text></View>
                <Text className="text-sm text-gray-500">Due {formatDate(invoice.dueAt)}</Text>
              </View>
            </View>
            <Text className="text-2xl font-bold text-primary-700">{formatCurrency(invoice.total)}</Text>
          </View>
        </CardContent></Card>

        <Card className="mb-4"><CardHeader><CardTitle>Customer</CardTitle></CardHeader><CardContent>
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center"><Text className="text-primary-700 font-bold">{customer?.name?.charAt(0) || "?"}</Text></View>
            <View className="flex-1"><Text className="font-bold text-gray-900">{customer?.name || invoice.customerName}</Text><Text className="text-sm text-gray-500">{customer?.phone || invoice.customerPhone || "-"}</Text></View>
            <ChevronRight size={20} color="#999" />
          </View>
        </CardContent></Card>

        <Card className="mb-4"><CardHeader><CardTitle>Items</CardTitle></CardHeader><CardContent>
          <View className="space-y-3">
            {invoice.lines.map((line, i) => (
              <View key={i} className="flex-row justify-between p-3 bg-gray-50 rounded-lg">
                <View className="flex-1"><Text className="font-medium text-gray-900">{line.description}</Text><Text className="text-sm text-gray-500">Qty: {toNumber(line.quantity)} x {formatCurrency(line.unitPrice)}</Text></View>
                <Text className="font-bold text-gray-900">{formatCurrency(toNumber(line.lineTotal) || toNumber(line.quantity) * toNumber(line.unitPrice))}</Text>
              </View>
            ))}
          </View>
        </CardContent></Card>

        <Card className="mb-4"><CardHeader><CardTitle>Summary</CardTitle></CardHeader><CardContent>
          <View className="space-y-2">
            <View className="flex-row justify-between"><Text className="text-gray-700">Subtotal</Text><Text className="font-medium">{formatCurrency(invoice.subtotal)}</Text></View>
            <View className="flex-row justify-between"><Text className="text-gray-700">Tax</Text><Text className="font-medium">{formatCurrency(invoice.taxAmount)}</Text></View>
            <View className="flex-row justify-between"><Text className="text-gray-700">Paid</Text><Text className="font-medium text-green-700">{formatCurrency(invoice.amountPaid)}</Text></View>
            <View className="flex-row justify-between border-t border-gray-200 pt-2"><Text className="text-gray-900 font-bold">Amount Due</Text><Text className="text-lg font-bold text-primary-700">{formatCurrency(invoice.amountDue)}</Text></View>
          </View>
        </CardContent></Card>

        {invoice.payments && invoice.payments.length > 0 && (
          <Card className="mb-4"><CardHeader><CardTitle>Payments</CardTitle></CardHeader><CardContent>
            <View className="space-y-2">
              {invoice.payments.map((p, i) => (
                <View key={i} className="flex-row justify-between p-3 bg-gray-50 rounded-lg">
                  <View><Text className="font-medium text-gray-900">{p.method}</Text><Text className="text-xs text-gray-500">{formatDate(p.paidAt)}</Text></View>
                  <Text className="font-bold text-green-700">{formatCurrency(p.amount)}</Text>
                </View>
              ))}
            </View>
          </CardContent></Card>
        )}

        {invoice.notes && (
          <Card className="mb-4"><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent><Text className="text-gray-700">{invoice.notes}</Text></CardContent></Card>
        )}

        <Card className="mb-4"><CardHeader><CardTitle>Actions</CardTitle></CardHeader><CardContent>
          <View className="flex-row flex-wrap gap-3">
            {invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <TouchableOpacity className="flex-1 bg-primary-600 px-4 py-3 rounded-lg items-center" onPress={handleWhatsApp} disabled={isSendingWhatsApp}><MessageSquare size={20} color="white" className="mb-1" /><Text className="text-white font-bold text-sm">{isSendingWhatsApp ? "Sharing..." : "Share via WhatsApp"}</Text></TouchableOpacity>
            )}
            {invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <TouchableOpacity className="flex-1 bg-blue-600 px-4 py-3 rounded-lg items-center" onPress={handleSend} disabled={isSending}><Send size={20} color="white" className="mb-1" /><Text className="text-white font-bold text-sm">{isSending ? "Sending..." : "Send via Email"}</Text></TouchableOpacity>
            )}
            <TouchableOpacity className="flex-1 bg-gray-100 px-4 py-3 rounded-lg items-center" onPress={handleDownloadPDF}><Download size={20} color="#006b5f" className="mb-1" /><Text className="text-primary-700 font-bold text-sm">Download PDF</Text></TouchableOpacity>
            {invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <TouchableOpacity className="flex-1 bg-green-100 px-4 py-3 rounded-lg items-center" onPress={() => setShowPaymentModal(true)}><CreditCard size={20} color="#16a34a" className="mb-1" /><Text className="text-green-700 font-bold text-sm">Record Payment</Text></TouchableOpacity>
            )}
          </View>
        </CardContent></Card>
      </ScrollView>

      <Modal visible={showPaymentModal} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-gray-50"><View className="flex-row justify-between items-center p-4 bg-white border-b border-gray-200"><Text className="text-lg font-bold text-primary-800">Record Payment</Text><TouchableOpacity onPress={() => setShowPaymentModal(false)}><Text className="text-gray-500 font-bold text-lg">X</Text></TouchableOpacity></View><ScrollView contentContainerStyle={{padding:16}}><View className="space-y-4">
          <View><Text className="text-sm font-medium text-gray-700 mb-1">Amount Due</Text><Text className="text-2xl font-bold text-primary-700">{formatCurrency(invoice.amountDue)}</Text></View>
          <View><Text className="text-sm font-medium text-gray-700 mb-1">Payment Amount *</Text><TextInput className="border border-gray-300 rounded-lg px-4 py-3 bg-white" placeholder="0.00" keyboardType="numeric" value={paymentAmount} onChangeText={setPaymentAmount}/></View>
          <View><Text className="text-sm font-medium text-gray-700 mb-1">Method</Text><View className="flex-row gap-2">
            {["cash", "mpesa", "bank_transfer", "card"].map((m) => (<TouchableOpacity key={m} className={`flex-1 py-2 rounded-lg items-center ${paymentMethod === m ? "bg-primary-600" : "bg-gray-100"}`} onPress={() => setPaymentMethod(m)}><Text className={paymentMethod === m ? "text-white" : "text-gray-700"} style={{fontSize:12,fontWeight:"bold"}}>{m.toUpperCase()}</Text></TouchableOpacity>))}</View></View>
          <View><Text className="text-sm font-medium text-gray-700 mb-1">Reference</Text><TextInput className="border border-gray-300 rounded-lg px-4 py-3 bg-white" placeholder="MPESA code, cheque no, etc." value={paymentRef} onChangeText={setPaymentRef}/></View>
          <TouchableOpacity className="mt-6 bg-primary-600 py-3 rounded-lg items-center" onPress={handleRecordPayment} disabled={isRecordingPayment}><Text className="text-white font-bold">{isRecordingPayment ? "Recording..." : "Record Payment"}</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>
    </View>
  );
}