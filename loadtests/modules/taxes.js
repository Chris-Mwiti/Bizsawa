// taxes module — tables: tax_rules, tax_entries
import { check } from 'k6';
import { login, get, post, mix, scenario, thresholds, uniq } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('taxes') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [4, () => {
      const r = get(data, '/taxes/rules', 'taxes', 'tax_rules', 'list-rules');
      check(r, { 'list rules 2xx': (x) => x.status === 200 });
    }],
    [3, () => {
      const r = get(data, '/taxes/summary', 'taxes', 'tax_entries', 'tax-summary');
      check(r, { 'summary handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      const r = post(data, '/taxes/rules', { name: uniq('k6-vat'), rate: 16, country: 'KE' },
        'taxes', 'tax_rules', 'create-rule');
      check(r, { 'create rule handled': (x) => x.status !== 0 && x.status < 500 });
    }],
  ]);
}
