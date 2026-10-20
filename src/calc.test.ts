import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProfitPulseMetrics } from './calc.ts';

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
