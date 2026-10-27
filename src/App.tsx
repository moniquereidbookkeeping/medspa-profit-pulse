/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { calculateProfitPulseMetrics, calculateInsights, ALERT_COLORS, ALERT_THRESHOLD_NOTE, CATEGORY_DEFAULTS, CATEGORY_MINUTES, SCALE_DEFAULTS, SCALE_LIMITS, PLATFORM_DEFAULT_FEES, PaymentPlatform } from './calc';
import NumField from './NumField';
import Turnstile from './Turnstile';
import { track } from './analytics';
import { buildReportPayload, newReportId } from './reportPayload';
import { emailProblem, suggestEmail, isThrowawayEmail } from './emailCheck';

const STORAGE_KEY = "medspa_profit_pulse_state";
const LEAD_CAPTURED_KEY = "medspa_profit_pulse_lead_captured";

// ---- Easy-to-edit business settings -------------------------------------------------------
const SITE_URL = 'https://moniquereidbookkeeping.com/';
/** Swap this for a calendar booking link (Calendly, Google Calendar, etc.) when you have one. */
const BOOKING_URL = SITE_URL;
/** Optional: link to your privacy policy. Leave empty to hide the link. */
const PRIVACY_URL = '/privacy.html';
/** The offer changes with the result, so the message always matches what the visitor just saw. */
const REVIEW_HEADLINES = {
  red: 'Cash may be leaking out of this treatment. Want help finding where?',
  amber: 'You are close. Want a quick look at what to tighten?',
  green: 'Strong numbers. Want a second set of eyes on the rest of your menu?'
} as const;
const REVIEW_TEXT = 'Enter your details to save your full report. Monique will also follow up about a free 15-minute treatment profit review. No obligation.';
// --------------------------------------------------------------------------------------------

/** Your Google Sheet script currently refuses a request with no phone number. Set this to false after the script accepts blank phones. */
const PHONE_REQUIRED = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CATEGORIES = ['injectables', 'lasers', 'facials'] as const;
/** Keep a saved/stale value inside the range the calculator and server accept. */
const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

type SaveStatus = 'idle' | 'saving' | 'ok' | 'error';

