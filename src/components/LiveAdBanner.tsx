import React, { useEffect, useRef, useState } from 'react';
import { PlatformAdSettings } from '../types/game';

export default function LiveAdBanner({ placement }: { placement: 'dashboard' | 'game' }) {
  const [ad, setAd] = useState<PlatformAdSettings | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    fetch('/api/ads/active').then(r => r.ok ? r.json() : null).then(setAd).catch(() => {});
    const events = new EventSource('/api/updates?userId=ads_client');
    const update = (event: MessageEvent) => { try { setAd(JSON.parse(event.data)); } catch {} };
    events.addEventListener('ad_settings_updated', update);
    return () => events.close();
  }, []);
  useEffect(() => {
    if (!ad?.enabled || (ad.placement !== 'all' && ad.placement !== placement)) return;
    let hideTimer: ReturnType<typeof setTimeout>;
    const durationSeconds = Math.max(1, Math.min(180, Number(ad.durationSeconds) || 3));
    const show = () => { clearTimeout(hideTimer); suppressClick.current = false; setDismissing(false); setVisible(true); hideTimer = setTimeout(() => setVisible(false), durationSeconds * 1000); };
    show(); const interval = setInterval(show, Math.max(10, ad.intervalSeconds || 60) * 1000);
    return () => { clearInterval(interval); clearTimeout(hideTimer); };
  }, [ad, placement]);
  useEffect(() => {
    if (!visible || ad?.format !== 'adsense' || !ad.adsenseClient || !ad.adsenseSlot) return;
    const scriptId = 'ludosom-adsense-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script'); script.id = scriptId; script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ad.adsenseClient)}`;
      script.crossOrigin = 'anonymous'; document.head.appendChild(script);
    }
    const timer = setTimeout(() => { try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch {} }, 250);
    return () => clearTimeout(timer);
  }, [visible, ad]);
  useEffect(() => {
    if (!dismissing) return;
    const timer = setTimeout(() => setVisible(false), 260);
    return () => clearTimeout(timer);
  }, [dismissing]);
  if (!visible || !ad) return null;
  const swipeProps = {
    onTouchStart: (event: React.TouchEvent) => { touchStartY.current = event.touches[0]?.clientY ?? null; suppressClick.current = false; },
    onTouchEnd: (event: React.TouchEvent) => {
      const endY = event.changedTouches[0]?.clientY;
      if (touchStartY.current !== null && endY !== undefined && touchStartY.current - endY >= 35) {
        suppressClick.current = true;
        setDismissing(true);
      }
      touchStartY.current = null;
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (!suppressClick.current) return;
      event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
    },
  };
  const shellClass = `fixed inset-x-0 top-0 z-[100] touch-pan-y transition-transform duration-300 ease-out ${dismissing ? '-translate-y-full' : 'translate-y-0'}`;
  const swipeHandle = <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/40" />;
  if (ad.format === 'adsense' && ad.adsenseClient && ad.adsenseSlot) return <div {...swipeProps} className={`${shellClass} bg-white pb-1 shadow-xl`}><ins className="adsbygoogle block min-h-12" data-ad-client={ad.adsenseClient} data-ad-slot={ad.adsenseSlot} data-ad-format="horizontal" data-full-width-responsive="true" />{swipeHandle}</div>;
  if (ad.format === 'ticker') {
    const tickerSeconds = Math.max(12, Math.min(40, 12 + `${ad.companyName || ''}${ad.title || ''}${ad.message || ''}`.length * 0.08));
    const ticker = <div className="ludosom-ticker-track inline-flex items-center gap-3 whitespace-nowrap px-4 py-2 text-white" style={{ animationDuration: `${tickerSeconds}s` }}>
      {ad.imageUrl && <img src={ad.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover"/>}
      <div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase text-yellow-300">{ad.companyName || 'Sponsored'}</span><strong className="text-sm">{ad.title}</strong>{ad.message && <span className="text-xs text-slate-200">{ad.message}</span>}</div>
    </div>;
    return <div {...swipeProps} className={`${shellClass} overflow-hidden border-b border-yellow-400/30 bg-slate-950/95 pb-1 shadow-xl backdrop-blur`}>{ad.linkUrl ? <a href={ad.linkUrl} target="_blank" rel="noreferrer" className="block w-max">{ticker}</a> : ticker}{swipeHandle}</div>;
  }
  const content = <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 px-4 py-2 text-center text-white">
    {ad.imageUrl && <img src={ad.imageUrl} alt="" className="h-9 w-9 rounded object-cover"/>}<div><span className="block text-[10px] font-bold uppercase text-yellow-300">{ad.companyName || 'Sponsored'}</span><strong className="text-sm">{ad.title}</strong>{ad.message && <span className="ml-2 text-xs text-slate-200">{ad.message}</span>}</div>
  </div>;
  return <div {...swipeProps} className={`${shellClass} border-b border-yellow-400/30 bg-slate-950/95 pb-1 shadow-xl backdrop-blur`}>{ad.linkUrl ? <a href={ad.linkUrl} target="_blank" rel="noreferrer">{content}</a> : content}{swipeHandle}</div>;
}
