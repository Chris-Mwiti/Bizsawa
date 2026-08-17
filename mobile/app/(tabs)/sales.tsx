import React, { useCallback, useEffect, useMemo, useState, memo } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Banknote, CheckCircle, CreditCard, Plus, Smartphone, Trash2 } from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { TAB_BAR_SCROLL_PADDING } from "../../constants/tabBar";
import { useCustomers, useCreateCustomer } from "../../hooks/api/useCustomers";
import { OrderStatus, useOrders } from "../../hooks/api/useOrders";
import { useInitiatePayment, usePaymentStatus } from "../../hooks/api/usePayments";
import { useProducts } from "../../hooks/api/useProducts";
import { useSales } from "../../hooks/api/useSales";
import { Order, toNumber } from "../../lib/api-dtos";
import { OrdersHeader } from "../../components/OrderHeader";
import { OrdersEmptyState } from "../../components/OrderEmptyState";
import { OrdersFooter } from "../../components/OrderFooter";

interface DraftLine {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
}

// Extract & Memoize Order Item to prevent FlatList thread freezing
const OrderItem = memo(({
  order,
  onUpdateStatus,
  onInitiatePayment,
  isInitiatingPayment,
  formatCurrency,
  formatDate,
}: {
  order: Order;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onInitiatePayment: (id: string, amount: string) => void;
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
              onPress={() => onUpdateStatus(order.id, OrderStatus.confirmed)}
            >
              <Text className="text-white font-bold">Confirm</Text>
            </TouchableOpacity>
          )}
          {order.status === "confirmed" && (
            <TouchableOpacity
              className="flex-1 bg-blue-600 py-2 rounded-lg items-center"
              onPress={() => onUpdateStatus(order.id, OrderStatus.fulfilled)}
            >
              <Text className="text-white font-bold">Fulfill</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            className="px-3 py-2 rounded-lg bg-gray-100"
            onPress={() => onInitiatePayment(order.id, order.total)}
            disabled={isInitiatingPayment}
          >
            <Smartphone size={18} color="#006b5f" />
          </TouchableOpacity>
          <TouchableOpacity
            className="px-3 py-2 rounded-lg bg-red-50"
            onPress={() => onUpdateStatus(order.id, OrderStatus.cancelled)}
          >
            <Trash2 size={18} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </CardContent>
    </Card>
  );
});

OrderItem.displayName = "OrderItem";

