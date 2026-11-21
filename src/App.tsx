/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  calculateProfitPulseMetrics,
  calculateInsights,
  Category,
  ALERT_COLORS,
  ALERT_THRESHOLD_NOTE,
  CATEGORY_DEFAULTS,
  CATEGORY_MINUTES,
  SCALE_DEFAULTS,
  SCALE_LIMITS,
  PLATFORM_DEFAULT_FEES,
  PaymentPlatform,
} from './calc';
import NumField from './NumField';
import { track } from './analytics';

const STORAGE_KEY = 'medspa_profit_pulse_state';
const LEGACY_LEAD_CAPTURED_KEY = 'medspa_profit_pulse_lead_captured';

// ---- Easy-to-edit business settings -------------------------------------------------------
/** Optional: link to your privacy policy. Leave empty to hide the link. */
const PRIVACY_URL = '/privacy.html';
const ASSUMPTIONS_TEXT =
  'All figures are estimates based on the inputs provided. Package price is treated as the total price for all sessions; material and room costs are multiplied by session count. Provider compensation and platform fees are estimated against the entered treatment/package price. This is not a complete clinic-level profit calculation, accounting advice, or a guarantee of actual fees. Yearly figures assume the same price, costs and monthly volume all year. Confirm actual processor contracts, treatment time, taxes, refunds, payroll arrangements, and accounting treatment with your qualified advisers.';
// --------------------------------------------------------------------------------------------

const CATEGORIES = ['injectables', 'lasers', 'facials', 'other'] as const;

/** Keep a saved/stale value inside the range the calculator accepts. */
const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

