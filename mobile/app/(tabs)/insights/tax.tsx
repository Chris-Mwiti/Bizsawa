import React, { useState } from 'react'
import { ScrollView, View, Text, ActivityIndicator, Pressable, Linking, Alert } from 'react-native'
import { Receipt, Building2, Package, LayoutGrid } from 'lucide-react-native'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card'
import { useAnalytics } from '../../../hooks/api/useAnalytics'
import { TAB_BAR_SCROLL_PADDING } from '../../../constants/tabBar'
import { toNumber } from '../../../lib/api-dtos'
import { useBusinessContext } from '../../../contexts/BusinessContext'

type TF = 'week' | 'month' | 'year'
export default function TaxInsights() {
  const [tf, setTf] = useState<TF>('month')
  const { getTaxSummary } = useAnalytics()
  const { activeBusiness } = useBusinessContext()
  const { data, isLoading, error } = getTaxSummary(tf as any)

  const fmt = (v: any) => `KES ${toNumber(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtInt = (v: any) => toNumber(v).toLocaleString('en-KE')

  if (isLoading) return <View className='flex-1 bg-gray-50 items-center justify-center'><ActivityIndicator color='#111827'/><Text className='font-sans text-sm text-gray-500 mt-2'>Loading tax…</Text></View>

  const totalTax = toNumber((data as any)?.totalTax)
  const taxable = toNumber((data as any)?.taxableSales)
  const total = toNumber((data as any)?.totalSales)
  const kra = toNumber((data as any)?.kraPayable)

  return (
    <View className='flex-1 bg-gray-50'>
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom: TAB_BAR_SCROLL_PADDING+24, gap:16 }} showsVerticalScrollIndicator={false}>
        <View className='flex-row gap-2'>
          {(['week','month','year'] as TF[]).map(k=>(
            <Pressable key={k} onPress={()=>setTf(k)} className={`px-4 py-2 rounded-full border ${tf===k?'bg-accent border-accent':'bg-white border-gray-200'}`}>
              <Text className={`font-geist-bold text-xs font-bold ${tf===k?'text-white':'text-gray-600'}`}>{k.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {/* Summary cards */}
        <View className='flex-row gap-3 flex-wrap'>
          <Card className='border border-gray-200 flex-1 min-w-[46%]'><CardContent className='p-4'><Text className='font-geist-bold text-xs tracking-widest text-gray-500 font-bold'>TOTAL VAT (16%)</Text><Text className='font-geist-bold text-lg font-bold mt-1 text-emerald-700'>{fmt(totalTax)}</Text><Text className='font-sans text-xs text-gray-500 mt-1'>{fmtInt((data as any)?.transactionCount)} transactions</Text></CardContent></Card>
          <Card className='border border-gray-200 flex-1 min-w-[46%]'><CardContent className='p-4'><Text className='font-geist-bold text-xs tracking-widest text-gray-500 font-bold'>KRA PAYABLE</Text><Text className='font-geist-bold text-lg font-bold mt-1 text-red-700'>{fmt(kra)}</Text><Text className='font-sans text-xs text-gray-500 mt-1'>Output VAT to file</Text></CardContent></Card>
          <Card className='border border-gray-200 flex-1 min-w-[46%]'><CardContent className='p-4'><Text className='font-geist-bold text-xs tracking-widest text-gray-500 font-bold'>TAXABLE SALES</Text><Text className='font-geist-bold text-base font-bold mt-1'>{fmt(taxable)}</Text><Text className='font-sans text-xs text-gray-500'>Excl. VAT</Text></CardContent></Card>
          <Card className='border border-gray-200 flex-1 min-w-[46%]'><CardContent className='p-4'><Text className='font-geist-bold text-xs tracking-widest text-gray-500 font-bold'>GROSS SALES</Text><Text className='font-geist-bold text-base font-bold mt-1'>{fmt(total)}</Text><Text className='font-sans text-xs text-gray-500'>Incl. VAT</Text></CardContent></Card>
        </View>

        {/* KRA guidance */}
        <Card className='border border-amber-200 bg-amber-50'><CardContent className='p-4'>
          <View className='flex-row items-center gap-2'><Building2 size={16} color='#92400e'/><Text className='font-geist-bold font-bold text-amber-900'>KRA Filing — VAT 16%</Text></View>
          <Text className='font-sans text-sm text-amber-900 mt-2'>Business: <Text className='font-geist-bold font-bold'>{activeBusiness?.name || 'Your Shop'}</Text>{activeBusiness?.taxPin ? ` • PIN: ${activeBusiness.taxPin}` : ''}</Text>
          <Text className='font-sans text-xs text-amber-800 mt-1 leading-4'>File monthly via iTax (KRA). Output VAT = {fmt(kra)} for this {tf}. Keep invoices as proof. If you paid input VAT on purchases, subtract it — this app shows output VAT only.</Text>
          <Pressable onPress={()=>Linking.openURL('https://itax.kra.go.ke')} className='mt-3 self-start px-3 py-2 rounded-full bg-amber-900'><Text className='font-geist-bold text-white text-xs font-bold'>Open iTax</Text></Pressable>
        </CardContent></Card>

        {/* By category */}
        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center gap-2'><LayoutGrid size={16} color='#111827'/><CardTitle>Tax by Category</CardTitle></CardHeader>
          <CardContent className='pt-0'>
            {!(data as any)?.byCategory?.length ? <Text className='font-sans text-sm text-gray-500 py-4 text-center'>No category tax yet</Text> :
              <View className='gap-2'>
                {(data as any).byCategory.map((c:any,i:number)=>(
                  <View key={i} className='flex-row justify-between items-center p-3 rounded-2xl bg-gray-50 border border-gray-100'>
                    <View><Text className='font-geist-semibold text-sm font-semibold'>{c.category}</Text><Text className='font-sans text-xs text-gray-500'>{fmt(c.revenue)} revenue</Text></View>
                    <Text className='font-geist-mono-bold text-sm font-bold text-emerald-700'>{fmt(c.taxAmount)}</Text>
                  </View>
                ))}
              </View>
            }
          </CardContent>
        </Card>

        {/* By product */}
        <Card className='border border-gray-200'>
          <CardHeader className='flex-row items-center gap-2'><Package size={16} color='#111827'/><CardTitle>Tax by Product</CardTitle></CardHeader>
          <CardContent className='pt-0'>
            {!(data as any)?.byProduct?.length ? <Text className='font-sans text-sm text-gray-500 py-4 text-center'>No product tax yet</Text> :
              <View className='gap-2'>
                {(data as any).byProduct.slice(0,20).map((p:any,i:number)=>(
                  <View key={i} className='flex-row justify-between items-center p-3 rounded-2xl bg-white border border-gray-200'>
                    <View className='flex-1 pr-2'><Text className='font-geist-semibold text-sm font-semibold' numberOfLines={1}>{p.name}</Text><Text className='font-sans text-xs text-gray-500'>{p.category} • {fmtInt(p.quantity)} sold • {fmt(p.revenue)}</Text></View>
                    <Text className='font-geist-mono-bold text-sm font-bold'>{fmt(p.taxAmount)}</Text>
                  </View>
                ))}
              </View>
            }
          </CardContent>
        </Card>

        <Card className='border border-gray-200'><CardContent className='p-4 flex-row gap-2 items-center'><Receipt size={16} color='#6b7280'/><Text className='font-sans text-xs text-gray-500 flex-1'>VAT rate 16% applied to pre-tax line totals. Totals derived from <Text className='font-geist-bold font-bold'>sales</Text> in selected timeframe. Ensure all sales are synced.</Text></CardContent></Card>
      </ScrollView>
    </View>
  )
}
