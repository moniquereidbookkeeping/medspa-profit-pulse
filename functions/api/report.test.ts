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
    if (mode === 'down') throw new TypeError('network');
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

const post = async (body: object, e: Record<string, string> = env, headers: Record<string, string> = {}) => {
  const res = await onRequestPost({
    request: new Request('https://site.test/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }),
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
  assert.match(calls[0].feedback, /Consent: \d{4}-\d{2}-\d{2}T/, 'records when consent was given');
  assert.equal(calls[0].email, 'owner@testmedspa.com');
  assert.match(calls[0].consentAt, /^\d{4}-\d{2}-\d{2}T/);
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
  const r = await post(payload({ hpRef: 'http://spam.example' }));
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0);
});

test('visitors get a friendly error and internal details stay in the logs', async () => {
  mockUpstream('rejects');
  const r = await post(payload());
  assert.equal(r.status, 502);
  assert.equal(r.body.saved, false);
  assert.equal(r.body.code, 'upstream_rejected', 'a short code says which step failed');
  assert.ok(!JSON.stringify(r.body).includes('internal sheet detail'), 'the sheet script\'s own message is never shown to visitors');
  mockUpstream('down');
  const r2 = await post(payload());
  assert.equal(r2.status, 502);
  assert.equal(r2.body.code, 'upstream_unreachable');
  assert.ok(!JSON.stringify(r2.body).includes('network'));
});

test('Turnstile is only enforced when BOTH keys are configured', async () => {
  const calls = mockUpstream();
  const withBot = { ...env, TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'turnstile-secret' };
  assert.equal((await post(payload(), withBot)).status, 400, 'no token');
  assert.equal((await post(payload({ turnstileToken: 'bad-token' }), withBot)).status, 400, 'bad token');
  assert.equal((await post(payload({ turnstileToken: 'good-token' }), withBot)).status, 200, 'good token');
  assert.equal(calls.length, 1);
  assert.equal((await post(payload())).status, 200, 'works without the keys');
  // A half-configured setup must never block real visitors: the page would not show the widget.
  assert.equal((await post(payload(), { ...env, TURNSTILE_SECRET_KEY: 'only-secret' })).status, 200, 'secret without site key = off');
  assert.equal((await post(payload(), { ...env, TURNSTILE_SITE_KEY: 'only-site' })).status, 200, 'site key without secret = off');
});

test('refuses submissions sent from another website but allows the site itself', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload(), env, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(payload(), env, { Origin: 'not a url' })).status, 403);
  assert.equal((await post(payload(), env, { Origin: 'https://site.test' })).status, 200);
  assert.equal(calls.length, 1);
});

test('text fields must be real strings and are rejected, not silently cut, when too long', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload({ ownerName: { a: 1 } }))).status, 400);
  assert.equal((await post(payload({ practiceName: ['x'] }))).status, 400);
  assert.equal((await post(payload({ email: 'a'.repeat(250) + '@x.com' }))).status, 400, 'over-long email');
  assert.equal((await post(payload({ feedback: 'y'.repeat(401) }))).status, 400);
  assert.equal((await post(payload({ paymentPlatform: ['Regular Card Processing (Stripe, Vagaro, Square)'] }))).status, 400);
  assert.equal(calls.length, 0);
});

test('report id must be a real UUID', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload({ reportId: '-'.repeat(36) }))).status, 400);
  assert.equal((await post(payload({ reportId: 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz' }))).status, 400);
  assert.equal((await post(payload({ reportId: 12345 }))).status, 400);
  assert.equal(calls.length, 0);
});

test('hidden direction-override and zero-width characters are removed from saved text', async () => {
  const calls = mockUpstream();
  await post(payload({ ownerName: 'Dr\u202E Evil\u200B Name', practiceName: 'Spa\u0007 One' }));
  assert.ok(!/[\u202E\u200B\u0007]/.test(calls[0].ownerName + calls[0].practiceName));
});

test('the same report id can be retried and is forwarded unchanged so rows can be de-duplicated', async () => {
  const calls = mockUpstream();
  const id = crypto.randomUUID();
  await post(payload({ reportId: id }));
  await post(payload({ reportId: id }));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].reportId, id);
  assert.equal(calls[1].reportId, id);
});

test('reports not-configured when the environment variables are missing', async () => {
  mockUpstream();
  assert.equal((await post(payload(), { APPS_SCRIPT_URL: '', REPORT_SHARED_SECRET: '' })).status, 503);
  const health = await onRequestGet({ env: { APPS_SCRIPT_URL: '', REPORT_SHARED_SECRET: '' } } as any);
  assert.equal(health.status, 503);
});

test('health check warns when only one Turnstile key is set', async () => {
  mockUpstream();
  const res = await onRequestGet({ env: { ...env, TURNSTILE_SECRET_KEY: 'only-secret' } } as any);
  const body: any = await res.json();
  assert.equal(body.botProtection, 'disabled');
  assert.match(body.warning, /Only one of/);
});

test('health check reports ready and whether bot protection is on', async () => {
  mockUpstream();
  const ok = await onRequestGet({ env } as any);
  const body: any = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.status, 'ready');
  assert.equal(body.botProtection, 'disabled');
});

