import { calculateInsights } from '../../src/calc';
import { isThrowawayEmail } from '../../src/emailCheck';

interface Env {
  APPS_SCRIPT_URL: string;
  REPORT_SHARED_SECRET: string;
  /** Optional. Bot protection is on only when BOTH Turnstile keys are set (see functions/api/config.ts). */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

const jsonResponse = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

const ALLOWED_PLATFORMS = [
  'Regular Card Processing (Stripe, Vagaro, Square)',
  'Cherry Financing (6-Month No-Interest Plan)',
  'Cherry Financing (12-Month Zero-Interest Split)',
  'CareCredit Standard Doctor Fee Program',
  'PatientFi Base Promotion Rate Setup',
  'Custom Platform Fee Override'
];
const MAX_BODY_CHARS = 12000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Control characters, zero-width characters and bidirectional overrides (which can disguise text in a sheet).
const INVISIBLE_RE = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundPct = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;

/** Replace invisible characters, trim, and collapse repeated spaces. */
const clean = (v: string) => v.replace(INVISIBLE_RE, ' ').replace(/ {2,}/g, ' ').trim();

/** Stop spreadsheet apps from treating visitor text as a formula (=, +, -, @ at the start). */
const sheetSafe = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);

export const turnstileEnabled = (env: Env) => Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);

// Safe operational check: never return the configured URL or any secret.
export const onRequestGet = async ({ env }: { env: Env }): Promise<Response> => {
  if (!env.APPS_SCRIPT_URL || !env.REPORT_SHARED_SECRET) {
    return jsonResponse({ status: 'not_configured', message: 'Cloudflare Pages environment variables are missing.' }, 503);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(env.APPS_SCRIPT_URL, { method: 'GET', signal: controller.signal, redirect: 'follow' });
    const body = await response.text();
    let upstream: any = {};
    try { upstream = JSON.parse(body); } catch { /* non-JSON response is reported without body */ }
    if (!response.ok || upstream.status !== 'ready' || upstream.submissionsTabFound !== true) {
      return jsonResponse({ status: 'upstream_not_ready', httpStatus: response.status, message: 'Apps Script did not confirm that the Submissions tab is ready.' }, 502);
    }
    const half = Boolean(env.TURNSTILE_SITE_KEY) !== Boolean(env.TURNSTILE_SECRET_KEY);
    return jsonResponse({
      status: 'ready',
      botProtection: turnstileEnabled(env) ? 'enabled' : 'disabled',
      ...(half ? { warning: 'Only one of TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY is set, so bot protection is OFF until both are set.' } : {}),
      message: 'Cloudflare configuration and Apps Script health check passed.'
    });
  } catch (error) {
    console.error('Apps Script health check failed', error instanceof Error ? error.name : 'Unknown error');
    return jsonResponse({ status: 'upstream_unreachable', message: 'Cloudflare could not reach the Apps Script health check.' }, 502);
  } finally {
    clearTimeout(timeout);
  }
};

