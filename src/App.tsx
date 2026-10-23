/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useTransition } from 'react';
import { calculateProfitPulseMetrics, CATEGORY_DEFAULTS, PLATFORM_DEFAULT_FEES, PaymentPlatform } from './calc';

const STORAGE_KEY = "medspa_profit_pulse_state";
const LEAD_CAPTURED_KEY = "medspa_profit_pulse_lead_captured";

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

  const [phone, setPhone] = useState<string>("");
  const [ownerName, setOwnerName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  
  const [isLeadCaptured, setIsLeadCaptured] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [, startTransition] = useTransition();

  // Load from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.category) setCategory(parsed.category);
        if (parsed.paymentPlatform) setPaymentPlatform(parsed.paymentPlatform);
        if (parsed.feeRatePct !== undefined) setFeeRatePct(parsed.feeRatePct);
        if (parsed.treatmentType) setTreatmentType(parsed.treatmentType);
        if (parsed.sessions !== undefined) setSessions(parsed.sessions);
        if (parsed.price !== undefined) setPrice(parsed.price);
        if (parsed.wholesaleCost !== undefined) setWholesaleCost(parsed.wholesaleCost);
        if (parsed.hourlyOverhead !== undefined) setHourlyOverhead(parsed.hourlyOverhead);
        if (parsed.wasteCushionPct !== undefined) setWasteCushionPct(parsed.wasteCushionPct);
        if (parsed.commissionPct !== undefined) setCommissionPct(parsed.commissionPct);
      }
      const captured = localStorage.getItem(LEAD_CAPTURED_KEY);
      if (captured === 'true') {
        setIsLeadCaptured(true);
      }
    } catch (e) {
      console.warn("Could not load saved state", e);
    }
  }, []);

  // Save state to LocalStorage
  useEffect(() => {
    try {
      const stateToSave = {
        category, paymentPlatform, feeRatePct, treatmentType, sessions,
        price, wholesaleCost, hourlyOverhead, wasteCushionPct, commissionPct
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn("Could not save state", e);
    }
  }, [category, paymentPlatform, feeRatePct, treatmentType, sessions, price, wholesaleCost, hourlyOverhead, wasteCushionPct, commissionPct]);

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

  const handlePlatformChange = (platform: PaymentPlatform) => {
    setPaymentPlatform(platform);
    if (platform !== 'Custom Platform Fee Override') {
      setFeeRatePct(PLATFORM_DEFAULT_FEES[platform]);
    }
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
    handlePlatformChange('Regular Card Processing (Stripe, Vagaro, Square)');
    handleTreatmentTypeChange('single');
    setWasteCushionPct(10);
    setCommissionPct(30);
    setPhone("");
    setOwnerName("");
    setPracticeName("");
    setFeedback("");
    setContactConsent(false);
    setSaveMessage("");
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!ownerName.trim() || !practiceName.trim() || !phone.trim()) {
      setSaveMessage('Please enter your name, practice name, and mobile number to generate your diagnostic report.');
      return;
    }
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) {
        setSaveMessage('Please enter a valid mobile number (10-15 digits), or leave blank.');
        return;
      }
    }

    setSaving(true);
    setSaveMessage('Saving your diagnostic snapshot...');

    try {
      const reportId = crypto.randomUUID();
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId, ownerName, practiceName, phone: phone.trim(),
          contactConsent, feedback, category, paymentPlatform,
          treatmentType, sessions, price, wholesaleCost,
          wasteCushionPct, feeRatePct, hourlyOverhead, commissionPct,
          totalCostOfMaterials: metrics.totalCostOfMaterials,
          hiddenPlatformFees: metrics.hiddenPlatformFees,
          providerPayrollCut: metrics.providerPayrollCut,
          roomOperationalExpense: metrics.roomOperationalExpense,
          totalOutflows: metrics.totalOutflows,
          contribution: metrics.yourRealTakeawayCash,
          margin: metrics.yourRealKeepPercentagePct,
          source: 'MedSpa Profit Pulse'
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.saved !== true) {
        throw new Error(String(result.detail || result.error || 'Server did not confirm save.'));
      }

      try { localStorage.setItem(LEAD_CAPTURED_KEY, 'true'); } catch (storageError) { console.warn('Could not remember capture preference', storageError); }
      setIsLeadCaptured(true);
      setIsEditingContact(false);
      setSaveMessage('Report saved to your practice tracker. Use “Print / Save Report” below when you are ready.');
    } catch (error) {
      console.error('Remote save failed', error);
      const reason = error instanceof Error ? error.message : 'Unknown submission error';
      setSaveMessage('Save failed: ' + reason + '. You can still print a copy below and retry saving.');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  return (
    <div className="app-card">
      {/* Print-Only Professional CPA-Ready Diagnostic Header */}
      <div className="print-header-brand">
        <h1>MONIQUE REID BOOKKEEPING</h1>
        <p>MedSpa Treatment Profitability Diagnostic</p>
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
        <h1>THE MEDSPA PROFIT PULSE</h1>
        <p>Find Missing Cash In Your Menu</p>
      </div>

      {/* Category Tabs */}
      <div className="tab-container" role="tablist">
        <button onClick={() => handleCategoryChange('injectables')} className={`tab-btn ${category === 'injectables' ? 'active' : ''}`} role="tab">Injectables</button>
        <button onClick={() => handleCategoryChange('lasers')} className={`tab-btn ${category === 'lasers' ? 'active' : ''}`} role="tab">Lasers & Devices</button>
        <button onClick={() => handleCategoryChange('facials')} className={`tab-btn ${category === 'facials' ? 'active' : ''}`} role="tab">Facials & Skin</button>
      </div>

      {/* Payment Platform Dropdown */}
      <div className="input-group">
        <label className="label-text" htmlFor="platform-select">Choose Payment/Financing Platform</label>
        <select 
          id="platform-select"
          className="manual-input"
          value={paymentPlatform}
          onChange={(e) => handlePlatformChange(e.target.value as PaymentPlatform)}
        >
          <option value="Regular Card Processing (Stripe, Vagaro, Square)">Regular Card Processing (Stripe, Vagaro, Square)</option>
          <option value="Cherry Financing (6-Month No-Interest Plan)">⚡ Cherry Financing (6-Month No-Interest Plan)</option>
          <option value="Cherry Financing (12-Month Zero-Interest Split)">⚡ Cherry Financing (12-Month Zero-Interest Split)</option>
          <option value="CareCredit Standard Doctor Fee Program">💳 CareCredit Standard Doctor Fee Program</option>
          <option value="PatientFi Base Promotion Rate Setup">🌸 PatientFi Base Promotion Rate Setup</option>
          <option value="Custom Platform Fee Override">🛠️ Custom Platform Fee Override</option>
        </select>
        <span className="label-sub" style={{ marginTop: '4px', display: 'block', color: '#94A3B8' }}>
          Illustrative default rate: {feeRatePct}% (Editable below)
        </span>
      </div>

      {/* Fee Rate Input */}
      <div className="input-group">
        <label className="label-text">Effective Platform Fee Rate (%)</label>
        <div className="currency-input-wrap">
          <input 
            type="number" 
            className="manual-input" 
            value={feeRatePct} 
            step="0.1" 
            min="0" 
            max="30" 
            onChange={(e) => startTransition(() => setFeeRatePct(Math.min(30, Math.max(0, parseFloat(e.target.value) || 0))))} 
          />
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
              onChange={(e) => startTransition(() => setSessions(Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 1))))} 
            />
          </div>
        </div>
      </div>

      {/* Financial Inputs */}
      <div className="input-group">
        <label className="label-text">What Does the Client Pay You? ($)</label>
        <div className="currency-input-wrap">
          <span>$</span>
          <input type="number" className="manual-input" value={price} min="0" step="10" onChange={(e) => startTransition(() => setPrice(Math.min(100000000, Math.max(0, parseFloat(e.target.value) || 0))))} />
        </div>
      </div>

      <div className="input-group">
        <label className="label-text">Wholesale Cost of Products/Boxes Used ($)</label>
        <div className="currency-input-wrap">
          <span>$</span>
          <input type="number" className="manual-input" value={wholesaleCost} min="0" step="5" onChange={(e) => startTransition(() => setWholesaleCost(Math.min(100000000, Math.max(0, parseFloat(e.target.value) || 0))))} />
        </div>
      </div>

      <div className="input-group">
        <label className="label-text">Estimated Room Overhead per Visit ($)</label>
        <div className="currency-input-wrap">
          <span>$</span>
          <input type="number" className="manual-input" value={hourlyOverhead} min="0" step="5" onChange={(e) => startTransition(() => setHourlyOverhead(Math.min(100000000, Math.max(0, parseFloat(e.target.value) || 0))))} />
        </div>
      </div>

      {/* Sliders with Manual Number Inputs */}
      <div className="input-group">
        <div className="slider-header">
          <span className="label-text" style={{ margin: 0 }}>Product Waste/Spill Cushion</span>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #1E293B', borderRadius: '6px', padding: '2px 6px', maxWidth: '75px' }}>
            <input 
              type="number" 
              value={wasteCushionPct} 
              min="0" 
              max="50" 
              step="1"
              onChange={(e) => startTransition(() => setWasteCushionPct(Math.min(50, Math.max(0, parseFloat(e.target.value) || 0))))} 
              style={{ width: '100%', background: 'none', border: 'none', color: '#F5E6C4', fontSize: '13px', fontWeight: 700, textAlign: 'right', outline: 'none' }} 
            />
            <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>%</span>
          </div>
        </div>
        <input type="range" min="0" max="25" step="5" value={wasteCushionPct} onChange={(e) => startTransition(() => setWasteCushionPct(parseFloat(e.target.value) || 0))} />
      </div>

      <div className="input-group">
        <div className="slider-header">
          <span className="label-text" style={{ margin: 0 }}>Provider Commission Cut</span>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#020617', border: '1px solid #1E293B', borderRadius: '6px', padding: '2px 6px', maxWidth: '75px' }}>
            <input 
              type="number" 
              value={commissionPct} 
              min="0" 
              max="100" 
              step="1"
              onChange={(e) => startTransition(() => setCommissionPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))))} 
              style={{ width: '100%', background: 'none', border: 'none', color: '#F5E6C4', fontSize: '13px', fontWeight: 700, textAlign: 'right', outline: 'none' }} 
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
          <span>Estimated Treatment Contribution</span>
          <span className="profit-text" style={{ color: metrics.yourRealTakeawayCash < 0 ? '#F87171' : metrics.yourRealKeepPercentagePct < 40 ? '#FBBF24' : '#34D399' }}>
            {formatCurrency(metrics.yourRealTakeawayCash)}
          </span>
        </div>
        <div className="result-row" style={{ marginBottom: '12px' }}>
          <span>Estimated Treatment Contribution Percentage</span>
          <span className="margin-text" style={{ color: metrics.yourRealTakeawayCash < 0 ? '#F87171' : metrics.yourRealKeepPercentagePct < 35 ? '#FBBF24' : '#34D399' }}>
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

      {/* Dynamic Accessible Contribution Alert Banner */}
      <div className={`alert-box alert-${metrics.alertLevel}`} role="alert" style={{ display: 'block', marginTop: '16px' }}>
        <strong>{metrics.alertLevel === 'red' ? '🚨 Profitability Concern: ' : metrics.alertLevel === 'amber' ? '🟡 Margin Squeeze: ' : '🟢 Strong Contribution: '}</strong>
        {metrics.alertMessage}
      </div>

      {metrics.showDeferredWarning && (
        <div className="alert-box alert-warning" role="alert" style={{ display: 'block', marginTop: '10px' }}>
          {metrics.deferredWarningText}
        </div>
      )}

      {/* Lead Capture & Returning Visitor State */}
      <div className="lead-box">
        {(!isLeadCaptured || isEditingContact) ? (
          <form onSubmit={handleLeadSubmit}>
            <label className="label-text" style={{ color: '#F5E6C4' }}>Save Diagnostic Report</label>
            <p style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '8px' }}>
              Enter your details to generate your professional print-ready CPA discussion summary.
            </p>
            <input className="manual-input" style={{ marginTop: '6px' }} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Owner Name (required)" aria-label="Owner name" required maxLength={100} />
            <input className="manual-input" style={{ marginTop: '6px' }} value={practiceName} onChange={e => setPracticeName(e.target.value)} placeholder="Practice Name (required)" aria-label="Practice name" required maxLength={120} />
            <input type="tel" className="manual-input" style={{ marginTop: '6px' }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Mobile Phone Number (required)" aria-label="Mobile phone number" required maxLength={25} />
            <input className="manual-input" style={{ marginTop: '6px' }} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="What would improve this calculator? (optional)" maxLength={400} />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', marginTop: '12px', color: '#E2E8F0', cursor: 'pointer' }}>
              <input type="checkbox" checked={contactConsent} onChange={e => setContactConsent(e.target.checked)} />
              I agree that Monique Reid Bookkeeping may contact me about this report and bookkeeping services. This is optional and is not required to calculate or print the report.
            </label>
            <button type="submit" disabled={saving} className="cta-btn" style={{ marginTop: '12px' }}>
              {saving ? 'Saving...' : 'Save Diagnostic Report'}
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#34D399', fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>✓ Diagnostic Session Recorded</p>
            <p style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '12px' }}>
              You have previously saved your session on this browser. You can create a new report or edit your contact information.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="cta-btn" onClick={() => setIsEditingContact(true)} style={{ marginTop: 0 }}>
                Create a New Diagnostic Report
              </button>
              <button type="button" className="secondary-cta-btn" onClick={() => setIsEditingContact(true)} style={{ marginTop: 0 }}>
                Edit Details
              </button>
            </div>
          </div>
        )}

        {saveMessage && <p role="status" style={{ marginTop: '10px', fontSize: '12px', color: '#F5E6C4' }}>{saveMessage}</p>}
        <button type="button" className="secondary-cta-btn print-report-btn" onClick={() => window.print()} style={{ marginTop: '12px' }}>Print / Save Report</button>
      </div>

      <a href="https://www.moniquereidbookkeeping.com/" target="_blank" rel="noopener noreferrer" className="secondary-cta-btn">
        Visit Monique Reid Bookkeeping
      </a>

      <div className="print-assumptions"><strong>Assumptions and limitations</strong><p>All figures are estimates based on the inputs provided. Package price is treated as the total price for all sessions; material and room costs are multiplied by session count. Provider compensation and platform fees are estimated against the entered treatment/package price. This is not a complete clinic-level profit calculation, accounting advice, or a guarantee of actual fees. Confirm actual processor contracts, treatment time, taxes, refunds, payroll arrangements, and accounting treatment with your qualified advisers.</p><p className="print-signature">Monique Reid Bookkeeping • Secure Virtual Solutions</p></div>
      <p className="footer-text">
        DISCLAIMER: Estimates are generated based on your manual inputs for planning and discussion with your accountant. Not a CPA audit, tax, or legal opinion.<br/>
        CONFIDENTIAL CLINIC BENCHMARKING ENGINE • MONIQUE REID BOOKKEEPING
      </p>
    </div>
  );
}