test('phone: international and punctuated numbers are accepted, letters and formulas are rejected', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload({ phone: '(954) 555-0123' }))).status, 200);
  assert.equal((await post(payload({ phone: '+1 954 555 0123' }))).status, 200);
  assert.equal((await post(payload({ phone: '954.555.0123' }))).status, 200);
  assert.equal((await post(payload({ phone: 'call me maybe 9545550123' }))).status, 400);
  assert.equal((await post(payload({ phone: '=HYPERLINK(1)1234567890' }))).status, 400);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].phone, '954-555-0123', 'dots become hyphens because the sheet script does not accept dots');
  assert.ok(/^[0-9 ()-]{10,25}$/.test(calls[0].phone) && /^[0-9 ()-]{10,25}$/.test(calls[1].phone), 'every stored phone matches the sheet script rule');
});

test('an international "+" phone number is stored without the "+", so Google Sheets never reads it as a formula', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload({ phone: '+1 954 555 0123' }))).status, 200);
  assert.equal(calls[0].phone, '1 954 555 0123');
  assert.ok(!calls[0].phone.startsWith("'"), 'no apostrophe escape either');
  await post(payload({ phone: '(954) 555-0123' }));
  assert.equal(calls[1].phone, '(954) 555-0123');
});

test('a missing bot check returns a machine-readable code so the page can show the check instead of a dead end', async () => {
  mockUpstream();
  const withBot = { ...env, TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'turnstile-secret' };
  const r = await post(payload(), withBot);
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'verification_required');
  assert.equal(r.body.saved, false);
  const ok = await post(payload({ turnstileToken: 'good-token' }), withBot);
  assert.equal(ok.status, 200);
});

test('every response from the report server carries the nosniff header and is never cached', async () => {
  mockUpstream();
  const res = await onRequestPost({
    request: new Request('https://site.test/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) }),
    env
  } as any);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('older pages without the new scale fields still save, and new fields are range-checked', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload())).status, 200, 'no scale fields');
  assert.ok(!/Volume:/.test(calls[0].feedback));
  assert.equal((await post(payload({ treatmentsPerMonth: 20, treatmentMinutes: 30, targetMarginPct: 40 }))).status, 200);
  assert.match(calls[1].feedback, /Volume: 20\/mo/);
  assert.match(calls[1].feedback, /Price for 40%: \$1339/, 'target price is recomputed on the server');
  assert.equal((await post(payload({ treatmentsPerMonth: -1 }))).status, 400);
  assert.equal((await post(payload({ treatmentsPerMonth: 5001 }))).status, 400);
  assert.equal((await post(payload({ treatmentsPerMonth: 2.5 }))).status, 400);
  assert.equal((await post(payload({ treatmentMinutes: 601 }))).status, 400);
  assert.equal((await post(payload({ targetMarginPct: 91 }))).status, 400);
  assert.equal((await post(payload({ treatmentsPerMonth: '20' }))).status, 400);
  assert.equal(calls.length, 2);
});

test('throw-away and placeholder email addresses are refused and nothing is saved', async () => {
  const calls = mockUpstream();
  assert.equal((await post(payload({ email: 'x@mailinator.com' }))).status, 400);
  assert.equal((await post(payload({ email: 'test@test.com' }))).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await post(payload({ email: 'paul@gmail.com' }))).status, 200);
});
