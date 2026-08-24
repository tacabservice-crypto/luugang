import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const REFRESH_THRESHOLD = 58;
const MAX_PULL = 82;

export default function GlobalPullToRefresh({ children }: { children: ReactNode }) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const overlayIsOpen = () => document.body.dataset.ludosomOverlayOpen === 'true'
      || document.body.dataset.ludosomPullRefreshBlocked === 'true';
    const cancelPull = () => {
      startYRef.current = null;
      distanceRef.current = 0;
      setDistance(0);
    };
    const finishRefresh = async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);
      distanceRef.current = 54;
      setDistance(54);
      try {
        const response = await fetch(`/api/version?pull=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Update check failed');
        const versionData = await response.json() as { version?: string };
        const incomingVersion = String(versionData.version || '').trim();
        const currentVersion = String(localStorage.getItem('ludosom_deploy_version') || '').trim();

        // A normal pull should only refresh the current view. Reloading the
        // WebView when nothing changed causes a blank-page flash on Android.
        if (!incomingVersion || incomingVersion === currentVersion) {
          refreshingRef.current = false;
          setRefreshing(false);
          distanceRef.current = 0;
          setDistance(0);
          window.dispatchEvent(new Event('ludosom:pull-refresh'));
          return;
        }

        localStorage.setItem('ludosom_deploy_version', incomingVersion);
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map(name => caches.delete(name)));
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(registration => registration.unregister().catch(() => false)));
        }
        // Close the pull surface before applying an actual new deployment so
        // no exposed strip can cover the sticky header during navigation.
        distanceRef.current = 0;
        setDistance(0);
        await new Promise(resolve => window.setTimeout(resolve, 300));
        sessionStorage.setItem('ludosom_pull_refresh_boot', '1');
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('app_refresh', Date.now().toString());
        window.location.replace(nextUrl.toString());
      } catch {
        refreshingRef.current = false;
        setRefreshing(false);
        distanceRef.current = 0;
        setDistance(0);
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      if (overlayIsOpen()) {
        cancelPull();
        return;
      }
      if (!refreshingRef.current && window.scrollY <= 0 && event.touches.length === 1) startYRef.current = event.touches[0].clientY;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (overlayIsOpen()) {
        cancelPull();
        return;
      }
      if (startYRef.current === null || refreshingRef.current) return;
      const rawDistance = event.touches[0].clientY - startYRef.current;
      if (rawDistance <= 0 || window.scrollY > 0) return;
      event.preventDefault();
      // Progressive resistance keeps the motion light and native-feeling.
      const nextDistance = Math.min(MAX_PULL, Math.pow(rawDistance, 0.82) * 0.72);
      distanceRef.current = nextDistance;
      setDistance(nextDistance);
    };
    const onTouchEnd = () => {
      if (overlayIsOpen()) {
        cancelPull();
        return;
      }
      if (startYRef.current === null) return;
      startYRef.current = null;
      if (distanceRef.current >= REFRESH_THRESHOLD) void finishRefresh();
      else {
        distanceRef.current = 0;
        setDistance(0);
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('ludosom:overlay-lock', cancelPull);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('ludosom:overlay-lock', cancelPull);
    };
  }, []);

  const visible = distance > 0 || refreshing;
  const rotation = Math.min(300, (distance / REFRESH_THRESHOLD) * 300);
  const contentOffset = Math.min(42, distance * 0.58);
  return (
    <>
      <style>{`
        .ludosom-pull-surface > * main {
          transform: translateY(var(--ludosom-content-pull, 0px));
          will-change: transform;
        }
        .ludosom-pull-settling > * main {
          transition: transform 300ms ease-out;
        }
      `}</style>
      {visible && (
        <div
          className="pointer-events-none fixed inset-x-0 top-[66px] z-[200] flex h-9 items-start justify-center"
          style={{ opacity: Math.min(1, distance / 24) }}
        >
          <div
            className={`h-7 w-7 rounded-full drop-shadow-[0_0_7px_rgba(168,85,247,0.75)] ${refreshing ? 'animate-spin' : ''}`}
            style={{
              background: 'conic-gradient(from 20deg, #facc15, #a855f7, #3b82f6, transparent 82%)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0)',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0)',
              transform: refreshing ? undefined : `rotate(${rotation}deg)`,
            }}
          />
        </div>
      )}
      <div
        className={`ludosom-pull-surface ${refreshing || distance === 0 ? 'ludosom-pull-settling' : ''}`}
        style={{ '--ludosom-content-pull': `${contentOffset}px` } as CSSProperties}
      >
        {children}
      </div>
    </>
  );
}
