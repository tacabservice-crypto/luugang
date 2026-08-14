import React, { useEffect, useState } from 'react';
import { PlatformAdSettings } from '../types/game';

export default function LiveAdBanner({ placement }: { placement: 'dashboard' | 'game' }) {
  const [ad, setAd] = useState<PlatformAdSettings | null>(null);
  const [visible, setVisible] = useState(false);
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
    const show = () => { setVisible(true); hideTimer = setTimeout(() => setVisible(false), (ad.durationSeconds || 3) * 1000); };
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
  if (!visible || !ad) return null;
  if (ad.format === 'adsense' && ad.adsenseClient && ad.adsenseSlot) return <div className="fixed inset-x-0 top-0 z-[100] bg-white shadow-xl"><ins className="adsbygoogle block min-h-12" data-ad-client={ad.adsenseClient} data-ad-slot={ad.adsenseSlot} data-ad-format="horizontal" data-full-width-responsive="true" /></div>;
  const content = <div className={`mx-auto flex max-w-2xl items-center justify-center gap-3 px-4 py-2 text-center text-white ${ad.format === 'ticker' ? 'animate-pulse' : ''}`}>
    {ad.imageUrl && <img src={ad.imageUrl} alt="" className="h-9 w-9 rounded object-cover"/>}<div><span className="block text-[10px] font-bold uppercase text-yellow-300">{ad.companyName || 'Sponsored'}</span><strong className="text-sm">{ad.title}</strong>{ad.message && <span className="ml-2 text-xs text-slate-200">{ad.message}</span>}</div>
  </div>;
  return <div className="fixed inset-x-0 top-0 z-[100] border-b border-yellow-400/30 bg-slate-950/95 shadow-xl backdrop-blur">{ad.linkUrl ? <a href={ad.linkUrl} target="_blank" rel="noreferrer">{content}</a> : content}</div>;
}
