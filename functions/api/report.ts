interface Env { APPS_SCRIPT_URL: string; REPORT_SHARED_SECRET: string; }
const jsonResponse = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

// Safe operational check: never return the configured URL or shared secret.
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
    return jsonResponse({ status: 'ready', message: 'Cloudflare configuration and Apps Script health check passed.' });
  } catch (error) {
    console.error('Apps Script health check failed', error instanceof Error ? error.name : 'Unknown error');
    return jsonResponse({ status: 'upstream_unreachable', message: 'Cloudflare could not reach the Apps Script health check.' }, 502);
  } finally {
    clearTimeout(timeout);
  }
};

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const json = (body: object, status: number) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
  try {
    if (!env.APPS_SCRIPT_URL || !env.REPORT_SHARED_SECRET) return json({saved:false,error:'Server not configured'},503);
    if (!request.headers.get('content-type')?.includes('application/json')) return json({saved:false,error:'JSON required'},415);
    if (Number(request.headers.get('content-length') || 0) > 12000) return json({saved:false,error:'Request too large'},413);
    const raw = await request.text();
    if (raw.length > 12000) return json({saved:false,error:'Request too large'},413);
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({saved:false,error:'Invalid request'},400);
    const nums = ['sessions','price','wholesaleCost','wasteCushionPct','feeRatePct','hourlyOverhead','commissionPct','totalCostOfMaterials','hiddenPlatformFees','providerPayrollCut','roomOperationalExpense','totalOutflows','contribution','margin'];
    if (nums.some(k => typeof data[k] !== 'number' || !Number.isFinite(data[k]) || Math.abs(data[k]) > 1e8)) return json({saved:false,error:'Invalid numeric input'},400);
    const platform = String(data.paymentPlatform || '');
    const allowedPlatforms = [
      'Regular Card Processing (Stripe, Vagaro, Square)',
      'Cherry Financing (6-Month No-Interest Plan)',
      'Cherry Financing (12-Month Zero-Interest Split)',
      'CareCredit Standard Doctor Fee Program',
      'PatientFi Base Promotion Rate Setup',
      'Custom Platform Fee Override'
    ];
    if (!['injectables','lasers','facials'].includes(data.category) || !allowedPlatforms.includes(platform) || !['single','package'].includes(data.treatmentType)) return json({saved:false,error:'Invalid selection'},400);
    if (data.price < 0 || data.wholesaleCost < 0 || data.hourlyOverhead < 0 || data.feeRatePct < 0 || data.feeRatePct > 30 || data.sessions < 1 || data.sessions > 24 || data.wasteCushionPct < 0 || data.wasteCushionPct > 50 || data.commissionPct < 0 || data.commissionPct > 100) return json({saved:false,error:'Numeric value outside allowed range'},400);
    const id = String(data.reportId || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({saved:false,error:'Invalid report ID'},400);
    const trim = (v: unknown, max: number) => String(v ?? '').slice(0,max);
    const phone = trim(data.phone,25);
    const consent = data.contactConsent === true;
    if (consent && !/^\+?[0-9 ()-]{10,25}$/.test(phone)) return json({saved:false,error:'A valid phone is required for follow-up permission'},400);
    const safe = { ...Object.fromEntries(nums.map(k=>[k,data[k]])), reportId:id,
      ownerName:trim(data.ownerName,100), practiceName:trim(data.practiceName,120), phone,
      contactConsent:consent, feedback:trim((platform ? 'Selected platform: ' + platform + '. ' : '') + String(data.feedback || ''),400), category:data.category,
      paymentMethod:platform.startsWith('Cherry Financing') ? 'cherry' : 'card',treatmentType:data.treatmentType,
      smsStatus:'Prepared',source:'MedSpa Profit Pulse', secret:env.REPORT_SHARED_SECRET };
    const controller = new AbortController();
    const abort = setTimeout(()=>controller.abort(),10000);
    let res: Response;
    try { res = await fetch(env.APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(safe),signal:controller.signal,redirect:'follow'}); }
    finally {clearTimeout(abort);}
    const text = await res.text();
    let result: any;
    try {result=JSON.parse(text);} catch {result={};}
    if (!res.ok || result.saved !== true || result.reportId !== id) {
      const reason = typeof result.error === 'string' ? result.error : 'Apps Script returned an unrecognized response';
      console.error('Apps Script rejected report submission', { httpStatus: res.status, reason });
      return json({ saved: false, error: 'Spreadsheet save not confirmed', detail: reason }, 502);
    }
    return json({saved:true,reportId:id},200);
  } catch(e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    console.error('Submission failed', timedOut ? 'Apps Script request timed out' : (e instanceof Error ? e.name : 'Unknown error'));
    return json({ saved: false, error: timedOut ? 'Apps Script request timed out' : 'Submission failed; check the report endpoint health and Cloudflare logs.' }, 502);
  }
};
