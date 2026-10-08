// orders module — tables: orders, order_lines (+ inventory reservation side-effects)
import { check } from 'k6';
import { login, get, post, postI, mix, scenario, thresholds, uniq, ensureProductId, ensureCustomerId, ok2xx } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('orders') };
export function setup() { return login(); }

function createOrder(data) {
  const pid = ensureProductId(data);
  if (!pid) return null;
  const cid = ensureCustomerId(data);
  const r = postI(data, '/orders',
    { customerId: cid, lines: [{ productId: pid, quantity: 1, unitPrice: 100 }] },
    'orders', 'orders', 'create-order');
  check(r, { 'create order handled': (x) => x.status !== 0 && x.status < 500 });
  if (!ok2xx(r)) return null;
  try { return r.json('id') || r.json('order.id'); } catch (e) { return null; }
}

export default function (data) {
  if (!data.token) return;
  mix([
    [4, () => {
      const r = get(data, '/orders?limit=20', 'orders', 'orders', 'list-orders');
      check(r, { 'list orders 2xx': (x) => x.status === 200 });
    }],
    [2, () => {
      // Full lifecycle on one VU iteration: create -> confirm -> fulfill (order_lines + stock moves)
      const id = createOrder(data);
      if (!id) return;
      const c = postI(data, `/orders/${id}/confirm`, {}, 'orders', 'orders', 'confirm-order');
      check(c, { 'confirm handled': (x) => x.status !== 0 && x.status < 500 });
      if (ok2xx(c)) {
        const f = postI(data, `/orders/${id}/fulfill`, {}, 'orders', 'order_lines', 'fulfill-order');
        check(f, { 'fulfill handled': (x) => x.status !== 0 && x.status < 500 });
      }
    }],
    [1, () => {
      const id = createOrder(data);
      if (!id) return;
      const r = postI(data, `/orders/${id}/cancel`, {}, 'orders', 'orders', 'cancel-order');
      check(r, { 'cancel handled': (x) => x.status !== 0 && x.status < 500 });
    }],
  ]);
}
