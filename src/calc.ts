/** Pure calculation logic for MedSpa Profit Pulse. All figures are estimates. */
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

export type PaymentPlatform = 
  | 'Regular Card Processing (Stripe, Vagaro, Square)'
  | 'Cherry Financing (6-Month No-Interest Plan)'
  | 'Cherry Financing (12-Month Zero-Interest Split)'
  | 'CareCredit Standard Doctor Fee Program'
  | 'PatientFi Base Promotion Rate Setup'
  | 'Custom Platform Fee Override';

export const PLATFORM_DEFAULT_FEES: Record<PaymentPlatform, number> = {
  'Regular Card Processing (Stripe, Vagaro, Square)': 3.0,
  'Cherry Financing (6-Month No-Interest Plan)': 9.0,
  'Cherry Financing (12-Month Zero-Interest Split)': 13.5,
  'CareCredit Standard Doctor Fee Program': 5.9,
  'PatientFi Base Promotion Rate Setup': 7.5,
  'Custom Platform Fee Override': 3.0
};

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
  alertLevel: 'green' | 'amber' | 'red';
  alertMessage: string;
}

export const CATEGORY_DEFAULTS = {
  injectables: { price: 600, wholesaleCost: 200, hourlyOverhead: 50 },
  lasers: { price: 1200, wholesaleCost: 150, hourlyOverhead: 120 },
  facials: { price: 250, wholesaleCost: 35, hourlyOverhead: 45 },
} as const;

/** One set of colors for the dollar figure, the percentage, and the banner, so they always agree. */
export const ALERT_COLORS = { red: '#F87171', amber: '#FBBF24', green: '#34D399' } as const;

export const ALERT_THRESHOLD_NOTE =
  'Alert levels use illustrative thresholds (amber under 40%, red under 30% estimated contribution). They are planning aids, not industry benchmarks.';

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
  const yourRealKeepPercentagePct = price > 0 ? pct(100 * yourRealTakeawayCash / price) : 0;
  
  const deferredPct = sessions > 1 ? pct(100 * (sessions - 1) / sessions) : 0;
  const showDeferredWarning = i.treatmentType === 'package' && sessions > 1;
  const deferredWarningText = `Package caution: If ${sessions} sessions are prepaid and none have been delivered, some revenue may need to be deferred until services are performed. The calculation assumes even per-session costs; recognize revenue according to your accounting policy and applicable rules.`;
  
  const showMarginWarning = price > 0 && yourRealKeepPercentagePct < 30;
  const marginWarningText = 'Low estimated treatment contribution (under 30%). This is an illustrative alert threshold, not an industry benchmark. Review overhead and provider-pay assumptions.';
  const takeawayPerVisit = money(yourRealTakeawayCash / sessions);

  // Dynamic 3-tier contribution alert thresholds
  let alertLevel: 'green' | 'amber' | 'red' = price > 0 ? 'green' : 'amber';
  let alertMessage = price > 0 ? 'Estimated treatment contribution is relatively strong.' : 'Enter a treatment price greater than $0 to assess estimated contribution.';

  if (price > 0) {
    if (yourRealKeepPercentagePct < 30) {
      alertLevel = 'red';
      alertMessage = 'Estimated contribution is below the 30% alert level. Review your treatment economics and cash-flow assumptions.';
    } else if (yourRealKeepPercentagePct < 40) {
      alertLevel = 'amber';
      alertMessage = 'Estimated contribution is below the 40% alert level. Review your treatment costs, payment fees, and provider compensation.';
    }
  }

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
    alertLevel,
    alertMessage
  };
}

// ---- "Scale it up" helpers: yearly impact, price check, contribution per hour, per-unit view ----

export interface ScaleInputs {
  /** Treatments (or packages, in package mode) sold per month. 0 hides the yearly figures. */
  treatmentsPerMonth: number;
  /** Minutes of treatment time per visit. 0 hides the per-hour figure. */
  treatmentMinutes: number;
  /** Contribution percentage the owner wants to reach. */
  targetPct: number;
  /** Optional injectable units used per visit. 0 hides the per-unit view. */
  unitsPerVisit: number;
}

export const SCALE_LIMITS = {
  treatmentsPerMonth: { min: 0, max: 5000 },
  treatmentMinutes: { min: 0, max: 600 },
  targetPct: { min: 0, max: 90 },
  unitsPerVisit: { min: 0, max: 1000 }
} as const;

