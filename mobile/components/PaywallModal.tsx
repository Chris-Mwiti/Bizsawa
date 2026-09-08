import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { Modal } from 'react-native'
import { Crown, Smartphone, Check } from 'lucide-react-native'
import { useSubscription, PlanCode } from '../hooks/api/useSubscription'

const PREMIUM_FEATURES = [
  '5 businesses (free = 1)',
  'Unlimited products, sales & invoices',
  'Full analytics: month / year + AI insights',
  'M-Pesa + WhatsApp automation',
]

export function PaywallModal({
  visible,
  onClose,
  feature,
  onSuccess,
}: {
  visible: boolean
  onClose: () => void
  feature?: string
  onSuccess?: () => void
}) {
  const { initiateUpgrade, getPayment, refetch } = useSubscription()
  const [phone, setPhone] = useState('')
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const paymentQuery = getPayment(paymentId as any)
  const status = paymentQuery.data?.status

  const handlePay = async () => {
    if (!phone.trim() || phone.replace(/\D/g, '').length < 9) {
      Alert.alert('Validation', 'Enter M-Pesa phone e.g. 0712345678 or 2547...')
      return
    }
    setSending(true)
    try {
      const pay = await initiateUpgrade({ planCode: 'premium' as PlanCode, phone: phone.trim() })
      setPaymentId(pay.id)
      Alert.alert('STK Push sent', 'Check your phone for M-Pesa prompt and enter PIN. Polling status...')
    } catch (e: any) {
      Alert.alert('Error', e.friendlyMessage || e.message || 'Failed to initiate')
    } finally {
      setSending(false)
    }
  }

  React.useEffect(() => {
    if (status === 'succeeded') {
      refetch()
      Alert.alert('Welcome to Premium', 'Your subscription is now active!')
      onSuccess?.()
      onClose()
      setPaymentId(null)
    } else if (status === 'failed') {
      Alert.alert('Payment failed', paymentQuery.data?.failureMessage || 'STK cancelled or failed. Try again.')
    }
  }, [status])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-gray-50 p-4 gap-4">
        <View className="flex-row justify-between items-center bg-white p-4 rounded-2xl border border-gray-200">
          <View className="flex-row items-center gap-2">
            <View className="w-11 h-11 rounded-2xl bg-gray-900 items-center justify-center"><Crown size={16} color="white" /></View>
            <View>
              <Text className="font-bold text-gray-900">Upgrade to Premium</Text>
              <Text className="text-xs text-gray-500">{feature || 'Unlock full power'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} className="w-11 h-11 rounded-full bg-gray-100 items-center justify-center"><Text className="font-bold">✕</Text></TouchableOpacity>
        </View>

        <View className="bg-white p-4 rounded-2xl border border-gray-200 gap-3">
          <Text className="text-sm font-bold text-gray-900">KES 399 / month • 3,900 / year (18% off)</Text>
          {PREMIUM_FEATURES.map((f) => (
            <View key={f} className="flex-row items-center gap-2">
              <Check size={14} color="#059669" /><Text className="text-sm text-gray-700">{f}</Text>
            </View>
          ))}
        </View>

        <View className="bg-white p-4 rounded-2xl border border-gray-200 gap-3">
          <Text className="text-sm font-semibold text-gray-700">M-Pesa phone for STK Push *</Text>
          <View className="flex-row items-center gap-2 border border-gray-300 rounded-2xl px-4 py-4 bg-white">
            <Smartphone size={16} color="#6b7280" />
            <TextInput className="flex-1 text-sm" placeholder="0712345678 or 2547..." keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          </View>
          <Text className="text-xs text-gray-400">Isolated from business payments • goes to BizSawa Paybill, callback upgrades subscription</Text>
          {paymentId ? (
            <View className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
              <Text className="text-xs font-bold text-amber-900">Status: {status || 'pending'} {status==='processing'?'— polling 3s':''}</Text>
              {status==='processing' && <ActivityIndicator className="mt-2" color="#b45309" />}
              <Text className="text-xs text-amber-700 mt-1">Payment {paymentId.slice(0,8)} • checkout {paymentQuery.data?.checkoutRequestId?.slice(0,12) || '—'}</Text>
            </View>
          ) : null}
          <TouchableOpacity onPress={handlePay} disabled={sending} className="bg-gray-900 py-4 rounded-2xl items-center mt-1 disabled:opacity-50">
            {sending ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Lipa na M-Pesa • STK Push</Text>}
          </TouchableOpacity>
          <Text className="text-xs text-center text-gray-400">Sandbox: use test phone 254708374149 • prod uses real Paybill</Text>
        </View>
      </View>
    </Modal>
  )
}
