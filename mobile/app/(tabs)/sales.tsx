import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { SalesEntryModal, DraftLine } from "../../components/SalesEntryModal";
import { TAB_BAR_SCROLL_PADDING } from "../../constants/tabBar";
import { useCustomers, useCreateCustomer } from "../../hooks/api/useCustomers";
import { useProducts } from "../../hooks/api/useProducts";
import { useSales } from "../../hooks/api/useSales";
import { toNumber } from "../../lib/api-dtos";

export default function SalesTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string }>();
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "" });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const { products, isLoading: productsLoading } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { mutateAsync: createCustomer } = useCreateCustomer();
  const { sales, createSale, isCreating: isCreatingSale, refetch: refetchSales } = useSales();

  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const total = draftLines.reduce((sum, line) => sum + toNumber(line.unitPrice) * toNumber(line.quantity), 0);
  const todaysSales = sales.filter((sale) => new Date(sale.soldAt).toDateString() === new Date().toDateString());
  const todaysRevenue = todaysSales.reduce((sum, sale) => sum + toNumber(sale.total), 0);

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE");

  useEffect(() => {
    if (params.action === "new-sale") {
      setShowSaleModal(true);
    }
  }, [params.action]);

  const addLine = () => {
    if (!selectedProduct) {
      Alert.alert("Validation", "Select a product first.");
      return;
    }
    if (toNumber(quantity) <= 0) {
      Alert.alert("Validation", "Enter a valid quantity.");
      return;
    }
    setDraftLines((prev) => [
      ...prev,
      {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity,
        unitPrice: selectedProduct.price.toString(),
      },
    ]);
    setSelectedProductId("");
    setQuantity("1");
  };

  const resetDraft = () => {
    setCustomerId(null);
    setPaymentMethod("cash");
    setDraftLines([]);
    setSelectedProductId("");
    setQuantity("1");
  };

  const handleCreateCustomer = async () => {
    if (!customerForm.name.trim()) {
      Alert.alert("Validation", "Customer name is required.");
      return;
    }
    const customer = await createCustomer({
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim() || undefined,
    });
    setCustomerId(customer.id);
    setCustomerForm({ name: "", phone: "" });
    setShowCustomerModal(false);
  };

  const handleCreateSale = async () => {
    if (draftLines.length === 0) {
      Alert.alert("Validation", "Add at least one product.");
      return;
    }
    try {
      await createSale({
        customerId,
        paymentMethod,
        lines: draftLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      });
      setShowSaleModal(false);
      resetDraft();
      await refetchSales();
      Alert.alert("Success", "Sale recorded successfully.");
    } catch (error: any) {
      Alert.alert("Error", error.friendlyMessage || error.message || "Failed to record sale.");
    }
  };

  if (productsLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#006b5f" />
        <Text className="text-gray-500 mt-2">Loading sales workspace...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="px-4 pt-3 pb-2">
        <View className="items-center py-2 mb-2">
          <Text className="text-xl font-bold text-gray-900">Sales Tracker</Text>
          <Text className="text-sm text-gray-500">Today's sales & orders</Text>
        </View>

        {/* Tab switcher: Sales / Orders / Invoices */}
        <View className="flex-row bg-gray-200 rounded-lg mb-2 max-w-sm self-center w-full p-1">
          <View className="flex-1 py-3 rounded-lg items-center bg-white shadow">
            <Text className="font-medium text-gray-900">Sales</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            className="flex-1 py-3 rounded-lg items-center"
            onPress={() => router.push("/orders")}
          >
            <Text className="font-medium text-gray-500">Orders</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="flex-1 py-3 rounded-lg items-center"
            onPress={() => router.push("/invoices")}
          >
            <Text className="font-medium text-gray-500">Invoices</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING }}>
        <View>
          <View className="flex-row justify-between mb-4">
            <Card className="w-[48%]">
              <CardContent className="p-4">
                <Text className="text-xs text-gray-500">Today</Text>
                <Text className="text-lg font-bold text-gray-900">{formatCurrency(todaysRevenue)}</Text>
              </CardContent>
            </Card>
            <Card className="w-[48%]">
              <CardContent className="p-4">
                <Text className="text-xs text-gray-500">Transactions</Text>
                <Text className="text-lg font-bold text-gray-900">{todaysSales.length}</Text>
              </CardContent>
            </Card>
          </View>
          <TouchableOpacity
            className="bg-gray-900 h-12 rounded-lg flex-row items-center justify-center mb-4"
            onPress={() => setShowSaleModal(true)}
          >
            <Plus size={18} color="white" />
            <Text className="text-white font-bold ml-2">Record Sale</Text>
          </TouchableOpacity>
          {sales.map((sale) => (
            <Card key={sale.id} className="mb-3">
              <CardContent className="p-4">
                <View className="flex-row justify-between">
                  <View>
                    <Text className="font-bold text-gray-900">{sale.receiptNumber}</Text>
                    <Text className="text-xs text-gray-500">{formatDate(sale.soldAt)}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-bold text-green-700">{formatCurrency(toNumber(sale.total))}</Text>
                    <Badge variant="secondary">{sale.status}</Badge>
                  </View>
                </View>
              </CardContent>
            </Card>
          ))}
        </View>
      </ScrollView>

      <SalesEntryModal
        visible={showSaleModal}
        title="Record Direct Sale"
        products={products}
        customers={customers}
        customerId={customerId}
        setCustomerId={setCustomerId}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        quantity={quantity}
        setQuantity={setQuantity}
        draftLines={draftLines}
        addLine={addLine}
        total={total}
        isSaving={isCreatingSale}
        onAddCustomer={() => setShowCustomerModal(true)}
        onClose={() => setShowSaleModal(false)}
        onSubmit={handleCreateSale}
      />

      <Modal
        visible={showCustomerModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCustomerModal(false)}
      >
        <View className="flex-1 bg-gray-50 p-4 justify-center">
          <Card>
            <CardHeader>
              <CardTitle>
                <Text className="font-bold">New Customer</Text>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TextInput
                className="border border-gray-300 rounded-lg p-3 mb-3 bg-white"
                placeholder="Customer name"
                value={customerForm.name}
                onChangeText={(name) => setCustomerForm((prev) => ({ ...prev, name }))}
              />
              <TextInput
                className="border border-gray-300 rounded-lg p-3 mb-4 bg-white"
                placeholder="Phone"
                keyboardType="phone-pad"
                value={customerForm.phone}
                onChangeText={(phone) => setCustomerForm((prev) => ({ ...prev, phone }))}
              />
              <TouchableOpacity
                className="bg-gray-900 h-12 rounded-lg items-center justify-center"
                onPress={handleCreateCustomer}
              >
                <Text className="text-white font-bold">Save Customer</Text>
              </TouchableOpacity>
            </CardContent>
          </Card>
        </View>
      </Modal>
    </View>
  );
}