export default function SalesTab() {
  const params = useLocalSearchParams<{ segment?: string; action?: string }>();
  const [activeTab, setActiveTab] = useState<"sales" | "orders">("sales");
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "" });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  
  const handleOpenOrderModal = useCallback(() => setShowOrderModal(true), []);

  const { products, isLoading: productsLoading } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { mutateAsync: createCustomer } = useCreateCustomer();
  const { orders, hasNextPage, hasPreviousPage, nextPage, previousPage, createOrder, updateOrder, isCreating: isCreatingOrder, isFetching } = useOrders({ limit: 25 });
  const { sales, createSale, isCreating: isCreatingSale, refetch: refetchSales } = useSales();
  const { mutateAsync: initiatePayment, isPending: isInitiatingPayment } = useInitiatePayment();
  const paymentStatus = usePaymentStatus(paymentId || undefined, !!paymentId);

  const formatCurrency = useCallback((amount: number) => `KES ${amount.toLocaleString("en-KE")}`, []);
  const formatDate = useCallback((iso: string) => new Date(iso).toLocaleDateString("en-KE"), []);

  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const total = draftLines.reduce((sum, line) => sum + toNumber(line.unitPrice) * toNumber(line.quantity), 0);
  const todaysSales = sales.filter((sale) => new Date(sale.soldAt).toDateString() === new Date().toDateString());
  const todaysRevenue = todaysSales.reduce((sum, sale) => sum + toNumber(sale.total), 0);

  const orderStats = useMemo(() => {
    const open = orders.filter((order) => order.status === "draft" || order.status === "confirmed").length;
    const fulfilled = orders.filter((order) => order.status === "fulfilled").length;
    const value = orders.reduce((sum, order) => sum + toNumber(order.total), 0);
    return { open, fulfilled, value };
  }, [orders]);

  useEffect(() => {
    const segment = Array.isArray(params.segment) ? params.segment[0] : params.segment;
    if (segment === "sales" || segment === "orders") {
      setActiveTab(segment);
    }

    if (params.action === "new-sale") {
      setShowSaleModal(true);
    }
  }, [params.segment, params.action]);

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

  // Status update handler wrapped in useCallback
  const handleUpdateStatus = useCallback(
    (id: string, status: OrderStatus) => {
      updateOrder({ id, data: { status } });
    },
    [updateOrder],
  );

  const handleInitiateOrderPayment = useCallback(
    async (orderId: string, amount: string) => {
      const customer = customerId ? customers.find((item) => item.id === customerId) : undefined;
      if (!customer?.phone) {
        Alert.alert("Missing phone", "Select a customer with a phone number before sending an M-Pesa request.");
        return;
      }
      const payment = await initiatePayment({
        orderId,
        phone: customer.phone,
        amount,
        currency: "KES",
      });
      setPaymentId(payment.id);
      Alert.alert("Payment sent", "The M-Pesa request has been sent.");
    },
    [customerId, customers, initiatePayment],
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

        <View className="flex-row bg-gray-200 rounded-lg mb-2 max-w-sm self-center w-full">
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg items-center ${activeTab === "sales" ? "bg-white shadow" : ""}`}
            onPress={() => setActiveTab("sales")}
          >
            <Text className={`font-medium ${activeTab === "sales" ? "text-gray-900" : "text-gray-500"}`}>Sales</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-3 rounded-lg items-center ${activeTab === "orders" ? "bg-white shadow" : ""}`}
            onPress={() => setActiveTab("orders")}
          >
            <Text className={`font-medium ${activeTab === "orders" ? "text-gray-900" : "text-gray-500"}`}>Orders</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === "sales" ? (
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
      ) : (
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
            if (hasNextPage && !isFetching){
              nextPage()     
            }
          }}
          ListHeaderComponent={
            <OrdersHeader
              stats={orderStats}
              formatCurrency={formatCurrency}
              onCreateOrder={handleOpenOrderModal}
            />
          }
          ListEmptyComponent={
            <OrdersEmptyState />
          }

          ListFooterComponent={
            <OrdersFooter visible={isFetching} />
          }
        />
      )}

      <EntryModal
        visible={showSaleModal || showOrderModal}
        title={showSaleModal ? "Record Direct Sale" : "Create New Order"}
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
        isSaving={showSaleModal ? isCreatingSale : isCreatingOrder}
        onAddCustomer={() => setShowCustomerModal(true)}
        onClose={() => {
          setShowSaleModal(false);
          setShowOrderModal(false);
        }}
        onSubmit={showSaleModal ? handleCreateSale : handleCreateOrder}
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

