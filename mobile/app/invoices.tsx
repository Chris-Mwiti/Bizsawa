import { Redirect } from 'expo-router'

/** Backward-compat: invoices now live as a sub-tab under Sales. */
export default function InvoicesRedirect() {
  return <Redirect href='/(tabs)/sales/invoices' />
}
