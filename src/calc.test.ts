import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProfitPulseMetrics, PLATFORM_DEFAULT_FEES, ALERT_COLORS } from './calc.ts';

test('calculates single-visit injectables and current low-contribution warning', () => {
  const result = calculateProfitPulseMetrics({
    price: 600,
    wholesaleCost: 200,
    hourlyOverhead: 50,
    feeRatePct: 3.0,
    sessions: 1,
    treatmentType: 'single',
    wasteCushionPct: 10,
    commissionPct: 30,
  });

  assert.equal(result.hiddenPlatformFees, 18);
  assert.equal(result.totalCostOfMaterials, 220);
  assert.equal(result.providerPayrollCut, 180);
  assert.equal(result.roomOperationalExpense, 50);
  assert.equal(result.totalOutflows, 468);
  assert.equal(result.yourRealTakeawayCash, 132);
  assert.equal(result.yourRealKeepPercentagePct, 22);
  assert.equal(result.takeawayPerVisit, 132);
  assert.equal(result.showMarginWarning, true);
  assert.match(result.marginWarningText, /Low estimated treatment contribution/);
  assert.match(result.marginWarningText, /not an industry benchmark/);
  assert.equal(result.showDeferredWarning, false);
  assert.equal(result.deferredPct, 0);
  assert.equal(result.alertLevel, 'red');
  assert.match(result.alertMessage, /below the 30% alert level/);
});

test('calculates a four-session prepaid package and current package caution', () => {
  const result = calculateProfitPulseMetrics({
    price: 2400,
    wholesaleCost: 150,
    hourlyOverhead: 120,
    feeRatePct: 8.0,
    sessions: 4,
    treatmentType: 'package',
    wasteCushionPct: 10,
    commissionPct: 25,
  });

  assert.equal(result.hiddenPlatformFees, 192);
  assert.equal(result.totalCostOfMaterials, 660);
  assert.equal(result.providerPayrollCut, 600);
  assert.equal(result.roomOperationalExpense, 480);
  assert.equal(result.totalOutflows, 1932);
  assert.equal(result.yourRealTakeawayCash, 468);
  assert.equal(result.yourRealKeepPercentagePct, 19.5);
  assert.equal(result.deferredPct, 75);
  assert.equal(result.takeawayPerVisit, 117);
  assert.equal(result.showDeferredWarning, true);
  assert.match(result.deferredWarningText, /Package caution/);
  assert.match(result.deferredWarningText, /some revenue may need to be deferred/);
  assert.match(result.deferredWarningText, /applicable rules/);
  assert.equal(result.showMarginWarning, true);
  assert.equal(result.alertLevel, 'red');
});

test('does not show a package deferral warning for one-session packages', () => {
  const result = calculateProfitPulseMetrics({
    price: 500,
    wholesaleCost: 100,
    hourlyOverhead: 40,
    feeRatePct: 3,
    sessions: 1,
    treatmentType: 'package',
    wasteCushionPct: 0,
    commissionPct: 20,
  });

  assert.equal(result.deferredPct, 0);
  assert.equal(result.showDeferredWarning, false);
});

test('validates platform default fee mappings and green alert level for high contribution', () => {
  const result = calculateProfitPulseMetrics({
    price: 1000,
    wholesaleCost: 50,
    hourlyOverhead: 30,
    feeRatePct: PLATFORM_DEFAULT_FEES['Regular Card Processing (Stripe, Vagaro, Square)'],
    sessions: 1,
    treatmentType: 'single',
    wasteCushionPct: 0,
    commissionPct: 10,
  });

  assert.ok(result.yourRealKeepPercentagePct >= 40);
  assert.equal(result.alertLevel, 'green');
});


test('zero-price input does not display a misleading green assessment', () => {
  const result = calculateProfitPulseMetrics({
    price: 0, wholesaleCost: 0, hourlyOverhead: 0, feeRatePct: 3, sessions: 1,
    treatmentType: 'single', wasteCushionPct: 0, commissionPct: 0,
  });
  assert.equal(result.yourRealKeepPercentagePct, 0);
  assert.equal(result.alertLevel, 'amber');
  assert.match(result.alertMessage, /Enter a treatment price greater than \$0/);
  assert.equal(result.showMarginWarning, false);
});


test('uses amber alert at exactly 30 percent and green at exactly 40 percent', () => {
  const make = (price: number, wholesaleCost: number, hourlyOverhead: number, commissionPct: number) =>
    calculateProfitPulseMetrics({
      price, wholesaleCost, hourlyOverhead, feeRatePct: 0, sessions: 1,
      treatmentType: 'single', wasteCushionPct: 0, commissionPct,
    });
  const at30 = make(100, 70, 0, 0);
  assert.equal(at30.yourRealKeepPercentagePct, 30);
  assert.equal(at30.alertLevel, 'amber');
  const at40 = make(100, 60, 0, 0);
  assert.equal(at40.yourRealKeepPercentagePct, 40);
  assert.equal(at40.alertLevel, 'green');
});

test('applies custom-entered fee rates through the calculation engine', () => {
  const result = calculateProfitPulseMetrics({
    price: 1000, wholesaleCost: 100, hourlyOverhead: 25, feeRatePct: 11.25,
    sessions: 1, treatmentType: 'single', wasteCushionPct: 0, commissionPct: 0,
  });
  assert.equal(result.hiddenPlatformFees, 112.5);
  assert.equal(result.totalOutflows, 237.5);
  assert.equal(result.yourRealTakeawayCash, 762.5);
});

test('every alert level maps to exactly one display color (number, percent and banner share it)', () => {
  const base = { hourlyOverhead: 0, feeRatePct: 0, sessions: 1, treatmentType: 'single' as const, wasteCushionPct: 0, commissionPct: 0, price: 100 };
  const expectations: Array<[number, 'red' | 'amber' | 'green']> = [[0, 'red'], [25, 'red'], [30, 'amber'], [39, 'amber'], [40, 'green'], [60, 'green']];
  for (const [keep, level] of expectations) {
    const r = calculateProfitPulseMetrics({ ...base, wholesaleCost: 100 - keep });
    assert.equal(r.alertLevel, level, `keep ${keep}%`);
    assert.ok(ALERT_COLORS[r.alertLevel].startsWith('#'));
  }
  assert.equal(new Set(Object.values(ALERT_COLORS)).size, 3);
});

test('a zero price never shows a green assessment; it asks for a price instead', () => {
  const r = calculateProfitPulseMetrics({ price: 0, wholesaleCost: 50, hourlyOverhead: 0, feeRatePct: 0, sessions: 1, treatmentType: 'single', wasteCushionPct: 0, commissionPct: 0 });
  assert.ok(r.yourRealTakeawayCash < 0);
  assert.equal(r.alertLevel, 'amber', 'asks for a price instead of calling it strong');
});
