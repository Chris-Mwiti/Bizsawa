import { useState } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import "../global.css";
import { AuthProvider } from "../contexts/AuthContext";
import { BusinessProvider } from "../contexts/BusinessContext";

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BusinessProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="auth/login" options={{ headerShown: false }} />
            <Stack.Screen name="auth/register" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="credit-preview"
              options={{
                title: "Credit",
                presentation: "card",
                headerShown: true,
              }}
            />
            <Stack.Screen name="coach" options={{ presentation: "modal" }} />
            <Stack.Screen name="social" options={{ presentation: "modal" }} />
          </Stack>
          <Toast />
        </BusinessProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
