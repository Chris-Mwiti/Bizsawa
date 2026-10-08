// invoices module — tables: invoices, invoice_lines (+ WAHA send side-effects)
import { check } from 'k6';
import { login, get, post, mix, scenario, thresholds, ensureProductId, ensureCustomerId, ok2xx } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('invoices') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [4, () => {
      const r = get(data, '/invoices?limit=20', 'invoices', 'invoices', 'list-invoices');
      check(r, { 'list invoices 2xx': (x) => x.status === 200 });
    }],
    [2, () => {
      const pid = ensureProductId(data);
      const cid = ensureCustomerId(data);
      if (!pid) return;
      const r = post(data, '/invoices',
        { customerId: cid, lines: [{ productId: pid, description: 'k6 load-test item', quantity: 2, unitPrice: 100 }], notes: 'k6' },
        'invoices', 'invoice_lines', 'create-invoice');
      check(r, { 'create invoice 2xx': (x) => x.status === 200 || x.status === 201 });
      let id = null;
      try { id = r.json('id') || r.json('invoice.id'); } catch (e) { /* ignore */ }
      if (id && ok2xx(r)) {
        const g = get(data, `/invoices/${id}`, 'invoices', 'invoices', 'get-invoice');
        check(g, { 'get invoice handled': (x) => x.status !== 0 && x.status < 500 });
        const p = post(data, `/invoices/${id}/record-payment`, { amount: 50, method: 'cash' },
          'invoices', 'invoices', 'record-payment');
        check(p, { 'record payment handled': (x) => x.status !== 0 && x.status < 500 });
      }
    }],
    [1, () => {
      const r = get(data, '/invoices?limit=1&status=overdue', 'invoices', 'invoices', 'list-overdue');
      check(r, { 'overdue filter handled': (x) => x.status !== 0 && x.status < 500 });
    }],
  ]);
}
