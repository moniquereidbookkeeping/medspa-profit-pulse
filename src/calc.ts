/** Pure calculation logic for MedSpa Profit Pulse. All figures are estimates. */
export interface ProfitPulseInputs {
  price: number; wholesaleCost: number; hourlyOverhead: number;
  feeRatePct: number; sessions: number; treatmentType: 'single' | 'package';
  wasteCushionPct: number; commissionPct: number;
}
export interface ProfitPulseOutputs {
  hiddenPlatformFees: number; totalCostOfMaterials: number; providerPayrollCut: number;
  roomOperationalExpense: number; yourRealTakeawayCash: number;
  yourRealKeepPercentagePct: number; deferredPct: number; showDeferredWarning: boolean;
  showMarginWarning: boolean; deferredWarningText: string; marginWarningText: string;
  totalOutflows: number; takeawayPerVisit: number;
}
export const CATEGORY_DEFAULTS = {
  injectables: { price: 600, wholesaleCost: 200, hourlyOverhead: 50 },
  lasers: { price: 1200, wholesaleCost: 150, hourlyOverhead: 120 },
  facials: { price: 250, wholesaleCost: 35, hourlyOverhead: 45 },
} as const;
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
export function calculateProfitPulseMetrics(i: ProfitPulseInputs): ProfitPulseOutputs {
  const price = Math.max(0, Number(i.price) || 0);
  const wholesale = Math.max(0, Number(i.wholesaleCost) || 0);
  const overhead = Math.max(0, Number(i.hourlyOverhead) || 0);
  const fee = Math.max(0, Number(i.feeRatePct) || 0);
  const commission = Math.max(0, Number(i.commissionPct) || 0);
  const waste = Math.max(0, Number(i.wasteCushionPct) || 0);
  const sessions = i.treatmentType === 'single' ? 1 : Math.max(1, Math.round(Number(i.sessions) || 1));
  // Price is the TOTAL package price for package mode; materials and room expense are per visit.
  const hiddenPlatformFees = money(price * fee / 100);
  const totalCostOfMaterials = money(wholesale * sessions * (1 + waste / 100));
  const providerPayrollCut = money(price * commission / 100);
  const roomOperationalExpense = money(overhead * sessions);
  const totalOutflows = money(hiddenPlatformFees + totalCostOfMaterials + providerPayrollCut + roomOperationalExpense);
  const yourRealTakeawayCash = money(price - totalOutflows);
  const yourRealKeepPercentagePct = price ? pct(100 * yourRealTakeawayCash / price) : 0;
  const deferredPct = sessions > 1 ? pct(100 * (sessions - 1) / sessions) : 0;
  const showDeferredWarning = i.treatmentType === 'package' && sessions > 1;
  const deferredWarningText = `Package caution: If ${sessions} sessions are prepaid and none have been delivered, some revenue may need to be deferred until services are performed. The calculation assumes even per-session costs; recognize revenue according to your accounting policy and applicable rules.`;
  const showMarginWarning = price > 0 && yourRealKeepPercentagePct < 35;
  const marginWarningText = 'Low estimated treatment contribution (under 35%). This is an illustrative alert threshold, not an industry benchmark. Review overhead and provider-pay assumptions.';
  const takeawayPerVisit = money(yourRealTakeawayCash / sessions);
  return { hiddenPlatformFees, totalCostOfMaterials, providerPayrollCut, roomOperationalExpense,
    yourRealTakeawayCash, yourRealKeepPercentagePct, deferredPct, showDeferredWarning,
    showMarginWarning, deferredWarningText, marginWarningText, totalOutflows, takeawayPerVisit };
}
