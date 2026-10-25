interface Env {
  APPS_SCRIPT_URL: string;
  REPORT_SHARED_SECRET: string;
  /** Optional. When set, every submission must pass a Cloudflare Turnstile check. */
  TURNSTILE_SECRET_KEY?: string;
}

const jsonResponse = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
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

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundPct = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;

/** Collapse control characters, trim, and cap the length. */
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

/** Stop spreadsheet apps from treating visitor text as a formula (=, +, -, @ at the start). */
const sheetSafe = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);

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
    return jsonResponse({
      status: 'ready',
      botProtection: env.TURNSTILE_SECRET_KEY ? 'enabled' : 'disabled',
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
  const fail = (status: number, error: string) => jsonResponse({ saved: false, error }, status);
  try {
    if (!env.APPS_SCRIPT_URL || !env.REPORT_SHARED_SECRET) return fail(503, 'Server not configured');
    if (!request.headers.get('content-type')?.includes('application/json')) return fail(415, 'JSON required');
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_CHARS) return fail(413, 'Request too large');
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return fail(413, 'Request too large');

    let data: any;
    try { data = JSON.parse(raw); } catch { return fail(400, 'Invalid request'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'Invalid request');

    // Hidden "website" field: real visitors never fill it in. Pretend success, save nothing.
    if (typeof data.website === 'string' && data.website.trim() !== '') return jsonResponse({ saved: true, reportId: String(data.reportId || '') });

    // ---- Calculator inputs (all totals are recomputed here; browser-sent totals are ignored) ----
    const inputNums = ['sessions', 'price', 'wholesaleCost', 'wasteCushionPct', 'feeRatePct', 'hourlyOverhead', 'commissionPct'];
    if (inputNums.some(k => typeof data[k] !== 'number' || !Number.isFinite(data[k]) || Math.abs(data[k]) > 1e8)) return fail(400, 'Invalid numeric input');
    const platform = String(data.paymentPlatform || '');
    if (!['injectables', 'lasers', 'facials'].includes(data.category) || !ALLOWED_PLATFORMS.includes(platform) || !['single', 'package'].includes(data.treatmentType)) return fail(400, 'Invalid selection');
    if (data.price < 0 || data.wholesaleCost < 0 || data.hourlyOverhead < 0 || data.feeRatePct < 0 || data.feeRatePct > 30 || !Number.isInteger(data.sessions) || data.sessions < 1 || data.sessions > 24 || data.wasteCushionPct < 0 || data.wasteCushionPct > 50 || data.commissionPct < 0 || data.commissionPct > 100) return fail(400, 'Numeric value outside allowed range');
    if (data.treatmentType === 'single' && data.sessions !== 1) return fail(400, 'Single-visit reports must have exactly one session');
    const id = String(data.reportId || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, 'Invalid report ID');

    // ---- Contact details (a saved report is a request for a free review, so contact info is required) ----
    const ownerName = clean(data.ownerName, 100);
    const practiceName = clean(data.practiceName, 120);
    const email = clean(data.email, 254).toLowerCase();
    const phone = clean(data.phone, 25);
    if (!ownerName || !practiceName) return fail(400, 'Please enter your name and practice name.');
    if (!EMAIL_RE.test(email)) return fail(400, 'Please enter a valid email address.');
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) return fail(400, 'Please enter a valid phone number (10-15 digits) or leave it blank.');
    }
    if (data.contactConsent !== true) return fail(400, 'Please confirm that Monique Reid Bookkeeping may contact you about this review.');

    // ---- Optional bot check ----
    if (env.TURNSTILE_SECRET_KEY) {
      const ok = await passesTurnstile(env.TURNSTILE_SECRET_KEY, data.turnstileToken, request.headers.get('CF-Connecting-IP'));
      if (!ok) return fail(400, 'Please complete the verification check and try again.');
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

    // The Google Sheet has no Email or Platform column yet, so both are also written into the
    // Feedback column. Once those columns exist, the Apps Script can read `email` and `paymentPlatform`.
    const feedback = clean(data.feedback, 400);
    const note = clean(`Email: ${email} | Platform: ${platform} | Feedback: ${feedback || '(none)'}`, 800);

    const safe = {
      sessions, price: data.price, wholesaleCost: data.wholesaleCost, wasteCushionPct: data.wasteCushionPct,
      feeRatePct: data.feeRatePct, hourlyOverhead: data.hourlyOverhead, commissionPct: data.commissionPct,
      totalCostOfMaterials, hiddenPlatformFees, providerPayrollCut, roomOperationalExpense, totalOutflows, contribution, margin,
      reportId: id,
      ownerName: sheetSafe(ownerName), practiceName: sheetSafe(practiceName), phone: sheetSafe(phone), email: sheetSafe(email),
      contactConsent: true, feedback: sheetSafe(note), category: data.category,
      paymentPlatform: platform, paymentMethod: platform.startsWith('Cherry Financing') ? 'cherry' : 'card',
      treatmentType: data.treatmentType,
      smsStatus: 'Prepared', source: 'MedSpa Profit Pulse', secret: env.REPORT_SHARED_SECRET
    };

    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try { res = await fetch(env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(safe), signal: controller.signal, redirect: 'follow' }); }
    finally { clearTimeout(abort); }
    const text = await res.text();
    let result: any;
    try { result = JSON.parse(text); } catch { result = {}; }
    if (!res.ok || result.saved !== true || result.reportId !== id) {
      // Details go to the Cloudflare logs only; visitors get a friendly message.
      console.error('Apps Script rejected report submission', { httpStatus: res.status, reason: typeof result.error === 'string' ? result.error : 'unrecognized response' });
      return fail(502, 'We could not save your details right now.');
    }
    return jsonResponse({ saved: true, reportId: id });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    console.error('Submission failed', timedOut ? 'Apps Script request timed out' : (e instanceof Error ? e.name : 'Unknown error'));
    return fail(502, 'We could not save your details right now.');
  }
};
