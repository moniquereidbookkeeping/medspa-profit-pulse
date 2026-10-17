/**
 * Pure calculation logic for The MedSpa Profit Pulse
 */

export interface ProfitPulseInputs {
  price: number;
  wholesaleCost: number;
  hourlyOverhead: number;
  feeRatePct: number;
  sessions: number;
  treatmentType: 'single' | 'package';
  wasteCushionPct: number;
  commissionPct: number;
}

export interface ProfitPulseOutputs {
  hiddenPlatformFees: number;
  totalCostOfMaterials: number;
  providerPayrollCut: number;
  roomOperationalExpense: number;
  yourRealTakeawayCash: number;
  yourRealKeepPercentagePct: number;
  deferredPct: number;
  showDeferredWarning: boolean;
  showMarginWarning: boolean;
  deferredWarningText: string;
  marginWarningText: string;
  totalOutflows: number;
  takeawayPerVisit: number;
}

export const CATEGORY_DEFAULTS = {
  injectables: {
    price: 600,
    wholesaleCost: 200,
    hourlyOverhead: 50,
  },
  lasers: {
    price: 1200,
    wholesaleCost: 150,
    hourlyOverhead: 120,
  },
  facials: {
    price: 250,
    wholesaleCost: 35,
    hourlyOverhead: 45,
  },
} as const;

function roundMoney(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function roundPct(num: number): number {
  return Math.round((num + Number.EPSILON) * 10) / 10;
}

export function calculateProfitPulseMetrics(inputs: ProfitPulseInputs): ProfitPulseOutputs {
  const price = Math.max(0, Number(inputs.price) || 0);
  const wholesaleCost = Math.max(0, Number(inputs.wholesaleCost) || 0);
  const hourlyOverhead = Math.max(0, Number(inputs.hourlyOverhead) || 0);
  const feeRatePct = Math.max(0, Number(inputs.feeRatePct) || 0);
  const sessions = inputs.treatmentType === 'single' ? 1 : Math.max(1, Math.round(Number(inputs.sessions) || 1));
  const wasteCushionPct = Math.max(0, Number(inputs.wasteCushionPct) || 0);
  const commissionPct = Math.max(0, Number(inputs.commissionPct) || 0);

  // Hidden Platform Fees = Price * (Manual Fee Rate % / 100)
  const hiddenPlatformFees = roundMoney(price * (feeRatePct / 100));

  // Total Cost of Materials = (Wholesale Cost * Package Sessions) * (1 + Waste Cushion %)
  const totalCostOfMaterials = roundMoney((wholesaleCost * sessions) * (1 + wasteCushionPct / 100));

  // Provider Payroll Cut = Price * (Commission % / 100)
  const providerPayrollCut = roundMoney(price * (commissionPct / 100));

  // Room Operational Expense = Hourly Overhead * Package Sessions
  const roomOperationalExpense = roundMoney(hourlyOverhead * sessions);

  // Total Outflows
  const totalOutflows = roundMoney(hiddenPlatformFees + totalCostOfMaterials + providerPayrollCut + roomOperationalExpense);

  // Your Real Takeaway Cash = Price - Hidden Platform Fees - Total Cost of Materials - Provider Payroll Cut - Room Operational Expense
  const yourRealTakeawayCash = roundMoney(price - totalOutflows);

  // Your Real Keep Percentage % = (Your Real Takeaway Cash / Price) * 100
  const yourRealKeepPercentagePct = price > 0 ? roundPct((yourRealTakeawayCash / price) * 100) : 0;

  // Deferred % = ((Sessions - 1) / Sessions) * 100
  const deferredPct = sessions > 1 ? roundPct(((sessions - 1) / sessions) * 100) : 0;

  const showDeferredWarning = inputs.treatmentType === 'package';
  const formattedDeferredPct = deferredPct % 1 === 0 ? deferredPct.toFixed(0) : deferredPct.toFixed(1);
  const deferredWarningText = `⚠️ The Future Cash-Flow Trap: You collected all the cash upfront for a package. But legally, ${formattedDeferredPct}% of this money is unearned. Spending it today means you are stealing cash from your clinic's future months when patients return for treatments.`;

  const showMarginWarning = yourRealKeepPercentagePct < 35;
  const marginWarningText = `🚨 Dangerously Low Retainer Cash: You keep less than 35% of the ticket after your overhead splits. Note: If you are the founder performing this treatment for 'free' to make the numbers look higher, your business model is silently draining your personal cash.`;

  const takeawayPerVisit = sessions > 0 ? roundMoney(yourRealTakeawayCash / sessions) : 0;

  return {
    hiddenPlatformFees,
    totalCostOfMaterials,
    providerPayrollCut,
    roomOperationalExpense,
    yourRealTakeawayCash,
    yourRealKeepPercentagePct,
    deferredPct,
    showDeferredWarning,
    showMarginWarning,
    deferredWarningText,
    marginWarningText,
    totalOutflows,
    takeawayPerVisit,
  };
}
