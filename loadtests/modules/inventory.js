// inventory module — tables: inventory_items, stock_movements, products
import { check } from 'k6';
import { login, get, post, mix, scenario, thresholds, ensureProductId } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('inventory') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [4, () => {
      const r = get(data, '/inventory?limit=20', 'inventory', 'inventory_items', 'list-inventory');
      check(r, { 'list inventory 2xx': (x) => x.status === 200 });
    }],
    [2, () => {
      const r = get(data, '/inventory/low-stock', 'inventory', 'inventory_items', 'low-stock');
      check(r, { 'low stock 2xx': (x) => x.status === 200 });
    }],
    [2, () => {
      const r = get(data, '/inventory/movements?limit=20', 'inventory', 'stock_movements', 'movements');
      check(r, { 'movements handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [2, () => {
      const r = get(data, '/inventory/valuation', 'inventory', 'inventory_items', 'valuation');
      check(r, { 'valuation handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      const pid = ensureProductId(data);
      if (!pid) return;
      const r = post(data, '/inventory/adjustments',
        { productId: pid, quantityDelta: 1, lowStockThreshold: 2, notes: 'k6 load test' },
        'inventory', 'stock_movements', 'adjust-stock');
      check(r, { 'adjust handled': (x) => x.status !== 0 && x.status < 500 });
    }],
  ]);
}
