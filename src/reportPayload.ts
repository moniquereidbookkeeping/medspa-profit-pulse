import type { PaymentPlatform, Category } from './calc';

/** Fields the page sends to /api/report. Totals are deliberately NOT sent: the server recomputes them. */
export interface ReportPayloadInput {
  reportId: string;
  ownerName: string;
  practiceName: string;
  email: string;
  phone: string;
  feedback: string;
  contactConsent: boolean;
  hpRef: string;
  turnstileToken: string;
  category: Category;
  paymentPlatform: PaymentPlatform;
  treatmentType: 'single' | 'package';
  sessions: number;
  price: number;
  wholesaleCost: number;
  wasteCushionPct: number;
  feeRatePct: number;
  hourlyOverhead: number;
  commissionPct: number;
  treatmentsPerMonth: number;
  treatmentMinutes: number;
  targetMarginPct: number;
}

export function buildReportPayload(i: ReportPayloadInput) {
  return {
    reportId: i.reportId,
    ownerName: i.ownerName.trim(),
    practiceName: i.practiceName.trim(),
    email: i.email.trim(),
    phone: i.phone.trim(),
    feedback: i.feedback.trim(),
    contactConsent: i.contactConsent,
    hpRef: i.hpRef,
    turnstileToken: i.turnstileToken,
    category: i.category,
    paymentPlatform: i.paymentPlatform,
    treatmentType: i.treatmentType,
    sessions: i.sessions,
    price: i.price,
    wholesaleCost: i.wholesaleCost,
    wasteCushionPct: i.wasteCushionPct,
    feeRatePct: i.feeRatePct,
    hourlyOverhead: i.hourlyOverhead,
    commissionPct: i.commissionPct,
    treatmentsPerMonth: i.treatmentsPerMonth,
    treatmentMinutes: i.treatmentMinutes,
    targetMarginPct: i.targetMarginPct,
    source: 'MedSpa Profit Pulse'
  };
}

type CryptoLike = { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };

/**
 * A report ID that works everywhere. `crypto.randomUUID` is missing on older iPhones (before iOS 15.4) and in
 * some in-app browsers, which would otherwise make the form fail for those visitors.
 */
export function newReportId(c: CryptoLike | undefined = (globalThis as { crypto?: CryptoLike }).crypto): string {
  if (c?.randomUUID) {
    try { return c.randomUUID(); } catch { /* fall through */ }
  }
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let k = 0; k < 16; k++) b[k] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