function EntryModal(props: {
  visible: boolean;
  title: string;
  products: Array<{ id: string; name: string; price: number; stockQuantity: number }>;
  customers: Array<{ id: string; name: string; phone?: string }>;
  customerId: string | null;
  setCustomerId: (id: string | null) => void;
  paymentMethod: string;
  setPaymentMethod: (method: string) => void;
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
  quantity: string;
  setQuantity: (quantity: string) => void;
  draftLines: DraftLine[];
  addLine: () => void;
  total: number;
  isSaving: boolean;
  onAddCustomer: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const selectedProduct = props.products.find((product) => product.id === props.selectedProductId);
  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <View className="flex-1 bg-gray-50">
        <View className="flex-row justify-between items-center p-4 bg-white border-b border-gray-200">
          <Text className="text-lg font-bold">{props.title}</Text>
          <TouchableOpacity onPress={props.onClose} className="p-2">
            <Text className="text-gray-500 font-bold text-lg">X</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text className="font-bold text-gray-900 mb-2">Customer</Text>
          <View className="bg-white border border-gray-200 rounded-lg mb-4">
            <TouchableOpacity className="p-3 border-b border-gray-100" onPress={props.onAddCustomer}>
              <Text className="text-green-700 font-bold">+ Add New Customer</Text>
            </TouchableOpacity>
            {props.customers.map((customer) => (
              <TouchableOpacity
                key={customer.id}
                className={`p-3 border-b border-gray-100 ${props.customerId === customer.id ? "bg-green-50" : ""}`}
                onPress={() => props.setCustomerId(customer.id)}
              >
                <Text className="font-medium">{customer.name}</Text>
                {customer.phone ? <Text className="text-xs text-gray-500">{customer.phone}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>

          <Text className="font-bold text-gray-900 mb-2">Payment Method</Text>
          <View className="flex-row gap-2 mb-4">
            {[
              { id: "mpesa", label: "M-Pesa", icon: Smartphone },
              { id: "cash", label: "Cash", icon: Banknote },
              { id: "card", label: "Card", icon: CreditCard },
            ].map((method) => {
              const Icon = method.icon;
              const active = props.paymentMethod === method.id;
              return (
                <TouchableOpacity
                  key={method.id}
                  className={`flex-1 p-3 rounded-lg flex-row items-center justify-center border ${
                    active ? "bg-green-50 border-green-500" : "bg-white border-gray-200"
                  }`}
                  onPress={() => props.setPaymentMethod(method.id)}
                >
                  <Icon size={16} color={active ? "#16a34a" : "#6b7280"} />
                  <Text className={`ml-2 font-medium ${active ? "text-green-700" : "text-gray-600"}`}>
                    {method.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text className="font-bold text-gray-900 mb-2">Products</Text>
          <View className="bg-white border border-gray-200 rounded-lg mb-3 max-h-[180px]">
            <ScrollView nestedScrollEnabled>
              {props.products.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  className={`p-3 border-b border-gray-100 ${
                    props.selectedProductId === product.id ? "bg-blue-50" : ""
                  }`}
                  onPress={() => props.setSelectedProductId(product.id)}
                >
                  <Text className="font-medium">{product.name}</Text>
                  <Text className="text-xs text-gray-500">
                    {formatCurrency(product.price)} • Stock: {product.stockQuantity}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View className="flex-row gap-2 mb-4">
            <TextInput
              className="flex-1 bg-white border border-gray-300 rounded-lg p-3"
              placeholder="Qty"
              keyboardType="numeric"
              value={props.quantity}
              onChangeText={props.setQuantity}
            />
            <TouchableOpacity
              className="w-14 bg-green-600 rounded-lg items-center justify-center"
              onPress={props.addLine}
              disabled={!selectedProduct}
            >
              <Plus size={22} color="white" />
            </TouchableOpacity>
          </View>

          {props.draftLines.map((line, index) => (
            <View
              key={`${line.productId}-${index}`}
              className="flex-row justify-between bg-white border border-gray-100 rounded-lg p-3 mb-2"
            >
              <View>
                <Text className="font-medium">{line.productName}</Text>
                <Text className="text-xs text-gray-500">Qty {line.quantity}</Text>
              </View>
              <Text className="font-bold">{formatCurrency(toNumber(line.unitPrice) * toNumber(line.quantity))}</Text>
            </View>
          ))}

          <View className="bg-blue-50 p-4 rounded-xl border border-blue-100 my-4">
            <Text className="text-blue-900 font-bold text-center text-lg">Total: {formatCurrency(props.total)}</Text>
          </View>
          <TouchableOpacity
            className="bg-gray-900 h-14 rounded-xl items-center justify-center"
            onPress={props.onSubmit}
            disabled={props.isSaving}
          >
            {props.isSaving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Save</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}
