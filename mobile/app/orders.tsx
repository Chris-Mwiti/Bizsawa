import React, { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, CheckCircle, Smartphone, Trash2 } from "lucide-react-native";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { OrdersEmptyState } from "../components/OrderEmptyState";
import { OrdersFooter } from "../components/OrderFooter";
import { OrdersHeader } from "../components/OrderHeader";
import { SalesEntryModal, DraftLine } from "../components/SalesEntryModal";
import { TAB_BAR_SCROLL_PADDING } from "../constants/tabBar";
import { useCustomers, useCreateCustomer } from "../hooks/api/useCustomers";
import { OrderStatus, useOrders } from "../hooks/api/useOrders";
import { useInitiatePayment, usePaymentStatus } from "../hooks/api/usePayments";
import { useProducts } from "../hooks/api/useProducts";
import { Order, toNumber } from "../lib/api-dtos";

const OrderItem = memo(({
  order,
  onUpdateStatus,
  onInitiatePayment,
  isInitiatingPayment,
  formatCurrency,
  formatDate,
}: {
  order: Order;
  onUpdateStatus: (order: Order, status: OrderStatus) => void;
  onInitiatePayment: (order: Order) => void;
  isInitiatingPayment: boolean;
  formatCurrency: (amount: number) => string;
  formatDate: (iso: string) => string;
}) => {
  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <View className="flex-row justify-between mb-3">
          <View className="flex-1 pr-3">
            <Text className="font-bold text-gray-900">Order {order.id.slice(0, 8)}</Text>
            <Text className="text-xs text-gray-500">{formatDate(order.createdAt)}</Text>
          </View>
          <View className="items-end">
            <Text className="font-bold">{formatCurrency(toNumber(order.total))}</Text>
            <Badge variant={order.status === "fulfilled" ? "secondary" : "destructive"}>{order.status}</Badge>
          </View>
        </View>
        <View className="flex-row gap-2">
          {order.status === "draft" && (
            <TouchableOpacity
              className="flex-1 bg-green-600 py-2 rounded-lg items-center"
              onPress={() => onUpdateStatus(order, OrderStatus.confirmed)}
            >
              <Text className="text-white font-bold">Confirm</Text>
            </TouchableOpacity>
          )}
          {order.status === "confirmed" && (
            <TouchableOpacity
              className="flex-1 bg-blue-600 py-2 rounded-lg items-center"
              onPress={() => onUpdateStatus(order, OrderStatus.fulfilled)}
            >
              <Text className="text-white font-bold">Fulfill</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            className="px-3 py-2 rounded-lg bg-gray-100"
            onPress={() => onInitiatePayment(order)}
            disabled={isInitiatingPayment}
          >
            <Smartphone size={18} color="#006b5f" />
          </TouchableOpacity>
          <TouchableOpacity
            className="px-3 py-2 rounded-lg bg-red-50"
            onPress={() => onUpdateStatus(order, OrderStatus.cancelled)}
          >
            <Trash2 size={18} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </CardContent>
    </Card>
  );
});

OrderItem.displayName = "OrderItem";

export default function OrdersScreen() {
  const router = useRouter();
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "" });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const { products, isLoading: productsLoading } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { mutateAsync: createCustomer } = useCreateCustomer();
  const { orders, hasNextPage, createOrder, updateOrder, nextPage, isCreating: isCreatingOrder, isFetching } = useOrders({ limit: 25 });
  const { mutateAsync: initiatePayment, isPending: isInitiatingPayment } = useInitiatePayment();
  const paymentStatus = usePaymentStatus(paymentId || undefined, !!paymentId);

  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const total = draftLines.reduce((sum, line) => sum + toNumber(line.unitPrice) * toNumber(line.quantity), 0);
  const orderStats = useMemo(() => {
    const open = orders.filter((order) => order.status === "draft" || order.status === "confirmed").length;
    const fulfilled = orders.filter((order) => order.status === "fulfilled").length;
    const value = orders.reduce((sum, order) => sum + toNumber(order.total), 0);
    return { open, fulfilled, value };
  }, [orders]);

  const formatCurrency = useCallback((amount: number) => `KES ${amount.toLocaleString("en-KE")}`, []);
  const formatDate = useCallback((iso: string) => new Date(iso).toLocaleDateString("en-KE"), []);

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

  const handleCreateOrder = async () => {
    if (draftLines.length === 0) {
      Alert.alert("Validation", "Add at least one product.");
      return;
    }
    try {
      const order = await createOrder({
        customerId,
        paymentMethod,
        lines: draftLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      });
      setShowOrderModal(false);
      resetDraft();
      Alert.alert("Success", `Order ${order.status} created.`);
    } catch (error: any) {
      Alert.alert("Error", error.friendlyMessage || error.message || "Failed to create order.");
    }
  };

  const handleUpdateStatus = useCallback(
    (order: Order, status: OrderStatus) => {
      const customer = order.customerId ? customers.find((item) => item.id === order.customerId) : undefined;
      if (status === OrderStatus.confirmed && !customer?.phone) {
        Alert.alert("Missing phone", "This order needs a customer phone number before it can be confirmed.");
        return;
      }
      updateOrder({ id: order.id, data: { status, customerPhone: customer?.phone } });
    },
    [customers, updateOrder],
  );

  const handleInitiateOrderPayment = useCallback(
    async (order: Order) => {
      const customer = order.customerId ? customers.find((item) => item.id === order.customerId) : undefined;
      if (!customer?.phone) {
        Alert.alert("Missing phone", "This order needs a customer phone number before sending an M-Pesa request.");
        return;
      }
      const payment = await initiatePayment({
        orderId: order.id,
        phone: customer.phone,
        amount: order.total,
        currency: "KES",
      });
      setPaymentId(payment.id);
      Alert.alert("Payment sent", "The M-Pesa request has been sent.");
    },
    [customers, initiatePayment],
  );

  const renderOrder = useCallback(
    ({ item: order }: { item: Order }) => (
      <OrderItem
        order={order}
        onUpdateStatus={handleUpdateStatus}
        onInitiatePayment={handleInitiateOrderPayment}
        isInitiatingPayment={isInitiatingPayment}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
      />
    ),
    [handleUpdateStatus, handleInitiateOrderPayment, isInitiatingPayment, formatCurrency, formatDate],
  );

  if (productsLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#006b5f" />
        <Text className="text-gray-500 mt-2">Loading orders...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="px-4 pt-12 pb-3 bg-white border-b border-gray-200">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <ChevronLeft size={24} color="#374151" />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-gray-900">Orders</Text>
            <Text className="text-xs text-gray-500">Manage open and fulfilled orders</Text>
          </View>
        </View>
        <View className="flex-row bg-gray-200 rounded-lg w-full p-1">
          <Pressable className="flex-1 py-3 rounded-lg items-center" onPress={() => router.replace("/(tabs)/sales") }>
            <Text className="font-medium text-gray-500">Sales</Text>
          </Pressable>
          <View className="flex-1 py-3 rounded-lg items-center bg-white shadow">
            <Text className="font-medium text-gray-900">Orders</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(order) => order.id}
        renderItem={renderOrder}
        contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_SCROLL_PADDING }}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasNextPage && !isFetching) {
            nextPage();
          }
        }}
        ListHeaderComponent={<OrdersHeader stats={orderStats} formatCurrency={formatCurrency} onCreateOrder={() => setShowOrderModal(true)} />}
        ListEmptyComponent={<OrdersEmptyState />}
        ListFooterComponent={<OrdersFooter visible={isFetching} />}
      />

      <SalesEntryModal
        visible={showOrderModal}
        title="Create New Order"
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
        isSaving={isCreatingOrder}
        onAddCustomer={() => setShowCustomerModal(true)}
        onClose={() => setShowOrderModal(false)}
        onSubmit={handleCreateOrder}
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

      {paymentStatus.data && (
        <View className="absolute bottom-24 left-4 right-4 bg-white border border-gray-200 rounded-lg p-3 flex-row items-center shadow">
          <CheckCircle size={18} color={paymentStatus.data.status === "failed" ? "#dc2626" : "#16a34a"} />
          <Text className="ml-2 text-sm font-medium">Payment status: {paymentStatus.data.status}</Text>
        </View>
      )}
    </View>
  );
}
