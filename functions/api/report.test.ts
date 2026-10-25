import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, onRequestGet } from './report.ts';

const env = { APPS_SCRIPT_URL: 'https://example.invalid/exec', REPORT_SHARED_SECRET: 'test-secret' };
const realFetch = globalThis.fetch;

/** Replace fetch with a fake Apps Script and remember what was forwarded to it. */
function mockUpstream(mode: 'ok' | 'rejects' | 'down' = 'ok') {
  const calls: any[] = [];
  globalThis.fetch = (async (url: any, opts: any) => {
    if (String(url).includes('challenges.cloudflare.com')) {
      const token = new URLSearchParams(opts.body).get('response');
      return new Response(JSON.stringify({ success: token === 'good-token' }), { status: 200 });
    }
    if (opts?.method === 'GET') return new Response(JSON.stringify({ status: 'ready', submissionsTabFound: true }), { status: 200 });
    if (mode === 'down') throw new Error('network');
    const sent = JSON.parse(opts.body);
    calls.push(sent);
    if (mode === 'rejects') return new Response(JSON.stringify({ saved: false, error: 'Exception: internal sheet detail' }), { status: 200 });
    return new Response(JSON.stringify({ saved: true, reportId: sent.reportId }), { status: 200 });
  }) as typeof fetch;
  return calls;
}

const payload = (over: Record<string, unknown> = {}) => ({
  reportId: crypto.randomUUID(), ownerName: 'Test Owner', practiceName: 'Test Medspa',
  email: 'owner@testmedspa.com', phone: '954-555-0123', contactConsent: true, feedback: 'great tool',
  category: 'facials', paymentPlatform: 'Cherry Financing (12-Month Zero-Interest Split)',
  treatmentType: 'single', sessions: 1, price: 250, wholesaleCost: 35, wasteCushionPct: 20,
  feeRatePct: 13.5, hourlyOverhead: 45, commissionPct: 40, source: 'MedSpa Profit Pulse', ...over
});

const post = async (body: object, e: Record<string, string> = env) => {
  const res = await onRequestPost({
    request: new Request('https://site.test/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    env: e
  } as any);
  return { status: res.status, body: await res.json() as any };
};

test.afterEach(() => { globalThis.fetch = realFetch; });

test('saves the exact payload the page sends and recomputes totals on the server', async () => {
  const calls = mockUpstream();
  const r = await post(payload({ contribution: 99999, margin: 99.9, totalOutflows: 1 }));
  assert.equal(r.status, 200);
  assert.equal(r.body.saved, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].contribution, 29.25);
  assert.equal(calls[0].margin, 11.7);
  assert.equal(calls[0].totalOutflows, 220.75);
  assert.equal(calls[0].paymentMethod, 'cherry');
  assert.equal(calls[0].secret, 'test-secret');
});

test('email and platform are kept in the feedback column for sheets without those columns', async () => {
  const calls = mockUpstream();
  await post(payload());
  assert.match(calls[0].feedback, /Email: owner@testmedspa\.com/);
  assert.match(calls[0].feedback, /Platform: Cherry Financing/);
  assert.match(calls[0].feedback, /Feedback: great tool/);
  assert.equal(calls[0].email, 'owner@testmedspa.com');
});

test('rejects a missing or invalid email, missing names, and missing consent', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload({ email: '' }))).status, 400);
  assert.equal((await post(payload({ email: 'not-an-email' }))).status, 400);
  assert.equal((await post(payload({ ownerName: '  ' }))).status, 400);
  assert.equal((await post(payload({ practiceName: '' }))).status, 400);
  assert.equal((await post(payload({ contactConsent: false }))).status, 400);
  assert.equal(calls.length, 0, 'nothing should reach the sheet');
});

test('phone is optional but must look real when given', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload({ phone: '' }))).status, 200);
  assert.equal((await post(payload({ phone: '12345' }))).status, 400);
  assert.equal(calls.length, 1);
});

test('neutralizes spreadsheet formulas typed into text fields', async () => {
  const calls = mockUpstream();
  await post(payload({ ownerName: '=HYPERLINK("http://evil","x")', practiceName: '+cmd', feedback: '@SUM(A1)' }));
  assert.ok(calls[0].ownerName.startsWith("'="));
  assert.ok(calls[0].practiceName.startsWith("'+"));
});

test('rejects tampered or out-of-range calculator values', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload({ sessions: 3 }))).status, 400, 'single visit with 3 sessions');
  assert.equal((await post(payload({ feeRatePct: 50 }))).status, 400);
  assert.equal((await post(payload({ commissionPct: 150 }))).status, 400);
  assert.equal((await post(payload({ price: -5 }))).status, 400);
  assert.equal((await post(payload({ paymentPlatform: 'Venmo' }))).status, 400);
  assert.equal((await post(payload({ reportId: 'nope' }))).status, 400);
  assert.equal(calls.length, 0);
});

test('hidden spam-trap field quietly saves nothing', async () => {
  const calls = mockUpstream();
  const r = await post(payload({ website: 'http://spam.example' }));
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0);
});

test('visitors get a friendly error and internal details stay in the logs', async () => {
  mockUpstream('rejects');
  const r = await post(payload());
  assert.equal(r.status, 502);
  assert.equal(r.body.saved, false);
  assert.ok(!JSON.stringify(r.body).includes('internal sheet detail'));
  mockUpstream('down');
  const r2 = await post(payload());
  assert.equal(r2.status, 502);
  assert.ok(!JSON.stringify(r2.body).includes('network'));
});

test('Turnstile is only enforced when the secret key is configured', async () => {
  const calls = mockUpstream();
  const withBot = { ...env, TURNSTILE_SECRET_KEY: 'turnstile-secret' };
  assert.equal((await post(payload(), withBot)).status, 400, 'no token');
  assert.equal((await post(payload({ turnstileToken: 'bad-token' }), withBot)).status, 400, 'bad token');
  assert.equal((await post(payload({ turnstileToken: 'good-token' }), withBot)).status, 200, 'good token');
  assert.equal(calls.length, 1);
  assert.equal((await post(payload())).status, 200, 'works without the key');
});

test('reports not-configured when the environment variables are missing', async () => {
  mockUpstream();
  assert.equal((await post(payload(), { APPS_SCRIPT_URL: '', REPORT_SHARED_SECRET: '' })).status, 503);
  const health = await onRequestGet({ env: { APPS_SCRIPT_URL: '', REPORT_SHARED_SECRET: '' } } as any);
  assert.equal(health.status, 503);
});

test('health check reports ready and whether bot protection is on', async () => {
  mockUpstream();
  const ok = await onRequestGet({ env } as any);
  const body: any = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.status, 'ready');
  assert.equal(body.botProtection, 'disabled');
});
