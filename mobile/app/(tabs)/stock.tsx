import React, { useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Pressable } from "react-native";
import { Package, Plus, Search, AlertTriangle, TrendingUp, Edit, Trash2 } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { TAB_BAR_SCROLL_PADDING } from "../../constants/tabBar";
import { useProducts } from "../../hooks/api/useProducts";
import { useInventory } from "../../hooks/api/useInventory";
import { shortId } from "../../lib/ids";

interface InventoryItem {
  id: string;
  productId: string;
  name: string;
  category: string;
  currentStock: number;
  minimumThreshold: number;
  maximumCapacity: number;
  unitPrice: number;
  supplier: string;
  lastRestocked: string;
}

export default function StockTab() {
  const { products, isLoading: isLoadingProducts, createProduct, updateProduct, deleteProduct, isDeleting } = useProducts();
  const { inventory: inventoryData, isLoadingInventory, adjustStock, isAdjustingStock } = useInventory();

  const [searchTerm, setSearchTerm] = useState("");
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formState, setFormState] = useState({ name: "", category: "", currentStock: "0", minimumThreshold: "0", maximumCapacity: "0", unitPrice: "0", supplier: "" });

  // cleanup unused dropdown state removed — category now free-text


  // derived categories for picker — includes existing product categories + defaults, de-duplicated
  const allCategories = Array.from(
    new Set(
      [
        "Dairy Feed",
        "Poultry Feed",
        "Swine Feed",
        "Aquaculture",
        "Other",
        ...products.map((p) => (p.category || "").trim()).filter(Boolean),
      ]
    )
  );

  const combinedInventory: InventoryItem[] = products.map((p) => {
    const invItem = inventoryData.find((inv) => inv.productId === p.id);
    const stockQty = invItem ? invItem.quantity : p.stockQuantity || 0;
    const minThreshold = invItem ? invItem.lowStockThreshold : p.minStockLevel || 0;
    const minT = minThreshold > 0 ? minThreshold : Math.max(1, Math.floor(stockQty * 0.2));
    const maxCap = p.maxStockLevel != null && p.maxStockLevel > 0 ? p.maxStockLevel : Math.max(stockQty * 2, 1);
    return { id: p.id.toString(), productId: p.id.toString(), name: p.name, category: p.category || "Uncategorized", currentStock: stockQty, minimumThreshold: minT, maximumCapacity: maxCap, unitPrice: p.price, supplier: p.supplier?.trim() || "—", lastRestocked: p.lastRestockedAt ? new Date(p.lastRestockedAt).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString() };
  });

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
  const getStockStatus = (item: InventoryItem) => {
    const cap = Math.max(item.maximumCapacity, 1);
    const pct = (item.currentStock / cap) * 100;
    const low = item.currentStock <= item.minimumThreshold;
    if (low) return { label: "Low stock", color: "bg-red-500", text: "text-red-700", bg: "bg-red-50 border-red-200" };
    if (pct <= 50) return { label: "Medium", color: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50 border-amber-100" };
    return { label: "In stock", color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" };
  };

  const filteredInventory = combinedInventory.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.category.toLowerCase().includes(searchTerm.toLowerCase()));
  const lowStockItems = combinedInventory.filter((item) => item.currentStock <= item.minimumThreshold);
  const totalValue = combinedInventory.reduce((sum, item) => sum + item.currentStock * item.unitPrice, 0);
  const totalItems = combinedInventory.reduce((sum, item) => sum + item.currentStock, 0);

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormState({ name: "", category: "", currentStock: "0", minimumThreshold: "0", maximumCapacity: "0", unitPrice: "0", supplier: "" });
    setShowItemModal(true);
  };
  const handleOpenEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setFormState({ name: item.name, category: item.category, currentStock: item.currentStock.toString(), minimumThreshold: item.minimumThreshold.toString(), maximumCapacity: item.maximumCapacity.toString(), unitPrice: item.unitPrice.toString(), supplier: item.supplier === "—" ? "" : item.supplier });
    setShowItemModal(true);
  };
  const handleSaveItem = async () => {
    if (!formState.name.trim() || !formState.category.trim()) return Alert.alert("Validation", "Name and category are required.");
    const stock = parseInt(formState.currentStock) || 0;
    const min = parseInt(formState.minimumThreshold) || 0;
    const max = parseInt(formState.maximumCapacity) || 0;
    const price = parseFloat(formState.unitPrice) || 0;
    try {
      if (editingItem) {
        await updateProduct({ id: editingItem.productId, data: { name: formState.name.trim(), category: formState.category, price, buyingPrice: Math.round(price * 0.7 * 100) / 100, supplier: formState.supplier.trim(), maxStockLevel: max > 0 ? max : null } });
        const delta = stock - editingItem.currentStock;
        await adjustStock({ productId: editingItem.productId, quantityDelta: delta, lowStockThreshold: min, notes: "Manual adjustment" });
        Alert.alert("Success", "Product updated");
      } else {
        const created = await createProduct({ name: formState.name.trim(), category: formState.category, price, buyingPrice: Math.round(price * 0.7 * 100) / 100, supplier: formState.supplier.trim(), maxStockLevel: max > 0 ? max : null });
        if (created?.id) await adjustStock({ productId: created.id, quantityDelta: stock, lowStockThreshold: min, notes: "Initial stock" });
        Alert.alert("Success", "Product added");
      }
      setShowItemModal(false);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save");
    }
  };
  const handleDeleteItem = (item: InventoryItem) => {
    Alert.alert("Delete product", `Delete "${item.name}"?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { try { await deleteProduct(item.productId); Alert.alert("Deleted", "Removed"); } catch (e: any) { Alert.alert("Error", e.message); } } }]);
  };

  if (isLoadingProducts || isLoadingInventory) {
    return <View className="flex-1 bg-gray-50 items-center justify-center px-6"><ActivityIndicator color="#111827" /><Text className="text-sm text-gray-500 mt-3">Loading stock…</Text></View>;
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-200">
        <View className="flex-row justify-between items-start gap-3">
          <View className="flex-1">
            <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Stock</Text>
            <Text className="text-xl font-bold tracking-tight text-gray-900 -mt-0.5">Inventory</Text>
            <Text className="text-xs text-gray-500">Mfumo wa kuhifadhi bidhaa</Text>
          </View>
          <TouchableOpacity onPress={handleOpenAddModal} className="flex-row items-center gap-2 bg-gray-900 px-4 py-2.5 rounded-full">
            <Plus size={16} color="white" /><Text className="text-white text-sm font-bold">Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING + 24, gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* Metrics */}
        <View className="flex-row gap-3">
          {[
            { label: "Total items", value: String(totalItems), sub: "units", icon: Package },
            { label: "Total value", value: formatCurrency(totalValue), sub: "stock value", icon: TrendingUp },
            { label: "Low stock", value: String(lowStockItems.length), sub: "need restock", icon: AlertTriangle, alert: lowStockItems.length > 0 },
          ].map((m) => (
            <View key={m.label} className="flex-1">
              <Card className="border border-gray-200">
                <CardContent className="p-3 items-center">
                  <View className={`w-8 h-8 rounded-lg items-center justify-center mb-2 ${m.alert ? "bg-amber-50 border border-amber-100" : "bg-gray-50 border border-gray-100"}`}>
                    <m.icon size={16} color={m.alert ? "#b45309" : "#6b7280"} />
                  </View>
                  <Text className="text-sm font-bold tracking-tight text-gray-900" numberOfLines={1}>{m.value}</Text>
                  <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase text-center">{m.label}</Text>
                  <Text className="text-[11px] text-gray-500">{m.sub}</Text>
                </CardContent>
              </Card>
            </View>
          ))}
        </View>

        {/* Search */}
        <View className="flex-row items-center gap-2 bg-white border border-gray-300 rounded-xl px-3">
          <Search size={16} color="#9ca3af" />
          <TextInput className="flex-1 py-3.5 text-sm text-gray-900" placeholder="Search products or category…" placeholderTextColor="#9ca3af" value={searchTerm} onChangeText={setSearchTerm} />
          {searchTerm ? <Pressable onPress={() => setSearchTerm("")}><Text className="text-xs font-bold text-gray-500">Clear</Text></Pressable> : null}
        </View>

        {/* Low stock banner */}
        {lowStockItems.length > 0 && (
          <Card className="border border-amber-200 bg-amber-50/60">
            <CardHeader className="flex-row items-center gap-2">
              <AlertTriangle size={16} color="#b45309" />
              <Text className="text-sm font-bold text-amber-900">Stock alert • {lowStockItems.length} items low</Text>
            </CardHeader>
            <CardContent className="pt-0 gap-2">
              {lowStockItems.slice(0, 3).map((it) => (
                <View key={it.id} className="flex-row justify-between items-center">
                  <Text className="text-sm font-medium text-gray-900">{it.name}</Text>
                  <Text className="text-xs font-bold text-amber-800">{it.currentStock} left • min {it.minimumThreshold}</Text>
                </View>
              ))}
              {lowStockItems.length > 3 && <Text className="text-xs text-amber-700">+{lowStockItems.length - 3} more</Text>}
            </CardContent>
          </Card>
        )}

        {/* List */}
        <View className="gap-3">
          {filteredInventory.map((item) => {
            const st = getStockStatus(item);
            const pct = Math.min((item.currentStock / Math.max(item.maximumCapacity, 1)) * 100, 100);
            return (
              <Card key={item.id} className="border border-gray-200">
                <CardContent className="p-4">
                  <View className="flex-row justify-between items-start gap-3 mb-3">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <Text className="text-sm font-bold text-gray-900">{item.name}</Text>
                        <View className="px-1.5 py-0.5 rounded-full bg-white border border-gray-200"><Text className="text-[9px] font-bold tracking-widest text-gray-500">{shortId(item.productId, 6)}</Text></View>
                        <View className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200"><Text className="text-[10px] font-bold text-gray-600">{item.category}</Text></View>
                      </View>
                      <Text className="text-xs text-gray-500 mt-1">Supplier • {item.supplier} • Last {item.lastRestocked}</Text>
                      <Text className="text-xs font-semibold text-gray-900 mt-1">{formatCurrency(item.unitPrice)} / unit</Text>
                    </View>
                    <View className="items-end">
                      <View className="flex-row items-center gap-1.5">
                        <View className={`w-2.5 h-2.5 rounded-full ${st.color}`} />
                        <Text className="text-sm font-bold text-gray-900">{item.currentStock}</Text>
                      </View>
                      <Text className="text-[11px] text-gray-400">of {item.maximumCapacity}</Text>
                      <View className={`mt-1 px-2 py-0.5 rounded-full border ${st.bg}`}><Text className={`text-[10px] font-bold ${st.text}`}>{st.label}</Text></View>
                    </View>
                  </View>

                  <View className="gap-1.5">
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500">Stock level</Text>
                      <Text className="text-xs font-medium text-gray-700">{Math.round(pct)}%</Text>
                    </View>
                    <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <View style={{ width: `${pct}%` }} className={`h-2 rounded-full ${item.currentStock <= item.minimumThreshold ? "bg-red-500" : pct <= 50 ? "bg-amber-500" : "bg-gray-900"}`} />
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-[11px] text-gray-400">Min {item.minimumThreshold}</Text>
                      <Text className="text-[11px] font-bold text-gray-700">Value {formatCurrency(item.currentStock * item.unitPrice)}</Text>
                    </View>
                  </View>

                  <View className="flex-row justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                    <TouchableOpacity onPress={() => handleOpenEditModal(item)} className="flex-row items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-gray-200">
                      <Edit size={14} color="#374151" /><Text className="text-xs font-semibold text-gray-700">Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteItem(item)} disabled={!!isDeleting} className="flex-row items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-red-200">
                      <Trash2 size={14} color="#dc2626" /><Text className="text-xs font-bold text-red-600">Delete</Text>
                    </TouchableOpacity>
                  </View>
                </CardContent>
              </Card>
            );
          })}
          {filteredInventory.length === 0 && (
            <Card className="border border-dashed border-gray-300">
              <CardContent className="items-center py-12">
                <Package size={28} color="#9ca3af" />
                <Text className="text-sm font-semibold text-gray-700 mt-3">{searchTerm ? "No matches" : "No inventory"}</Text>
                <Text className="text-xs text-gray-500 mt-1">Try a different search or add a product</Text>
              </CardContent>
            </Card>
          )}
        </View>
      </ScrollView>

      <Modal visible={showItemModal} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-gray-50">
          <View className="flex-row justify-between items-center p-4 bg-white border-b border-gray-200">
            <View><Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">{editingItem ? "Edit" : "New"}</Text><Text className="text-lg font-bold text-gray-900 -mt-0.5">{editingItem ? "Edit item" : "Add item"}</Text></View>
            <Pressable onPress={() => setShowItemModal(false)} className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"><Text className="font-bold text-gray-600">✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View><Text className="text-sm font-semibold text-gray-700 mb-2">Product name *</Text><TextInput className="bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm" placeholder="e.g., Dairy Meal 50kg" value={formState.name} onChangeText={(t) => setFormState({ ...formState, name: t })} /></View>
            <View>
              <Text className="text-sm font-semibold text-gray-700 mb-2">Category *</Text>
              <TextInput
                className="bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm"
                placeholder="Type or choose — e.g., Dairy Feed"
                value={formState.category}
                onChangeText={(t) => setFormState({ ...formState, category: t })}
                autoCapitalize="words"
              />
              <View className="flex-row flex-wrap gap-2 mt-2">
                {allCategories
                  .filter((c) => !formState.category || c.toLowerCase().includes(formState.category.toLowerCase()))
                  .slice(0, 6)
                  .map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => setFormState({ ...formState, category: cat })}
                      className={`px-3 py-1.5 rounded-full border ${formState.category === cat ? "bg-gray-900 border-gray-900" : "bg-white border-gray-200"}`}
                    >
                      <Text className={`text-xs font-bold ${formState.category === cat ? "text-white" : "text-gray-700"}`}>{cat}</Text>
                    </Pressable>
                  ))}
              </View>
              <Text className="text-[11px] text-gray-400 mt-1">You can create a new category — just type it. Existing categories are suggested above.</Text>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1"><Text className="text-sm font-semibold text-gray-700 mb-2">Current stock</Text><TextInput className="bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm" keyboardType="numeric" value={formState.currentStock} onChangeText={(t)=>setFormState({...formState, currentStock:t})}/></View>
              <View className="flex-1"><Text className="text-sm font-semibold text-gray-700 mb-2">Unit price</Text><TextInput className="bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm" keyboardType="numeric" value={formState.unitPrice} onChangeText={(t)=>setFormState({...formState, unitPrice:t})}/></View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1"><Text className="text-sm font-semibold text-gray-700 mb-2">Min threshold</Text><TextInput className="bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm" keyboardType="numeric" value={formState.minimumThreshold} onChangeText={(t)=>setFormState({...formState, minimumThreshold:t})}/></View>
              <View className="flex-1"><Text className="text-sm font-semibold text-gray-700 mb-2">Max capacity</Text><TextInput className="bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm" keyboardType="numeric" value={formState.maximumCapacity} onChangeText={(t)=>setFormState({...formState, maximumCapacity:t})}/></View>
            </View>
            <View><Text className="text-sm font-semibold text-gray-700 mb-2">Supplier</Text><TextInput className="bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-sm" placeholder="e.g., Kenchic Ltd" value={formState.supplier} onChangeText={(t)=>setFormState({...formState, supplier:t})}/></View>
            <TouchableOpacity onPress={handleSaveItem} disabled={!!isAdjustingStock} className="bg-gray-900 py-4 rounded-xl items-center flex-row justify-center gap-2 mt-2">
              {isAdjustingStock ? <ActivityIndicator color="white"/> : <><Plus size={18} color="white"/><Text className="text-white font-bold">{editingItem ? "Update product" : "Save item"}</Text></>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
