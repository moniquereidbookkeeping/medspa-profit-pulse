import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_DEFAULTS, CATEGORY_MINUTES, calculateProfitPulseMetrics, calculateInsights, PLATFORM_DEFAULT_FEES, ALERT_COLORS } from './calc.ts';

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

const facial = { price: 250, wholesaleCost: 35, hourlyOverhead: 45, feeRatePct: 13.5, sessions: 1, treatmentType: 'single' as const, wasteCushionPct: 20, commissionPct: 40 };
const scale = { treatmentsPerMonth: 20, treatmentMinutes: 60, targetPct: 40, unitsPerVisit: 0 };

test('yearly contribution = contribution per treatment x monthly volume x 12', () => {
  const r = calculateInsights(facial, scale);
  assert.equal(r.yearlyContribution, 29.25 * 20 * 12);
  assert.equal(calculateInsights(facial, { ...scale, treatmentsPerMonth: 0 }).yearlyContribution, null);
});

test('price check finds the lowest whole-dollar price that reaches the target, and the gain per year', () => {
  const r = calculateInsights(facial, scale);
  assert.equal(r.priceCheck, 'raise');
  assert.equal(r.targetPrice, 1339);
  const at = calculateProfitPulseMetrics({ ...facial, price: r.targetPrice! });
  const below = calculateProfitPulseMetrics({ ...facial, price: r.targetPrice! - 1 });
  // Compare exact (unrounded-percentage) ratios: the displayed % is rounded to one decimal.
  assert.ok(at.yourRealTakeawayCash / (r.targetPrice!) >= 0.4);
  assert.ok(below.yourRealTakeawayCash / (r.targetPrice! - 1) < 0.4, 'one dollar less would miss the target');
  assert.equal(r.extraYearlyCash, Math.round((at.yourRealTakeawayCash - 29.25) * 240 * 100) / 100);
});

test('price check says "meets" when already at target and "impossible" when fees + commission eat the target', () => {
  assert.equal(calculateInsights({ ...facial, price: 5000 }, scale).priceCheck, 'meets');
  assert.equal(calculateInsights({ ...facial, feeRatePct: 30, commissionPct: 50 }, scale).priceCheck, 'impossible');
  assert.equal(calculateInsights({ ...facial, price: 0 }, scale).priceCheck, 'none');
  assert.equal(calculateInsights(facial, { ...scale, targetPct: 0 }).priceCheck, 'meets');
});

test('package mode: price is the whole package, volume is packages per month, hour uses per-visit contribution', () => {
  const pkg = { ...facial, treatmentType: 'package' as const, sessions: 4, price: 1000 };
  const m = calculateProfitPulseMetrics(pkg);
  const r = calculateInsights(pkg, scale);
  assert.equal(r.yearlyContribution, Math.round(m.yourRealTakeawayCash * 240 * 100) / 100);
  assert.equal(r.contributionPerHour, Math.round(m.takeawayPerVisit * 100) / 100); // 60-minute visits
  assert.equal(calculateInsights(pkg, { ...scale, treatmentMinutes: 0 }).contributionPerHour, null);
});

test('per-unit view splits one visit across the units used', () => {
  const inj = { price: 600, wholesaleCost: 200, hourlyOverhead: 50, feeRatePct: 3, sessions: 1, treatmentType: 'single' as const, wasteCushionPct: 10, commissionPct: 30 };
  const m = calculateProfitPulseMetrics(inj);
  const r = calculateInsights(inj, { ...scale, unitsPerVisit: 40 });
  assert.deepEqual(r.perUnit, { price: 15, cost: 5.5, contribution: Math.round(m.takeawayPerVisit / 40 * 100) / 100 });
  assert.equal(calculateInsights(inj, scale).perUnit, null);
});

test('insights never produce NaN or Infinity from bad input', () => {
  const r = calculateInsights({ ...facial, price: NaN as any }, { treatmentsPerMonth: NaN as any, treatmentMinutes: -5, targetPct: 500, unitsPerVisit: -1 });
  for (const v of [r.yearlyContribution, r.contributionPerHour, r.targetPrice, r.extraYearlyCash]) assert.ok(v === null || Number.isFinite(v));
});

test('every category, including Other treatment, has complete placeholder numbers and a treatment time', () => {
  for (const key of Object.keys(CATEGORY_DEFAULTS) as (keyof typeof CATEGORY_DEFAULTS)[]) {
    const d = CATEGORY_DEFAULTS[key];
    assert.ok(d.price > 0 && d.wholesaleCost >= 0 && d.hourlyOverhead >= 0, key);
    assert.ok(CATEGORY_MINUTES[key] > 0, key + ' minutes');
    const m = calculateProfitPulseMetrics({ price: d.price, wholesaleCost: d.wholesaleCost, hourlyOverhead: d.hourlyOverhead, feeRatePct: 3, sessions: 1, treatmentType: 'single', wasteCushionPct: 10, commissionPct: 30 });
    assert.ok(Number.isFinite(m.yourRealTakeawayCash), key);
  }
  assert.ok('other' in CATEGORY_DEFAULTS);
});
