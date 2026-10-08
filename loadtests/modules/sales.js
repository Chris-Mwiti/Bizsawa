// sales module (POS) — tables: sales, sale_lines
import { check } from 'k6';
import { login, get, post, mix, scenario, thresholds, ensureProductId, ok2xx } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('sales') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [4, () => {
      const r = get(data, '/sales?limit=20', 'sales', 'sales', 'list-sales');
      check(r, { 'list sales 2xx': (x) => x.status === 200 });
    }],
    [2, () => {
      const r = get(data, '/sales/summary', 'sales', 'sales', 'sales-summary');
      check(r, { 'summary handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      const r = get(data, '/sales/by-product', 'sales', 'sale_lines', 'by-product');
      check(r, { 'by-product handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      const r = get(data, '/sales/by-payment-method', 'sales', 'sales', 'by-payment');
      check(r, { 'by-payment handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [2, () => {
      const pid = ensureProductId(data);
      if (!pid) return;
      const r = post(data, '/sales',
        {
          paymentMethod: 'cash', lines: [{ productId: pid, quantity: 1, unitPrice: 100 }],
          idempotencyKey: `k6-${__VU}-${__ITER}-${Date.now()}`,
        },
        'sales', 'sale_lines', 'create-sale');
      check(r, { 'create sale handled': (x) => x.status !== 0 && x.status < 500 });
      let id = null;
      try { id = r.json('id') || r.json('sale.id'); } catch (e) { /* ignore */ }
      if (id && ok2xx(r) && Math.random() < 0.3) {
        const v = post(data, `/sales/${id}/void`, {}, 'sales', 'sales', 'void-sale');
        check(v, { 'void handled': (x) => x.status !== 0 && x.status < 500 });
      }
    }],
  ]);
}
