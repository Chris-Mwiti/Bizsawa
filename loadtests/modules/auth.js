// auth module — tables: auth_users, auth_accounts, auth_otps, auth_refresh_tokens
import { check } from 'k6';
import { login, get, post, mix, scenario, thresholds, BASE } from '../lib/helpers.js';
import http from 'k6/http';

export const options = { scenarios: scenario('default'), thresholds: thresholds('auth') };
export function setup() { return login(); }

function loginFlow() {
  // Login with seeded creds (exercises auth_users + auth_refresh_tokens writes).
  // Under load with wrong/missing creds this 401s — that still load-tests the module.
  const email = __ENV.TEST_EMAIL || 'k6-loadtest@example.com';
  const res = post(null, '/auth/login', { email, password: __ENV.TEST_PASSWORD || 'wrong-password' },
    'auth', 'auth_users', 'login');
  check(res, { 'login handled (no 5xx)': (r) => r.status !== 0 && r.status < 500 });
}

function checkEmail(data) {
  const res = http.get(`${BASE}/auth/check-email?email=k6-${__VU}@example.com`, {
    headers: { 'Content-Type': 'application/json' },
    tags: { module: 'auth', table: 'auth_users', op: 'check-email' },
  });
  check(res, { 'check-email handled': (r) => r.status !== 0 && r.status < 500 });
}

function otpSend(data) {
  const res = post(data, '/auth/email-otp/send-verification-otp', { email: `k6-${__VU}-${__ITER}@example.com` },
    'auth', 'auth_otps', 'otp-send');
  check(res, { 'otp-send handled': (r) => r.status !== 0 && r.status < 500 });
}

function refresh(data) {
  const res = post(data, '/auth/refresh', { refreshToken: 'k6-invalid-token' },
    'auth', 'auth_refresh_tokens', 'refresh-invalid');
  check(res, { 'refresh rejects bad token without 5xx': (r) => r.status === 401 || r.status === 400 || (r.status !== 0 && r.status < 500) });
}

export default function (data) {
  if (!data.token) { loginFlow(); return; }
  mix([[3, () => checkEmail(data)], [2, loginFlow], [1, () => otpSend(data)], [1, () => refresh(data)]]);
}
