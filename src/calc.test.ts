import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProfitPulseMetrics } from './calc.ts';

test('calculates single visit injectables with new formulas', () => {
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

  // Hidden Platform Fees = 600 * 0.03 = 18
  assert.equal(result.hiddenPlatformFees, 18);
  // Total Cost of Materials = 200 * 1.10 = 220
  assert.equal(result.totalCostOfMaterials, 220);
  // Provider Payroll Cut = 600 * 0.30 = 180
  assert.equal(result.providerPayrollCut, 180);
  // Room Operational Expense = 50 * 1 = 50
  assert.equal(result.roomOperationalExpense, 50);
  // Your Real Takeaway Cash = 600 - 18 - 220 - 180 - 50 = 132
  assert.equal(result.yourRealTakeawayCash, 132);
  // Your Real Keep Percentage % = (132 / 600) * 100 = 22.0%
  assert.equal(result.yourRealKeepPercentagePct, 22.0);

  // Margin is 22% < 35%, so low margin warning shows
  assert.equal(result.showMarginWarning, true);
  assert.match(result.marginWarningText, /Dangerously Low Retainer Cash/);
  assert.match(result.marginWarningText, /personal cash/);

  // Single visit: deferred warning hidden
  assert.equal(result.showDeferredWarning, false);
});

test('calculates multi-session package and cash-flow trap warning', () => {
  const result = calculateProfitPulseMetrics({
    price: 2400,
    wholesaleCost: 150,
    hourlyOverhead: 120,
    feeRatePct: 8.0, // Cherry Split
    sessions: 4,
    treatmentType: 'package',
    wasteCushionPct: 10,
    commissionPct: 25,
  });

  // Hidden Platform Fees = 2400 * 0.08 = 192
  assert.equal(result.hiddenPlatformFees, 192);
  // Total Cost of Materials = (150 * 4) * 1.10 = 660
  assert.equal(result.totalCostOfMaterials, 660);
  // Provider Payroll Cut = 2400 * 0.25 = 600
  assert.equal(result.providerPayrollCut, 600);
  // Room Operational Expense = 120 * 4 = 480
  assert.equal(result.roomOperationalExpense, 480);
  // Your Real Takeaway Cash = 2400 - 192 - 660 - 600 - 480 = 468
  assert.equal(result.yourRealTakeawayCash, 468);
  // Keep Percentage = (468 / 2400) * 100 = 19.5%
  assert.equal(result.yourRealKeepPercentagePct, 19.5);

  // Deferred % = ((4 - 1) / 4) * 100 = 75%
  assert.equal(result.deferredPct, 75);
  assert.equal(result.showDeferredWarning, true);
  assert.match(result.deferredWarningText, /The Future Cash-Flow Trap/);
  assert.match(result.deferredWarningText, /75% of this money is unearned/);
});
