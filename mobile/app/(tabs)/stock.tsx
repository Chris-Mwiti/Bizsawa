import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  TrendingUp,
} from "lucide-react-native";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/Progress";
import { TAB_BAR_SCROLL_PADDING } from "../../constants/tabBar";
import { useProducts } from "../../hooks/api/useProducts";

interface InventoryItem {
  id: string;
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
  const { products, isLoading, createProduct, updateProduct } = useProducts();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showCategorySelect, setShowCategorySelect] = useState(false);

  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    currentStock: "0",
    minimumThreshold: "0",
    maximumCapacity: "0",
    unitPrice: "0",
    supplier: "",
  });

  // Map products to inventory items (DB-backed fields with sensible fallbacks)
  const inventory: InventoryItem[] = products.map((p) => {
    const minT =
      p.minStockLevel != null && p.minStockLevel >= 0
        ? p.minStockLevel
        : Math.max(1, Math.floor(p.stockQuantity * 0.2));
    const maxCap =
      p.maxStockLevel != null && p.maxStockLevel > 0
        ? p.maxStockLevel
        : Math.max(p.stockQuantity * 2, 1);
    return {
      id: p.id.toString(),
      name: p.name,
      category: p.category || "Uncategorized",
      currentStock: p.stockQuantity,
      minimumThreshold: minT,
      maximumCapacity: maxCap,
      unitPrice: p.price,
      supplier: p.supplier?.trim() || "—",
      lastRestocked: p.lastRestockedAt
        ? new Date(p.lastRestockedAt).toLocaleDateString()
        : new Date(p.createdAt).toLocaleDateString(),
    };
  });

  const formatCurrency = (amount: number) =>
    `KES ${amount.toLocaleString("en-KE")}`;

  const getStockStatus = (item: InventoryItem) => {
    const cap = Math.max(item.maximumCapacity, 1);
    const stockPercentage = (item.currentStock / cap) * 100;
    const isLowStock = item.currentStock <= item.minimumThreshold;

    if (isLowStock)
      return {
        status: "low",
        color: "bg-red-500",
        label: "Low Stock",
        textColor: "text-red-600",
      };
    if (stockPercentage <= 50)
      return {
        status: "medium",
        color: "bg-yellow-500",
        label: "Medium Stock",
        textColor: "text-yellow-600",
      };
    return {
      status: "good",
      color: "bg-green-500",
      label: "Good Stock",
      textColor: "text-green-600",
    };
  };

  const filteredInventory = inventory.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const lowStockItems = inventory.filter(
    (item) => item.currentStock <= item.minimumThreshold,
  );
  const totalValue = inventory.reduce(
    (sum, item) => sum + item.currentStock * item.unitPrice,
    0,
  );
  const totalItems = inventory.reduce(
    (sum, item) => sum + item.currentStock,
    0,
  );

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.category || !newItem.supplier) return;

    const stock = parseInt(newItem.currentStock) || 0;
    const min = parseInt(newItem.minimumThreshold) || 0;
    const max = parseInt(newItem.maximumCapacity) || 0;
    const price = parseFloat(newItem.unitPrice) || 0;

    try {
      await createProduct({
        name: newItem.name,
        category: newItem.category,
        stockQuantity: stock,
        price: price,
        buyingPrice: Math.round(price * 0.7 * 100) / 100,
        supplier: newItem.supplier.trim(),
        minStockLevel: min,
        maxStockLevel: max > 0 ? max : null,
        lastRestockedAt: new Date().toISOString(),
      });
      setNewItem({
        name: "",
        category: "",
        currentStock: "0",
        minimumThreshold: "0",
        maximumCapacity: "0",
        unitPrice: "0",
        supplier: "",
      });
      setShowAddItem(false);
      Alert.alert("Success", "Product added successfully");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to add product");
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-gray-500">Loading inventory...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING }}>
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-xl font-bold text-gray-900">
              Inventory Manager
            </Text>
            <Text className="text-sm text-gray-500">
              Mfumo wa kuhifadhi bidhaa
            </Text>
          </View>
          <TouchableOpacity
            className="flex-row items-center bg-gray-900 px-3 py-2 rounded-lg"
            onPress={() => setShowAddItem(true)}
          >
            <View className="mr-1">
              <Plus size={16} color="white" />
            </View>
            <Text className="text-white text-sm font-medium">Add</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row justify-between mb-4">
          <Card className="w-[31%]">
            <CardContent className="p-3 items-center">
              <View className="w-8 h-8 bg-blue-100 rounded-lg items-center justify-center mx-auto mb-2">
                <Package size={16} color="#2563eb" />
              </View>
              <Text className="text-sm font-bold text-gray-900">
                {totalItems}
              </Text>
              <Text className="text-[10px] text-gray-500 text-center">
                Total Items
              </Text>
            </CardContent>
          </Card>
          <Card className="w-[31%]">
            <CardContent className="p-3 items-center">
              <View className="w-8 h-8 bg-green-100 rounded-lg items-center justify-center mx-auto mb-2">
                <TrendingUp size={16} color="#16a34a" />
              </View>
              <Text className="text-sm font-bold text-gray-900">
                {formatCurrency(totalValue)}
              </Text>
              <Text className="text-[10px] text-gray-500 text-center">
                Total Value
              </Text>
            </CardContent>
          </Card>
          <Card className="w-[31%]">
            <CardContent className="p-3 items-center">
              <View className="w-8 h-8 bg-red-100 rounded-lg items-center justify-center mx-auto mb-2">
                <AlertTriangle size={16} color="#dc2626" />
              </View>
              <Text className="text-sm font-bold text-gray-900">
                {lowStockItems.length}
              </Text>
              <Text className="text-[10px] text-gray-500 text-center">
                Low Stock
              </Text>
            </CardContent>
          </Card>
        </View>

        <View className="relative flex-row items-center bg-white border border-gray-300 rounded-lg mb-6 shadow-sm">
          <View className="pl-3">
            <Search size={16} color="#9ca3af" />
          </View>
          <TextInput
            className="flex-1 py-3 px-2 text-gray-900"
            placeholder="Search products..."
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>

        {lowStockItems.length > 0 && (
          <Card className="mb-4 bg-red-50 border-red-200">
            <CardHeader className="pb-2">
              <CardTitle>
                <View className="flex-row items-center">
                  <View className="mr-2">
                    <AlertTriangle size={16} color="#b91c1c" />
                  </View>
                  <Text className="text-sm font-bold text-red-800">
                    Stock Alert - {lowStockItems.length} items
                  </Text>
                </View>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lowStockItems.slice(0, 3).map((item) => (
                <View
                  key={item.id}
                  className="flex-row justify-between items-center mb-1"
                >
                  <Text className="font-medium text-sm text-gray-800">
                    {item.name}
                  </Text>
                  <Text className="text-xs text-red-600 font-bold">
                    {item.currentStock} left (min: {item.minimumThreshold})
                  </Text>
                </View>
              ))}
              {lowStockItems.length > 3 && (
                <Text className="text-xs text-red-500 italic mt-1">
                  +{lowStockItems.length - 3} more items need restocking
                </Text>
              )}
            </CardContent>
          </Card>
        )}

        <View className="space-y-4">
          {filteredInventory.map((item) => {
            const stockStatus = getStockStatus(item);
            const cap = Math.max(item.maximumCapacity, 1);
            const stockPercentage = (item.currentStock / cap) * 100;

            return (
              <Card key={item.id} className="mb-4">
                <CardContent className="p-4">
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center mb-1">
                        <Text className="font-bold text-gray-900 mr-2 flex-shrink">
                          {item.name}
                        </Text>
                        <Badge
                          variant="outline"
                          className="flex-shrink-0"
                          textClassName="text-[10px]"
                        >
                          {item.category}
                        </Badge>
                      </View>
                      <Text className="text-xs text-gray-500">
                        Supplier: {item.supplier}
                      </Text>
                      <Text className="text-xs font-medium mt-1">
                        Price: {formatCurrency(item.unitPrice)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <View className="flex-row items-center mb-1">
                        <View
                          className={`w-3 h-3 rounded-full mr-2 ${stockStatus.color}`}
                        />
                        <Text className={`font-bold ${stockStatus.textColor}`}>
                          {item.currentStock}
                        </Text>
                      </View>
                      <Text className="text-[10px] text-gray-400">
                        of {item.maximumCapacity}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-2">
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-xs text-gray-500">Stock Level</Text>
                      <Text className="text-xs text-gray-700 font-medium">
                        {stockStatus.label}
                      </Text>
                    </View>
                    <Progress value={stockPercentage} className="mb-1" />
                    <View className="flex-row justify-between">
                      <Text className="text-[10px] text-gray-400">
                        Min: {item.minimumThreshold}
                      </Text>
                      <Text className="text-[10px] text-gray-700 font-bold">
                        Value:{" "}
                        {formatCurrency(item.currentStock * item.unitPrice)}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-3 p-2 bg-blue-50 rounded-lg">
                    <Text className="text-xs text-blue-700">
                      Set min threshold and max capacity when adding items for accurate stock alerts.
                    </Text>
                  </View>
                </CardContent>
              </Card>
            );
          })}
          {filteredInventory.length === 0 && (
            <Card>
              <CardContent className="p-8 items-center justify-center">
                <View className="mb-4">
                  <Package size={40} color="#9ca3af" />
                </View>
                <Text className="text-gray-500 font-medium">
                  {searchTerm ? "No matches found" : "No inventory items"}
                </Text>
              </CardContent>
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Add Item Modal */}
      <Modal
        visible={showAddItem}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View className="flex-1 bg-gray-50">
          <View className="flex-row justify-between items-center p-4 bg-white border-b border-gray-200 shadow-sm">
            <Text className="text-lg font-bold text-gray-900">
              Add Inventory Item
            </Text>
            <TouchableOpacity onPress={() => setShowAddItem(false)}>
              <Text className="text-gray-500 font-bold text-lg">X</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text className="font-bold text-gray-700 mb-1">Product Name *</Text>
            <TextInput
              className="bg-white border border-gray-300 p-3 rounded-lg mb-4"
              placeholder="e.g., Dairy Meal 50kg"
              value={newItem.name}
              onChangeText={(t) => setNewItem({ ...newItem, name: t })}
            />

            <Text className="font-bold text-gray-700 mb-1">Category *</Text>
            <TouchableOpacity
              onPress={() => setShowCategorySelect(!showCategorySelect)}
              className="bg-white border border-gray-300 p-3 rounded-lg mb-4 flex-row justify-between"
            >
              <Text
                className={newItem.category ? "text-gray-900" : "text-gray-400"}
              >
                {newItem.category || "Select category"}
              </Text>
              <Text className="text-gray-400">▼</Text>
            </TouchableOpacity>

            {showCategorySelect && (
              <View className="bg-white border border-gray-200 rounded-lg mb-4">
                {[
                  "Dairy Feed",
                  "Poultry Feed",
                  "Swine Feed",
                  "Aquaculture",
                  "Other",
                ].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    className="p-3 border-b border-gray-100"
                    onPress={() => {
                      setNewItem({ ...newItem, category: cat });
                      setShowCategorySelect(false);
                    }}
                  >
                    <Text className="text-gray-800">{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View className="flex-row justify-between mb-4">
              <View className="w-[48%]">
                <Text className="font-bold text-gray-700 mb-1">
                  Current Stock
                </Text>
                <TextInput
                  className="bg-white border border-gray-300 p-3 rounded-lg"
                  keyboardType="numeric"
                  value={newItem.currentStock}
                  onChangeText={(t) =>
                    setNewItem({ ...newItem, currentStock: t })
                  }
                />
              </View>
              <View className="w-[48%]">
                <Text className="font-bold text-gray-700 mb-1">Unit Price</Text>
                <TextInput
                  className="bg-white border border-gray-300 p-3 rounded-lg"
                  keyboardType="numeric"
                  value={newItem.unitPrice}
                  onChangeText={(t) => setNewItem({ ...newItem, unitPrice: t })}
                />
              </View>
            </View>

            <View className="flex-row justify-between mb-4">
              <View className="w-[48%]">
                <Text className="font-bold text-gray-700 mb-1">
                  Min Threshold
                </Text>
                <TextInput
                  className="bg-white border border-gray-300 p-3 rounded-lg"
                  keyboardType="numeric"
                  value={newItem.minimumThreshold}
                  onChangeText={(t) =>
                    setNewItem({ ...newItem, minimumThreshold: t })
                  }
                />
              </View>
              <View className="w-[48%]">
                <Text className="font-bold text-gray-700 mb-1">
                  Max Capacity
                </Text>
                <TextInput
                  className="bg-white border border-gray-300 p-3 rounded-lg"
                  keyboardType="numeric"
                  value={newItem.maximumCapacity}
                  onChangeText={(t) =>
                    setNewItem({ ...newItem, maximumCapacity: t })
                  }
                />
              </View>
            </View>

            <Text className="font-bold text-gray-700 mb-1">Supplier *</Text>
            <TextInput
              className="bg-white border border-gray-300 p-3 rounded-lg mb-6"
              placeholder="e.g., Kenchic Ltd"
              value={newItem.supplier}
              onChangeText={(t) => setNewItem({ ...newItem, supplier: t })}
            />

            <TouchableOpacity
              onPress={handleAddItem}
              className="bg-gray-900 py-4 rounded-xl items-center flex-row justify-center"
            >
              <View className="mr-2">
                <Plus size={20} color="white" />
              </View>
              <Text className="text-white font-bold text-lg">Save Item</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
