import { ReactNode, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const REFRESH_THRESHOLD = 64;
const MAX_PULL = 96;

export default function GlobalPullToRefresh({ children }: { children: ReactNode }) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const finishRefresh = async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);
      distanceRef.current = 58;
      setDistance(58);
      try {
        const response = await fetch(`/api/version?pull=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Update check failed');
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map(name => caches.delete(name)));
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(registration => registration.unregister().catch(() => false)));
        }
        await new Promise(resolve => window.setTimeout(resolve, 350));
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
      if (!refreshingRef.current && window.scrollY <= 0 && event.touches.length === 1) startYRef.current = event.touches[0].clientY;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (startYRef.current === null || refreshingRef.current) return;
      const rawDistance = event.touches[0].clientY - startYRef.current;
      if (rawDistance <= 0 || window.scrollY > 0) return;
      event.preventDefault();
      const nextDistance = Math.min(MAX_PULL, rawDistance * 0.46);
      distanceRef.current = nextDistance;
      setDistance(nextDistance);
    };
    const onTouchEnd = () => {
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
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const visible = distance > 0 || refreshing;
  const rotation = Math.min(300, (distance / REFRESH_THRESHOLD) * 300);
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#020012]">
      {visible && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex h-14 items-center justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg shadow-black/30">
            <div
              className={`h-5 w-5 rounded-full border-[3px] border-blue-500 border-t-transparent ${refreshing ? 'animate-spin' : ''}`}
              style={{ transform: refreshing ? undefined : `rotate(${rotation}deg)` }}
            />
          </div>
        </div>
      )}
      <div
        style={{ transform: `translateY(${distance}px)` }}
        className={refreshing || distance === 0 ? 'transition-transform duration-200 ease-out' : ''}
      >
        {children}
      </div>
    </div>
  );
}
