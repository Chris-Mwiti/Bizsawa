// users/members module — tables: user_profiles, business_members, business_invites
import { check } from 'k6';
import http from 'k6/http';
import { login, get, post, mix, scenario, thresholds, uniq, BASE } from '../lib/helpers.js';
export const options = { scenarios: scenario('default'), thresholds: thresholds('users') };
let __invited = false; // per-VU: each VU invites at most once
let __inviteeId = null;
function ensureInvitee(data) {
  if (__inviteeId) return __inviteeId;
  // Each VU registers its own invitee: no cross-VU duplicates at any scale.
  // (Email invites would hit Resend — sandbox rejects example.com — so we use direct /invite.)
  const email = `k6-invitee-${__VU}-${Date.now()}@example.com`;
  try {
    const res = http.post(`${BASE}/auth/register`, JSON.stringify({ email, password: 'K6Invitee!123' }),
      { headers: { 'Content-Type': 'application/json' }, tags: { module: 'users', table: 'auth_users', op: 'register-invitee' } });
    __inviteeId = res.json('userId') || null;
  } catch (e) { __inviteeId = null; }
  return __inviteeId;
}
export function setup() {
  return login();
}

export default function (data) {
  if (!data.token) return;
  const membersBase = data.businessId
    ? `/businesses/${data.businessId}/members`
    : '/businesses/k6-no-business/members'; // will 4xx -> still exercises authz path
  mix([
    [4, () => {
      const r = get(data, membersBase, 'users', 'business_members', 'list-members');
      check(r, { 'list members handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [2, () => {
      const r = get(data, `${membersBase}/invites`, 'users', 'business_invites', 'list-invites');
      check(r, { 'invites handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [1, () => {
      // Direct member invite, once per VU with a VU-private invitee (no duplicates).
      if (__invited) {
        get(data, membersBase, 'users', 'business_members', 'list-members-reread');
        return;
      }
      const inviteeId = ensureInvitee(data);
      if (!inviteeId) return;
      const r = post(data, `${membersBase}/invite`,
        { userId: inviteeId, role: 'CASHIER' },
        'users', 'business_members', 'invite-member');
      check(r, { 'invite 2xx': (x) => x.status === 200 || x.status === 201 });
      __invited = true;
    }],
  ]);
}
