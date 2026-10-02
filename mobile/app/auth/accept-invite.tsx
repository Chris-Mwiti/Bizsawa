import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useInvites } from '../../hooks/api/useInvites'
import { api } from '../../lib/api'

export default function AcceptInviteScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string; otp?: string; businessId?: string }>()
  const [email, setEmail] = useState((params.email as string) || '')
  const [otp, setOtp] = useState((params.otp as string) || '')
  const [businessId, setBusinessId] = useState((params.businessId as string) || '')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { acceptInvitePublic } = useInvites()

  const handleAccept = async () => {
    if (!email.trim() || !otp.trim()) return Alert.alert('Validation', 'Email and code required')
    setIsLoading(true)
    try {
      // Public accept creates membership (and user if not exists)
      await acceptInvitePublic({ businessId: businessId.trim() || undefined, email: email.trim(), otp: otp.trim(), name: name.trim() || undefined })
     // Use direct API sign-in to get tokens
      try {
        const res = await api.post('/auth/sign-in/email-otp', { email: email.trim(), otp: otp.trim(), name: name.trim() || undefined })
        // Persist auth like normal login would — reuse AuthContext helper via direct storage
        const { persistAuthResponse } = await import('../../lib/api')
        const { persistSecureAuth } = await import('../../lib/secureStorage')
        await persistAuthResponse(res.data)
        await persistSecureAuth({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken, userId: res.data.userId })
        Alert.alert('Joined!', 'Invite accepted and you are now signed in.')
        router.replace('/(tabs)')
        return
      } catch (e:any) {
        // If sign-in fails (e.g. OTP already used), just inform and go to login
        Alert.alert('Invite accepted', 'You have been added to the business. Please sign in with your email code.')
        router.replace({ pathname: '/auth/login', params: { email } } as any)
      }
    } catch (e:any) {
      Alert.alert('Failed', e.friendlyMessage || e.message || 'Invalid code')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <SafeAreaView className='flex-1 bg-white'>
      <ScrollView className='flex-1 px-6' contentContainerStyle={{ paddingVertical: 24, gap: 16 }}>
        <View className='items-center mt-6 mb-2'>
          <Text className='font-geist-bold text-2xl font-bold text-gray-900'>Accept invite</Text>
          <Text className='font-sans text-sm text-gray-500 text-center mt-1'>Enter the email and code from your invite.{"\n"}If you don't have the app, download it then come back here.</Text>
        </View>
        <View>
          <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>Email</Text>
          <TextInput className='bg-white border border-gray-300 rounded-2xl px-4 py-4' keyboardType='email-address' autoCapitalize='none' placeholder='you@example.com' value={email} onChangeText={setEmail} />
        </View>
        <View>
          <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>Invite code (OTP)</Text>
          <TextInput className='bg-white border border-gray-300 rounded-2xl px-4 py-4 text-center tracking-widest' placeholder='123456' keyboardType='number-pad' maxLength={6} value={otp} onChangeText={setOtp} />
          <Text className='font-sans text-xs text-gray-500 mt-1'>6-digit code from email — expires in 24h.</Text>
        </View>
        <View>
          <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>Your name (optional, for new accounts)</Text>
          <TextInput className='bg-white border border-gray-300 rounded-2xl px-4 py-4' placeholder='Jane Doe' value={name} onChangeText={setName} />
        </View>
        <View>
          <Text className='font-geist-semibold text-sm font-semibold text-gray-700 mb-2'>Business ID (optional)</Text>
          <TextInput className='bg-white border border-gray-300 rounded-2xl px-4 py-4' placeholder='Leave empty to auto-detect via code' value={businessId} onChangeText={setBusinessId} />
          <Text className='font-sans text-xs text-gray-500 mt-1'>Usually not needed — code is tied to business.</Text>
        </View>
        <TouchableOpacity onPress={handleAccept} disabled={isLoading} className={`py-4 rounded-2xl items-center ${isLoading ? 'bg-gray-300' : 'bg-accent'}`}>
          {isLoading ? <ActivityIndicator color='white' /> : <Text className='font-geist-bold text-white font-bold'>Accept invite & join</Text>}
        </TouchableOpacity>
        <View className='bg-gray-50 rounded-2xl border border-gray-200 p-3'>
          <Text className='font-geist-bold text-xs font-bold text-gray-900'>No app yet?</Text>
          <Text className='font-sans text-xs leading-4 text-gray-600 mt-1'>Android: https://play.google.com/store/apps/details?id=com.bizsawa.mobile{"\n"}iOS: https://apps.apple.com/app/bizsawa</Text>
        </View>
        <TouchableOpacity onPress={() => router.replace('/auth/login')} className='py-3 items-center'>
          <Text className='font-geist-semibold text-sm font-semibold text-gray-600'>Back to login</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
