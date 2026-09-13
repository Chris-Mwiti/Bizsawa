import React, { useMemo, useState } from 'react'
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Pressable,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import {
  Send,
  MessageSquare,
  Download,
  ChevronLeft,
  CreditCard,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  Package,
  User,
  Printer,
  Share2,
} from 'lucide-react-native'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card'
import { useInvoices } from '../../hooks/api/useInvoices'
import { useCustomers } from '../../hooks/api/useCustomers'
import { useProducts } from '../../hooks/api/useProducts'
import { TAB_BAR_SCROLL_PADDING } from '../../constants/tabBar'
import { toNumber } from '../../lib/api-dtos'
import { useBusinessContext } from '../../contexts/BusinessContext'
import { buildInvoiceHtml, invoiceShareText } from '../../lib/invoicePdf'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
// SDK 54: expo-file-system ~19.0.24 moved classic APIs to /legacy
// New File API lives at 'expo-file-system' (Paths, File), legacy keeps documentDirectory/moveAsync/getInfoAsync
import * as FileSystem from 'expo-file-system/legacy'
import { Linking, Share } from 'react-native'

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')} ${d.toLocaleString('en-KE', { month: 'short' })} ${d.getFullYear()}`
}

// heuristic: UUID v4 pattern
function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v.trim(),
  )
}

const STATUS_STYLE: Record<
  string,
  {
    bg: string
    text: string
    label: string
    icon: React.ComponentType<{ size?: number; color?: string }>
  }
