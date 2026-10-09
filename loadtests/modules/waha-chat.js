// waha (WhatsApp) + chat modules — tables: outbox_events (+ invoices on notify).
// Sends are GATED (WRITE_WAHA=1 / WRITE_LLM=1): by default this file load-tests
// routing + payload validation only (no real WhatsApp messages, no LLM spend).
import { check } from 'k6';
import { login, post, mix, scenario, thresholds, WRITE_WAHA, WRITE_LLM } from '../lib/helpers.js';

export const options = { scenarios: scenario('default'), thresholds: thresholds('waha') };
export function setup() { return login(); }

export default function (data) {
  if (!data.token) return;
  mix([
    [3, () => {
      const body = WRITE_WAHA
        ? { to: __ENV.TEST_WA_RECIPIENT || '254700000000', message: 'k6 load test — ignore' }
        : {}; // empty => validation path only
      const r = post(data, '/waha/send', body, 'waha', 'outbox_events', 'waha-send');
      check(r, { 'waha send handled': (x) => x.status !== 0 && x.status < 500 });
      // FIXED (was: route resolved "waha", policy seeded "whatsapp" -> OWNER 403).
      // waha is now normalised to whatsapp + seeded; gated sends return 422
      // validation. 403 stays accepted in case of future RBAC regressions.
      if (!WRITE_WAHA) check(r, { 'waha rejects w/o 5xx (400/422/403)': (x) => x.status === 400 || x.status === 422 || x.status === 403 });
    }],
    [2, () => {
      const r = post(data, '/waha/notify', WRITE_WAHA ? { to: __ENV.TEST_WA_RECIPIENT || '254700000000', kind: 'k6' } : {},
        'waha', 'outbox_events', 'waha-notify');
      check(r, { 'waha notify handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [WRITE_LLM ? 2 : 0, () => {
      const r = post(data, '/chatbot/chat', { message: 'What were my sales today?' },
        'chat', 'outbox_events', 'chatbot-chat');
      check(r, { 'chatbot handled': (x) => x.status !== 0 && x.status < 500 });
    }],
    [!WRITE_LLM ? 2 : 0, () => {
      // FIXED (was: empty payload 500d instead of 400). Empty message now
      // returns 400; assertion holds the line against regressions.
      const r = post(data, '/chatbot/chat', {}, 'chat', 'outbox_events', 'chatbot-validation');
      check(r, { 'chatbot validation w/o 5xx (wanted)': (x) => x.status !== 0 && x.status < 500 });
    }],
  ]);
}
