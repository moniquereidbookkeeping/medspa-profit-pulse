/**
 * Tiny, privacy-friendly event tracking.
 *
 * Nothing is sent unless you turn it on. Two ways:
 *  1. Easiest: in the Cloudflare dashboard, enable Web Analytics for this Pages project (page views, no code).
 *  2. For funnel events (calculator used, review requested, CTA clicked): set VITE_PLAUSIBLE_DOMAIN in the
 *     Cloudflare Pages build variables to your Plausible domain (optionally VITE_ANALYTICS_SCRIPT_SRC for a
 *     self-hosted script). Events also go to Google Analytics if a `gtag` is already on the page.
 *
 * Never put names, emails, phone numbers, or dollar amounts in event properties.
 */
type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: ((event: string, options?: { props?: EventProps }) => void) & { q?: unknown[] };
    gtag?: (...args: unknown[]) => void;
  }
}

export function loadAnalytics(): void {
  try {
    const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
    if (!domain || typeof document === 'undefined') return;
    if (document.querySelector('script[data-medspa-analytics]')) return;

    // Queue events fired before the script finishes loading.
    window.plausible = window.plausible || Object.assign(
      (...args: unknown[]) => { (window.plausible!.q = window.plausible!.q || []).push(args); },
      { q: [] as unknown[] }
    ) as Window['plausible'];

    const script = document.createElement('script');
    script.defer = true;
    script.setAttribute('data-domain', domain);
    script.setAttribute('data-medspa-analytics', 'true');
    script.src = (import.meta.env.VITE_ANALYTICS_SCRIPT_SRC as string | undefined) || 'https://plausible.io/js/script.js';
    document.head.appendChild(script);
  } catch (error) {
    console.warn('Analytics could not be started', error);
  }
}

export function track(event: string, props?: EventProps): void {
  try {
    window.plausible?.(event, props ? { props } : undefined);
    window.gtag?.('event', event, props);
  } catch {
    /* analytics must never break the calculator */
  }
}
