import { Tabs } from "expo-router";
import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function InsightsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#006b5f",
        tabBarInactiveTintColor: "#555f6d",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "500" },
        tabBarStyle: {
          backgroundColor: "#f8f9fa",
          borderTopWidth: 0,
          paddingTop: 8,
          height: 60,
        },
        tabBarIconStyle: { marginBottom: 2 },
      }}>
      <Tabs.Screen
        name="overview"
        options={{
          title: "Overview",
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons
              name={focused ? "view-dashboard" : "view-dashboard-outline"}
              size={24}
              color={focused ? "#006b5f" : "#555f6d"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons
              name={focused ? "chart-line" : "chart-line-outline"}
              size={24}
              color={focused ? "#006b5f" : "#555f6d"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: "Expenses",
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons
              name={focused ? "cash-minus" : "cash-minus-outline"}
              size={24}
              color={focused ? "#006b5f" : "#555f6d"}
            />
          ),
        }}
      />
    </Tabs>
  );
}