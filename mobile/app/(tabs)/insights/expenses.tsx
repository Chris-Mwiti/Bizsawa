import React, { useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from "react-native";
import { Plus, Trash2, Edit2, Filter, Calendar, DollarSign } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { useExpenses } from "../../../hooks/api/useExpenses";
import { TAB_BAR_SCROLL_PADDING } from "../../../constants/tabBar";
import { toNumber } from "../../../lib/api-dtos";

export default function InsightsExpenses() {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ category: "", description: "", amount: "", spentAt: new Date().toISOString() });
  
  const { expenses, isLoading, createExpense, updateExpense, deleteExpense, isCreating, isUpdating, isDeleting } = useExpenses();

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });

  const totalExpenses = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);

  const handleSubmit = async () => {
    if (!formData.category || !formData.amount) { Alert.alert("Error", "Category and amount required"); return; }
    try {
      setShowModal(false); 
      setEditingId(null); 
      setFormData({ category: "", description: "", amount: "", spentAt: new Date().toISOString() });
    } catch (e: any) { Alert.alert("Error", e.friendlyMessage || "Failed"); }
  };

  const handleEdit = (expense: any) => {
    setEditingId(expense.id);
    setFormData({ category: expense.category, description: expense.description || "", amount: expense.amount, spentAt: expense.spentAt });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    Alert.alert("Delete expense?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await deleteExpense(id); } catch (e: any) { Alert.alert("Error", e.friendlyMessage); } } },
    ]);
  };

  const handleNew = () => { setEditingId(null); setFormData({ category: "", description: "", amount: "", spentAt: new Date().toISOString() }); setShowModal(true); };

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:TAB_BAR_SCROLL_PADDING+20}} showsVerticalScrollIndicator={false}>
        <Card className="mb-4"><CardContent className="py-3"><View className="flex-row justify-between items-center"><Text className="text-lg font-bold text-gray-900">Total Expenses</Text><Text className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</Text></View></CardContent></Card>
        <Card className="mb-4"><CardHeader className="flex-row justify-between items-center"><CardTitle>Expenses</CardTitle><TouchableOpacity className="flex-row items-center gap-2 bg-primary-600 px-4 py-2 rounded-lg" onPress={handleNew}><Plus size={18} color="white" /><Text className="text-white font-bold text-sm">Add</Text></TouchableOpacity></CardHeader><CardContent>
          {isLoading ? <View className="items-center py-8"><ActivityIndicator size="small" color="#006b5f" /><Text className="text-gray-500 mt-2">Loading...</Text></View> : expenses.length === 0 ? <View className="items-center py-8"><Text className="text-gray-500">No expenses yet</Text></View> : <View className="space-y-3">{expenses.map((e) => (<View key={e.id} className="flex-row items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"><View className="flex-1"><View className="flex-row items-center gap-3"><Badge className="bg-gray-100 text-gray-700">{e.category}</Badge><Text className="font-medium text-gray-900">{e.description || "-"}</Text></View><View className="flex-row items-center gap-4 mt-1 text-sm text-gray-500"><Text>{formatDate(e.spentAt)}</Text><Text className="font-bold text-red-600">{formatCurrency(toNumber(e.amount))}</Text></View></View><View className="flex-row gap-2"><TouchableOpacity className="p-2" onPress={() => handleEdit(e)}><Edit2 size={18} color="#006b5f" /></TouchableOpacity><TouchableOpacity className="p-2" onPress={() => handleDelete(e.id)}><Trash2 size={18} color="#ef4444" /></TouchableOpacity></View></View>))}</View>}
        </CardContent></Card>
      </ScrollView>
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet"><View className="flex-1 bg-gray-50"><View className="flex-row justify-between items-center p-4 bg-white border-b border-gray-200"><Text className="text-lg font-bold text-primary-800">{editingId ? "Edit Expense" : "Add Expense"}</Text><TouchableOpacity onPress={() => {setShowModal(false);setEditingId(null);setFormData({category:"",description:"",amount:"",spentAt:new Date().toISOString()})}}><Text className="text-gray-500 font-bold text-lg">X</Text></TouchableOpacity></View><ScrollView contentContainerStyle={{padding:16}}><View className="space-y-4"><View><Text className="text-sm font-medium text-gray-700 mb-1">Category *</Text><TextInput className="border border-gray-300 rounded-lg px-4 py-3 bg-white" placeholder="e.g., Feed, Rent, Utilities" value={formData.category} onChangeText={v=>setFormData({...formData,category:v})}/></View><View><Text className="text-sm font-medium text-gray-700 mb-1">Description</Text><TextInput className="border border-gray-300 rounded-lg px-4 py-3 bg-white" placeholder="Optional" value={formData.description} onChangeText={v=>setFormData({...formData,description:v})}/></View><View><Text className="text-sm font-medium text-gray-700 mb-1">Amount (KES) *</Text><TextInput className="border border-gray-300 rounded-lg px-4 py-3 bg-white" placeholder="0.00" keyboardType="numeric" value={formData.amount} onChangeText={v=>setFormData({...formData,amount:v})}/></View><View><Text className="text-sm font-medium text-gray-700 mb-1">Date</Text><TextInput className="border border-gray-300 rounded-lg px-4 py-3 bg-white" value={formData.spentAt.split("T")[0]} editable={false} /><Text className="text-xs text-gray-500 mt-1">Tap to pick date (TODO)</Text></View><TouchableOpacity className="mt-6 bg-primary-600 py-3 rounded-lg items-center" onPress={handleSubmit} disabled={isCreating||isUpdating}><Text className="text-white font-bold">{editingId ? (isUpdating?"Saving...":"Update") : (isCreating?"Adding...":"Add Expense")}</Text></TouchableOpacity></View></ScrollView></View></Modal>
    </View>
  );
}