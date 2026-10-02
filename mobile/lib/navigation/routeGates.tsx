import React, { useEffect, useRef } from 'react'

import { useProducts } from '../../hooks/api/useProducts'
import { useSales } from '../../hooks/api/useSales'
import { useInventory } from '../../hooks/api/useInventory'
import { useOrders } from '../../hooks/api/useOrders'
import { useInvoices } from '../../hooks/api/useInvoices'
import { useExpenses } from '../../hooks/api/useExpenses'
import { useAnalytics } from '../../hooks/api/useAnalytics'
import { useBusiness } from '../../hooks/api/useBusiness'
import { useSubscription } from '../../hooks/api/useSubscription'
import { useInvites } from '../../hooks/api/useInvites'
import {
  extractRouteId,
  matchGatePath,
  normalizeHref,
} from './routeGateMatchers'

export { extractRouteId }

/**
 * Route gates — the data each destination screen waits on before it renders.
 *
 * Navigation is held on the current page until the destination's own loading gate
 * clears, so the screen mounts with warm data and never flashes its skeleton. The
 * prefetch components call the exact same hooks the screen calls, which means the
 * TanStack Query cache is filled by the same queryFns and the same transforms —
 * no duplicated fetchers, no shape drift.
 *
 * Every gate below mirrors the *screen's own* loading state. Waiting on less would
 * let the skeleton flash; waiting on more (e.g. customers, which the sales screen
 * only needs inside its modal) would make navigation slower than doing nothing.
 */

/** Fire `onReady` once, the first time `ready` flips true. */
function useReadySignal(ready: boolean, onReady: () => void) {
  const fired = useRef(false)
  useEffect(() => {
    if (ready && !fired.current) {
      fired.current = true
      onReady()
    }
  }, [ready, onReady])
}

/** Sales: product picker is the screen's full-screen gate; the list is its content. */
function SalesPrefetch({ onReady }: { onReady: () => void }) {
  const { isLoading: productsLoading } = useProducts()
  const { isLoading: salesLoading } = useSales()
  useReadySignal(!(productsLoading || salesLoading), onReady)
  return null
}

/** Stock: mirrors stock.tsx — `isLoadingProducts || isLoadingInventory`. */
function StockPrefetch({ onReady }: { onReady: () => void }) {
  const { isLoading: productsLoading } = useProducts()
  const { isLoadingInventory } = useInventory()
  useReadySignal(!(productsLoading || isLoadingInventory), onReady)
  return null
}

/** Home: mirrors index.tsx — `isBusinessLoading || isOverviewLoading || productsLoading`. */
function HomePrefetch({ onReady }: { onReady: () => void }) {
  const { isOverviewLoading } = useAnalytics() as any
  const { isLoading: productsLoading } = useProducts()
  useReadySignal(!(isOverviewLoading || productsLoading), onReady)
  return null
}

/**
 * Insights overview: the screen blocks on business, then renders overview stats,
 * category performance, expenses and AI tips as sections — all of which would
 * otherwise show their own spinners on arrival.
 */
function InsightsPrefetch({ onReady }: { onReady: () => void }) {
  const { isOverviewLoading, isCategoriesLoading } = useAnalytics() as any
  const { isLoading: expensesLoading } = useExpenses()
  useReadySignal(
    !(isOverviewLoading || isCategoriesLoading || expensesLoading),
    onReady,
  )
  return null
}

/**
 * Analytics: every section is gated by its own query, so all four must be warm.
 * The screen's default timeframe is 'week' — see analytics.tsx.
 */
function AnalyticsPrefetch({ onReady }: { onReady: () => void }) {
  const {
    getRevenueAnalytics,
    getProfitAnalytics,
    getCategoryAnalytics,
    getCustomerAnalytics,
    isBusinessLoading,
  } = useAnalytics() as any
  const revenue = getRevenueAnalytics('week')
  const profit = getProfitAnalytics('week')
  const category = getCategoryAnalytics('week')
  const customer = getCustomerAnalytics('week')
  useReadySignal(
    !(
      isBusinessLoading ||
      revenue.isLoading ||
      profit.isLoading ||
      category.isLoading ||
      customer.isLoading
    ),
    onReady,
  )
  return null
}

function ExpensesPrefetch({ onReady }: { onReady: () => void }) {
  const { isLoading } = useExpenses()
  useReadySignal(!isLoading, onReady)
  return null
}

