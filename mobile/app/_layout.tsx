import '../polyfills'
import { useState } from 'react'
import { View } from 'react-native'
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
                <View style={{ flex: 1, backgroundColor: '#F4F9F7' }}>
                  <OfflineBanner />
                  <View style={{ flex: 1 }}>
                    <Stack screenOptions={{ headerShown: false }}>
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
                    options={{ presentation: 'modal' }}
                  />
                  <Stack.Screen
                    name='social'
                    options={{ presentation: 'modal' }}
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
