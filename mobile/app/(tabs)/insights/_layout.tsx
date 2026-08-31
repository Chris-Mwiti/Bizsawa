import React from "react";
import { View, Text, Pressable } from "react-native";
import { Slot, usePathname, useRouter } from "expo-router";
import { useBusinessContext } from "../../../contexts/BusinessContext";

type TabKey = "overview" | "analytics" | "expenses";

const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/(tabs)/insights/overview" },
  { key: "analytics", label: "Analytics", href: "/(tabs)/insights/analytics" },
  { key: "expenses", label: "Expenses", href: "/(tabs)/insights/expenses" },
];

export default function InsightsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeBusiness } = useBusinessContext();

  const active: TabKey = pathname.includes("/analytics")
    ? "analytics"
    : pathname.includes("/expenses")
      ? "expenses"
      : "overview";

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header — impeccable style matching Invoices / Orders */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-200">
        <View className="mb-4">
          <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Insights</Text>
          <Text className="text-xl font-bold text-gray-900 -mt-0.5">
            {active === "analytics" ? "Analytics" : active === "expenses" ? "Expenses" : "Overview"}
          </Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {activeBusiness?.name ? `${activeBusiness.name} • ` : ""}
            {active === "analytics" ? "Revenue, profit & segments" : active === "expenses" ? "Spend by category" : "Weekly growth & cash flow"}
          </Text>
        </View>

        {/* Segmented control — Sales-style pill (not bottom nav) */}
        <View className="flex-row bg-gray-100 rounded-full p-1">
          {TABS.map((t) => {
            const isActive = t.key === active;
            return isActive ? (
              <View key={t.key} className="flex-1 py-2.5 rounded-full items-center bg-white shadow-sm border border-gray-200">
                <Text className="font-bold text-gray-900 text-sm">{t.label}</Text>
              </View>
            ) : (
              <Pressable
                key={t.key}
                className="flex-1 py-2.5 rounded-full items-center active:bg-gray-200/60"
                onPress={() => router.replace(t.href as any)}
                accessibilityRole="button"
                accessibilityState={{ selected: false }}
              >
                <Text className="font-medium text-gray-500 text-sm">{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Slot />
    </View>
  );
}
