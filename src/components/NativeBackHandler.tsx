import { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';

export const NATIVE_BACK_EVENT = 'ludosom:native-back';

export default function NativeBackHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showExitHint, setShowExitHint] = useState(false);
  const lastRootBackAtRef = useRef(0);
  const exitHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let removeListener: (() => Promise<void>) | undefined;

    void CapacitorApp.addListener('backButton', () => {
      const backEvent = new Event(NATIVE_BACK_EVENT, { cancelable: true });
      window.dispatchEvent(backEvent);
      if (backEvent.defaultPrevented) return;

      const isHome = location.pathname === '/' && !location.search && !location.hash;
      if (!isHome) {
        const historyIndex = Number(window.history.state?.idx ?? 0);
        if (historyIndex > 0) navigate(-1);
        else navigate('/', { replace: true });
        return;
      }

      const now = Date.now();
      if (now - lastRootBackAtRef.current <= 2_000) {
        void CapacitorApp.exitApp();
        return;
      }
      lastRootBackAtRef.current = now;
      setShowExitHint(true);
      if (exitHintTimerRef.current) window.clearTimeout(exitHintTimerRef.current);
      exitHintTimerRef.current = window.setTimeout(() => setShowExitHint(false), 2_000);
    }).then(handle => {
      if (disposed) void handle.remove();
      else removeListener = () => handle.remove();
    });

    return () => {
      disposed = true;
      if (exitHintTimerRef.current) window.clearTimeout(exitHintTimerRef.current);
      void removeListener?.();
    };
  }, [location.hash, location.pathname, location.search, navigate]);

  if (!showExitHint) return null;
  return <div className="fixed inset-x-0 bottom-8 z-[300] flex justify-center px-4"><div className="rounded-xl border border-white/10 bg-slate-950/95 px-4 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur-xl">Mar kale Back u taabo si aad app-ka uga baxdo</div></div>;
}
