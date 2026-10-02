import { Redirect } from 'expo-router'

/** Backward-compat: orders now live as a sub-tab under Sales. */
export default function OrdersRedirect() {
  return <Redirect href='/(tabs)/sales/orders' />
}
