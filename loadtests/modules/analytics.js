// analytics module — tables: analytics_snapshots (+ aggregates over sales/expenses/inventory)
import { check } from 'k6';
import { login, get, post, mix, scenario, thresholds } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('analytics') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [5, () => {
      const r = get(data, '/analytics', 'analytics', 'analytics_snapshots', 'dashboard');
      check(r, { 'dashboard handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [2, () => {
      const r = get(data, '/analytics/tax', 'analytics', 'analytics_snapshots', 'tax-view');
      check(r, { 'tax view handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      const r = get(data, '/analytics/ai-insights', 'analytics', 'analytics_snapshots', 'ai-insights');
      check(r, { 'insights handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      // Refresh is the heaviest op (recomputes snapshots) — low weight by design
      const r = post(data, '/analytics/refresh', {}, 'analytics', 'analytics_snapshots', 'refresh');
      check(r, { 'refresh handled': (x) => x.status !== 0 && x.status < 500 });
    }],
  ]);
}
