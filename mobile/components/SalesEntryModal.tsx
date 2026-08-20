import React from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Banknote, CreditCard, Plus, Smartphone } from "lucide-react-native";
import { toNumber } from "../lib/api-dtos";

export interface DraftLine {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
}

export function SalesEntryModal(props: {
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
                  className={`p-3 border-b border-gray-100 ${props.selectedProductId === product.id ? "bg-blue-50" : ""}`}
                  onPress={() => props.setSelectedProductId(product.id)}
                >
                  <Text className="font-medium">{product.name}</Text>
                  <Text className="text-xs text-gray-500">
                    {formatCurrency(product.price)} - Stock: {product.stockQuantity}
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
            {props.isSaving ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Save</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}
