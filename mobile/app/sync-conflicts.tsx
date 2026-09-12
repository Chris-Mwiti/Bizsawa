import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native'
import {
  AlertTriangle,
  Check,
  Download,
  RefreshCw,
  ShieldCheck,
  User,
  Package,
  ShoppingBag,
  Receipt,
  FileText,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowLeftRight,
} from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { api } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { useSync } from '../sync/SyncProvider'
import {
  getLocalConflicts,
  resolveConflictLocally,
  syncNow,
} from '../sync/client'

// ── Helpers: humanize for non-technical UX ──────────────────────────────────
const TABLE_LABEL: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  customers: { label: 'Customer', icon: User, color: '#0ea5e9', bg: 'bg-sky-50' },
  products: { label: 'Product', icon: Package, color: '#10b981', bg: 'bg-emerald-50' },
  product_variants: { label: 'Variant', icon: Package, color: '#10b981', bg: 'bg-emerald-50' },
  orders: { label: 'Order', icon: ShoppingBag, color: '#f59e0b', bg: 'bg-amber-50' },
  order_lines: { label: 'Order item', icon: ShoppingBag, color: '#f59e0b', bg: 'bg-amber-50' },
  sales: { label: 'Sale', icon: Receipt, color: '#8b5cf6', bg: 'bg-violet-50' },
  sale_lines: { label: 'Sale item', icon: Receipt, color: '#8b5cf6', bg: 'bg-violet-50' },
  expenses: { label: 'Expense', icon: FileText, color: '#ef4444', bg: 'bg-red-50' },
  invoices: { label: 'Invoice', icon: FileText, color: '#6366f1', bg: 'bg-indigo-50' },
  payment_commands: { label: 'Payment', icon: CreditCard, color: '#06b6d4', bg: 'bg-cyan-50' },
  inventory_items: { label: 'Stock', icon: Package, color: '#84cc16', bg: 'bg-lime-50' },
}

function humanizeTable(t: string) {
  return TABLE_LABEL[t]?.label ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function humanizeField(f: string) {
  const map: Record<string, string> = {
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    price: 'Price',
    cost: 'Cost',
    quantity: 'Quantity',
    total: 'Total',
    subtotal: 'Subtotal',
    tax_amount: 'Tax',
    payment_method: 'Payment method',
    payment_status: 'Payment status',
    status: 'Status',
    category: 'Category',
    description: 'Description',
    notes: 'Notes',
    tags: 'Tags',
    loyalty_points: 'Loyalty points',
    total_spend: 'Total spend',
    amount: 'Amount',
    vendor: 'Vendor',
  }
  return map[f] ?? f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function isInternalField(f: string) {
  return ['id', 'business_id', 'tenant_id', 'sync_version', 'created_at', 'updated_at', 'deleted_at', 'businessId', 'tenantId', 'syncVersion'].includes(f)
}
function formatValue(v: any): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v).trim()
  if (s === '' || s === 'null' || s === 'undefined') return '—'
  // currency-ish fields
  if (/^\d+(\.\d+)?$/.test(s) && s.length < 10) {
    const n = Number(s)
    if (!isNaN(n) && s.includes('.')) return `KES ${n.toLocaleString('en-KE')}`
  }
  return s.length > 40 ? s.slice(0, 40) + '…' : s
}
function parsePayload(p: any): Record<string, any> {
  if (!p) return {}
  if (typeof p === 'string') {
    try { return JSON.parse(p) } catch { return {} }
  }
  return p as Record<string, any>
}
function getDisplayName(table: string, payload: Record<string, any>): string {
  const p = payload
  if (p.name) return String(p.name)
  if (p.category) return String(p.category)
  if (p.invoice_number) return String(p.invoice_number)
  if (p.receipt_number) return String(p.receipt_number)
  return p.id ? String(p.id).slice(0, 6).toUpperCase() : '—'
}
function getDiffs(client: Record<string, any>, server: Record<string, any>) {
  const keys = new Set([...Object.keys(client), ...Object.keys(server)])
  const diffs: Array<{ field: string; label: string; client: string; server: string }> = []
  for (const k of keys) {
    if (isInternalField(k)) continue
    if (k.startsWith('_')) continue
    const cv = client[k]
    const sv = server[k]
    // Normalize for comparison (string vs number)
    const cn = cv == null ? '' : String(cv).trim()
    const sn = sv == null ? '' : String(sv).trim()
    if (cn === sn) continue
    // Skip if both empty
    if (cn === '' && sn === '') continue
    diffs.push({ field: k, label: humanizeField(k), client: formatValue(cv), server: formatValue(sv) })
  }
  // If no diffs (e.g. sync_version only), show at least one generic
  if (diffs.length === 0) {
    diffs.push({ field: 'record', label: 'Record', client: 'Your edits', server: 'Server version' })
  }
  return diffs.slice(0, 6) // cap for UX
}

