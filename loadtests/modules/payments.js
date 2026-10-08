// payments module — tables: payment_commands (+ Daraja M-Pesa side-effects).
// Writes are GATED (WRITE_PAYMENTS=1) because POST /payments hits the M-Pesa sandbox.
import { check } from 'k6';
import { login, get, post, mix, scenario, thresholds, WRITE_PAYMENTS } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('payments') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [5, () => {
      const r = get(data, '/payments?limit=20', 'payments', 'payment_commands', 'list-payments');
      check(r, { 'list payments 2xx': (x) => x.status === 200 });
    }],
    [2, () => {
      const r = get(data, '/payments?limit=1', 'payments', 'payment_commands', 'poll-latest');
      check(r, { 'poll handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [WRITE_PAYMENTS ? 2 : 0, () => {
      const r = post(data, '/payments',
        { amount: 10, phone: '254708000000', method: 'mpesa-stk' },
        'payments', 'payment_commands', 'initiate-payment');
      check(r, { 'initiate handled': (x) => x.status !== 0 && x.status < 500 });
    }],
  ]);
}
