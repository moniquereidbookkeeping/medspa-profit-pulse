/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useTransition } from 'react';
import { calculateProfitPulseMetrics, CATEGORY_DEFAULTS } from './calc';

const STORAGE_KEY = "medspa_profit_pulse_state";

export default function App() {
  const [category, setCategory] = useState<'injectables' | 'lasers' | 'facials'>('injectables');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cherry'>('card');
  const [feeRatePct, setFeeRatePct] = useState<number>(3.0);
  const [treatmentType, setTreatmentType] = useState<'single' | 'package'>('single');
  const [sessions, setSessions] = useState<number>(1);
  
  const [price, setPrice] = useState<number>(CATEGORY_DEFAULTS.injectables.price);
  const [wholesaleCost, setWholesaleCost] = useState<number>(CATEGORY_DEFAULTS.injectables.wholesaleCost);
  const [hourlyOverhead, setHourlyOverhead] = useState<number>(CATEGORY_DEFAULTS.injectables.hourlyOverhead);
  const [wasteCushionPct, setWasteCushionPct] = useState<number>(10);
  const [commissionPct, setCommissionPct] = useState<number>(30);

  const [phone, setPhone] = useState<string>("");
  const [ownerName, setOwnerName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [smsReady, setSmsReady] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  // Load from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.category) setCategory(parsed.category);
        if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
        if (parsed.feeRatePct !== undefined) setFeeRatePct(parsed.feeRatePct);
        if (parsed.treatmentType) setTreatmentType(parsed.treatmentType);
        if (parsed.sessions !== undefined) setSessions(parsed.sessions);
        if (parsed.price !== undefined) setPrice(parsed.price);
        if (parsed.wholesaleCost !== undefined) setWholesaleCost(parsed.wholesaleCost);
        if (parsed.hourlyOverhead !== undefined) setHourlyOverhead(parsed.hourlyOverhead);
        if (parsed.wasteCushionPct !== undefined) setWasteCushionPct(parsed.wasteCushionPct);
        if (parsed.commissionPct !== undefined) setCommissionPct(parsed.commissionPct);
        // Contact information is intentionally not persisted in browser storage.
      }
    } catch (e) {
      console.warn("Could not load saved state", e);
    }
  }, []);

  // Save to LocalStorage on state change
  useEffect(() => {
    try {
      const stateToSave = {
        category, paymentMethod, feeRatePct, treatmentType, sessions,
        price, wholesaleCost, hourlyOverhead, wasteCushionPct, commissionPct
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn("Could not save state", e);
    }
  }, [category, paymentMethod, feeRatePct, treatmentType, sessions, price, wholesaleCost, hourlyOverhead, wasteCushionPct, commissionPct]);

  const metrics = calculateProfitPulseMetrics({
    price,
    wholesaleCost,
    hourlyOverhead,
    feeRatePct,
    sessions,
    treatmentType,
    wasteCushionPct,
    commissionPct
  });

  const handleCategoryChange = (cat: 'injectables' | 'lasers' | 'facials') => {
    setCategory(cat);
    const defaults = CATEGORY_DEFAULTS[cat];
    setPrice(defaults.price);
    setWholesaleCost(defaults.wholesaleCost);
    setHourlyOverhead(defaults.hourlyOverhead);
  };

  const handlePaymentChange = (method: 'card' | 'cherry') => {
    setPaymentMethod(method);
    setFeeRatePct(method === 'cherry' ? 8.0 : 3.0);
  };

  const handleTreatmentTypeChange = (type: 'single' | 'package') => {
    setTreatmentType(type);
    if (type === 'package' && sessions === 1) {
      setSessions(4);
    } else if (type === 'single') {
      setSessions(1);
    }
  };

  const handleReset = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    handleCategoryChange('injectables');
    handlePaymentChange('card');
    handleTreatmentTypeChange('single');
    setWasteCushionPct(10);
    setCommissionPct(30);
    setPhone("");
    setOwnerName("");
    setPracticeName("");
    setFeedback("");
    setContactConsent(false);
    setSmsReady(false);
    setSaveMessage("");
    setIsSubmitted(false);
  };

  const makeReport = () => [
    'MEDSPA PROFIT PULSE — Treatment Snapshot',
    `Category: ${category}`,
    `Treatment price: $${price.toFixed(2)}`,
    `Processing fees: $${metrics.hiddenPlatformFees.toFixed(2)}`,
    `Materials (incl. waste): $${metrics.totalCostOfMaterials.toFixed(2)}`,
    `Provider compensation: $${metrics.providerPayrollCut.toFixed(2)}`,
    `Room overhead: $${metrics.roomOperationalExpense.toFixed(2)}`,
    `Total costs: $${metrics.totalOutflows.toFixed(2)}`,
    `Estimated contribution: $${metrics.yourRealTakeawayCash.toFixed(2)}`,
    `Contribution margin: ${metrics.yourRealKeepPercentagePct}%`,
    treatmentType === 'package' ? `Package sessions: ${sessions}; per-session contribution: $${metrics.takeawayPerVisit.toFixed(2)}` : '',
    'Estimate from your inputs, not verified net profit. — Monique Reid Bookkeeping'
  ].filter(Boolean).join('\n');

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const digits = phone.replace(/\D/g, '');
    if (phone.trim() && (digits.length < 10 || digits.length > 15)) {
      setSaveMessage('Use a valid mobile number, or leave it blank.');
      return;
    }
    if (contactConsent && !phone.trim()) {
      setSaveMessage('Enter a mobile number if you want to opt in to follow-up.');
      return;
    }
    setSaving(true);
    setSaveMessage('Saving your snapshot…');
    try {
      const reportId = crypto.randomUUID();
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId, ownerName, practiceName, phone: phone.trim(),
          contactConsent, feedback, category, paymentMethod,
          treatmentType, sessions, price, wholesaleCost,
          wasteCushionPct, feeRatePct, hourlyOverhead, commissionPct,
          totalCostOfMaterials: metrics.totalCostOfMaterials,
          hiddenPlatformFees: metrics.hiddenPlatformFees,
          providerPayrollCut: metrics.providerPayrollCut,
          roomOperationalExpense: metrics.roomOperationalExpense,
          totalOutflows: metrics.totalOutflows,
          contribution: metrics.yourRealTakeawayCash,
          margin: metrics.yourRealKeepPercentagePct,
          smsStatus: 'Prepared', source: 'MedSpa Profit Pulse'
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.saved !== true) throw new Error('Save not confirmed');
      setSmsReady(true);
      setIsSubmitted(true);
      setSaveMessage('Saved to your report tracker. Your report is ready below.');
    } catch (error) {
      console.error('Report save failed', error);
      // Access to the report must remain available even during an outage.
      setSmsReady(true);
      setSaveMessage('Could not save the report to our tracker. You can still copy or text your results below, or retry saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(makeReport());
      setSaveMessage('Report copied. Open your messaging app and paste it.');
    } catch {
      setSaveMessage('Copy is unavailable in this browser. Please select and copy the report text below.');
    }
  };

  const handleOpenSms = () => {
    // An SMS URI opens the owner's messaging app; only the owner can send the SMS.
    // Not all iOS/Android configurations allow prefilling the body.
    window.location.href = `sms:?body=${encodeURIComponent(makeReport())}`;
    setSaveMessage('Your messaging app was requested. If the report is not prefilled, use Copy My Report.');
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  return (
    <div className="app-card">
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
        <h1>THE MEDSPA PROFIT PULSE</h1>
        <p>Find Missing Cash In Your Menu</p>
      </div>

      {/* Category Tabs */}
      <div className="tab-container" role="tablist">
        <button onClick={() => handleCategoryChange('injectables')} className={`tab-btn ${category === 'injectables' ? 'active' : ''}`} role="tab">Injectables</button>
        <button onClick={() => handleCategoryChange('lasers')} className={`tab-btn ${category === 'lasers' ? 'active' : ''}`} role="tab">Lasers & Devices</button>
        <button onClick={() => handleCategoryChange('facials')} className={`tab-btn ${category === 'facials' ? 'active' : ''}`} role="tab">Facials & Skin</button>
      </div>

      {/* Payment Method Setup */}
      <div className="input-group">
        <span className="label-text">
          How Do Clients Pay You?
          <span className="label-sub">Fee Rate %</span>
        </span>
        <div className="input-row-split">
          <div className="toggle-container" role="radiogroup">
            <button onClick={() => handlePaymentChange('card')} className={`toggle-btn ${paymentMethod === 'card' ? 'active' : ''}`} role="radio">Regular Card</button>
            <button onClick={() => handlePaymentChange('cherry')} className={`toggle-btn ${paymentMethod === 'cherry' ? 'active' : ''}`} role="radio">⚡ Cherry Split</button>
          </div>
          <div>
            <input 
              type="number" 
              className="manual-input rate-suffix-input" 
              value={feeRatePct} 
              step="0.1" 
              min="0" 
              max="25" 
              onChange={(e) => startTransition(() => setFeeRatePct(parseFloat(e.target.value) || 0))} 
            />
          </div>
        </div>
      </div>

      {/* Treatment Type Setup */}
      <div className="input-group">
        <span className="label-text">
          Treatment Structure
          <span className="label-sub">{treatmentType === 'single' ? '1 visit' : `${sessions} visits`}</span>
        </span>
        <div className="input-row-split">
          <div className="toggle-container" role="radiogroup">
            <button onClick={() => handleTreatmentTypeChange('single')} className={`toggle-btn ${treatmentType === 'single' ? 'active' : ''}`} role="radio">Single Visit</button>
            <button onClick={() => handleTreatmentTypeChange('package')} className={`toggle-btn ${treatmentType === 'package' ? 'active' : ''}`} role="radio">📦 Multi-Session</button>
          </div>
          <div>
            <input 
              type="number" 
              className="manual-input rate-suffix-input" 
              value={sessions} 
              min="1" 
              max="24" 
              step="1" 
              disabled={treatmentType === 'single'} 
              onChange={(e) => startTransition(() => setSessions(parseInt(e.target.value, 10) || 1))} 
            />
          </div>
        </div>
      </div>

      {/* Financial Inputs */}
      <div className="input-group">
        <label className="label-text">What Does the Client Pay You? ($)</label>
        <div className="currency-input-wrap">
          <span>$</span>
          <input type="number" className="manual-input" value={price} min="0" step="10" onChange={(e) => startTransition(() => setPrice(Math.max(0, parseFloat(e.target.value) || 0)))} />
        </div>
      </div>

      <div className="input-group">
        <label className="label-text">Wholesale Cost of Products/Boxes Used ($)</label>
        <div className="currency-input-wrap">
          <span>$</span>
          <input type="number" className="manual-input" value={wholesaleCost} min="0" step="5" onChange={(e) => startTransition(() => setWholesaleCost(Math.max(0, parseFloat(e.target.value) || 0)))} />
        </div>
      </div>

      <div className="input-group">
        <label className="label-text">Estimated Room Overhead per Hour ($)</label>
        <div className="currency-input-wrap">
          <span>$</span>
          <input type="number" className="manual-input" value={hourlyOverhead} min="0" step="5" onChange={(e) => startTransition(() => setHourlyOverhead(Math.max(0, parseFloat(e.target.value) || 0)))} />
        </div>
      </div>

      {/* Product Waste Slider */}
      <div className="input-group">
        <div className="slider-header">
          <span className="label-text" style={{ margin: 0 }}>Product Waste/Spill Cushion</span>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #1E293B', borderRadius: '6px', padding: '2px 6px', maxWidth: '60px' }}>
            <input 
              type="number" 
              value={wasteCushionPct} 
              min="0" 
              max="25" 
              onChange={(e) => startTransition(() => setWasteCushionPct(parseFloat(e.target.value) || 0))} 
              style={{ width: '100%', background: 'none', border: 'none', color: '#F5E6C4', fontSize: '14px', fontWeight: 700, textAlign: 'right', outline: 'none' }} 
            />
            <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>%</span>
          </div>
        </div>
        <input type="range" min="0" max="25" step="5" value={wasteCushionPct} onChange={(e) => startTransition(() => setWasteCushionPct(parseFloat(e.target.value) || 0))} />
      </div>

      {/* Provider Commission Slider */}
      <div className="input-group">
        <div className="slider-header">
          <span className="label-text" style={{ margin: 0 }}>Provider Commission Cut</span>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #1E293B', borderRadius: '6px', padding: '2px 6px', maxWidth: '60px' }}>
            <input 
              type="number" 
              value={commissionPct} 
              min="0" 
              max="50" 
              onChange={(e) => startTransition(() => setCommissionPct(parseFloat(e.target.value) || 0))} 
              style={{ width: '100%', background: 'none', border: 'none', color: '#F5E6C4', fontSize: '14px', fontWeight: 700, textAlign: 'right', outline: 'none' }} 
            />
            <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>%</span>
          </div>
        </div>
        <input type="range" min="0" max="50" step="5" value={commissionPct} onChange={(e) => startTransition(() => setCommissionPct(parseFloat(e.target.value) || 0))} />
      </div>

      <hr className="divider" />

      {/* Results Panel */}
      <div className="results-panel">
        <div className="result-row total-profit">
          <span>Your Real Takeaway Cash</span>
          <span className="profit-text" style={{ color: metrics.yourRealTakeawayCash < 0 ? '#F87171' : metrics.yourRealKeepPercentagePct < 35 ? '#FBBF24' : '#34D399' }}>
            {formatCurrency(metrics.yourRealTakeawayCash)}
          </span>
        </div>
        <div className="result-row" style={{ marginBottom: '12px' }}>
          <span>Your Real Keep Percentage</span>
          <span className="margin-text" style={{ color: metrics.yourRealTakeawayCash < 0 ? '#F87171' : metrics.yourRealKeepPercentagePct < 35 ? '#FBBF24' : '#34D399' }}>
            {metrics.yourRealKeepPercentagePct}%
          </span>
        </div>
        <div className="result-row">
          <span>Hidden Platform Fees ({feeRatePct}%)</span>
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
          <span>Room Operational Expense</span>
          <span>{formatCurrency(metrics.roomOperationalExpense)}</span>
        </div>
        <div className="result-row" style={{ borderTop: '1px solid rgba(30, 41, 59, 0.6)', paddingTop: '6px', color: '#E2E8F0' }}>
          <span>Total Expense Burden</span>
          <span style={{ color: '#F5E6C4' }}>{formatCurrency(metrics.totalOutflows)}</span>
        </div>
        {treatmentType === 'package' && sessions > 1 && (
          <div className="result-row" style={{ display: 'flex', borderTop: '1px dashed rgba(212, 175, 55, 0.3)', paddingTop: '6px', color: '#D4AF37' }}>
            <span>Takeaway Per Visit ({sessions} visits)</span>
            <span>{formatCurrency(metrics.takeawayPerVisit)}</span>
          </div>
        )}
      </div>

      {/* Warning Boxes */}
      {metrics.showDeferredWarning && (
        <div className="alert-box alert-warning" style={{ display: 'block' }}>
          {metrics.deferredWarningText}
        </div>
      )}
      {metrics.showMarginWarning && (
        <div className="alert-box alert-danger" style={{ display: 'block' }}>
          {metrics.marginWarningText}
        </div>
      )}

      {/* Optional owner information and report preparation */}
      <div className="lead-box">
        <form onSubmit={handleLeadSubmit}>
          <label className="label-text" style={{ color: '#F5E6C4' }}>Save & Prepare My Profit Report</label>
          <p style={{ fontSize: '12px', color: '#CBD5E1' }}>Results are visible above. Contact details are optional unless you opt into follow-up.</p>
          <input className="manual-input" style={{ marginTop: '6px' }} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Your name (optional)" maxLength={100} />
          <input className="manual-input" style={{ marginTop: '6px' }} value={practiceName} onChange={e => setPracticeName(e.target.value)} placeholder="Practice name (optional)" maxLength={120} />
          <input type="tel" className="manual-input" style={{ marginTop: '6px' }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile number (optional)" maxLength={25} />
          <input className="manual-input" style={{ marginTop: '6px' }} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="What would improve this calculator? (optional)" maxLength={400} />
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', marginTop: '12px', color: '#E2E8F0' }}>
            <input type="checkbox" checked={contactConsent} onChange={e => setContactConsent(e.target.checked)} />
            I agree that Monique Reid Bookkeeping may contact me at the number provided about my calculator feedback and bookkeeping services. This is optional and separate from getting my report.
          </label>
          <button type="submit" disabled={saving} className="cta-btn">{saving ? 'Saving…' : isSubmitted ? 'Save Another Snapshot' : 'Save & Prepare My Report'}</button>
        </form>
        {saveMessage && <p role="status" style={{ marginTop: '10px', fontSize: '12px', color: '#F5E6C4' }}>{saveMessage}</p>}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="secondary-cta-btn" onClick={handleOpenSms}>Open Text App</button>
          <button type="button" className="secondary-cta-btn" onClick={handleCopyReport}>Copy My Report</button>
        </div>
        {smsReady && <p style={{ fontSize: '11px', color: '#CBD5E1' }}>Text delivery is not automatic; review and send inside your messaging app.</p>}
        <details style={{ marginTop: '8px', color: '#E2E8F0', fontSize: '12px' }}>
          <summary>View report text</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', overflowWrap: 'anywhere' }}>{makeReport()}</pre>
        </details>
      </div>

      <a href="https://www.moniquereidbookkeeping.com/" target="_blank" rel="noopener noreferrer" className="secondary-cta-btn">
        Chat with Monique Reid Bookkeeping
      </a>

      <p className="footer-text">ESTIMATES BASED ON YOUR INPUTS • MONIQUE REID BOOKKEEPING</p>
    </div>
  );
}
