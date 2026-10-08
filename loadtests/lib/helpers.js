import http from 'k6/http';
import { Counter, Rate } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Shared helpers for the Bizworth k6 load-test suite.
// Black-box HTTP tests: every request is tagged with {module, table, op} so
// results can be sliced per database-table-registry entry (see TABLE_REGISTRY.md).
// 5xx = failure. 4xx on writes = "handled" (validation/data under concurrency),
// never fails the run. Transport errors surface via http_req_failed.
// ---------------------------------------------------------------------------

export const BASE = (__ENV.BASE_URL || 'http://localhost:5504/api/v1').replace(/\/$/, '');
export const PROFILE = (__ENV.PROFILE || 'smoke').toLowerCase();
export const BUSINESS_ID = __ENV.BUSINESS_ID || '';

// Side-effect gates (default OFF — load tests must not spam real money/WhatsApp/LLM):
export const WRITE_PAYMENTS = __ENV.WRITE_PAYMENTS === '1'; // POST /payments (M-Pesa sandbox)
export const WRITE_WAHA = __ENV.WRITE_WAHA === '1';         // POST /waha/* (real WhatsApp)
export const WRITE_LLM = __ENV.WRITE_LLM === '1';           // POST /chatbot/*, /chat/* (LLM cost)

export const errorRate = new Rate('error_rate_5xx');
export const writeOk = new Counter('writes_2xx');
export const writeHandled = new Counter('writes_handled_non2xx');
export const skipped = new Counter('ops_skipped_no_fixture');

export function login() {
  if (__ENV.TOKEN) return { token: __ENV.TOKEN, businessId: BUSINESS_ID };
  const email = __ENV.TEST_EMAIL || '';
  const password = __ENV.TEST_PASSWORD || '';
  if (!email || !password) {
    console.warn('No TOKEN or TEST_EMAIL/TEST_PASSWORD — authenticated scenarios will be skipped');
    return { token: '', businessId: BUSINESS_ID };
  }
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { module: 'auth', table: 'auth_users', op: 'setup-login' } },
  );
  let token = '';
  try {
    token = res.json('token') || res.json('accessToken') || res.json('data.token') || '';
  } catch (e) { /* ignore */ }
  if (!token) console.warn(`setup login failed: status=${res.status} body=${String(res.body).slice(0, 200)}`);
  return { token, businessId: BUSINESS_ID };
}

export function H(data) {
  const h = { 'Content-Type': 'application/json' };
  if (data && data.token) h['Authorization'] = `Bearer ${data.token}`;
  const bid = (data && data.businessId) || BUSINESS_ID;
  if (bid) h['X-Business-ID'] = bid;
  return h;
}

function track(res, module) {
  const bad = res.status === 0 || res.status >= 500;
  errorRate.add(bad, { module });
  return res;
}

export function get(data, path, module, table, op) {
  const res = http.get(`${BASE}${path}`, {
    headers: H(data),
    tags: { module, table, op: op || `GET ${path}` },
  });
  return track(res, module);
}

export function send(data, method, path, body, module, table, op) {
  const res = http.request(method, `${BASE}${path}`, body ? JSON.stringify(body) : null, {
    headers: H(data),
    tags: { module, table, op: op || `${method} ${path}` },
  });
  track(res, module);
  if (method !== 'GET') {
    if (res.status === 200 || res.status === 201) writeOk.add(1, { module });
    else if (res.status < 500) writeHandled.add(1, { module });
  }
  return res;
}

export const post = (d, p, b, m, t, o) => send(d, 'POST', p, b, m, t, o);
export const put = (d, p, b, m, t, o) => send(d, 'PUT', p, b, m, t, o);
export const del = (d, p, m, t, o) => send(d, 'DELETE', p, null, m, t, o);

