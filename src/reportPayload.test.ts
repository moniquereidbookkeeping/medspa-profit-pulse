import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportPayload, newReportId } from './reportPayload.ts';
import { onRequestPost } from '../functions/api/report.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('newReportId makes valid v4 ids with and without crypto.randomUUID (older iPhones, in-app browsers)', () => {
  assert.match(newReportId(), UUID);
  assert.match(newReportId({ getRandomValues: (a) => { a.fill(171); return a; } }), UUID, 'no randomUUID');
  assert.match(newReportId(undefined as any), UUID, 'no crypto at all');
  assert.match(newReportId({ randomUUID: () => { throw new Error('insecure context'); } }), UUID, 'randomUUID throws');
  assert.notEqual(newReportId(), newReportId());
});

test('the exact payload the page builds is accepted by the real server code', async () => {
  const realFetch = globalThis.fetch;
  let forwarded: any = null;
  globalThis.fetch = (async (_u: any, o: any) => { forwarded = JSON.parse(o.body); return new Response(JSON.stringify({ saved: true, reportId: forwarded.reportId }), { status: 200 }); }) as typeof fetch;
  try {
    const payload = buildReportPayload({
      reportId: newReportId(), ownerName: '  Dr. Test ', practiceName: 'Glow Spa', email: ' Owner@Glow.com ', phone: '', feedback: '',
      contactConsent: true, hpRef: '', turnstileToken: '', category: 'lasers',
      paymentPlatform: 'CareCredit Standard Doctor Fee Program', treatmentType: 'package', sessions: 4,
      price: 2400, wholesaleCost: 150, wasteCushionPct: 10, feeRatePct: 5.9, hourlyOverhead: 120, commissionPct: 25,
      treatmentsPerMonth: 12, treatmentMinutes: 45, targetMarginPct: 40, treatmentName: 'ignored on this tab'
    });
    const res = await onRequestPost({
      request: new Request('https://site.test/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://site.test' }, body: JSON.stringify(payload) }),
      env: { APPS_SCRIPT_URL: 'https://example.invalid/exec', REPORT_SHARED_SECRET: 's' }
    } as any);
    assert.equal(res.status, 200);
    assert.equal(forwarded.email, 'owner@glow.com');
    assert.equal(forwarded.ownerName, 'Dr. Test');
    assert.equal(forwarded.treatmentType, 'package');
    assert.match(forwarded.feedback, /Volume: 12\/mo \| Yearly contribution: \$\d+/);
    assert.equal(forwarded.contribution, Math.round((2400 - (141.6 + 660 + 600 + 480)) * 100) / 100); // 518.40, rounded to cents
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the page never sends calculator totals for the server to trust', () => {
  const p: any = buildReportPayload({
    reportId: newReportId(), ownerName: 'a', practiceName: 'b', email: 'c@d.co', phone: '', feedback: '', contactConsent: true,
    hpRef: '', turnstileToken: '', category: 'facials', paymentPlatform: 'Regular Card Processing (Stripe, Vagaro, Square)',
    treatmentType: 'single', sessions: 1, price: 1, wholesaleCost: 1, wasteCushionPct: 1, feeRatePct: 1, hourlyOverhead: 1, commissionPct: 1,
    treatmentsPerMonth: 1, treatmentMinutes: 1, targetMarginPct: 1, treatmentName: ''
  });
  for (const k of ['contribution', 'margin', 'totalOutflows', 'hiddenPlatformFees', 'providerPayrollCut', 'totalCostOfMaterials', 'roomOperationalExpense']) assert.ok(!(k in p), k);
});

test('the treatment name is sent only from the Other tab', () => {
  const base: any = { reportId: newReportId(), ownerName: 'a', practiceName: 'b', email: 'c@d.co', phone: '', feedback: '', contactConsent: true, hpRef: '', turnstileToken: '',
    paymentPlatform: 'Regular Card Processing (Stripe, Vagaro, Square)', treatmentType: 'single', sessions: 1, price: 1, wholesaleCost: 1, wasteCushionPct: 1, feeRatePct: 1, hourlyOverhead: 1, commissionPct: 1,
    treatmentsPerMonth: 1, treatmentMinutes: 1, targetMarginPct: 1, treatmentName: '  CoolSculpting ' };
  assert.equal(buildReportPayload({ ...base, category: 'other' }).treatmentName, 'CoolSculpting');
  assert.equal(buildReportPayload({ ...base, category: 'facials' }).treatmentName, '');
});
