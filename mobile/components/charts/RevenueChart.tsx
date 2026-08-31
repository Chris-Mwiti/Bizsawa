import React from "react";
import { View, Text } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";

export interface RevenueChartProps {
  data: Array<{ date: string; revenue: number; transactions: number }>;
  title?: string;
}

export function RevenueChart({ data, title = "Revenue Trend" }: RevenueChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent><View className="items-center py-8"><Text className="text-gray-500">No revenue data</Text></View></CardContent></Card>
    );
  }

  const max = Math.max(...data.map((d) => d.revenue));
  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <View className="h-48 flex-row items-end justify-around mb-4">
          {data.map((point, i) => {
            const h = max > 0 ? (point.revenue / max) * 100 : 0;
            return (
              <View key={i} className="flex-1 flex-col items-center justify-end px-1">
                <View
                  style={{
                    width: "100%",
                    height: `${Math.max(h, 2)}%`,
                    backgroundColor: "#006b5f",
                    borderRadius: 4,
                  }}
                />
                <Text className="text-[10px] text-gray-500 mt-1" numberOfLines={1}>
                  {point.date.split("T")[0].slice(5)}
                </Text>
              </View>
            );
          })}
        </View>
        <View className="space-y-2 max-h-40">
          {data.slice(-7).map((point, i) => (
            <View key={i} className="flex-row justify-between text-sm">
              <Text className="text-gray-700">{point.date.split("T")[0].slice(5)}</Text>
              <Text className="font-bold text-gray-900">{formatCurrency(point.revenue)}</Text>
            </View>
          ))}
        </View>
      </CardContent>
    </Card>
  );
}