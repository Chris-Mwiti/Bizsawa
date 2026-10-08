// expenses module — tables: expenses
import { check } from 'k6';
import { login, get, post, del, mix, scenario, thresholds, uniq, ok2xx } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('expenses') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [4, () => {
      const r = get(data, '/expenses?limit=20', 'expenses', 'expenses', 'list-expenses');
      check(r, { 'list expenses 2xx': (x) => x.status === 200 });
    }],
    [2, () => {
      const r = get(data, '/expenses/summary', 'expenses', 'expenses', 'expenses-summary');
      check(r, { 'summary handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [2, () => {
      const r = post(data, '/expenses',
        { description: uniq('k6-exp'), amount: 150, category: 'Transport' },
        'expenses', 'expenses', 'create-expense');
      check(r, { 'create expense handled': (x) => x.status !== 0 && x.status < 500 });
      let id = null;
      try { id = r.json('id') || r.json('expense.id'); } catch (e) { /* ignore */ }
      if (id && ok2xx(r)) {
        const g = get(data, `/expenses/${id}`, 'expenses', 'expenses', 'get-expense');
        check(g, { 'get expense handled': (x) => x.status !== 0 && x.status < 500 });
        const d = del(data, `/expenses/${id}`, 'expenses', 'expenses', 'delete-expense');
        check(d, { 'delete expense handled': (x) => x.status !== 0 && x.status < 500 });
      }
    }],
  ]);
}
