// sync module (mobile offline-first) — tables: conflicts, outbox_events + all synced tables.
// Mirrors what the Expo app does: pull on foreground, push queued offline changes.
import { check } from 'k6';
import { login, get, post, mix, scenario, thresholds, uniq } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('sync') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [4, () => {
      // Steady-state foreground pull: delta since 1h ago (what phones do 95% of the time)
      const since = Date.now() - 3600000;
      const r = get(data, `/sync/pull?since=${since}`, 'sync', 'outbox_events', 'pull-delta');
      check(r, { 'delta pull 2xx': (x) => x.status === 200 });
    }],
    [1, () => {
      // Full first-install pull: uncapped full dataset — the expensive path.
      // FINDING: no pagination/cap; grows with business history (see FINDINGS.md).
      const r = get(data, '/sync/pull', 'sync', 'outbox_events', 'pull-full');
      check(r, { 'full pull handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [3, () => {
      // Empty push exercises the apply/conflict pipeline with zero side effects
      const r = post(data, '/sync/push', { changes: {}, lastPulledAt: null },
        'sync', 'conflicts', 'push-empty');
      check(r, { 'push handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      // Offline-created customer replayed on reconnect (creates a real row — unique name)
      const r = post(data, '/sync/push',
        { changes: { customers: { created: [{ clientId: uniq('cli'), name: uniq('k6-sync-cust') }] } }, lastPulledAt: null },
        'sync', 'conflicts', 'push-replay');
      check(r, { 'replay handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      const r = get(data, '/sync/conflicts', 'sync', 'conflicts', 'list-conflicts');
      check(r, { 'conflicts handled': (x) => x.status !== 0 && x.status < 500 });
    }],
  ]);
}
