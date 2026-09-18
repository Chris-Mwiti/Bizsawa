import '../polyfills'
import { useState } from 'react'
import { View, StatusBar, Platform } from 'react-native'
import { Stack } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'
import { TamaguiProvider } from 'tamagui'
import tamaguiConfig from '../tamagui.config'
import { AuthProvider } from '../contexts/AuthContext'
import { BusinessProvider } from '../contexts/BusinessContext'
import { SyncProvider } from '../sync/SyncProvider'
import { TourProvider } from '../contexts/TourContext'
import { OfflineBanner } from '../components/OfflineBanner'

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
  )

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme='light'>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BusinessProvider>
            <SyncProvider>
              <TourProvider>
                {/* Fix status-bar covering: opaque bar, dark content, never translucent so swipe-down shade stays reachable */}
                <StatusBar
                  barStyle='dark-content'
                  backgroundColor='#F4F9F7'
                  translucent={false}
                />
                <View style={{ flex: 1, backgroundColor: '#F4F9F7' }}>
                  <OfflineBanner />
                  <View style={{ flex: 1 }}>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: '#F4F9F7' },
                        // Android: prevent edge-to-edge under status bar; iOS: formSheet will handle it
                        ...(Platform.OS === 'android'
                          ? { statusBarTranslucent: false } as any
                          : {}),
                      }}
                    >
                  <Stack.Screen
                    name='auth/login'
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name='auth/register'
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen name='(tabs)' />
                  <Stack.Screen
                    name='credit-preview'
                    options={{
                      title: 'Credit',
                      presentation: 'card',
                      headerShown: true,
                    }}
                  />
                  <Stack.Screen
                    name='coach'
                    options={{
                      presentation: 'formSheet',
                      sheetAllowedDetents: [0.92, 1] as any,
                      sheetCornerRadius: 20,
                      sheetExpandsWhenScrolledToEdge: false,
                      sheetGrabberVisible: true,
                      headerShown: false,
                      // Android fallback when formSheet not supported
                      ...((Platform.OS === 'android' ? { presentation: 'modal' } : {}) as any),
                      contentStyle: { backgroundColor: 'transparent' },
                      animation: 'slide_from_bottom',
                    }}
                  />
                  <Stack.Screen
                    name='social'
                    options={{
                      presentation: 'formSheet',
                      sheetAllowedDetents: [0.92, 1] as any,
                      sheetCornerRadius: 20,
                      sheetExpandsWhenScrolledToEdge: false,
                      sheetGrabberVisible: true,
                      headerShown: false,
                      ...((Platform.OS === 'android' ? { presentation: 'modal' } : {}) as any),
                      contentStyle: { backgroundColor: 'transparent' },
                      animation: 'slide_from_bottom',
                    }}
                  />
                  <Stack.Screen
                    name='sync-conflicts'
                    options={{
                      presentation: 'card',
                      headerShown: true,
                      title: 'Sync Conflicts',
                    }}
                  />
                </Stack>
                  </View>
                  <Toast />
                </View>
              </TourProvider>
            </SyncProvider>
          </BusinessProvider>
        </AuthProvider>
      </QueryClientProvider>
    </TamaguiProvider>
  )
}
