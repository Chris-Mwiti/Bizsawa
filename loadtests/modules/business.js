// business + tenancy module — tables: businesses, business_members, business_invites,
// tenancy_subscriptions, subscription_payments, user_profiles
import { check } from 'k6';
import { login, get, post, put, mix, scenario, thresholds, uniq } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('business') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) { check(null, { 'needs auth (set TOKEN or TEST_EMAIL/TEST_PASSWORD)': () => false }); return; }
  mix([
    [4, () => {
      const r = get(data, '/businesses', 'business', 'businesses', 'list-businesses');
      check(r, { 'list businesses 2xx': (x) => x.status === 200 });
    }],
    [3, () => {
      const r = get(data, '/profile', 'business', 'user_profiles', 'get-profile');
      check(r, { 'profile handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [2, () => {
      const r = get(data, '/subscriptions/subscription', 'business', 'tenancy_subscriptions', 'active-subscription');
      check(r, { 'subscription handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      // Plan guard: accounts are limited to 1 business, so repeat creates 403 —
      // that IS the expected behaviour under load (limit enforced, no 5xx).
      const name = uniq('k6-biz');
      const r = post(data, '/businesses', { name }, 'business', 'businesses', 'create-business');
      check(r, { 'create business handled (201 or limit-403)': (x) => x.status === 201 || x.status === 403 });
    }],
  ]);
}
