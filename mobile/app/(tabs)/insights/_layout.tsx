import React from "react";
import { View, Text } from "react-native";
import { Slot, usePathname, useRouter } from "expo-router";
import { useBusinessContext } from "../../../contexts/BusinessContext";
import { Tabs } from "tamagui";
import { BarChart3 } from "lucide-react-native";

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
      {/* AppBar — impeccable: ink header, subtle hairline, business pill, Tamagui Tabs */}
      <View className="bg-white border-b border-gray-200">
        <View className="px-4 pt-12 pb-3">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <View className="w-7 h-7 rounded-lg bg-gray-900 items-center justify-center">
                  <BarChart3 size={14} color="white" />
                </View>
                <Text className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Insights</Text>
                {activeBusiness?.name ? (
                  <View className="ml-1 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200">
                    <Text className="text-[10px] font-bold text-gray-600" numberOfLines={1}>{activeBusiness.name.slice(0, 18)}</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-[20px] font-bold tracking-tight text-gray-900 mt-1">
                {active === "analytics" ? "Analytics" : active === "expenses" ? "Expenses" : "Overview"}
              </Text>
              <Text className="text-xs leading-4 text-gray-500" numberOfLines={1}>
                {active === "analytics" ? "Revenue, profit & segments • tap timeframe to filter" : active === "expenses" ? "Spend by category • add & delete" : "Weekly growth & cash flow • at a glance"}
              </Text>
            </View>
          </View>
        </View>

        {/* Tamagui Tabs — battle-tested, no Pressable hang, impeccable pill */}
        <View className="px-4 pb-3">
          <Tabs
            value={active}
            onValueChange={(v) => router.replace((TABS.find((t) => t.key === v)?.href as any) || "/(tabs)/insights/overview")}
            orientation="horizontal"
            defaultValue="overview"
            activationMode="manual"
          >
            <Tabs.List
              style={{
                backgroundColor: "#f3f4f6",
                borderRadius: 999,
                padding: 4,
                gap: 6,
                flexDirection: "row",
              }}
            >
              {TABS.map((t) => (
                <Tabs.Tab
                  key={t.key}
                  value={t.key}
                  flex={1}
                  justifyContent="center"
                  alignItems="center"
                  paddingVertical={10}
                  borderRadius={999}
                  backgroundColor={active === t.key ? "white" : "transparent"}
                  borderWidth={active === t.key ? 1 : 0}
                  borderColor={active === t.key ? "#e5e7eb" : "transparent"}
                  style={{
                    flex: 1,
                    backgroundColor: active === t.key ? "white" : "transparent",
                    borderRadius: 999,
                    borderWidth: active === t.key ? 1 : 0,
                    borderColor: active === t.key ? "#e5e7eb" : "transparent",
                    shadowColor: active === t.key ? "#000" : "transparent",
                    shadowOpacity: active === t.key ? 0.06 : 0,
                    shadowRadius: 4,
                    elevation: active === t.key ? 1 : 0,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: active === t.key ? "700" : "500", color: active === t.key ? "#111827" : "#6b7280" }}>{t.label}</Text>
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        </View>
      </View>

      <Slot />
    </View>
  );
}