export const SCALE_DEFAULTS = { treatmentsPerMonth: 20, targetPct: 40, unitsPerVisit: 0 } as const;
/** Placeholder treatment times (minutes per visit) the owner is expected to replace. */
export const CATEGORY_MINUTES = { injectables: 30, lasers: 45, facials: 60 } as const;

export interface ProfitPulseInsights {
  /** Yearly contribution at the entered monthly volume (null when volume is 0). */
  yearlyContribution: number | null;
  /** Contribution per hour of treatment time (null when minutes is 0). */
  contributionPerHour: number | null;
  /** 'meets' = already at or above target; 'raise' = price needed; 'impossible' = fees + commission alone exceed the target. */
  priceCheck: 'none' | 'meets' | 'raise' | 'impossible';
  targetPrice: number | null;
  priceIncreasePct: number | null;
  /** Extra yearly cash if the price were raised to targetPrice at the same volume (null when volume is 0). */
  extraYearlyCash: number | null;
  feePlusCommissionPct: number;
  perUnit: { price: number; cost: number; contribution: number } | null;
}

const clampScale = (v: unknown, lim: { min: number; max: number }) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(lim.max, Math.max(lim.min, n)) : lim.min;
};

export function calculateInsights(i: ProfitPulseInputs, s: ScaleInputs): ProfitPulseInsights {
  const m = calculateProfitPulseMetrics(i);
  const perMonth = Math.round(clampScale(s.treatmentsPerMonth, SCALE_LIMITS.treatmentsPerMonth));
  const minutes = clampScale(s.treatmentMinutes, SCALE_LIMITS.treatmentMinutes);
  const target = clampScale(s.targetPct, SCALE_LIMITS.targetPct);
  const units = clampScale(s.unitsPerVisit, SCALE_LIMITS.unitsPerVisit);
  const price = Math.max(0, Number(i.price) || 0);
  const fee = Math.max(0, Number(i.feeRatePct) || 0);
  const commission = Math.max(0, Number(i.commissionPct) || 0);
  const sessions = i.treatmentType === 'single' ? 1 : Math.max(1, Math.round(Number(i.sessions) || 1));
  const yearlyFactor = perMonth * 12;

  const yearlyContribution = perMonth > 0 ? money(m.yourRealTakeawayCash * yearlyFactor) : null;
  const contributionPerHour = minutes > 0 ? money(m.takeawayPerVisit / (minutes / 60)) : null;

  let priceCheck: ProfitPulseInsights['priceCheck'] = 'none';
  let targetPrice: number | null = null;
  let priceIncreasePct: number | null = null;
  let extraYearlyCash: number | null = null;
  const feePlusCommissionPct = pct(fee + commission);

  if (price > 0) {
    if (m.yourRealKeepPercentagePct >= target) {
      priceCheck = 'meets';
    } else {
      const share = 1 - fee / 100 - commission / 100 - target / 100;
      if (share <= 0) {
        priceCheck = 'impossible';
      } else {
        const fixed = m.totalCostOfMaterials + m.roomOperationalExpense;
        let p = Math.ceil(fixed / share - 1e-9);
        // Guard against rounding: make sure the rounded price really reaches the target.
        let guard = 0;
        while (guard++ < 5 && calculateProfitPulseMetrics({ ...i, price: p }).yourRealKeepPercentagePct < target) p += 1;
        if (p <= price) {
          priceCheck = 'meets';
        } else {
          priceCheck = 'raise';
          targetPrice = p;
          priceIncreasePct = pct(100 * (p - price) / price);
          if (perMonth > 0) {
            const gain = calculateProfitPulseMetrics({ ...i, price: p }).yourRealTakeawayCash - m.yourRealTakeawayCash;
            extraYearlyCash = money(gain * yearlyFactor);
          }
        }
      }
    }
  }

  const perUnit = units > 0
    ? {
        price: money(price / sessions / units),
        cost: money((Math.max(0, Number(i.wholesaleCost) || 0) * (1 + Math.max(0, Number(i.wasteCushionPct) || 0) / 100)) / units),
        contribution: money(m.takeawayPerVisit / units)
      }
    : null;

  return { yearlyContribution, contributionPerHour, priceCheck, targetPrice, priceIncreasePct, extraYearlyCash, feePlusCommissionPct, perUnit };
}