export default function SyncConflictsScreen() {
  const router = useRouter()
  const { refreshCounts } = useSync()
  const [conflicts, setConflicts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const [serverRes, localRows] = await Promise.all([
        api.get('/sync/conflicts').then((r) => r.data).catch(() => ({ conflicts: [] })),
        getLocalConflicts().catch(() => []),
      ])
      const serverList: any[] = serverRes.conflicts || serverRes.data?.conflicts || []
      // Merge: server wins for same id, but include local-only (e.g. offline conflict not yet pushed)
      const map = new Map<string, any>()
      for (const c of serverList) {
        const id = c.id || c.ID
        if (id) map.set(String(id), { ...c, id: String(id), table_name: c.table_name || c.Table || c.table, record_id: c.record_id || c.RecordID || c.recordId })
      }
      for (const c of localRows) {
        const id = String(c.id)
        if (!map.has(id)) map.set(id, c)
      }
      const merged = Array.from(map.values()).sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0
        return bt - at
      })
      setConflicts(merged)
    } catch (e: any) {
      Alert.alert('Error', e.friendlyMessage || 'Failed to load conflicts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
  }, [fetch])

  const handleResolve = async (c: any, resolution: 'kept_client' | 'kept_server') => {
    const id = String(c.id)
    setResolvingId(id)
    try {
      // 1. Tell server (ForceApply if kept_client)
      await api.post(`/sync/conflicts/${id}/resolve`, { resolution })
      // 2. Apply locally in background (technical bit) — clears banner instantly
      const normalized = {
        id,
        table_name: c.table_name || c.Table || c.table,
        record_id: c.record_id || c.RecordID || c.recordId,
        client_payload: c.client_payload ?? c.ClientPayload,
        server_payload: c.server_payload ?? c.ServerPayload,
        client_version: c.client_version ?? c.ClientVersion ?? 0,
        server_version: c.server_version ?? c.ServerVersion ?? 0,
      }
      await resolveConflictLocally(normalized as any, resolution)
      // 3. Pull latest so pending clears and sync_version aligns
      await syncNow().catch(() => {})
      await fetch()
      await refreshCounts().catch(() => {})
      Alert.alert(
        resolution === 'kept_client' ? 'Kept your version ✓' : 'Applied server version ✓',
        resolution === 'kept_client'
          ? 'Your edits were saved and will stay on all devices.'
          : 'Your local edits were replaced with the latest from the server.',
      )
    } catch (e: any) {
      Alert.alert('Could not resolve', e.friendlyMessage || e.message || 'Try again. Check connection.')
    } finally {
      setResolvingId(null)
    }
  }

  const handleResolveAll = async (resolution: 'kept_client' | 'kept_server') => {
    if (!conflicts.length) return
    Alert.alert(
      resolution === 'kept_client' ? 'Keep all my changes?' : 'Use server for all?',
      `This will ${resolution === 'kept_client' ? 'keep your edits' : 'overwrite your edits with server'} for ${conflicts.length} conflict(s).`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: resolution === 'kept_client' ? 'default' : 'destructive',
          onPress: async () => {
            for (const c of conflicts) {
              await handleResolve(c, resolution)
            }
          },
        },
      ],
    )
  }

  if (loading)
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color="#111827" />
        <Text className="text-sm text-gray-500 mt-2">Checking for conflicts…</Text>
      </View>
    )

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="bg-white rounded-2xl border border-gray-200 p-4">
          <View className="flex-row items-center gap-3">
            <View className={`w-10 h-10 rounded-xl items-center justify-center ${conflicts.length ? 'bg-amber-500' : 'bg-emerald-500'}`}>
              {conflicts.length ? <AlertTriangle size={18} color="white" /> : <ShieldCheck size={18} color="white" />}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-gray-900">
                {conflicts.length ? `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} needs attention` : 'All synced — no conflicts'}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {conflicts.length
                  ? 'Same record edited offline on two devices. Pick which to keep — we handle the rest.'
                  : 'Your data is in sync across devices.'}
              </Text>
            </View>
          </View>
          {conflicts.length > 1 && (
            <View className="flex-row gap-2 mt-3">
              <TouchableOpacity onPress={() => handleResolveAll('kept_client')} className="flex-1 py-2.5 rounded-xl bg-gray-900 items-center">
                <Text className="text-white font-bold text-xs">Keep all mine</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleResolveAll('kept_server')} className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 items-center">
                <Text className="text-gray-700 font-bold text-xs">Use all server</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Explainer for non-technical */}
        {conflicts.length > 0 && (
          <View className="bg-sky-50 border border-sky-100 rounded-2xl p-3 flex-row gap-2">
            <Sparkles size={14} color="#0369a1" style={{ marginTop: 2 }} />
            <Text className="text-xs leading-4 text-sky-900 flex-1">
              <Text className="font-bold">What happened?</Text> You and someone else edited the same thing while offline. We keep both versions safe — just tap which one you want to keep. No data is lost.
            </Text>
          </View>
        )}

        {conflicts.length === 0 ? (
          <Card className="border border-gray-200">
            <CardContent className="items-center py-10">
              <View className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 items-center justify-center mb-3">
                <Check size={22} color="#059669" />
              </View>
              <Text className="font-bold text-gray-900">No conflicts</Text>
              <Text className="text-sm text-gray-500 mt-1 text-center px-6">All records in sync — no action needed.</Text>
              <TouchableOpacity onPress={() => fetch()} className="mt-4 px-4 py-2 bg-white border border-gray-200 rounded-full flex-row items-center gap-2">
                <RefreshCw size={14} color="#374151" />
                <Text className="text-sm font-semibold text-gray-700">Refresh</Text>
              </TouchableOpacity>
            </CardContent>
          </Card>
        ) : (
          conflicts.map((c) => {
            const table = String(c.table_name || c.Table || 'record')
            const meta = TABLE_LABEL[table] ?? { label: humanizeTable(table), icon: FileText, color: '#6b7280', bg: 'bg-gray-50' }
            const Icon = meta.icon
            const client = parsePayload(c.client_payload ?? c.ClientPayload)
            const server = parsePayload(c.server_payload ?? c.ServerPayload)
            const diffs = getDiffs(client, server)
            const displayName = getDisplayName(table, { ...server, ...client })
            const isResolving = resolvingId === String(c.id)
            const isExpanded = expandedId === String(c.id)

            return (
              <Card key={String(c.id)} className="border border-amber-200 overflow-hidden">
                <CardHeader className="pb-2">
                  <View className="flex-row items-center gap-3">
                    <View className={`w-9 h-9 rounded-xl items-center justify-center ${meta.bg} border border-gray-100`}>
                      <Icon size={16} color={meta.color} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <CardTitle className="text-gray-900">{meta.label}</CardTitle>
                        <View className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100">
                          <Text className="text-xs font-bold text-amber-700">Conflict</Text>
                        </View>
                      </View>
                      <Text className="text-xs text-gray-500" numberOfLines={1}>
                        {displayName} • {String(c.record_id || c.recordId || '').slice(0, 6).toUpperCase()} • v{c.client_version ?? '?'} vs v{c.server_version ?? '?'}
                      </Text>
                    </View>
                  </View>
                </CardHeader>
                <CardContent className="gap-3">
                  {/* Friendly diff */}
                  <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <View className="flex-row items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                      <ArrowLeftRight size={12} color="#6b7280" />
                      <Text className="text-xs font-bold tracking-widest text-gray-500 uppercase">What changed</Text>
                    </View>
                    {diffs.map((d, i) => (
                      <View key={d.field} className={`px-3 py-2.5 ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                        <Text className="text-xs font-semibold text-gray-500">{d.label}</Text>
                        <View className="flex-row gap-2 mt-1.5">
                          <View className="flex-1 p-2.5 rounded-xl bg-gray-900 border border-gray-900">
                            <Text className="text-xs font-bold tracking-widest text-gray-400 uppercase">Your version</Text>
                            <Text className="text-sm font-medium text-white mt-1" numberOfLines={2}>
                              {d.client}
                            </Text>
                          </View>
                          <View className="flex-1 p-2.5 rounded-xl bg-sky-50 border border-sky-100">
                            <Text className="text-xs font-bold tracking-widest text-sky-700 uppercase">Server</Text>
                            <Text className="text-sm font-medium text-sky-900 mt-1" numberOfLines={2}>
                              {d.server}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Actions */}
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => handleResolve(c, 'kept_client')}
                      disabled={!!resolvingId}
                      className={`flex-1 py-3.5 rounded-2xl items-center flex-row justify-center gap-2 ${resolvingId ? 'bg-gray-100' : 'bg-gray-900'}`}
                    >
                      {isResolving ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <>
                          <Check size={16} color="white" />
                          <View>
                            <Text className="text-white font-bold text-sm text-center">Keep my version</Text>
                            <Text className="text-white/70 text-xs text-center">Your edits win</Text>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleResolve(c, 'kept_server')}
                      disabled={!!resolvingId}
                      className={`flex-1 py-3.5 rounded-2xl items-center flex-row justify-center gap-2 bg-white border ${resolvingId ? 'border-gray-100' : 'border-gray-200'}`}
                    >
                      {isResolving ? (
                        <ActivityIndicator color="#111827" size="small" />
                      ) : (
                        <>
                          <Download size={16} color="#111827" />
                          <View>
                            <Text className="font-bold text-sm text-gray-900 text-center">Use server</Text>
                            <Text className="text-gray-500 text-xs text-center">Discard mine</Text>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Technical details collapsible */}
                  <Pressable onPress={() => setExpandedId(isExpanded ? null : String(c.id))} className="flex-row items-center justify-center gap-1 py-1">
                    <Text className="text-xs font-semibold text-gray-400">
                      {isExpanded ? 'Hide technical details' : 'Show technical details'}
                    </Text>
                    {isExpanded ? <ChevronUp size={12} color="#9ca3af" /> : <ChevronDown size={12} color="#9ca3af" />}
                  </Pressable>
                  {isExpanded && (
                    <View className="gap-2">
                      <View className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                        <Text className="text-xs font-mono text-gray-500" numberOfLines={20}>
                          {JSON.stringify({ client, server }, null, 2)}
                        </Text>
                      </View>
                      <Text className="text-xs text-gray-400 text-center">IDs: {String(c.id).slice(0, 8)} • Record {String(c.record_id || '').slice(0, 8)}</Text>
                    </View>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}

        <TouchableOpacity onPress={() => fetch()} className="py-3 rounded-2xl bg-white border border-gray-200 items-center flex-row justify-center gap-2">
          <RefreshCw size={14} color="#374151" />
          <Text className="text-sm font-semibold text-gray-700">Refresh</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}
