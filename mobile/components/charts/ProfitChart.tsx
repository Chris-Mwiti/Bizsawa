import React from "react";
import { View, Text } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";

export interface ProfitChartProps {
  data: Array<{ date: string; revenue: number; expenses: number; profit: number; margin: number }>;
  title?: string;
}

export function ProfitChart({ data, title = "Profit & Margin" }: ProfitChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent><View className="items-center py-8"><Text className="text-gray-500">No profit data</Text></View></CardContent></Card>
    );
  }

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <View className="space-y-2">
          {data.map((point, i) => (
            <View key={i} className="flex-row items-center justify-between p-3 bg-gray-50 rounded-lg">
              <Text className="font-medium text-gray-900">{point.date.split("T")[0].slice(5)}</Text>
              <View className="flex-row gap-3">
                <Text className="text-green-700 font-bold">{formatCurrency(point.profit)}</Text>
                <Text className="text-blue-700 font-bold">{point.margin.toFixed(1)}%</Text>
              </View>
            </View>
          ))}
        </View>
      </CardContent>
    </Card>
  );
}