> = {
  draft: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    label: 'DRAFT',
    icon: Clock,
  },
  sent: { bg: 'bg-sky-100', text: 'text-sky-700', label: 'SENT', icon: Send },
  viewed: {
    bg: 'bg-cyan-100',
    text: 'text-cyan-700',
    label: 'VIEWED',
    icon: CheckCircle,
  },
  partial: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    label: 'PARTIAL',
    icon: AlertCircle,
  },
  paid: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    label: 'PAID',
    icon: CheckCircle,
  },
  overdue: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    label: 'OVERDUE',
    icon: AlertCircle,
  },
  cancelled: {
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    label: 'CANCELLED',
    icon: XCircle,
  },
}

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentRef, setPaymentRef] = useState('')
  const [lastSettlement, setLastSettlement] = useState<any>(null)

  const {
    getInvoice,
    sendInvoice,
    isSending,
    sendWhatsApp,
    isSendingWhatsApp,
    recordPayment,
    isRecordingPayment,
    settleCustomerPayment,
    isSettlingCustomer,
  } = useInvoices() as any
  const { data: customers = [] } = useCustomers()
  const { products } = useProducts()
  const { activeBusiness } = useBusinessContext()
  const [isPrinting, setIsPrinting] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const query = getInvoice(id)
  const invoice = query.data
  const isLoading = query.isLoading

  const formatCurrency = (amount: string | number) =>
    `KES ${toNumber(amount).toLocaleString('en-KE')}`

  const productMap = useMemo(() => {
    const m = new Map<string, string>()
    products.forEach((p) => m.set(p.id, p.name))
    return m
  }, [products])

  const getLineTitle = (line: any) => {
    const raw = (line.description || '').trim()
    // If description is a UUID and we have product map, resolve to product name
    if (raw && isUUID(raw) && line.productId && productMap.has(line.productId))
      return productMap.get(line.productId)!
    if (raw && isUUID(raw) && productMap.has(raw)) return productMap.get(raw)!
    if (line.productId && productMap.has(line.productId))
      return productMap.get(line.productId)!
    if (raw) return raw
    if (line.productId && productMap.has(line.productId))
      return productMap.get(line.productId)!
    return 'Item'
  }

  const handleSend = async () => {
    try {
      await sendInvoice(id)
      Alert.alert('Sent', 'Invoice sent via email')
      query.refetch()
    } catch (e: any) {
      Alert.alert('Error', e.friendlyMessage || 'Failed to send')
    }
  }
  const handleWhatsApp = async () => {
    try {
      await sendWhatsApp(id)
      Alert.alert('Shared', 'Invoice shared via WhatsApp')
      query.refetch()
    } catch (e: any) {
      Alert.alert('Error', e.friendlyMessage || 'Failed to share')
    }
  }
  const handleRecordPayment = async () => {
    if (!paymentAmount) {
      Alert.alert('Error', 'Amount required')
      return
    }
    // Use customer-level FIFO settlement when possible (requirement: payment for customer settles oldest unpaid first, works for cash & mpesa)
    const customerId =
      (invoice as any)?.customerId ||
      (invoice as any)?.customer_id ||
      customer?.id
    const useCustomerSettle = !!customerId
    try {
      if (useCustomerSettle) {
        const result: any = await settleCustomerPayment({
          customerId,
          amount: paymentAmount,
          method: paymentMethod,
          reference: paymentRef,
        })
        const allocations = result?.allocations || []
        setLastSettlement(result)
        if (allocations.length > 1) {
          const summary = allocations
            .map((a: any) => `${a.invoiceNumber}: ${a.amount} (${a.status})`)
            .join('\n')
          Alert.alert(
            'Payment distributed',
            `KES ${paymentAmount} applied to ${allocations.length} invoices:\n${summary}${result.remainingCredit && parseFloat(result.remainingCredit) > 0 ? `\n\nExcess credit: KES ${result.remainingCredit} — will apply to next invoices. ✅ Complete.` : '\n\nAll invoices fully settled. ✅'}`,
          )
        } else if (result?.remainingCredit && parseFloat(result.remainingCredit) > 0) {
          Alert.alert(
            'Payment complete — excess credit',
            `Invoice ${invoice.invoiceNumber} fully paid. Excess KES ${result.remainingCredit} kept as customer credit and will auto-apply to oldest unpaid invoices.`,
          )
        } else {
          Alert.alert('Success', 'Payment applied — invoice fully settled ✅')
        }
      } else {
        await recordPayment({
          id,
          amount: paymentAmount,
          method: paymentMethod,
          reference: paymentRef,
        })
        Alert.alert('Success', 'Payment recorded')
      }
      setShowPaymentModal(false)
      setPaymentAmount('')
      setPaymentRef('')
      query.refetch()
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.friendlyMessage || e.message || 'Failed to record payment',
      )
    }
  }
  const buildPdfHtml = () => {
    if (!invoice) return ''
    return buildInvoiceHtml({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      subtotal: (invoice as any).subtotal,
      taxAmount: (invoice as any).taxAmount,
      total: (invoice as any).total,
      amountPaid: (invoice as any).amountPaid,
      amountDue: (invoice as any).amountDue,
      currency: (invoice as any).currency || 'KES',
      dueAt: (invoice as any).dueAt,
      createdAt: (invoice as any).createdAt,
      notes: (invoice as any).notes,
      customerName: customer?.name || (invoice as any).customerName || 'Customer',
      customerPhone: customer?.phone || (invoice as any).customerPhone || '',
      lines: (invoice.lines || []).map((l: any) => ({
        description: l.description,
        productName: l.productId ? (productMap.get(l.productId) || l.description) : l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
      business: {
        name: activeBusiness?.name || 'Business Shop',
        phone: activeBusiness?.phone || '',
        email: activeBusiness?.email || '',
        address: activeBusiness?.address || '',
        taxPin: (activeBusiness as any)?.taxPin || '',
      },
    })
  }

  const handlePrint = async () => {
    try {
      setIsPrinting(true)
      const html = buildPdfHtml()
      await Print.printAsync({ html })
    } catch (e: any) {
      Alert.alert('Print failed', e?.message || 'Could not print')
    } finally { setIsPrinting(false) }
  }

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true)
      const html = buildPdfHtml()
      const { uri } = await Print.printToFileAsync({ html })
      // SDK 54: expo-file-system ~19.0.24 uses documentDirectory + moveAsync
      const safeName = (invoice.invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9-_]/g, '_')
      const fileName = `${safeName}.pdf`
      let targetUri = uri

      if (FileSystem.documentDirectory) {
        const dest = `${FileSystem.documentDirectory}${fileName}`
        try {
          await FileSystem.moveAsync({ from: uri, to: dest })
          const info = await FileSystem.getInfoAsync(dest)
          if (info.exists) targetUri = dest
        } catch {
          // move can fail if file exists or permission issue — fallback to original uri
          targetUri = uri
        }
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', dialogTitle: `Invoice ${invoice.invoiceNumber}`, UTI: 'com.adobe.pdf' })
      } else {
        Alert.alert('Saved', `PDF ready at ${targetUri}`)
      }
    } catch (e: any) {
      Alert.alert('Download failed', e?.message || 'Could not generate PDF')
    } finally { setIsDownloading(false) }
  }

  const handleShareWhatsAppNative = async () => {
    try {
      const html = buildPdfHtml()
      const { uri } = await Print.printToFileAsync({ html })
      const text = invoiceShareText({
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        subtotal: (invoice as any).subtotal,
        taxAmount: (invoice as any).taxAmount,
        total: (invoice as any).total,
        amountPaid: (invoice as any).amountPaid,
        amountDue: (invoice as any).amountDue,
        currency: (invoice as any).currency || 'KES',
        dueAt: (invoice as any).dueAt,
        createdAt: (invoice as any).createdAt,
        notes: (invoice as any).notes,
        customerName: customer?.name || (invoice as any).customerName || 'Customer',
        customerPhone: customer?.phone || (invoice as any).customerPhone || '',
        lines: [],
        business: { name: activeBusiness?.name || 'Business Shop', phone: activeBusiness?.phone, email: activeBusiness?.email, address: activeBusiness?.address, taxPin: (activeBusiness as any)?.taxPin },
      })
      // Try to share file via system sheet — user can pick WhatsApp
      if (await Sharing.isAvailableAsync()) {
        // Share file first; if user picks WhatsApp it attaches
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share via WhatsApp', UTI: 'com.adobe.pdf' })
      }
      // Also offer to open WhatsApp with text
      const encoded = encodeURIComponent(text + `\n\n*Amount due: KES ${toNumber((invoice as any).amountDue).toLocaleString('en-KE')}*`)
      const waUrl = `whatsapp://send?text=${encoded}`
      const can = await Linking.canOpenURL(waUrl)
      if (can) {
        // Ask user if they want to open WhatsApp with caption
        Alert.alert('Share via WhatsApp', 'PDF ready. Open WhatsApp to send caption?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open WhatsApp', onPress: () => Linking.openURL(waUrl) },
        ])
      } else {
        // Fallback: generic share sheet with text
        await Share.share({ message: text })
      }
    } catch (e: any) {
      Alert.alert('Share failed', e?.message || 'Could not share')
    }
  }

  if (isLoading)
    return (
      <View className='flex-1 items-center justify-center bg-white'>
        <ActivityIndicator size='large' color='#006b5f' />
      </View>
    )
  if (!invoice)
    return (
      <View className='flex-1 items-center justify-center p-6 bg-gray-50'>
        <Text className='text-gray-500'>Invoice not found</Text>
        <Pressable
          onPress={() => router.back()}
          className='mt-4 px-4 py-2 bg-gray-900 rounded-full'
        >
          <Text className='text-white font-bold text-sm'>Go back</Text>
        </Pressable>
      </View>
    )

  const s = STATUS_STYLE[invoice.status] || STATUS_STYLE.draft
  const Icon = s.icon
  const customer = customers.find((c) => c.id === (invoice as any).customerId)
  const isPaid = invoice.status === 'paid'
  const isCancelled = invoice.status === 'cancelled'

  return (
    <View className='flex-1 bg-gray-50'>
      {/* Header — single source of truth, generous padding */}
      <View className='px-4 pt-12 pb-4 bg-white border-b border-gray-200'>
        <View className='flex-row items-center gap-3'>
          <TouchableOpacity
            onPress={() => router.back()}
            className='p-2 -ml-2 rounded-full active:bg-gray-100'
          >
            <ChevronLeft size={22} color='#111827' />
          </TouchableOpacity>
          <View className='flex-1'>
            <Text className='text-xs font-bold tracking-widest text-gray-400 uppercase'>
              Invoice
            </Text>
            <Text className='text-lg font-bold text-gray-900' numberOfLines={1}>
              {invoice.invoiceNumber}
            </Text>
          </View>
          <View
            className={`flex-row items-center gap-2 px-3 py-1.5 rounded-full ${s.bg}`}
          >
            <Icon
              size={13}
              color={
                s.text.includes('emerald')
                  ? '#047857'
                  : s.text.includes('red')
                    ? '#b91c1c'
                    : '#475569'
              }
            />
            <Text className={`text-xs font-bold tracking-widest ${s.text}`}>
              {s.label}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: TAB_BAR_SCROLL_PADDING + 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary — not crowded, clear amount hierarchy */}
        <Card className='border border-gray-200'>
          <CardContent className='p-5'>
            <View className='flex-row justify-between items-start gap-4'>
              <View className='flex-1'>
                <Text className='text-xs font-bold font-mono tracking-widest text-gray-400 uppercase mb-1'>
                  Amount due
                </Text>
                <Text
                  className={`text-3xl font-bold tracking-tight ${isPaid ? 'text-emerald-700' : 'text-gray-900'}`}
                >
                  {formatCurrency(invoice.amountDue)}
                </Text>
                <Text className='text-xs text-gray-500 mt-1'>
                  of {formatCurrency(invoice.total)} total • Due{' '}
                  {formatDate(invoice.dueAt)}
                </Text>
              </View>
              <View className='items-end'>
                <Text className='text-xs text-gray-400'>Status</Text>
                <Text className='text-sm font-bold text-gray-900 capitalize mt-1'>
                  {invoice.status}
                </Text>
              </View>
            </View>

            <View className='h-px bg-gray-100 my-4' />

            <View className='flex-row justify-between gap-4'>
              <View className='flex-1'>
                <Text className='text-xs font-bold font-mono tracking-widest text-gray-400 uppercase'>
                  Subtotal
                </Text>
                <Text className='text-sm font-semibold text-gray-900 mt-1'>
                  {formatCurrency(invoice.subtotal)}
                </Text>
              </View>
              <View className='flex-1'>
                <Text className='text-xs font-bold font-mono tracking-widest text-gray-400 uppercase'>
                  Tax
                </Text>
                <Text className='text-sm font-semibold text-gray-900 mt-1'>
                  {formatCurrency(invoice.taxAmount)}
                </Text>
              </View>
              <View className='flex-1 items-end'>
                <Text className='text-xs font-bold font-mono tracking-widest text-gray-400 uppercase'>
                  Paid
                </Text>
                <Text className='text-sm font-bold font-mono text-emerald-700 mt-1'>
                  {formatCurrency(invoice.amountPaid)}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Excess / allocation banner — visible sign that payment was complete and excess applied FIFO */}
        {lastSettlement && (
          <Card className='border border-emerald-200 bg-emerald-50/70'>
            <CardContent className='p-4'>
              <View className='flex-row items-center gap-2 mb-2'>
                <CheckCircle size={16} color='#059669' />
                <Text className='font-bold text-emerald-900 text-sm'>
                  Payment complete — distributed FIFO
                </Text>
              </View>
              {lastSettlement.allocations?.length ? (
                <View className='gap-2'>
                  {lastSettlement.allocations.map((a: any, idx: number) => (
                    <View key={a.invoiceId || a.invoiceNumber || idx} className='flex-row justify-between items-center bg-white rounded-2xl px-3 py-2 border border-emerald-100'>
                      <Text className='text-xs font-bold font-mono text-gray-800' numberOfLines={1}>
                        {a.invoiceNumber || `Inv ${String(a.invoiceId).slice(0, 6)}`} • {String(a.status).toUpperCase()}
                      </Text>
                      <Text className='text-xs font-bold font-mono text-emerald-700'>
                        {formatCurrency(a.amount)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {lastSettlement.remainingCredit && parseFloat(lastSettlement.remainingCredit) > 0 ? (
                <View className='mt-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl'>
                  <Text className='text-xs font-bold font-mono text-amber-900'>
                    Excess credit: {formatCurrency(lastSettlement.remainingCredit)}
                  </Text>
                  <Text className='text-xs text-amber-800 mt-1'>
                    Fully paid — excess will auto-apply to next oldest unpaid invoice for this customer.
                  </Text>
                </View>
              ) : (
                <Text className='text-xs text-emerald-700 mt-2'>
                  All targeted invoices fully settled. No remaining credit.
                </Text>
              )}
            </CardContent>
          </Card>
        )}

        {/* Customer */}
        <Card className='border border-gray-200'>
          <CardHeader className='pb-2'>
            <View className='flex-row items-center gap-2'>
              <User size={16} color='#6b7280' />
              <CardTitle>Customer</CardTitle>
            </View>
          </CardHeader>
          <CardContent className='pt-0'>
            <View className='flex-row items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100'>
              <View className='w-10 h-10 rounded-full bg-gray-900 items-center justify-center'>
                <Text className='text-white font-bold'>
                  {(customer?.name || invoice.customerName || '?')
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
              <View className='flex-1'>
                <Text className='font-bold text-gray-900'>
                  {customer?.name || invoice.customerName}
                </Text>
                <Text className='text-sm text-gray-500'>
                  {customer?.phone || (invoice as any).customerPhone || '-'}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Items — product name, not ID, with breathing room */}
        <Card className='border border-gray-200'>
          <CardHeader>
            <View className='flex-row items-center justify-between'>
              <View className='flex-row items-center gap-2'>
                <Package size={16} color='#6b7280' />
                <CardTitle>Items</CardTitle>
              </View>
              <View className='px-3 py-1 rounded-full bg-gray-100'>
                <Text className='text-xs font-bold font-mono text-gray-600'>
                  {invoice.lines.length}{' '}
                  {invoice.lines.length === 1 ? 'item' : 'items'}
                </Text>
              </View>
            </View>
          </CardHeader>
          <CardContent>
            <View className='gap-3'>
              {invoice.lines.map((line: any, i: number) => {
                const title = getLineTitle(line)
                const qty = toNumber(line.quantity)
                const unit = formatCurrency(line.unitPrice)
                const total = formatCurrency(
                  toNumber(line.lineTotal) || qty * toNumber(line.unitPrice),
                )
                return (
                  <View
                    key={line.id || i}
                    className='flex-row gap-3 p-4 bg-white rounded-2xl border border-gray-200'
                  >
                    <View className='w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 items-center justify-center shrink-0'>
                      <Package size={16} color='#6b7280' />
                    </View>
                    <View className='flex-1 gap-1'>
                      <Text
                        className='font-bold text-gray-900 text-[14px] leading-4'
                        numberOfLines={2}
                      >
                        {title}
                      </Text>
                      <View className='flex-row items-center gap-2 flex-wrap'>
                        <View className='px-2 py-1 rounded-full bg-gray-100'>
                          <Text className='text-xs font-bold text-gray-600'>
                            QTY {qty}
                          </Text>
                        </View>
                        <Text className='text-xs text-gray-500'>× {unit}</Text>
                      </View>
                    </View>
                    <View className='items-end justify-center shrink-0 ml-2'>
                      <Text className='font-bold text-gray-900 text-sm'>
                        {total}
                      </Text>
                      <Text className='text-xs text-gray-400'>
                        Line total
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </CardContent>
        </Card>

        {/* Summary breakdown — airy, not dense */}
        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <View className='gap-3'>
              <View className='flex-row justify-between items-center'>
                <Text className='text-sm text-gray-600'>Subtotal</Text>
                <Text className='text-sm font-semibold text-gray-900'>
                  {formatCurrency(invoice.subtotal)}
                </Text>
              </View>
              <View className='flex-row justify-between items-center'>
                <Text className='text-sm text-gray-600'>Tax</Text>
                <Text className='text-sm font-semibold text-gray-900'>
                  {formatCurrency(invoice.taxAmount)}
                </Text>
              </View>
              <View className='flex-row justify-between items-center'>
                <Text className='text-sm text-gray-600'>Paid</Text>
                <Text className='text-sm font-bold font-mono text-emerald-700'>
                  {formatCurrency(invoice.amountPaid)}
                </Text>
              </View>
              <View className='h-px bg-gray-100' />
              <View className='flex-row justify-between items-center'>
                <Text className='text-sm font-bold font-mono text-gray-900'>
                  Amount Due
                </Text>
                <Text className='text-base font-bold font-mono text-gray-900'>
                  {formatCurrency(invoice.amountDue)}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {invoice.payments && invoice.payments.length > 0 && (
          <Card className='border border-gray-200'>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <View className='gap-2.5'>
                {invoice.payments.map((p, i) => (
                  <View
                    key={(p as any).id || i}
                    className='flex-row items-center justify-between p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-100'
                  >
                    <View className='flex-row items-center gap-3'>
                      <View className='w-11 h-11 rounded-full bg-emerald-600 items-center justify-center'>
                        <CheckCircle size={14} color='white' />
                      </View>
                      <View>
                        <Text className='text-sm font-bold font-mono text-gray-900 capitalize'>
                          {p.method.replace('_', ' ')}
                        </Text>
                        <Text className='text-xs text-gray-500'>
                          {formatDate(p.paidAt)}
                        </Text>
                      </View>
                    </View>
                    <Text className='font-bold font-mono text-emerald-700'>
                      {formatCurrency(p.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            </CardContent>
          </Card>
        )}

        {invoice.notes && (
          <Card className='border border-gray-200'>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Text className='text-sm leading-5 text-gray-700'>
                {invoice.notes}
              </Text>
            </CardContent>
          </Card>
        )}

        {/* Actions — print / download / share via native WhatsApp (not WAHA) */}
        <Card className='border border-gray-200'>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <View className='gap-3'>
              <View className='flex-row gap-3'>
                {!isPaid && !isCancelled && (
                  <TouchableOpacity
                    className='flex-1 flex-row items-center justify-center gap-2 bg-emerald-600 px-4 py-4 rounded-2xl active:opacity-90'
                    onPress={handleWhatsApp}
                    disabled={isSendingWhatsApp}
                  >
                    <MessageSquare size={18} color='white' />
                    <Text className='text-white font-bold text-sm'>
                      {isSendingWhatsApp ? 'Sharing…' : 'WhatsApp (Server)'}
                    </Text>
                  </TouchableOpacity>
                )}
                {!isPaid && !isCancelled && (
                  <TouchableOpacity
                    className='flex-1 flex-row items-center justify-center gap-2 bg-sky-600 px-4 py-4 rounded-2xl active:opacity-90'
                    onPress={handleSend}
                    disabled={isSending}
                  >
                    <Send size={18} color='white' />
                    <Text className='text-white font-bold text-sm'>
                      {isSending ? 'Sending…' : 'Email'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View className='flex-row gap-3'>
                <TouchableOpacity
                  className='flex-1 flex-row items-center justify-center gap-2 bg-white border border-gray-200 px-4 py-4 rounded-2xl active:bg-gray-50'
                  onPress={handlePrint}
                  disabled={isPrinting}
                >
                  <Printer size={18} color='#111827' />
                  <Text className='text-gray-900 font-bold text-sm'>
                    {isPrinting ? 'Printing…' : 'Print'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className='flex-1 flex-row items-center justify-center gap-2 bg-white border border-gray-200 px-4 py-4 rounded-2xl active:bg-gray-50'
                  onPress={handleDownloadPDF}
                  disabled={isDownloading}
                >
                  <Download size={18} color='#111827' />
                  <Text className='text-gray-900 font-bold text-sm'>
                    {isDownloading ? 'Saving…' : 'Download'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View className='flex-row gap-3'>
                <TouchableOpacity
                  className='flex-1 flex-row items-center justify-center gap-2 bg-[#25D366] px-4 py-4 rounded-2xl active:opacity-90'
                  onPress={handleShareWhatsAppNative}
                >
                  <Share2 size={18} color='white' />
                  <Text className='text-white font-bold text-sm'>Share via WhatsApp</Text>
                </TouchableOpacity>
                {!isPaid && !isCancelled && (
                  <TouchableOpacity
                    className='flex-1 flex-row items-center justify-center gap-2 bg-gray-900 px-4 py-4 rounded-2xl active:opacity-90'
                    onPress={() => setShowPaymentModal(true)}
                  >
                    <CreditCard size={18} color='white' />
                    <Text className='text-white font-bold text-sm'>
                      Record Payment
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {(isPaid || isCancelled) && (
                <Text className='text-xs text-center text-gray-400 mt-1'>
                  No further actions — invoice is {invoice.status}
                </Text>
              )}
              <Text className='text-xs text-center text-gray-400'>From: <Text className='font-bold'>{activeBusiness?.name || 'Your Shop'}</Text> — printed header uses business shop title</Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>

      <Modal
        visible={showPaymentModal}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View className='flex-1 bg-gray-50'>
          <View className='flex-row justify-between items-center p-4 bg-white border-b border-gray-200'>
            <Text className='text-lg font-bold text-gray-900'>
              Record Payment
            </Text>
            <TouchableOpacity
              onPress={() => setShowPaymentModal(false)}
              className='w-11 h-11 rounded-full bg-gray-100 items-center justify-center'
            >
              <Text className='text-gray-600 font-bold font-mono'>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View className='p-4 bg-white rounded-2xl border border-gray-200'>
              <Text className='text-xs font-bold font-mono tracking-widest text-gray-400 uppercase'>
                Amount Due (this invoice)
              </Text>
              <Text className='text-2xl font-bold font-mono text-gray-900 mt-1'>
                {formatCurrency(invoice.amountDue)}
              </Text>
              <Text className='text-xs text-gray-500 mt-1'>
                Payment will be applied FIFO to oldest unpaid invoices for{' '}
                {customer?.name || 'this customer'} — works for cash & M-Pesa.
              </Text>
            </View>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Payment Amount *
              </Text>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white text-base'
                placeholder='0.00'
                keyboardType='numeric'
                value={paymentAmount}
                onChangeText={setPaymentAmount}
              />
            </View>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Method
              </Text>
              <View className='flex-row gap-2 flex-wrap'>
                {['cash', 'mpesa', 'bank_transfer', 'card'].map((m) => (
                  <Pressable
                    key={m}
                    className={`px-4 py-3 rounded-full border ${paymentMethod === m ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-200'}`}
                    onPress={() => setPaymentMethod(m)}
                  >
                    <Text
                      className={`text-xs font-bold tracking-widest ${paymentMethod === m ? 'text-white' : 'text-gray-600'}`}
                    >
                      {m.toUpperCase().replace('_', ' ')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View>
              <Text className='text-sm font-semibold text-gray-700 mb-2'>
                Reference
              </Text>
              <TextInput
                className='border border-gray-300 rounded-2xl px-4 py-4 bg-white'
                placeholder='MPESA code, cheque no, etc.'
                value={paymentRef}
                onChangeText={setPaymentRef}
              />
            </View>
            <TouchableOpacity
              className='mt-2 bg-gray-900 py-4 rounded-2xl items-center active:opacity-90'
              onPress={handleRecordPayment}
              disabled={isRecordingPayment || isSettlingCustomer}
            >
              <Text className='text-white font-bold'>
                {isRecordingPayment || isSettlingCustomer
                  ? 'Recording…'
                  : 'Record Payment'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}
