// Mobile-setup simulation: same backend, mobile client behaviour.
// Models what the Expo app does: cold start (pull + dashboard + lists in a burst),
// tab navigation (stock/sales/orders/invoices/profile reads), and offline-queue
// replay (sync/push). Tag client:mobile via the op prefix so mobile vs backend
// traffic can be compared. Tables: outbox_events, conflicts + every read table.
import { check } from 'k6';
import { login, get, post, mix, scenario, thresholds } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('mobile') };
export function setup() { return login(); }

function coldStart(data) {
  // App foreground burst — 5 requests back-to-back like the real client
  const deltaSince = Date.now() - 3600000;
  const ops = [
    [`/sync/pull?since=${deltaSince}`, 'outbox_events', 'm-coldstart-pull'],
    ['/analytics', 'analytics_snapshots', 'm-coldstart-dashboard'],
    ['/products?limit=20', 'products', 'm-coldstart-products'],
    ['/customers?limit=20', 'customers', 'm-coldstart-customers'],
    ['/inventory/low-stock', 'inventory_items', 'm-coldstart-lowstock'],
  ];
  for (const [path, table, op] of ops) {
    const r = get(data, path, 'mobile', table, op);
    check(r, { [`${op} handled`]: (x) => x.status !== 0 && x.status < 500 });
  }
}

function tabNavigation(data) {
  mix([
    [3, () => get(data, '/sales?limit=10', 'mobile', 'sales', 'm-tab-sales')],
    [3, () => get(data, '/inventory?limit=10', 'mobile', 'inventory_items', 'm-tab-stock')],
    [2, () => get(data, '/orders?limit=10', 'mobile', 'orders', 'm-tab-orders')],
    [2, () => get(data, '/invoices?limit=10', 'mobile', 'invoices', 'm-tab-invoices')],
    [1, () => get(data, '/expenses/summary', 'mobile', 'expenses', 'm-tab-expenses')],
  ]);
}

function offlineReplay(data) {
  // Shop with no signal for 10 min replays queued writes on reconnect
  const r = post(data, '/sync/push', { changes: {}, lastPulledAt: Date.now() - 600000 },
    'mobile', 'conflicts', 'm-offline-replay');
  check(r, { 'replay handled': (x) => x.status !== 0 && x.status < 500 });
}

export default function (data) {
  if (!data.token) return;
  coldStart(data);
  tabNavigation(data);
  if (Math.random() < 0.4) tabNavigation(data); // power users bounce between tabs
  if (Math.random() < 0.3) offlineReplay(data); // ~30% of sessions replay offline queue
}
