import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstile(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    if (!document.querySelector('script[data-turnstile]')) {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-turnstile', 'true');
      document.head.appendChild(script);
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.turnstile) { clearInterval(timer); resolve(); }
      else if (Date.now() - started > 10000) { clearInterval(timer); reject(new Error('Turnstile did not load')); }
    }, 100);
  });
}

interface Props {
  siteKey: string;
  onToken: (token: string) => void;
  /** Called when the check could not load or errored (some in-app browsers block it). */
  onProblem?: (problem: boolean) => void;
  /** Increase this number to ask for a fresh check (after a failed submit). */
  resetSignal: number;
}

/** Cloudflare Turnstile bot check. Only rendered when the server's /api/config says protection is on. */
export default function Turnstile({ siteKey, onToken, onProblem, resetSignal }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !host.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(host.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (token: string) => { onProblem?.(false); onToken(token); },
          'expired-callback': () => onToken(''),
          'error-callback': () => { onToken(''); onProblem?.(true); }
        });
      })
      .catch(() => { onToken(''); onProblem?.(true); });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal > 0 && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      onToken('');
    }
  }, [resetSignal]);

  return <div ref={host} style={{ minHeight: 65 }} />;
}
