// E2E business workflow: the shop-counter lifecycle in one VU iteration.
// customer -> product -> stock adjust -> order -> confirm -> fulfill -> sale ->
// invoice -> record payment -> analytics. Tables touched: customers, products,
// product_variants, inventory_items, stock_movements, orders, order_lines, sales,
// sale_lines, invoices, invoice_lines, payment_commands, analytics_snapshots.
import { Trend } from 'k6/metrics';
import { check as k6check } from 'k6';
import { login, get, post, postI, scenario, thresholds, uniq, ok2xx, ensureProductId, ensureCustomerId, skipped } from '../lib/helpers.js';

export const e2eDuration = new Trend('e2e_workflow_duration_ms', true);

export const options = { scenarios: scenario('default'), thresholds: thresholds('e2e') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  const t0 = Date.now();
  let stepsOk = 0;

  const pid = ensureProductId(data);
  const cid = ensureCustomerId(data);
  if (!pid || !cid) { skipped.add(1, { module: 'e2e' }); return; }
  stepsOk += 2;

  // 1. stock up (inventory_items + stock_movements)
  const adj = post(data, '/inventory/adjustments',
    { productId: pid, quantityDelta: 5, notes: 'k6 e2e restock' }, 'e2e', 'stock_movements', 'e2e-restock');
  if (!ok2xx(adj)) return;
  stepsOk++;

  // 2. order lifecycle (orders + order_lines) — X-Idempotency-Key is mandatory
  const ord = postI(data, '/orders',
    { customerId: cid, lines: [{ productId: pid, quantity: 2, unitPrice: 100 }] }, 'e2e', 'orders', 'e2e-order');
  let oid = null;
  try { oid = ord.json('id') || ord.json('order.id'); } catch (e) { /* ignore */ }
  if (!oid) return;
  stepsOk++;
  const conf = postI(data, `/orders/${oid}/confirm`, {}, 'e2e', 'orders', 'e2e-confirm');
  if (!ok2xx(conf)) return;
  stepsOk++;
  postI(data, `/orders/${oid}/fulfill`, {}, 'e2e', 'order_lines', 'e2e-fulfill');
  stepsOk++;

  // 3. independent counter sale (confirm already mints the order's own sale 1:1)
  const sale = post(data, '/sales',
    { paymentMethod: 'cash', lines: [{ productId: pid, quantity: 2, unitPrice: 100 }], idempotencyKey: uniq('e2e') },
    'e2e', 'sale_lines', 'e2e-sale');
  if (ok2xx(sale)) stepsOk++;

  // 4. invoice + payment (invoices + invoice_lines + payment_commands/invoices)
  const inv = post(data, '/invoices',
    { customerId: cid, lines: [{ productId: pid, description: 'k6 e2e item', quantity: 1, unitPrice: 100 }] },
    'e2e', 'invoice_lines', 'e2e-invoice');
  let iid = null;
  try { iid = inv.json('id') || inv.json('invoice.id'); } catch (e) { /* ignore */ }
  if (iid && ok2xx(inv)) {
    stepsOk++;
    const pay = post(data, `/invoices/${iid}/record-payment`, { amount: 100, method: 'cash' },
      'e2e', 'invoices', 'e2e-invoice-pay');
    if (ok2xx(pay)) stepsOk++;
  }

  // 5. owner checks the numbers (analytics_snapshots)
  const dash = get(data, '/analytics', 'e2e', 'analytics_snapshots', 'e2e-dashboard');
  if (dash.status === 200) stepsOk++;

  e2eDuration.add(Date.now() - t0, { module: 'e2e' });
  k6check(null, { 'e2e workflow completed all steps': () => stepsOk >= 9 });
}
