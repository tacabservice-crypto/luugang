import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  resetKey: number;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}

const SCRIPT_ID = 'cloudflare-turnstile-script';

export default function TurnstileWidget({ siteKey, resetKey, onToken, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);

  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let widgetId = '';
    let cancelled = false;

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      containerRef.current.innerHTML = '';
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        size: 'flexible',
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => { onTokenRef.current(''); onErrorRef.current('Security check expired. Please try again.'); },
        'error-callback': () => { onTokenRef.current(''); onErrorRef.current('Security check failed. Please refresh and try again.'); },
      });
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (window.turnstile) render();
    else if (existing) existing.addEventListener('load', render, { once: true });
    else {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = render;
      script.onerror = () => onErrorRef.current('Security check could not load. Check your connection.');
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      existing?.removeEventListener('load', render);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey]);

  if (!siteKey) return <p className="text-center text-xs text-amber-300">Phone registration is temporarily unavailable.</p>;
  return <div ref={containerRef} className="mx-auto w-full overflow-hidden rounded-lg" />;
}