async function passesTurnstile(secret: string, token: unknown, ip: string | null): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: controller.signal });
    const out: any = await res.json().catch(() => ({}));
    return out.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const fail = (status: number, error: string, code?: string) => jsonResponse({ saved: false, error, ...(code ? { code } : {}) }, status);
  try {
    if (!env.APPS_SCRIPT_URL || !env.REPORT_SHARED_SECRET) return fail(503, 'Server not configured');

    // Browsers always send Origin on a cross-site or fetch POST. Refuse requests that come from another website.
    const origin = request.headers.get('Origin');
    if (origin) {
      let sameSite = false;
      try { sameSite = new URL(origin).host === new URL(request.url).host; } catch { /* malformed Origin */ }
      if (!sameSite) return fail(403, 'Forbidden');
    }

    if (!request.headers.get('content-type')?.includes('application/json')) return fail(415, 'JSON required');
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_CHARS) return fail(413, 'Request too large');
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return fail(413, 'Request too large');

    let data: any;
    try { data = JSON.parse(raw); } catch { return fail(400, 'Invalid request'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'Invalid request');

    // Hidden spam-trap field: real visitors never fill it in. Pretend success, save nothing.
    if (typeof data.hpRef === 'string' && data.hpRef.trim() !== '') return jsonResponse({ saved: true, reportId: String(data.reportId || '') });

    // ---- Calculator inputs (all totals are recomputed here; browser-sent totals are ignored) ----
    const inputNums = ['sessions', 'price', 'wholesaleCost', 'wasteCushionPct', 'feeRatePct', 'hourlyOverhead', 'commissionPct'];
    if (inputNums.some(k => typeof data[k] !== 'number' || !Number.isFinite(data[k]) || Math.abs(data[k]) > 1e8)) return fail(400, 'Invalid numeric input');
    const platform = typeof data.paymentPlatform === 'string' ? data.paymentPlatform : '';
    if (!['injectables', 'lasers', 'facials'].includes(data.category) || !ALLOWED_PLATFORMS.includes(platform) || !['single', 'package'].includes(data.treatmentType)) return fail(400, 'Invalid selection');
    if (data.price < 0 || data.wholesaleCost < 0 || data.hourlyOverhead < 0 || data.feeRatePct < 0 || data.feeRatePct > 30 || !Number.isInteger(data.sessions) || data.sessions < 1 || data.sessions > 24 || data.wasteCushionPct < 0 || data.wasteCushionPct > 50 || data.commissionPct < 0 || data.commissionPct > 100) return fail(400, 'Numeric value outside allowed range');
    if (data.treatmentType === 'single' && data.sessions !== 1) return fail(400, 'Single-visit reports must have exactly one session');
    // Optional "scale it up" inputs (older pages do not send them). When present they must be sensible numbers.
    const optional: Record<string, [number, number, boolean]> = { treatmentsPerMonth: [0, 5000, true], treatmentMinutes: [0, 600, false], targetMarginPct: [0, 90, false] };
    for (const [k, [lo, hi, whole]] of Object.entries(optional)) {
      if (data[k] === undefined) continue;
      if (typeof data[k] !== 'number' || !Number.isFinite(data[k]) || data[k] < lo || data[k] > hi || (whole && !Number.isInteger(data[k]))) return fail(400, 'Numeric value outside allowed range');
    }
    if (typeof data.reportId !== 'string' || !UUID_RE.test(data.reportId)) return fail(400, 'Invalid report ID');
    const id: string = data.reportId;

    // ---- Contact details: text fields must be plain strings and are rejected, not silently cut, when too long ----
    const field = (v: unknown, max: number): string | null => {
      if (v === undefined || v === null) return '';
      if (typeof v !== 'string' || v.length > max) return null;
      return clean(v);
    };
    const ownerName = field(data.ownerName, 100);
    const practiceName = field(data.practiceName, 120);
    const emailRaw = field(data.email, 254);
    const phone = field(data.phone, 25);
    const feedback = field(data.feedback, 400);
    if (ownerName === null || practiceName === null || emailRaw === null || phone === null || feedback === null) return fail(400, 'One of your entries is too long or not valid text.');
    const email = emailRaw.toLowerCase();
    if (!ownerName || !practiceName) return fail(400, 'Please enter your name and practice name.');
    if (!EMAIL_RE.test(email)) return fail(400, 'Please enter a valid email address.');
    if (isThrowawayEmail(email)) return fail(400, 'Please use a real email address where Monique can send your follow-up.');
    if (phone) {
      // Only digits and common phone punctuation, so letters or formulas cannot be saved in the phone column.
      const digits = phone.replace(/\D/g, '');
      if (!/^\+?[0-9(][0-9 ()\-.]*$/.test(phone) || digits.length < 10 || digits.length > 15) return fail(400, 'Please enter a valid phone number (10-15 digits) or leave it blank.');
    }
    // Stored without a leading "+" so Google Sheets never reads the number as a formula (+1 954... becomes 1 954...).
    // The sheet script accepts only digits, spaces, ( ) and -, so dots (954.555.0123) are turned into hyphens.
    const phoneStored = phone.replace(/^\+\s*/, '').replace(/\./g, '-');
    if (data.contactConsent !== true) return fail(400, 'Please confirm that Monique Reid Bookkeeping may contact you about this review.');

    // ---- Optional bot check (only when BOTH Turnstile keys are set) ----
    if (turnstileEnabled(env)) {
      const ok = await passesTurnstile(env.TURNSTILE_SECRET_KEY as string, data.turnstileToken, request.headers.get('CF-Connecting-IP'));
      if (!ok) return jsonResponse({ saved: false, error: 'Please complete the verification check and try again.', code: 'verification_required' }, 400);
    }

    // ---- Recompute results ----
    const sessions = data.treatmentType === 'single' ? 1 : data.sessions;
    const totalCostOfMaterials = roundMoney(data.wholesaleCost * sessions * (1 + data.wasteCushionPct / 100));
    const hiddenPlatformFees = roundMoney(data.price * data.feeRatePct / 100);
    const providerPayrollCut = roundMoney(data.price * data.commissionPct / 100);
    const roomOperationalExpense = roundMoney(data.hourlyOverhead * sessions);
    const totalOutflows = roundMoney(totalCostOfMaterials + hiddenPlatformFees + providerPayrollCut + roomOperationalExpense);
    const contribution = roundMoney(data.price - totalOutflows);
    const margin = data.price > 0 ? roundPct(100 * contribution / data.price) : 0;

    // The Google Sheet has no Email, Platform or Consent columns yet, so they are also written into the Feedback
    // column (with the time consent was given). Once those columns exist, the Apps Script can read `email`,
    // `paymentPlatform` and `consentAt` directly.
    const consentAt = new Date().toISOString();
    // Volume and target price are recomputed here too, so the sheet shows what the lead's yearly numbers look like.
    let scale = '';
    if (typeof data.treatmentsPerMonth === 'number') {
      const ins = calculateInsights(
        { price: data.price, wholesaleCost: data.wholesaleCost, hourlyOverhead: data.hourlyOverhead, feeRatePct: data.feeRatePct, sessions, treatmentType: data.treatmentType, wasteCushionPct: data.wasteCushionPct, commissionPct: data.commissionPct },
        { treatmentsPerMonth: data.treatmentsPerMonth, treatmentMinutes: typeof data.treatmentMinutes === 'number' ? data.treatmentMinutes : 0, targetPct: typeof data.targetMarginPct === 'number' ? data.targetMarginPct : 40, unitsPerVisit: 0 }
      );
      const parts = [`Volume: ${data.treatmentsPerMonth}/mo`];
      if (ins.yearlyContribution !== null) parts.push(`Yearly contribution: $${Math.round(ins.yearlyContribution)}`);
      if (ins.targetPrice !== null) parts.push(`Price for ${data.targetMarginPct}%: $${ins.targetPrice}`);
      if (ins.extraYearlyCash !== null) parts.push(`Extra per year: $${Math.round(ins.extraYearlyCash)}`);
      scale = ` | ${parts.join(' | ')}`;
    }
    const note = clean(`Email: ${email} | Platform: ${platform} | Consent: ${consentAt}${scale} | Feedback: ${feedback || '(none)'}`).slice(0, 900);

    const safe = {
      sessions, price: data.price, wholesaleCost: data.wholesaleCost, wasteCushionPct: data.wasteCushionPct,
      feeRatePct: data.feeRatePct, hourlyOverhead: data.hourlyOverhead, commissionPct: data.commissionPct,
      totalCostOfMaterials, hiddenPlatformFees, providerPayrollCut, roomOperationalExpense, totalOutflows, contribution, margin,
      reportId: id,
      ownerName: sheetSafe(ownerName), practiceName: sheetSafe(practiceName), phone: sheetSafe(phoneStored), email: sheetSafe(email),
      contactConsent: true, consentAt, feedback: sheetSafe(note), category: data.category,
      paymentPlatform: platform, paymentMethod: platform.startsWith('Cherry Financing') ? 'cherry' : 'card',
      treatmentType: data.treatmentType,
      smsStatus: 'Prepared', source: 'MedSpa Profit Pulse', secret: env.REPORT_SHARED_SECRET
    };

    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), 20000); // Google Apps Script can be slow on its first call
    let res: Response;
    try { res = await fetch(env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(safe), signal: controller.signal, redirect: 'follow' }); }
    finally { clearTimeout(abort); }
    const text = await res.text();
    let result: any;
    try { result = JSON.parse(text); } catch { result = {}; }
    if (!res.ok || result.saved !== true || result.reportId !== id) {
      // Details go to the Cloudflare logs only; visitors get a friendly message and a short code that says which step failed.
      console.error('Apps Script rejected report submission', { httpStatus: res.status, reason: typeof result.error === 'string' ? result.error : 'unrecognized response' });
      const code = !res.ok ? `upstream_http_${res.status}` : result.saved === false ? 'upstream_rejected' : result.saved === true ? 'upstream_id_mismatch' : 'upstream_bad_response';
      return fail(502, 'We could not save your details right now.', code);
    }
    return jsonResponse({ saved: true, reportId: id });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    console.error('Submission failed', timedOut ? 'Apps Script request timed out' : (e instanceof Error ? `${e.name}: ${e.message}` : 'Unknown error'));
    return fail(502, 'We could not save your details right now.', timedOut ? 'upstream_timeout' : e instanceof TypeError ? 'upstream_unreachable' : 'server_error');
  }
};