/** POST with X-Idempotency-Key (required by POST /orders; must be UUID-shaped). */
function uuidv4() {
  const h = () => Math.floor(Math.random() * 65535).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${h().slice(1)}-${h()}${h()}${h()}`;
}

export function idemHeaders(data) {
  const h = H(data);
  h['X-Idempotency-Key'] = uuidv4();
  return h;
}

export function postI(data, path, body, module, table, op) {
  const res = http.request('POST', `${BASE}${path}`, JSON.stringify(body || {}), {
    headers: idemHeaders(data),
    tags: { module, table, op: op || `POST ${path}` },
  });
  track(res, module);
  if (res.status === 200 || res.status === 201) writeOk.add(1, { module });
  else if (res.status < 500) writeHandled.add(1, { module });
  return res;
}

export const ok2xx = (res) => res.status === 200 || res.status === 201;
export const not5xx = (res) => res.status !== 0 && res.status < 500;

/** Weighted random dispatch: ops = [[weight, fn], ...] */
export function mix(ops) {
  let total = 0;
  for (const [w] of ops) total += w;
  let r = Math.random() * total;
  for (const [w, fn] of ops) {
    r -= w;
    if (r <= 0) return fn();
  }
  return ops[ops.length - 1][1]();
}

export function uniq(prefix) {
  return `${prefix}-${__VU}-${__ITER}-${Date.now() % 100000}`;
}

// ---- load profiles: spike / soak / stress (+ smoke for verification) --------

// ramping-vus spike: baseline -> sudden 8x burst -> hold -> recover
const SPIKE_STAGES = [
  { duration: '30s', target: 15 },
  { duration: '20s', target: 120 },
  { duration: '1m', target: 120 },
  { duration: '20s', target: 15 },
  { duration: '1m', target: 15 },
];
// stress: stepwise climb to find the breaking point, then ramp down
const STRESS_STAGES = [
  { duration: '1m', target: 25 },
  { duration: '2m', target: 75 },
  { duration: '2m', target: 150 },
  { duration: '2m', target: 250 },
  { duration: '1m', target: 0 },
];

export function scenario(exec) {
  if (PROFILE === 'spike') {
    const s = {};
    s[exec + '_spike'] = { executor: 'ramping-vus', exec, startVUs: 5, stages: SPIKE_STAGES, gracefulRampDown: '20s' };
    return s;
  }
  if (PROFILE === 'soak') {
    const s = {};
    // Default 20m. A true production soak is 2h+:  SOAK_DURATION=2h PROFILE=soak
    s[exec + '_soak'] = { executor: 'constant-vus', exec, vus: 15, duration: __ENV.SOAK_DURATION || '20m' };
    return s;
  }
  if (PROFILE === 'stress') {
    const s = {};
    s[exec + '_stress'] = { executor: 'ramping-vus', exec, startVUs: 5, stages: STRESS_STAGES, gracefulRampDown: '30s' };
    return s;
  }
  const s = {};
  s[exec + '_smoke'] = { executor: 'constant-vus', exec, vus: 2, duration: '30s' };
  return s;
}

export function thresholds(module) {
  const perMod = {};
  perMod[`http_req_duration{module:${module}}`] =
    PROFILE === 'soak' ? ['p(95)<800'] : PROFILE === 'stress' ? ['p(95)<2000'] : PROFILE === 'spike' ? ['p(95)<1200'] : [];
  const base =
    PROFILE === 'spike'
      ? { 'http_req_duration': ['p(95)<1200'], 'error_rate_5xx': ['rate<0.05'] }
      : PROFILE === 'soak'
        ? { 'http_req_duration': ['p(95)<800'], 'error_rate_5xx': ['rate<0.01'] }
        : PROFILE === 'stress'
          ? { 'http_req_duration': ['p(95)<2000'], 'error_rate_5xx': ['rate<0.10'] }
          : {};
  return Object.assign(base, perMod);
}

// ---- lazy per-VU fixtures (each VU resolves once, then reuses) --------------
let __productId = null;
let __customerId = null;

function firstId(res, keys) {
  try {
    const j = res.json();
    for (const k of keys) {
      const v = k ? j[k] : j;
      if (Array.isArray(v) && v.length && v[0].id) return v[0].id;
      if (v && v.id) return v.id;
    }
  } catch (e) { /* ignore */ }
  return null;
}

export function ensureProductId(data) {  if (__productId) return __productId;
  const list = get(data, '/products?limit=5', 'products', 'products', 'fixture-list-products');
  __productId = firstId(list, ['products', 'data', 'items', null]);
  if (!__productId) {
    const name = uniq('k6-prod');
    const created = post(
      data,
      '/products',
      { name, category: 'Dairy Feed', price: 100, buyingPrice: 70, supplier: 'k6-fixture', sku: name },
      'products', 'products', 'fixture-create-product',
    );
    __productId = firstId(created, [null, 'product', 'data']);
  }
  if (!__productId) skipped.add(1, { module: 'products' });
  return __productId;
}

export function ensureCustomerId(data) {
  if (__customerId) return __customerId;
  const list = get(data, '/customers?limit=5', 'customers', 'customers', 'fixture-list-customers');
  __customerId = firstId(list, ['customers', 'data', 'items', null]);
  if (!__customerId) {
    const created = post(
      data, '/customers',
      { name: uniq('k6-cust'), phone: `2547${String(10000000 + Math.floor(Math.random() * 89999999))}` },
      'customers', 'customers', 'fixture-create-customer',
    );
    __customerId = firstId(created, [null, 'customer', 'data']);
  }
  if (!__customerId) skipped.add(1, { module: 'customers' });
  return __customerId;
}

/** Uncached first-id pick (for reads that must not use a possibly-deleted cached fixture). */
export function liveFirstId(data, path, keys, module) {
  const list = get(data, path, module, 'pick', 'pick-live');
  if (list.status !== 200) return null;
  return firstId(list, keys);
}
