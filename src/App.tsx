/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useTransition } from 'react';
import { calculateProfitPulseMetrics, CATEGORY_DEFAULTS } from './calc';

// Google Form Pre-fill Configuration & Entry Keys
const CONFIG = {
  formViewUrl: "https://docs.google.com/forms/d/e/1FAIpQLSePe4W0m6STMu0kzit0grjbQR50BvBXiS7flzh-CLmKDP9OGQ/viewform",
  phoneFieldKey: "entry.307925494",
  payloadKey: "entry.1181600789"
};

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
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [toastVisible, setToastVisible] = useState<boolean>(false);
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
        if (parsed.phone) setPhone(parsed.phone);
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
        price, wholesaleCost, hourlyOverhead, wasteCushionPct, commissionPct, phone
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn("Could not save state", e);
    }
  }, [category, paymentMethod, feeRatePct, treatmentType, sessions, price, wholesaleCost, hourlyOverhead, wasteCushionPct, commissionPct, phone]);

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
    setIsSubmitted(false);
  };

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedPhone = phone.replace(/[^0-9+]/g, "").slice(0, 15);
    if (!sanitizedPhone || sanitizedPhone.length < 7) {
      alert("Please enter a valid mobile phone number.");
      return;
    }

    const summaryString = `Category: ${category.toUpperCase()} | Takeaway: $${metrics.yourRealTakeawayCash.toFixed(2)} | Margin: ${metrics.yourRealKeepPercentagePct}%`;

    // Construct the direct prefilled Google Form URL
    const targetUrl = `${CONFIG.formViewUrl}?usp=pp_url&${CONFIG.phoneFieldKey}=${encodeURIComponent(sanitizedPhone)}&${CONFIG.payloadKey}=${encodeURIComponent(summaryString)}`;

    // Open the pre-filled form in a clean new tab
    window.open(targetUrl, '_blank');

    setIsSubmitted(true);
    setToastVisible(true);
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

      {/* Lead Capture Form & Interactive Success Window */}
      {!isSubmitted ? (
        <form onSubmit={handleLeadSubmit}>
          <div className="lead-box">
            <label className="label-text" style={{ color: '#F5E6C4' }}>Text Me My Menu Profit Report</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              className="manual-input" 
              style={{ fontSize: '14px', marginTop: '6px' }} 
              placeholder="Enter mobile phone number..." 
              required 
            />
            <button type="submit" className="cta-btn">Text Me My Profit Summary</button>
            {toastVisible && <div className="toast-msg" style={{ display: 'block' }}>✓ Profit Breakdown queued for dispatch!</div>}
          </div>
        </form>
      ) : (
        <div className="lead-box" style={{ background: 'rgba(6, 78, 59, 0.25)', borderColor: 'rgba(52, 211, 153, 0.4)' }}>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <span style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34D399', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
              Report Dispatched Successfully!
            </span>
          </div>
          <p style={{ fontSize: '12px', color: '#E2E8F0', textAlign: 'center', margin: '8px 0 12px 0', lineHeight: 1.4 }}>
            Your personalized unit economics breakdown has been securely logged. Ready to lock in your higher margin menu?
          </p>
          <a href="https://calendly.com" target="_blank" rel="noopener noreferrer" className="cta-btn" style={{ textDecoration: 'none', marginTop: 0, background: 'linear-gradient(90deg, #34D399, #6EE7B7, #34D399)', color: '#020617', textAlign: 'center' }}>
            Schedule Your Diagnostic Review Call ⚡
          </a>
          <button type="button" onClick={() => { setIsSubmitted(false); setPhone(""); }} className="secondary-cta-btn" style={{ marginTop: '8px', width: '100%', cursor: 'pointer' }}>
            Calculate Another Service
          </button>
        </div>
      )}

      <a href="https://calendly.com" target="_blank" rel="noopener noreferrer" className="secondary-cta-btn">
        Chat with Monique Reid Bookkeeping
      </a>

      <p className="footer-text">CONFIDENTIAL CLINIC BENCHMARKING ENGINE • MONIQUE REID</p>
    </div>
  );
}
