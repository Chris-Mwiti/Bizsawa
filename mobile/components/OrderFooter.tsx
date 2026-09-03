import { memo } from 'react'
import { View, ActivityIndicator } from 'react-native'

export const OrdersFooter = memo(({ visible }: { visible: boolean }) =>
  visible ? (
    <View style={{ paddingVertical: 20 }}>
      <ActivityIndicator color='#006b5f' />
    </View>
  ) : null,
)
OrdersFooter.displayName = 'OrdersFooter'
