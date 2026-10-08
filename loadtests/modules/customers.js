// customers module — tables: customers (+ reads sales/invoices for history)
import { check } from 'k6';
import { login, get, post, put, mix, scenario, thresholds, uniq, ensureCustomerId } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('customers') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [5, () => {
      const r = get(data, '/customers?limit=20', 'customers', 'customers', 'list-customers');
      check(r, { 'list customers 2xx': (x) => x.status === 200 });
    }],
    [2, () => {
      const r = get(data, '/customers/top?limit=5', 'customers', 'customers', 'top-customers');
      check(r, { 'top customers handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [2, () => {
      const id = ensureCustomerId(data);
      if (!id) return;
      const r = get(data, `/customers/${id}/purchase-history`, 'customers', 'customers', 'purchase-history');
      check(r, { 'purchase history handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      const r = post(data, '/customers',
        { name: uniq('k6-cust'), phone: `2547${String(10000000 + Math.floor(Math.random() * 89999999))}` },
        'customers', 'customers', 'create-customer');
      check(r, { 'create customer handled': (x) => x.status !== 0 && x.status < 500 });
    }],
  ]);
}
