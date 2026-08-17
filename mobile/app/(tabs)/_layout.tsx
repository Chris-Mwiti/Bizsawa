import "../../global.css";
import { Tabs } from "expo-router";
import { AppTabBar } from "../../components/AppTabBar";
import { TabWrapper } from "../../components/TabWrapper";

export default function TabsLayout() {
  return (
    <TabWrapper>
      <Tabs
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={{
          headerShown: true,
          tabBarShowLabel: false,
          tabBarStyle: {
            overflow: "visible",
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
          },
        }}
      >
        <Tabs.Screen name="sales" options={{ title: "Sales" }} />
        <Tabs.Screen name="stock" options={{ title: "Stock" }} />
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="insights" options={{ title: "Insight" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </TabWrapper>
  );
}