export default function App() {
  const [category, setCategory] = useState<Category>('injectables');
  const [paymentPlatform, setPaymentPlatform] = useState<PaymentPlatform>(
    'Regular Card Processing (Stripe, Vagaro, Square)'
  );
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
  const [treatmentName, setTreatmentName] = useState(''); // optional name for the Other treatment tab

  const engaged = useRef(false);

  const engage = () => {
    if (!engaged.current) {
      engaged.current = true;
      track('calculator_used');
    }
  };

  /** Wrap a calculator setter so the first real use of the calculator is counted once. */
  const used =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      engage();
      setter(v);
    };

  // Load from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if ((CATEGORIES as readonly string[]).includes(parsed.category)) setCategory(parsed.category);
        if (typeof parsed.paymentPlatform === 'string' && parsed.paymentPlatform in PLATFORM_DEFAULT_FEES) {
          setPaymentPlatform(parsed.paymentPlatform);
        }
        const savedType = parsed.treatmentType === 'package' ? 'package' : 'single';
        setTreatmentType(savedType);
        setSessions(savedType === 'package' ? Math.round(clampNum(parsed.sessions, 1, 24, 4)) : 1);
        setFeeRatePct(clampNum(parsed.feeRatePct, 0, 30, 3));
        setPrice(clampNum(parsed.price, 0, 100000000, CATEGORY_DEFAULTS.injectables.price));
        setWholesaleCost(clampNum(parsed.wholesaleCost, 0, 100000000, CATEGORY_DEFAULTS.injectables.wholesaleCost));
        setHourlyOverhead(clampNum(parsed.hourlyOverhead, 0, 100000000, CATEGORY_DEFAULTS.injectables.hourlyOverhead));
        setWasteCushionPct(clampNum(parsed.wasteCushionPct, 0, 50, 10));
        setCommissionPct(clampNum(parsed.commissionPct, 0, 100, 30));
        setTreatmentsPerMonth(
          Math.round(
            clampNum(
              parsed.treatmentsPerMonth,
              SCALE_LIMITS.treatmentsPerMonth.min,
              SCALE_LIMITS.treatmentsPerMonth.max,
              SCALE_DEFAULTS.treatmentsPerMonth
            )
          )
        );
        setTreatmentMinutes(
          clampNum(
            parsed.treatmentMinutes,
            SCALE_LIMITS.treatmentMinutes.min,
            SCALE_LIMITS.treatmentMinutes.max,
            CATEGORY_MINUTES[
              (CATEGORIES as readonly string[]).includes(parsed.category)
                ? (parsed.category as keyof typeof CATEGORY_MINUTES)
                : 'injectables'
            ]
          )
        );
        setTargetPct(clampNum(parsed.targetPct, SCALE_LIMITS.targetPct.min, SCALE_LIMITS.targetPct.max, SCALE_DEFAULTS.targetPct));
        setUnitsPerVisit(
          clampNum(parsed.unitsPerVisit, SCALE_LIMITS.unitsPerVisit.min, SCALE_LIMITS.unitsPerVisit.max, 0)
        );
        if (typeof parsed.treatmentName === 'string') {
          setTreatmentName(parsed.treatmentName.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 60));
        }
      }
      localStorage.removeItem(LEGACY_LEAD_CAPTURED_KEY);
    } catch (e) {
      console.warn('Could not load saved state', e);
    }
  }, []);

  // Save state to LocalStorage
  useEffect(() => {
    try {
      const stateToSave = {
        category,
        paymentPlatform,
        feeRatePct,
        treatmentType,
        sessions,
        price,
        wholesaleCost,
        hourlyOverhead,
        wasteCushionPct,
        commissionPct,
        treatmentsPerMonth,
        treatmentMinutes,
        targetPct,
        unitsPerVisit,
        treatmentName,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Could not save state', e);
    }
  }, [
    category,
    paymentPlatform,
    feeRatePct,
    treatmentType,
    sessions,
    price,
    wholesaleCost,
    hourlyOverhead,
    wasteCushionPct,
    commissionPct,
    treatmentsPerMonth,
    treatmentMinutes,
    targetPct,
    unitsPerVisit,
    treatmentName,
  ]);

  const calcInputs = {
    price,
    wholesaleCost,
    hourlyOverhead,
    feeRatePct,
    sessions,
    treatmentType,
    wasteCushionPct,
    commissionPct,
  };
  const metrics = calculateProfitPulseMetrics(calcInputs);
  const insights = calculateInsights(calcInputs, {
    treatmentsPerMonth,
    treatmentMinutes,
    targetPct,
    unitsPerVisit: category === 'injectables' ? unitsPerVisit : 0,
  });

  // One color for the dollar figure, the percentage, and the banner.
  const toneColor = ALERT_COLORS[metrics.alertLevel];

  const handleCategoryChange = (cat: Category) => {
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
      localStorage.removeItem(LEGACY_LEAD_CAPTURED_KEY);
    } catch (e) {
      /* storage may be blocked */
    }
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
    setTreatmentName('');
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);

  const formatWhole = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);

  const per = treatmentType === 'package' ? 'package' : 'treatment';

  const tabs: { id: Category; label: string }[] = [
    { id: 'injectables', label: 'Injectables' },
    { id: 'lasers', label: 'Lasers & Devices' },
    { id: 'facials', label: 'Facials & Skin' },
    { id: 'other', label: 'Other Treatment' },
  ];

  return (
    <main className="app-card">
      {/* Print-Only Diagnostic Header */}
      <div className="print-header-brand">
        <h1>MONIQUE REID BOOKKEEPING</h1>
        <p>Treatment Profitability Diagnostic</p>
        <p className="print-report-date">Report date: {new Date().toLocaleDateString('en-US')}</p>
        <p>
          Platform: {paymentPlatform} • Treatment:{' '}
          {category === 'other' && treatmentName.trim() ? treatmentName.trim() : category} • Structure:{' '}
          {treatmentType === 'single' ? 'Single visit' : `${sessions}-session package`}
        </p>
        <hr className="print-divider" />
      </div>

      <div className="header">
        <div className="header-top-bar">
          <span className="badge-pill">Clinic Unit Economics</span>
          <button type="button" className="reset-link-btn" onClick={handleReset} title="Reset to standard defaults">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
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
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={category === t.id}
            onClick={() => {
              engage();
              handleCategoryChange(t.id);
            }}
            className={`tab-btn ${category === t.id ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {category === 'other' && (
        <div className="input-group">
          <label className="label-text" htmlFor="treatment-name">
            What treatment is this? (optional)
          </label>
          <input
            id="treatment-name"
            className="manual-input"
            value={treatmentName}
            onChange={(e) => {
              engage();
              setTreatmentName(e.target.value.replace(/[\u0000-\u001F\u007F]/g, ''));
            }}
            maxLength={60}
            placeholder="For example: body contouring, IV therapy, weight loss"
            autoComplete="off"
          />
          <span className="label-sub print-hide" style={{ textAlign: 'left', display: 'block', marginTop: 4, color: '#94A3B8' }}>
            Enter your own numbers below. The starting values are only placeholders.
          </span>
        </div>
      )}

      {/* Payment Platform Dropdown */}
      <div className="input-group print-hide">
        <label className="label-text" htmlFor="platform-select">
          Choose Payment/Financing Platform
        </label>
        <select
          id="platform-select"
          className="manual-input"
          value={paymentPlatform}
          onChange={(e) => {
            engage();
            handlePlatformChange(e.target.value as PaymentPlatform);
          }}
        >
          <option value="Regular Card Processing (Stripe, Vagaro, Square)">
            Regular Card Processing (Stripe, Vagaro, Square)
          </option>
          <option value="Cherry Financing (6-Month No-Interest Plan)">⚡ Cherry Financing (6-Month No-Interest Plan)</option>
          <option value="Cherry Financing (12-Month Zero-Interest Split)">
            ⚡ Cherry Financing (12-Month Zero-Interest Split)
          </option>
          <option value="CareCredit Standard Doctor Fee Program">💳 CareCredit Standard Doctor Fee Program</option>
          <option value="PatientFi Base Promotion Rate Setup">🌸 PatientFi Base Promotion Rate Setup</option>
          <option value="Custom Platform Fee Override">🛠️ Custom Platform Fee Override</option>
        </select>
        <span className="label-sub" style={{ marginTop: '4px', display: 'block', color: '#94A3B8' }}>
          {paymentPlatform === 'Custom Platform Fee Override'
            ? 'Type your own rate in the fee box below. To find it: total fees you paid on your statement divided by total sales through that platform, times 100.'
            : `Placeholder rate: ${feeRatePct}%. Financing companies quote each practice its own fee, so replace this with the rate on your own statement.`}
        </span>
      </div>

      <div className="print-grid">
        {/* Fee Rate Input */}
        <div className="input-group">
          <label className="label-text" htmlFor="fee-rate">
            Effective Platform Fee Rate (%)
          </label>
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
              <button
                type="button"
                onClick={() => {
                  engage();
                  handleTreatmentTypeChange('single');
                }}
                className={`toggle-btn ${treatmentType === 'single' ? 'active' : ''}`}
                role="radio"
                aria-checked={treatmentType === 'single'}
              >
                Single Visit
              </button>
              <button
                type="button"
                onClick={() => {
                  engage();
                  handleTreatmentTypeChange('package');
                }}
                className={`toggle-btn ${treatmentType === 'package' ? 'active' : ''}`}
                role="radio"
                aria-checked={treatmentType === 'package'}
              >
                📦 Multi-Session
              </button>
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
          <label className="label-text" htmlFor="price">
            {treatmentType === 'package' ? `Total Package Price, All ${sessions} Visits ($)` : 'What Does the Client Pay You? ($)'}
          </label>
          <div className="currency-input-wrap">
            <span>$</span>
            <NumField id="price" className="manual-input" value={price} min={0} max={100000000} step={10} onChange={used(setPrice)} />
          </div>
        </div>

        <div className="input-group">
          <label className="label-text" htmlFor="wholesale">
            {treatmentType === 'package' ? 'Wholesale Cost of Products Per Visit ($)' : 'Wholesale Cost of Products/Boxes Used ($)'}
          </label>
          <div className="currency-input-wrap">
            <span>$</span>
            <NumField
              id="wholesale"
              className="manual-input"
              value={wholesaleCost}
              min={0}
              max={100000000}
              step={5}
              onChange={used(setWholesaleCost)}
            />
          </div>
        </div>

        <div className="input-group">
          <label className="label-text" htmlFor="overhead">
            Estimated Room Overhead per Visit ($)
          </label>
          <div className="currency-input-wrap">
            <span>$</span>
            <NumField
              id="overhead"
              className="manual-input"
              value={hourlyOverhead}
              min={0}
              max={100000000}
              step={5}
              onChange={used(setHourlyOverhead)}
            />
          </div>
        </div>
      </div>

      <div className="print-grid">
        {/* Sliders with Manual Number Inputs */}
        <div className="input-group">
          <div className="slider-header">
            <label className="label-text" htmlFor="waste-number" style={{ margin: 0 }}>
              Product Waste/Spill Cushion
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#020617',
                border: '1px solid #1E293B',
                borderRadius: '6px',
                padding: '2px 6px',
                maxWidth: '75px',
              }}
            >
              <NumField
                id="waste-number"
                value={wasteCushionPct}
                min={0}
                max={50}
                step={1}
                onChange={used(setWasteCushionPct)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: '#F5E6C4',
                  fontSize: '13px',
                  fontWeight: 700,
                  textAlign: 'right',
                  outline: 'none',
                }}
              />
              <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>%</span>
            </div>
          </div>
          <input
            type="range"
            aria-label="Product waste cushion percent"
            min="0"
            max="25"
            step="5"
            value={wasteCushionPct}
            onChange={(e) => {
              engage();
              setWasteCushionPct(parseFloat(e.target.value) || 0);
            }}
          />
        </div>

        <div className="input-group">
          <div className="slider-header">
            <label className="label-text" htmlFor="commission-number" style={{ margin: 0 }}>
              Provider Commission Cut
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#020617',
                border: '1px solid #1E293B',
                borderRadius: '6px',
                padding: '2px 6px',
                maxWidth: '75px',
              }}
            >
              <NumField
                id="commission-number"
                value={commissionPct}
                min={0}
                max={100}
                step={1}
                onChange={used(setCommissionPct)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: '#F5E6C4',
                  fontSize: '13px',
                  fontWeight: 700,
                  textAlign: 'right',
                  outline: 'none',
                }}
              />
              <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, marginLeft: '2px' }}>%</span>
            </div>
          </div>
          <input
            type="range"
            aria-label="Provider commission percent"
            min="0"
            max="50"
            step="5"
            value={commissionPct}
            onChange={(e) => {
              engage();
              setCommissionPct(parseFloat(e.target.value) || 0);
            }}
          />
        </div>
      </div>

      {/* Scale it up: turns one treatment into a yearly number and a price target */}
      <div className="scale-group">
        <p className="scale-title">
          Scale it up <span className="label-sub" style={{ marginLeft: 6 }}>optional</span>
        </p>
        <div className="input-group">
          <label className="label-text" htmlFor="per-month">
            How many {per === 'package' ? 'packages' : 'of these'} do you sell per month?
          </label>
          <NumField
            id="per-month"
            className="manual-input"
            value={treatmentsPerMonth}
            min={SCALE_LIMITS.treatmentsPerMonth.min}
            max={SCALE_LIMITS.treatmentsPerMonth.max}
            step={1}
            integer
            onChange={used(setTreatmentsPerMonth)}
          />
        </div>
        <div className="input-group">
          <label className="label-text" htmlFor="minutes">
            Treatment time per visit (minutes)
          </label>
          <NumField
            id="minutes"
            className="manual-input"
            value={treatmentMinutes}
            min={SCALE_LIMITS.treatmentMinutes.min}
            max={SCALE_LIMITS.treatmentMinutes.max}
            step={5}
            onChange={used(setTreatmentMinutes)}
          />
          <span className="label-sub" style={{ textAlign: 'left', display: 'block', marginTop: 4, color: '#94A3B8' }}>
            Placeholder time. Replace it with how long this really takes your provider.
          </span>
        </div>
        <div className="input-group">
          <label className="label-text" htmlFor="target-pct">
            Contribution percentage you want to reach (%)
          </label>
          <NumField
            id="target-pct"
            className="manual-input"
            value={targetPct}
            min={SCALE_LIMITS.targetPct.min}
            max={SCALE_LIMITS.targetPct.max}
            step={1}
            onChange={used(setTargetPct)}
          />
        </div>
        {category === 'injectables' && (
          <div className="input-group">
            <label className="label-text" htmlFor="units">
              Units used per visit (Botox, filler and similar)
            </label>
            <NumField
              id="units"
              className="manual-input"
              value={unitsPerVisit}
              min={SCALE_LIMITS.unitsPerVisit.min}
              max={SCALE_LIMITS.unitsPerVisit.max}
              step={1}
              onChange={used(setUnitsPerVisit)}
            />
            <span className="label-sub" style={{ textAlign: 'left', display: 'block', marginTop: 4, color: '#94A3B8' }}>
              Leave at 0 to skip the per-unit view.
            </span>
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
          <div
            className="result-row"
            style={{ display: 'flex', borderTop: '1px dashed rgba(212, 175, 55, 0.3)', paddingTop: '6px', color: '#D4AF37' }}
          >
            <span>Contribution Per Visit ({sessions} visits)</span>
            <span>{formatCurrency(metrics.takeawayPerVisit)}</span>
          </div>
        )}
      </div>

      {/* Yearly impact, price check, hourly view, per-unit view */}
      <div className="results-panel insights-panel" aria-label="Yearly impact and price check">
        {insights.yearlyContribution !== null ? (
          <div className="result-row">
            <span>
              Estimated yearly contribution ({treatmentsPerMonth} {per === 'package' ? 'packages' : 'treatments'} a month)
            </span>
            <span style={{ color: toneColor }}>{formatWhole(insights.yearlyContribution)}</span>
          </div>
        ) : (
          <div className="result-row">
            <span>Enter how many you sell per month to see your yearly number.</span>
            <span />
          </div>
        )}
        {insights.contributionPerHour !== null && (
          <div className="result-row">
            <span>Estimated contribution per treatment hour ({treatmentMinutes} min per visit)</span>
            <span>{formatCurrency(insights.contributionPerHour)}</span>
          </div>
        )}
        {insights.perUnit && (
          <div className="result-row">
            <span>
              Per unit: client pays {formatCurrency(insights.perUnit.price)}, product costs {formatCurrency(insights.perUnit.cost)}, you keep
            </span>
            <span>{formatCurrency(insights.perUnit.contribution)}</span>
          </div>
        )}
        {insights.priceCheck === 'raise' && insights.targetPrice !== null && (
          <p className="price-check">
            <strong>Price check:</strong> to reach {targetPct}% contribution, this {per} would need to be about{' '}
            <strong>{formatCurrency(insights.targetPrice)}</strong>
            {insights.priceIncreasePct !== null && <> ({insights.priceIncreasePct}% more than today)</>}.
            {insights.extraYearlyCash !== null && (
              <>
                {' '}
                If your volume held steady, that is roughly <strong>{formatWhole(insights.extraYearlyCash)} more a year</strong>.
              </>
            )}
          </p>
        )}
        {insights.priceCheck === 'stretch' && insights.targetPrice !== null && (
          <p className="price-check">
            <strong>Price check:</strong> reaching {targetPct}% by price alone would take about{' '}
            <strong>{formatCurrency(insights.targetPrice)}</strong>, which is a very big jump. Look at product cost, payment fees, provider
            pay and room cost first.
          </p>
        )}
        {insights.priceCheck === 'meets' && (
          <p className="price-check">
            <strong>Price check:</strong> this {per} already reaches your {targetPct}% target.
          </p>
        )}
        {insights.priceCheck === 'impossible' && (
          <p className="price-check">
            <strong>Price check:</strong> platform fees and provider commission alone take {insights.feePlusCommissionPct}% of the price, so a{' '}
            {targetPct}% target cannot be reached by price alone. Look at the fee rate or the commission first.
          </p>
        )}
        <p className="threshold-note" style={{ marginTop: 6 }}>
          Yearly figures assume the same price, costs and volume every month. They are estimates for planning, not forecasts.
        </p>
      </div>

      {/* Dynamic Accessible Contribution Alert Banner */}
      <div className={`alert-box alert-${metrics.alertLevel}`} role="status" style={{ display: 'block', marginTop: '16px' }}>
        <strong>
          <span className="emoji-icon" aria-hidden="true">
            {metrics.alertLevel === 'red' ? '🚨 ' : metrics.alertLevel === 'amber' ? '🟡 ' : '🟢 '}
          </span>
          {metrics.alertLevel === 'red'
            ? 'Profitability Concern: '
            : metrics.alertLevel === 'amber'
            ? 'Margin Squeeze: '
            : 'Strong Contribution: '}
        </strong>
        {metrics.alertMessage}
      </div>
      <p className="threshold-note">{ALERT_THRESHOLD_NOTE}</p>

      {metrics.showDeferredWarning && (
        <div className="alert-box alert-warning" role="status" style={{ display: 'block', marginTop: '10px' }}>
          {metrics.deferredWarningText}
        </div>
      )}

      <div className="print-assumptions">
        <strong>Assumptions and limitations</strong>
        <p>{ASSUMPTIONS_TEXT}</p>
        <p className="print-signature">Monique Reid Bookkeeping • Secure Virtual Solutions</p>
      </div>

      <p className="privacy-note">
        Your calculator entries are saved only in this browser. We count visits without recording who you are.
        {PRIVACY_URL && (
          <>
            {' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              Privacy policy
            </a>
          </>
        )}
      </p>
      <p className="footer-text">
        DISCLAIMER: Estimates are generated based on your manual inputs for planning and discussion with your accountant. Not a CPA audit,
        tax, or legal opinion.
        <br />
        MONIQUE REID BOOKKEEPING • SECURE VIRTUAL SOLUTIONS
      </p>
    </main>
  );
}