/** Mirrors insights/tax.tsx — its default timeframe is 'month'. */
function TaxPrefetch({ onReady }: { onReady: () => void }) {
  const { getTaxSummary } = useAnalytics() as any
  const query = getTaxSummary('month')
  useReadySignal(!query.isLoading, onReady)
  return null
}

/** Profile: business is the screen's gate; plan and team are rendered sections. */
function ProfilePrefetch({ onReady }: { onReady: () => void }) {
  const { isLoading: businessLoading } = useBusiness(null)
  const { isLoading: subLoading } = useSubscription()
  const { membersLoading, invitesLoading } = useInvites()
  useReadySignal(
    !(businessLoading || subLoading || membersLoading || invitesLoading),
    onReady,
  )
  return null
}

/** Orders list: the product picker gates the screen, the list is its content. */
function OrdersPrefetch({ onReady }: { onReady: () => void }) {
  const { isLoading: ordersLoading } = useOrders()
  const { isLoading: productsLoading } = useProducts()
  useReadySignal(!(ordersLoading || productsLoading), onReady)
  return null
}

/**
 * Detail gates warm the exact record. With no id the underlying query is disabled,
 * which reports ready immediately — the gate then falls through to navigation.
 */
function OrderDetailPrefetch({
  id,
  onReady,
}: {
  id?: string
  onReady: () => void
}) {
  const { getOrder } = useOrders()
  const query = getOrder(id as any)
  useReadySignal(!query.isLoading, onReady)
  return null
}

function InvoicesPrefetch({ onReady }: { onReady: () => void }) {
  const { isLoading } = useInvoices()
  useReadySignal(!isLoading, onReady)
  return null
}

function InvoiceDetailPrefetch({
  id,
  onReady,
}: {
  id?: string
  onReady: () => void
}) {
  const { getInvoice } = useInvoices() as any
  const query = getInvoice(id)
  useReadySignal(!query.isLoading, onReady)
  return null
}

export interface RouteGate {
  /** Human-readable name shown in the loading indicator. */
  label: string
  Prefetch: React.ComponentType<{ id?: string; onReady: () => void }>
}

/**
 * Keyed by the concrete hrefs the app navigates to (see AppTabBar and the insights
 * segment layout). Detail routes carry their id in the href, so the prefetcher can
 * warm that exact record.
 */
export const ROUTE_GATES: Record<string, RouteGate> = {
  '/(tabs)/sales': { label: 'Sales', Prefetch: SalesPrefetch },
  '/(tabs)/sales/orders': { label: 'Orders', Prefetch: OrdersPrefetch },
  '/(tabs)/sales/invoices': { label: 'Invoices', Prefetch: InvoicesPrefetch },
  '/(tabs)/stock': { label: 'Stock', Prefetch: StockPrefetch },
  '/(tabs)': { label: 'Home', Prefetch: HomePrefetch },
  '/(tabs)/insights/overview': { label: 'Insights', Prefetch: InsightsPrefetch },
  '/(tabs)/insights/analytics': {
    label: 'Analytics',
    Prefetch: AnalyticsPrefetch,
  },
  '/(tabs)/insights/expenses': { label: 'Expenses', Prefetch: ExpensesPrefetch },
  '/(tabs)/insights/tax': { label: 'Tax', Prefetch: TaxPrefetch },
  '/(tabs)/profile': { label: 'Profile', Prefetch: ProfilePrefetch },
  // Backward-compat redirects (app/orders.tsx, app/invoices.tsx) — same gates.
  '/orders': { label: 'Orders', Prefetch: OrdersPrefetch },
  '/invoices': { label: 'Invoices', Prefetch: InvoicesPrefetch },
}

/**
 * Resolve a target href to its gate. Returns null for routes that must never block
 * navigation (auth flows, modals/sheets, back, and unknown paths) — those navigate
 * immediately as before.
 */
export function resolveRouteGate(href: string): RouteGate | null {
  const match = matchGatePath(normalizeHref(href))
  if (!match) return null
  if (match.kind === 'detail') {
    return match.detail === 'order'
      ? { label: 'Order', Prefetch: OrderDetailPrefetch }
      : { label: 'Invoice', Prefetch: InvoiceDetailPrefetch }
  }
  return ROUTE_GATES[match.path] ?? null
}
