import { Capacitor } from '@capacitor/core';

const configuredApiOrigin = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const nativeApiOrigin = String(import.meta.env.VITE_NATIVE_API_BASE_URL || configuredApiOrigin || 'https://ludosom.com')
  .trim()
  .replace(/\/$/, '');

export function apiUrl(value: string): string {
  if (!Capacitor.isNativePlatform()) return value;
  if (value.startsWith('/api/')) return `${nativeApiOrigin}${value}`;
  try {
    const parsed = new URL(value, nativeApiOrigin);
    if (parsed.pathname.startsWith('/api/')) {
      return `${nativeApiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Non-URL values are passed through to the browser unchanged.
  }
  return value;
}

export function installNativeApiBridge(): void {
  if (!Capacitor.isNativePlatform() || typeof window === 'undefined') return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return originalFetch(apiUrl(input), init);
    if (input instanceof URL) return originalFetch(new URL(apiUrl(input.pathname + input.search), nativeApiOrigin), init);
    if (input instanceof Request) {
      const requestUrl = new URL(input.url);
      if (requestUrl.pathname.startsWith('/api/')) {
        return originalFetch(new Request(`${nativeApiOrigin}${requestUrl.pathname}${requestUrl.search}`, input), init);
      }
    }
    return originalFetch(input, init);
  }) as typeof window.fetch;

  const OriginalEventSource = window.EventSource;
  window.EventSource = class NativeApiEventSource extends OriginalEventSource {
    constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
      const value = typeof url === 'string' ? url : url.toString();
      super(apiUrl(value), eventSourceInitDict);
    }
  } as typeof window.EventSource;
}

installNativeApiBridge();
