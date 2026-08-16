import React, { useState, useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import {
  User,
  Phone,
  MapPin,
  Building,
  Calendar,
  Star,
  Trophy,
  CheckCircle,
  Smartphone,
  LogOut,
} from "lucide-react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { useAuth } from "../../contexts/AuthContext";
import { useBusiness } from "../../hooks/api/useBusiness";
import { TAB_BAR_SCROLL_PADDING } from "../../constants/tabBar";

const achievements = [
  { title: "Consistent Earner", description: "6 months of steady revenue", earned: true },
  { title: "Payment Master", description: "No late payments in 3 months", earned: true },
  { title: "Growth Champion", description: "20% month-over-month growth", earned: false },
  { title: "Customer Favorite", description: "4.5+ customer rating", earned: true },
];

function metadataLocation(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const loc = m.location ?? m.address ?? m.city;
  if (typeof loc === "string" && loc.trim()) return loc.trim();
  return null;
}

export default function ProfileTab() {
  const router = useRouter();
  const { userData, logout } = useAuth();
  const { data: business, isLoading, isError, refetch } = useBusiness(userData?.id);

  const ownerParts = useMemo(() => {
    const name = business?.ownerName || userData?.ownerName || "";
    const parts = name.trim().split(/\s+/);
    return {
      first: parts[0] || "—",
      last: parts.slice(1).join(" ") || "",
      initials: `${(parts[0]?.[0] || "?").toUpperCase()}${(parts[1]?.[0] || parts[0]?.[1] || "?").toUpperCase()}`,
    };
  }, [business?.ownerName, userData?.ownerName]);

  const businessName = business?.name || userData?.name || "—";

  const phone =
    business?.ownerPhone?.trim() ||
    business?.whatsappNumber?.trim() ||
    "Not set";
  const mpesaDisplay = business?.whatsappNumber?.trim() || business?.ownerPhone?.trim() || "—";
  const location = metadataLocation(business?.metadata) || "Not set in profile";
  const businessType = business?.businessType?.trim() || "—";
  const years = business?.yearsInBusiness?.trim() || "—";

  return (
    <View className="flex-1 bg-gray-50">
      <View className="px-4 pt-6">
        <View className="items-center mb-6">
          <Text className="text-xl font-bold text-gray-900">Your Business</Text>
          <Text className="text-sm text-gray-500">Dhibiti maelezo yako / Manage your details</Text>
        </View>

        {/* Navigation Buttons */}
        <View className="flex-row items-center mb-8">
          <TouchableOpacity
            className="flex-1 py-4 bg-white border border-gray-200 rounded-l-2xl items-center"
            onPress={() => router.push("/credit-preview")}
          >
            <Text className="font-bold text-gray-600">Credit</Text>
          </TouchableOpacity>
          
          <View className="flex-[1.3] z-10 -mx-4 shadow-xl shadow-primary-900/40">
            <View className="bg-primary-600 rounded-2xl py-5 items-center border-4 border-white">
              <Text className="font-black text-white text-lg tracking-wider">PROFILE</Text>
            </View>
          </View>

          <TouchableOpacity
            className="flex-1 py-4 bg-white border border-gray-200 rounded-r-2xl items-center"
            onPress={() => router.push("/rewards")}
          >
            <Text className="font-bold text-gray-600">Rewards</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_BAR_SCROLL_PADDING }}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
      >
        <View>
          {isLoading && (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color="#006b5f" />
              <Text className="text-gray-500 text-sm mt-2">Loading business profile…</Text>
            </View>
          )}
          {isError && (
            <TouchableOpacity onPress={() => refetch()} className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
              <Text className="text-red-800 text-sm">Could not load full profile. Tap to retry.</Text>
            </TouchableOpacity>
          )}

          <Card className="mb-4">
            <CardContent className="p-4 flex-row items-center">
              <View className="w-16 h-16 rounded-full bg-blue-100 items-center justify-center mr-4">
                <Text className="text-lg font-bold text-blue-700">{ownerParts.initials}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold">
                  {ownerParts.first} {ownerParts.last}
                </Text>
                <Text className="text-sm text-gray-600">{businessName}</Text>
                <View className="flex-row items-center mt-1">
                  <View className="mr-1">
                    <MapPin size={12} color="#6b7280" />
                  </View>
                  <Text className="text-xs text-gray-500">{location}</Text>
                </View>
              </View>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>
                <View className="flex-row items-center">
                  <View className="mr-2">
                    <User size={16} color="#374151" />
                  </View>
                  <Text className="font-bold">Business Information</Text>
                </View>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <View className="space-y-3">
                <View className="flex-row items-center mb-3">
                  <View className="mr-3">
                    <Phone size={16} color="#6b7280" />
                  </View>
                  <Text className="text-gray-800">{phone}</Text>
                </View>
                <View className="flex-row items-center mb-3">
                  <View className="mr-3">
                    <Building size={16} color="#6b7280" />
                  </View>
                  <Text className="text-gray-800">{businessType}</Text>
                </View>
                <View className="flex-row items-center mb-3">
                  <View className="mr-3">
                    <Calendar size={16} color="#6b7280" />
                  </View>
                  <Text className="text-gray-800">
                    {years === "—" ? "Years in business not set" : `${years} in business`}
                  </Text>
                </View>
                {business?.ownerEmail ? (
                  <View className="flex-row items-center mb-1">
                    <Text className="text-xs text-gray-500">Email: {business.ownerEmail}</Text>
                  </View>
                ) : null}
              </View>

              <TouchableOpacity 
                onPress={logout}
                className="flex-row items-center justify-center py-4 border-t border-gray-100 mt-4"
              >
                <LogOut size={18} color="#dc2626" />
                <Text className="text-red-600 font-bold ml-2">Sign Out</Text>
              </TouchableOpacity>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>
                <View className="flex-row items-center">
                  <View className="mr-2">
                    <Smartphone size={16} color="#374151" />
                  </View>
                  <Text className="font-bold">Mobile Money</Text>
                </View>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <View className="flex-row items-center justify-between p-3 border border-gray-200 rounded-lg mb-3">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 bg-green-100 rounded-full items-center justify-center mr-3">
                    <Text className="text-green-700 font-bold">MP</Text>
                  </View>
                  <View>
                    <Text className="font-bold">M-Pesa / contact</Text>
                    <Text className="text-xs text-gray-500">{mpesaDisplay}</Text>
                  </View>
                </View>
                <CheckCircle size={20} color="#16a34a" />
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