export default function App() {
  const [category, setCategory] = useState<'injectables' | 'lasers' | 'facials'>('injectables');
  const [paymentPlatform, setPaymentPlatform] = useState<PaymentPlatform>('Regular Card Processing (Stripe, Vagaro, Square)');
  const [feeRatePct, setFeeRatePct] = useState<number>(3.0);
  const [treatmentType, setTreatmentType] = useState<'single' | 'package'>('single');
  const [sessions, setSessions] = useState<number>(1);

  const [price, setPrice] = useState<number>(CATEGORY_DEFAULTS.injectables.price);
  const [wholesaleCost, setWholesaleCost] = useState<number>(CATEGORY_DEFAULTS.injectables.wholesaleCost);
  const [hourlyOverhead, setHourlyOverhead] = useState<number>(CATEGORY_DEFAULTS.injectables.hourlyOverhead);
  const [wasteCushionPct, setWasteCushionPct] = useState<number>(10);
  const [commissionPct, setCommissionPct] = useState<number>(30);
  const [treatmentsPerMonth, setTreatmentsPerMonth] = useState<number>(SCALE_DEFAULTS.treatmentsPerMonth);
  const [treatmentMinutes, setTreatmentMinutes] = useState<number>(CATEGORY_MINUTES.injectables);
  const [targetPct, setTargetPct] = useState<number>(SCALE_DEFAULTS.targetPct);
  const [unitsPerVisit, setUnitsPerVisit] = useState<number>(SCALE_DEFAULTS.unitsPerVisit);

  const [ownerName, setOwnerName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<string>("");
  // Plain-language help under the email box: a problem to fix, or a "did you mean" suggestion.
  const [emailNote, setEmailNote] = useState<{ kind: 'error' | 'suggest'; text: string; fix?: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const keptEmail = useRef<string>(''); // an address the visitor confirmed is spelled as intended
  const [feedback, setFeedback] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [website, setWebsite] = useState(""); // hidden spam trap; real visitors never fill it in
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(""); // set by /api/config only when the server enforces it
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [turnstileProblem, setTurnstileProblem] = useState(false);
  // One id per submission attempt chain, so a retry after a timeout reuses it and rows can be de-duplicated.
  const pendingReportId = useRef<string | null>(null);
  // The bot-check script is downloaded only when the visitor scrolls near the form (most visitors never do).
  const leadBoxRef = useRef<HTMLDivElement>(null);
  const [formNear, setFormNear] = useState(typeof IntersectionObserver === 'undefined');

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState("");

  const [isLeadCaptured, setIsLeadCaptured] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const engaged = useRef(false);

  const engage = () => {
    if (!engaged.current) {
      engaged.current = true;
      track('calculator_used');
    }
  };
  /** Wrap a calculator setter so the first real use of the calculator is counted once (not the contact form). */
  const used = <T,>(setter: (v: T) => void) => (v: T) => { engage(); setter(v); };

  // Load from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if ((CATEGORIES as readonly string[]).includes(parsed.category)) setCategory(parsed.category);
        if (typeof parsed.paymentPlatform === 'string' && parsed.paymentPlatform in PLATFORM_DEFAULT_FEES) setPaymentPlatform(parsed.paymentPlatform);
        const savedType = parsed.treatmentType === 'package' ? 'package' : 'single';
        setTreatmentType(savedType);
        setSessions(savedType === 'package' ? Math.round(clampNum(parsed.sessions, 1, 24, 4)) : 1);
        setFeeRatePct(clampNum(parsed.feeRatePct, 0, 30, 3));
        setPrice(clampNum(parsed.price, 0, 100000000, CATEGORY_DEFAULTS.injectables.price));
        setWholesaleCost(clampNum(parsed.wholesaleCost, 0, 100000000, CATEGORY_DEFAULTS.injectables.wholesaleCost));
        setHourlyOverhead(clampNum(parsed.hourlyOverhead, 0, 100000000, CATEGORY_DEFAULTS.injectables.hourlyOverhead));
        setWasteCushionPct(clampNum(parsed.wasteCushionPct, 0, 50, 10));
        setCommissionPct(clampNum(parsed.commissionPct, 0, 100, 30));
        setTreatmentsPerMonth(Math.round(clampNum(parsed.treatmentsPerMonth, SCALE_LIMITS.treatmentsPerMonth.min, SCALE_LIMITS.treatmentsPerMonth.max, SCALE_DEFAULTS.treatmentsPerMonth)));
        setTreatmentMinutes(clampNum(parsed.treatmentMinutes, SCALE_LIMITS.treatmentMinutes.min, SCALE_LIMITS.treatmentMinutes.max, CATEGORY_MINUTES[(CATEGORIES as readonly string[]).includes(parsed.category) ? parsed.category as keyof typeof CATEGORY_MINUTES : 'injectables']));
        setTargetPct(clampNum(parsed.targetPct, SCALE_LIMITS.targetPct.min, SCALE_LIMITS.targetPct.max, SCALE_DEFAULTS.targetPct));
        setUnitsPerVisit(clampNum(parsed.unitsPerVisit, SCALE_LIMITS.unitsPerVisit.min, SCALE_LIMITS.unitsPerVisit.max, 0));
      }
      const captured = localStorage.getItem(LEAD_CAPTURED_KEY);
      if (captured === 'true') {
        setIsLeadCaptured(true);
      }
    } catch (e) {
      console.warn("Could not load saved state", e);
    }
    // Ask the server whether bot protection is on, so the page and the server always agree.
    loadConfig();
    const box = leadBoxRef.current;
    if (!box || typeof IntersectionObserver === 'undefined') { setFormNear(true); return; }
    const watcher = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { setFormNear(true); watcher.disconnect(); }
    }, { rootMargin: '200px 0px' });
    watcher.observe(box);
    return () => watcher.disconnect();
  }, []);

  /** Learn whether the verification check is required. `fresh` skips the browser's short cache. */
  const loadConfig = (fresh = false) =>
    fetch('/api/config', fresh ? { cache: 'no-store' } : undefined)
      .then(r => (r.ok ? r.json() : {}))
      .then((cfg: { turnstileSiteKey?: string }) => { if (typeof cfg.turnstileSiteKey === 'string') setTurnstileSiteKey(cfg.turnstileSiteKey); })
      .catch(() => { /* no widget; the server decides whether a check is needed */ });

  // Save state to LocalStorage
  useEffect(() => {
    try {
      const stateToSave = {
        category, paymentPlatform, feeRatePct, treatmentType, sessions,
        price, wholesaleCost, hourlyOverhead, wasteCushionPct, commissionPct,
        treatmentsPerMonth, treatmentMinutes, targetPct, unitsPerVisit
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn("Could not save state", e);
    }
  }, [category, paymentPlatform, feeRatePct, treatmentType, sessions, price, wholesaleCost, hourlyOverhead, wasteCushionPct, commissionPct, treatmentsPerMonth, treatmentMinutes, targetPct, unitsPerVisit]);

  const calcInputs = { price, wholesaleCost, hourlyOverhead, feeRatePct, sessions, treatmentType, wasteCushionPct, commissionPct };
  const metrics = calculateProfitPulseMetrics(calcInputs);
  const insights = calculateInsights(calcInputs, { treatmentsPerMonth, treatmentMinutes, targetPct, unitsPerVisit: category === 'injectables' ? unitsPerVisit : 0 });

  // One color for the dollar figure, the percentage, and the banner.
  const toneColor = ALERT_COLORS[metrics.alertLevel];

  const handleCategoryChange = (cat: 'injectables' | 'lasers' | 'facials') => {
    setCategory(cat);
    const defaults = CATEGORY_DEFAULTS[cat];
    // In package mode the price box holds the TOTAL package price, so scale the single-visit default.
    setPrice(defaults.price * (treatmentType === 'package' ? sessions : 1));
    setWholesaleCost(defaults.wholesaleCost);
    setHourlyOverhead(defaults.hourlyOverhead);
    setTreatmentMinutes(CATEGORY_MINUTES[cat]);
  };

  const handlePlatformChange = (platform: PaymentPlatform) => {
    setPaymentPlatform(platform);
    if (platform !== 'Custom Platform Fee Override') {
      setFeeRatePct(PLATFORM_DEFAULT_FEES[platform]);
    }
  };

  const handleTreatmentTypeChange = (type: 'single' | 'package') => {
    if (type === treatmentType) return;
    if (type === 'package') {
      // The price box becomes the total for all sessions, so carry the single-visit price over as 4 visits' worth.
      setTreatmentType('package');
      setSessions(4);
      setPrice(Math.min(100000000, Math.round(price * 4 * 100) / 100));
    } else {
      setTreatmentType('single');
      setPrice(Math.round((price / Math.max(1, sessions)) * 100) / 100);
      setSessions(1);
    }
  };

  const handleReset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEAD_CAPTURED_KEY);
    } catch (e) { /* storage may be blocked */ }
    setCategory('injectables');
    setPaymentPlatform('Regular Card Processing (Stripe, Vagaro, Square)');
    setFeeRatePct(PLATFORM_DEFAULT_FEES['Regular Card Processing (Stripe, Vagaro, Square)']);
    setTreatmentType('single');
    setSessions(1);
    setPrice(CATEGORY_DEFAULTS.injectables.price);
    setWholesaleCost(CATEGORY_DEFAULTS.injectables.wholesaleCost);
    setHourlyOverhead(CATEGORY_DEFAULTS.injectables.hourlyOverhead);
    setWasteCushionPct(10);
    setCommissionPct(30);
    setTreatmentsPerMonth(SCALE_DEFAULTS.treatmentsPerMonth);
    setTreatmentMinutes(CATEGORY_MINUTES.injectables);
    setTargetPct(SCALE_DEFAULTS.targetPct);
    setUnitsPerVisit(SCALE_DEFAULTS.unitsPerVisit);
    pendingReportId.current = null;
    setPhone("");
    setEmail("");
    setOwnerName("");
    setPracticeName("");
    setFeedback("");
    setContactConsent(false);
    setSaveStatus('idle');
    setSaveMessage("");
    setIsLeadCaptured(false);
    setIsEditingContact(false);
  };

  const fail = (message: string) => {
    setSaveStatus('error');
    setSaveMessage(message);
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveStatus === 'saving') return;

    if (!ownerName.trim() || !practiceName.trim()) {
      return fail('Please enter your name and practice name.');
    }
    const problem = emailProblem(email) ?? (EMAIL_RE.test(email.trim()) ? null : 'This does not look like a full email address. Please check it.');
    if (problem) {
      setEmailNote({ kind: 'error', text: problem });
      emailRef.current?.focus();
      return fail('Please fix your email address, then press the button again.');
    }
    if (isThrowawayEmail(email)) {
      setEmailNote({ kind: 'error', text: 'Please use a real email address where Monique can send your follow-up.' });
      emailRef.current?.focus();
      return fail('Please use a real email address to unlock your report.');
    }
    const maybe = suggestEmail(email);
    if (maybe && keptEmail.current !== email.trim()) {
      keptEmail.current = email.trim(); // a second press keeps the address as typed
      setEmailNote({ kind: 'suggest', text: `Is this the right email? Did you mean ${maybe}?`, fix: maybe });
      emailRef.current?.focus();
      return fail('Please check your email address. If it is correct as typed, press the button again.');
    }
    if (PHONE_REQUIRED && !phone.trim()) {
      return fail('Please enter a phone number so Monique can follow up.');
    }
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) {
        return fail('Please enter a valid phone number (10-15 digits) or leave it blank.');
      }
    }
    if (!contactConsent) {
      return fail('Please tick the box to confirm Monique may contact you about this review.');
    }
    if (turnstileSiteKey && !turnstileToken) {
      return fail(turnstileProblem
        ? 'The verification check did not load. Some in-app browsers block it. Please open this page in Safari or Chrome and try again.'
        : 'Please complete the verification check below, then try again.');
    }

    setSaveStatus('saving');
    setSaveMessage('Sending your request...');
    let needsCheck = false;

    try {
      // Reuse the same id when retrying after a failure, so a save that actually went through is not duplicated.
      const reportId = pendingReportId.current ?? (pendingReportId.current = newReportId());
      let response: Response;
      try {
        response = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildReportPayload({
            reportId, ownerName, practiceName, email, phone, feedback, contactConsent,
            hpRef: website, turnstileToken, category, paymentPlatform, treatmentType, sessions,
            price, wholesaleCost, wasteCushionPct, feeRatePct, hourlyOverhead, commissionPct,
            treatmentsPerMonth, treatmentMinutes, targetMarginPct: targetPct
          }))
        });
      } catch {
        throw new Error('We could not reach the server. Please check your connection.');
      }

      const result = await response.json().catch(() => ({}));
      if (result.code === 'verification_required') {
        // The server requires the check but this page did not know (for example the settings changed a moment ago).
        needsCheck = true;
        await loadConfig(true);
        throw new Error('Please complete the quick verification check shown below, then press the button again.');
      }
      if (!response.ok || result.saved !== true) {
        // Messages for 4xx errors are written for visitors; anything else gets a generic line.
        const friendly = response.status >= 400 && response.status < 500 && typeof result.error === 'string'
          ? result.error
          : 'We could not save your details right now.';
        // A short code (for example upstream_rejected) tells Monique which step failed, without showing technical details.
        const code = typeof result.code === 'string' && /^[a-z0-9_]{3,40}$/.test(result.code) ? ` (Code: ${result.code})` : ` (Code: http_${response.status})`;
        // TEMPORARY while the sheet connection is being tested: show the short reason from the sheet script.
        const why = typeof result.detail === 'string' && result.detail ? ` Reason: ${result.detail.slice(0, 120)}` : '';
        throw new Error(friendly + code + why);
      }

      try { localStorage.setItem(LEAD_CAPTURED_KEY, 'true'); } catch (storageError) { console.warn('Could not remember capture preference', storageError); }
      pendingReportId.current = null;
      setTurnstileToken('');
      setTurnstileReset(n => n + 1);
      setIsLeadCaptured(true);
      setIsEditingContact(false);
      setSaveStatus('ok');
      setSaveMessage('Thank you. Your report is opening now. If it does not, press the Print / Save My Full Report button below. Monique will follow up at ' + email.trim() + '.');
      track('review_requested', { alert: metrics.alertLevel, category });
      // The full report opens right after the details are saved. The button below stays available if a browser blocks this.
      setTimeout(() => { track('report_printed'); window.print(); }, 400);
    } catch (error) {
      console.error('Remote save failed', error);
      const reason = error instanceof Error ? error.message : 'We could not save your details right now.';
      fail(needsCheck ? reason : reason + ' Your results are still on screen. You can print or save them below and try again in a minute.');
      setTurnstileToken('');
      setTurnstileReset(n => n + 1);
      track(needsCheck ? 'verification_needed' : 'review_request_failed');
    }
  };

  const handlePrint = () => {
    if (!isLeadCaptured) {
      // The full report is the thank-you for sharing contact details: take the visitor to the short form instead.
      track('report_gate_shown');
      setSaveStatus('idle');
      setSaveMessage('');
      setFormNear(true);
      leadBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => leadBoxRef.current?.querySelector<HTMLInputElement>('input[aria-label="Your name"]')?.focus({ preventScroll: true }), 350);
      return;
    }
    track('report_printed');
    window.print();
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const formatWhole = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
  const per = treatmentType === 'package' ? 'package' : 'treatment';

  const tabs: { id: 'injectables' | 'lasers' | 'facials'; label: string }[] = [
    { id: 'injectables', label: 'Injectables' },
    { id: 'lasers', label: 'Lasers & Devices' },
    { id: 'facials', label: 'Facials & Skin' }
  ];

  return (
    <div className={`app-card${isLeadCaptured ? '' : ' report-locked'}`}>
      {/* Printed instead of the report when the visitor has not yet saved their details (for example Ctrl+P) */}
      <div className="print-lock-note">
        <h1>MONIQUE REID BOOKKEEPING</h1>
        <p>Your full Profit Pulse report is saved after you enter your name, practice and email on the calculator page.</p>
        <p>medspa.moniquereidbookkeeping.com</p>
      </div>
      {/* Print-Only Professional CPA-Ready Diagnostic Header */}
      <div className="print-header-brand">
        <h1>MONIQUE REID BOOKKEEPING</h1>
        <p>Treatment Profitability Diagnostic</p>
        <p className="print-report-date">Report date: {new Date().toLocaleDateString('en-US')}</p>
        <p className="print-contact-details">Practice: {practiceName || 'Not provided'} • Prepared for: {ownerName || 'Not provided'}</p>
        <p>Platform: {paymentPlatform} • Treatment: {category} • Structure: {treatmentType === 'single' ? 'Single visit' : `${sessions}-session package`}</p>
        <hr className="print-divider" />
      </div>

      <div className="header">
        <div className="header-top-bar">
          <span className="badge-pill">Clinic Unit Economics</span>
          <button type="button" className="reset-link-btn" onClick={handleReset} title="Reset to standard defaults">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Reset Defaults
          </button>
        </div>
        <h1>THE PROFIT PULSE</h1>
        <p>Find Missing Cash In Your Menu</p>
        <p className="brand-line">For MedSpas &amp; aesthetic practices. A free tool by Monique Reid Bookkeeping</p>
      </div>

      {/* Category Tabs */}
      <div className="tab-container" role="tablist" aria-label="Treatment category">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={category === t.id}
            onClick={() => { engage(); handleCategoryChange(t.id); }}
            className={`tab-btn ${category === t.id ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Payment Platform Dropdown */}
      <div className="input-group print-hide">
        <label className="label-text" htmlFor="platform-select">Choose Payment/Financing Platform</label>
        <select
          id="platform-select"
          className="manual-input"
          value={paymentPlatform}
          onChange={(e) => { engage(); handlePlatformChange(e.target.value as PaymentPlatform); }}
        >
          <option value="Regular Card Processing (Stripe, Vagaro, Square)">Regular Card Processing (Stripe, Vagaro, Square)</option>
          <option value="Cherry Financing (6-Month No-Interest Plan)">⚡ Cherry Financing (6-Month No-Interest Plan)</option>
          <option value="Cherry Financing (12-Month Zero-Interest Split)">⚡ Cherry Financing (12-Month Zero-Interest Split)</option>
          <option value="CareCredit Standard Doctor Fee Program">💳 CareCredit Standard Doctor Fee Program</option>
          <option value="PatientFi Base Promotion Rate Setup">🌸 PatientFi Base Promotion Rate Setup</option>
          <option value="Custom Platform Fee Override">🛠️ Custom Platform Fee Override</option>
        </select>
        <span className="label-sub" style={{ marginTop: '4px', display: 'block', color: '#94A3B8' }}>
          Placeholder rate: {feeRatePct}%. Financing companies quote each practice its own fee, so replace this with the rate on your own statement.
        </span>
      </div>

      <div className="print-grid">
      {/* Fee Rate Input */}
      <div className="input-group">
        <label className="label-text" htmlFor="fee-rate">Effective Platform Fee Rate (%)</label>
        <div className="currency-input-wrap">
          <NumField id="fee-rate" className="manual-input" value={feeRatePct} min={0} max={30} step={0.1} onChange={used(setFeeRatePct)} />
        </div>
      </div>

      {/* Treatment Type Setup */}
      <div className="input-group print-hide">
        <span className="label-text" id="structure-label">
          Treatment Structure
          <span className="label-sub">{treatmentType === 'single' ? '1 visit' : `${sessions} visits`}</span>
        </span>
        <div className="input-row-split">
          <div className="toggle-container" role="radiogroup" aria-labelledby="structure-label">
            <button type="button" onClick={() => { engage(); handleTreatmentTypeChange('single'); }} className={`toggle-btn ${treatmentType === 'single' ? 'active' : ''}`} role="radio" aria-checked={treatmentType === 'single'}>Single Visit</button>
            <button type="button" onClick={() => { engage(); handleTreatmentTypeChange('package'); }} className={`toggle-btn ${treatmentType === 'package' ? 'active' : ''}`} role="radio" aria-checked={treatmentType === 'package'}>📦 Multi-Session</button>
          </div>
          <div>
            <NumField
              aria-label="Number of sessions"
              className="manual-input rate-suffix-input"
              value={sessions}
              min={1}
              max={24}
              step={1}
              integer
              disabled={treatmentType === 'single'}
              onChange={used(setSessions)}
            />
          </div>
        </div>
      </div>

      {/* Financial Inputs */}
      <div className="input-group">
        <label className="label-text" htmlFor="price">{treatmentType === 'package' ? `Total Package Price, All ${sessions} Visits ($)` : 'What Does the Client Pay You? ($)'}</label>
        <div className="currency-input-wrap">
          <span>$</span>
          <NumField id="price" className="manual-input" value={price} min={0} max={100000000} step={10} onChange={used(setPrice)} />
        </div>
      </div>

      <div className="input-group">
        <label className="label-text" htmlFor="wholesale">{treatmentType === 'package' ? 'Wholesale Cost of Products Per Visit ($)' : 'Wholesale Cost of Products/Boxes Used ($)'}</label>
        <div className="currency-input-wrap">
          <span>$</span>
          <NumField id="wholesale" className="manual-input" value={wholesaleCost} min={0} max={100000000} step={5} onChange={used(setWholesaleCost)} />
        </div>
      </div>

      <div className="input-group">
        <label className="label-text" htmlFor="overhead">Estimated Room Overhead per Visit ($)</label>
        <div className="currency-input-wrap">
          <span>$</span>
          <NumField id="overhead" className="manual-input" value={hourlyOverhead} min={0} max={100000000} step={5} onChange={used(setHourlyOverhead)} />
        </div>
      </div>

      </div>

      <div className="print-grid">
      {/* Sliders with Manual Number Inputs */}
      <div className="input-group">
        <div className="slider-header">
          <label className="label-text" htmlFor="waste-number" style={{ margin: 0 }}>Product Waste/Spill Cushion</label>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #1E293B', borderRadius: '6px', padding: '2px 6px', maxWidth: '75px' }}>
            <NumField
              id="waste-number"
              value={wasteCushionPct}
              min={0}
              max={50}
              step={1}
              onChange={used(setWasteCushionPct)}
              style={{ width: '100%', background: 'none', border: 'none', color: '#F5E6C4', fontSize: '13px', fontWeight: 700, textAlign: 'right', outline: 'none' }}
            />
            <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>%</span>
          </div>
        </div>
        <input type="range" aria-label="Product waste cushion percent" min="0" max="25" step="5" value={wasteCushionPct} onChange={(e) => { engage(); setWasteCushionPct(parseFloat(e.target.value) || 0); }} />
      </div>

      <div className="input-group">
        <div className="slider-header">
          <label className="label-text" htmlFor="commission-number" style={{ margin: 0 }}>Provider Commission Cut</label>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #1E293B', borderRadius: '6px', padding: '2px 6px', maxWidth: '75px' }}>
            <NumField
              id="commission-number"
              value={commissionPct}
              min={0}
              max={100}
              step={1}
              onChange={used(setCommissionPct)}
              style={{ width: '100%', background: 'none', border: 'none', color: '#F5E6C4', fontSize: '13px', fontWeight: 700, textAlign: 'right', outline: 'none' }}
            />
            <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>%</span>
          </div>
        </div>
        <input type="range" aria-label="Provider commission percent" min="0" max="50" step="5" value={commissionPct} onChange={(e) => { engage(); setCommissionPct(parseFloat(e.target.value) || 0); }} />
      </div>

      </div>

      {/* Scale it up: turns one treatment into a yearly number and a price target */}
      <div className="scale-group">
        <p className="scale-title">Scale it up <span className="label-sub" style={{ marginLeft: 6 }}>optional</span></p>
        <div className="input-group">
          <label className="label-text" htmlFor="per-month">How many {per === 'package' ? 'packages' : 'of these'} do you sell per month?</label>
          <NumField id="per-month" className="manual-input" value={treatmentsPerMonth} min={SCALE_LIMITS.treatmentsPerMonth.min} max={SCALE_LIMITS.treatmentsPerMonth.max} step={1} integer onChange={used(setTreatmentsPerMonth)} />
        </div>
        <div className="input-group">
          <label className="label-text" htmlFor="minutes">Treatment time per visit (minutes)</label>
          <NumField id="minutes" className="manual-input" value={treatmentMinutes} min={SCALE_LIMITS.treatmentMinutes.min} max={SCALE_LIMITS.treatmentMinutes.max} step={5} onChange={used(setTreatmentMinutes)} />
          <span className="label-sub" style={{ textAlign: 'left', display: 'block', marginTop: 4, color: '#94A3B8' }}>Placeholder time. Replace it with how long this really takes your provider.</span>
        </div>
        <div className="input-group">
          <label className="label-text" htmlFor="target-pct">Contribution percentage you want to reach (%)</label>
          <NumField id="target-pct" className="manual-input" value={targetPct} min={SCALE_LIMITS.targetPct.min} max={SCALE_LIMITS.targetPct.max} step={1} onChange={used(setTargetPct)} />
        </div>
        {category === 'injectables' && (
          <div className="input-group">
            <label className="label-text" htmlFor="units">Units used per visit (Botox, filler and similar)</label>
            <NumField id="units" className="manual-input" value={unitsPerVisit} min={SCALE_LIMITS.unitsPerVisit.min} max={SCALE_LIMITS.unitsPerVisit.max} step={1} onChange={used(setUnitsPerVisit)} />
            <span className="label-sub" style={{ textAlign: 'left', display: 'block', marginTop: 4, color: '#94A3B8' }}>Leave at 0 to skip the per-unit view.</span>
          </div>
        )}
      </div>

      <hr className="divider" />

      {/* Results Panel */}
      <div className="results-panel">
        <div className="result-row total-profit">
          <span>Estimated Treatment Contribution</span>
          <span className="profit-text" style={{ color: toneColor }}>
            {formatCurrency(metrics.yourRealTakeawayCash)}
          </span>
        </div>
        <div className="result-row" style={{ marginBottom: '12px' }}>
          <span>Estimated Treatment Contribution Percentage</span>
          <span className="margin-text" style={{ color: toneColor }}>
            {metrics.yourRealKeepPercentagePct}%
          </span>
        </div>
        <div className="result-row">
          <span>Platform Fees ({feeRatePct}%)</span>
          <span>{formatCurrency(metrics.hiddenPlatformFees)}</span>
        </div>
        <div className="result-row">
          <span>Total Cost of Materials (+{wasteCushionPct}% cushion)</span>
          <span>{formatCurrency(metrics.totalCostOfMaterials)}</span>
        </div>
        <div className="result-row">
          <span>Provider Payroll Cut ({commissionPct}%)</span>
          <span>{formatCurrency(metrics.providerPayrollCut)}</span>
        </div>
        <div className="result-row">
          <span>Estimated Room / Operational Expense (per visit × sessions)</span>
          <span>{formatCurrency(metrics.roomOperationalExpense)}</span>
        </div>
        <div className="result-row" style={{ borderTop: '1px solid rgba(30, 41, 59, 0.6)', paddingTop: '6px', color: '#E2E8F0' }}>
          <span>Total Estimated Outflows</span>
          <span style={{ color: '#F5E6C4' }}>{formatCurrency(metrics.totalOutflows)}</span>
        </div>
        {treatmentType === 'package' && sessions > 1 && (
          <div className="result-row" style={{ display: 'flex', borderTop: '1px dashed rgba(212, 175, 55, 0.3)', paddingTop: '6px', color: '#D4AF37' }}>
            <span>Contribution Per Visit ({sessions} visits)</span>
            <span>{formatCurrency(metrics.takeawayPerVisit)}</span>
          </div>
        )}
      </div>

      {/* Yearly impact, price check, hourly view, per-unit view */}
      <div className="results-panel insights-panel" aria-label="Yearly impact and price check">
        {insights.yearlyContribution !== null ? (
          <div className="result-row">
            <span>Estimated yearly contribution ({treatmentsPerMonth} {per === 'package' ? 'packages' : 'treatments'} a month)</span>
            <span style={{ color: toneColor }}>{formatWhole(insights.yearlyContribution)}</span>
          </div>
        ) : (
          <div className="result-row"><span>Enter how many you sell per month to see your yearly number.</span><span /></div>
        )}
        {insights.contributionPerHour !== null && (
          <div className="result-row">
            <span>Estimated contribution per treatment hour ({treatmentMinutes} min per visit)</span>
            <span>{formatCurrency(insights.contributionPerHour)}</span>
          </div>
        )}
        {insights.perUnit && (
          <div className="result-row">
            <span>Per unit: client pays {formatCurrency(insights.perUnit.price)}, product costs {formatCurrency(insights.perUnit.cost)}, you keep</span>
            <span>{formatCurrency(insights.perUnit.contribution)}</span>
          </div>
        )}
        {insights.priceCheck === 'raise' && insights.targetPrice !== null && (
          <p className="price-check">
            <strong>Price check:</strong> to reach {targetPct}% contribution, this {per} would need to be about <strong>{formatCurrency(insights.targetPrice)}</strong>
            {insights.priceIncreasePct !== null && <> ({insights.priceIncreasePct}% more than today)</>}.
            {insights.extraYearlyCash !== null && <> If your volume held steady, that is roughly <strong>{formatWhole(insights.extraYearlyCash)} more a year</strong>.</>}
          </p>
        )}
        {insights.priceCheck === 'meets' && (
          <p className="price-check"><strong>Price check:</strong> this {per} already reaches your {targetPct}% target.</p>
        )}
        {insights.priceCheck === 'impossible' && (
          <p className="price-check"><strong>Price check:</strong> platform fees and provider commission alone take {insights.feePlusCommissionPct}% of the price, so a {targetPct}% target cannot be reached by price alone. Look at the fee rate or the commission first.</p>
        )}
        <p className="threshold-note" style={{ marginTop: 6 }}>Yearly figures assume the same price, costs and volume every month. They are estimates for planning, not forecasts.</p>
      </div>

      {/* Dynamic Accessible Contribution Alert Banner */}
      <div className={`alert-box alert-${metrics.alertLevel}`} role="status" style={{ display: 'block', marginTop: '16px' }}>
        <strong><span className="emoji-icon" aria-hidden="true">{metrics.alertLevel === 'red' ? '🚨 ' : metrics.alertLevel === 'amber' ? '🟡 ' : '🟢 '}</span>{metrics.alertLevel === 'red' ? 'Profitability Concern: ' : metrics.alertLevel === 'amber' ? 'Margin Squeeze: ' : 'Strong Contribution: '}</strong>
        {metrics.alertMessage}
      </div>
      <p className="threshold-note">{ALERT_THRESHOLD_NOTE}</p>

      {metrics.showDeferredWarning && (
        <div className="alert-box alert-warning" role="status" style={{ display: 'block', marginTop: '10px' }}>
          {metrics.deferredWarningText}
        </div>
      )}

      {/* Free-review offer (lead capture) & returning visitor state */}
      <div className="lead-box" ref={leadBoxRef} onFocus={() => setFormNear(true)}>
        {(!isLeadCaptured || isEditingContact) ? (
          <form onSubmit={handleLeadSubmit} noValidate>
            <p className="lead-headline">{REVIEW_HEADLINES[metrics.alertLevel]}</p>
            <p style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '8px' }}>{REVIEW_TEXT}</p>
            <input className="manual-input" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Your name (required)" aria-label="Your name" autoComplete="name" required maxLength={100} />
            <input className="manual-input" value={practiceName} onChange={e => setPracticeName(e.target.value)} placeholder="Practice name (required)" aria-label="Practice name" autoComplete="organization" required maxLength={120} />
            <input ref={emailRef} type="email" className="manual-input" value={email} onChange={e => { setEmail(e.target.value); setEmailNote(null); }} placeholder="Email (required)" aria-label="Email address" aria-describedby={emailNote ? 'email-note' : undefined} autoComplete="email" inputMode="email" required maxLength={254} />
            {emailNote && (
              <p id="email-note" role="alert" className={`field-note field-note-${emailNote.kind}`}>
                {emailNote.text}
                {emailNote.fix && (
                  <> <button type="button" className="link-btn" onClick={() => { setEmail(emailNote.fix!); setEmailNote(null); emailRef.current?.focus(); }}>Use {emailNote.fix}</button></>
                )}
              </p>
            )}
            <input type="tel" className="manual-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder={PHONE_REQUIRED ? 'Phone (required)' : 'Phone (optional, for a faster review)'} aria-label={PHONE_REQUIRED ? 'Phone number' : 'Phone number, optional'} autoComplete="tel" maxLength={25} />
            <input className="manual-input" value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="What should we improve? (optional)" aria-label="Optional: tell us anything that was confusing or missing, or what would make this calculator more useful" maxLength={400} />
            {/* Spam trap: hidden from people, visible to bots */}
            <input className="hp-field" type="text" name="hp_ref" tabIndex={-1} autoComplete="off" aria-hidden="true" data-lpignore="true" data-1p-ignore="true" value={website} onChange={e => setWebsite(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', marginTop: '4px', color: '#E2E8F0', cursor: 'pointer' }}>
              <input type="checkbox" checked={contactConsent} onChange={e => setContactConsent(e.target.checked)} required />
              I agree that Monique Reid Bookkeeping may contact me by email or phone about my report, a free profit review and bookkeeping services. I can opt out at any time.
            </label>
            {turnstileSiteKey && formNear && <Turnstile siteKey={turnstileSiteKey} onToken={setTurnstileToken} onProblem={setTurnstileProblem} resetSignal={turnstileReset} />}
            {turnstileSiteKey && turnstileProblem && (
              <p className="save-message save-error">The verification check did not load. Some in-app browsers (including social media apps) block it. Please open this page in Safari or Chrome to send your request. You can still use the calculator and print your report here.</p>
            )}
            <button type="submit" disabled={saveStatus === 'saving'} className="cta-btn" style={{ marginTop: '4px' }}>
              {saveStatus === 'saving' ? 'Sending...' : 'Unlock My Full Report'}
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#34D399', fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>✓ Details received. Your full report is unlocked.</p>
            <p style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '12px' }}>
              Your details are saved from this browser, so your full report is unlocked. Need to send a new request with different numbers?
            </p>
            <button type="button" className="cta-btn" onClick={() => { setSaveStatus('idle'); setSaveMessage(''); setIsEditingContact(true); }} style={{ marginTop: 0 }}>
              Send a New Request
            </button>
          </div>
        )}

        {saveMessage && (
          <p role={saveStatus === 'error' ? 'alert' : 'status'} className={`save-message save-${saveStatus}`}>{saveMessage}</p>
        )}
        <button type="button" className="secondary-cta-btn print-report-btn" onClick={handlePrint} style={{ marginTop: '12px' }}>{isLeadCaptured ? 'Print / Save My Full Report' : 'Unlock My Full Report (enter your details above)'}</button>
      </div>

      <a href={BOOKING_URL} onClick={() => track('cta_clicked')} target="_blank" rel="noopener" className="secondary-cta-btn">
        See How Monique Helps Practices Like Yours
      </a>

      <div className="print-assumptions"><strong>Assumptions and limitations</strong><p>All figures are estimates based on the inputs provided. Package price is treated as the total price for all sessions; material and room costs are multiplied by session count. Provider compensation and platform fees are estimated against the entered treatment/package price. This is not a complete clinic-level profit calculation, accounting advice, or a guarantee of actual fees. Yearly figures assume the same price, costs and monthly volume all year. Confirm actual processor contracts, treatment time, taxes, refunds, payroll arrangements, and accounting treatment with your qualified advisers.</p><p className="print-signature">Monique Reid Bookkeeping • Secure Virtual Solutions</p></div>

      <p className="privacy-note">
        Your calculator entries are saved only in this browser. When you unlock your full report, your contact details and the numbers you entered are saved by Monique Reid Bookkeeping so she can follow up. A Cloudflare security check confirms you are a person, and we count visits without recording who you are.
        {PRIVACY_URL && <> <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy policy</a></>}
      </p>
      <p className="footer-text">
        DISCLAIMER: Estimates are generated based on your manual inputs for planning and discussion with your accountant. Not a CPA audit, tax, or legal opinion.<br/>
        MONIQUE REID BOOKKEEPING • SECURE VIRTUAL SOLUTIONS
      </p>
    </div>
  );
}
