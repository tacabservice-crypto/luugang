import React, { useEffect, useRef, useState } from 'react';
import { PlatformAdSettings } from '../types/game';

type Entrance = 'scale' | 'slide-left' | 'slide-right' | 'drop';

const entranceClasses: Record<Entrance, string> = {
  scale: 'ludosom-ad-enter-scale',
  'slide-left': 'ludosom-ad-enter-left',
  'slide-right': 'ludosom-ad-enter-right',
  drop: 'ludosom-ad-enter-drop',
};

function videoSource(rawUrl?: string) {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be' || host.endsWith('youtube.com')) {
      const id = host === 'youtu.be' ? url.pathname.split('/').filter(Boolean)[0] : url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      if (id && /^[\w-]{6,}$/.test(id)) return { kind: 'embed' as const, url: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0` };
    }
    if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch') {
      return { kind: 'embed' as const, url: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(value)}&autoplay=true&show_text=false` };
    }
    if (/\.(mp4|webm|ogg)(?:$|[?#])/i.test(value)) return { kind: 'direct' as const, url: value };
  } catch {}
  return null;
}

export default function LiveAdBanner({ placement }: { placement: 'dashboard' | 'game' }) {
  const [campaigns, setCampaigns] = useState<PlatformAdSettings[]>([]);
  const [ad, setAd] = useState<PlatformAdSettings | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [entrance, setEntrance] = useState<Entrance>('scale');
  const touchStartY = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const rotation = useRef(0);
  const lastShown = useRef<Record<string, number>>({});

  useEffect(() => {
    const receive = (value: unknown) => setCampaigns(Array.isArray(value) ? value : value && typeof value === 'object' ? [value as PlatformAdSettings] : []);
    fetch('/api/ads/active').then(r => r.ok ? r.json() : null).then(receive).catch(() => {});
    const events = new EventSource('/api/updates?userId=ads_client');
    const update = (event: MessageEvent) => { try { receive(JSON.parse(event.data)); } catch {} };
    events.addEventListener('ad_settings_updated', update);
    return () => events.close();
  }, []);

  useEffect(() => {
    let stopped = false;
    let hideTimer: ReturnType<typeof setTimeout>;
    let nextTimer: ReturnType<typeof setTimeout>;
    const transitions: Entrance[] = ['scale', 'slide-left', 'slide-right', 'drop'];
    const showNext = () => {
      if (stopped) return;
      const now = Date.now();
      const eligible = campaigns.filter(campaign => {
        if (!campaign.enabled || (campaign.placement !== 'all' && campaign.placement !== placement)) return false;
        if (campaign.startAt && now < campaign.startAt) return false;
        if (campaign.endAt && now >= campaign.endAt) return false;
        const previous = lastShown.current[String(campaign.id || '')] || 0;
        return now - previous >= Math.max(10, Number(campaign.intervalSeconds) || 60) * 1000;
      });
      if (!eligible.length) { setVisible(false); nextTimer = setTimeout(showNext, 1000); return; }
      const selected = eligible[rotation.current % eligible.length];
      rotation.current += 1;
      lastShown.current[String(selected.id || rotation.current)] = now;
      const durationSeconds = Math.max(1, Math.min(180, Number(selected.durationSeconds) || 3));
      setAd(selected);
      suppressClick.current = false;
      setEntrance(transitions[Math.floor(Math.random() * transitions.length)]);
      setDismissing(false);
      setVisible(true);
      hideTimer = setTimeout(() => setDismissing(true), durationSeconds * 1000);
      nextTimer = setTimeout(() => { setVisible(false); nextTimer = setTimeout(showNext, 350); }, durationSeconds * 1000 + 300);
    };
    showNext();
    return () => { stopped = true; clearTimeout(hideTimer); clearTimeout(nextTimer); };
  }, [campaigns, placement]);

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
    const timer = setTimeout(() => setVisible(false), 280);
    return () => clearTimeout(timer);
  }, [dismissing]);

  if (!visible || !ad) return null;
  const dismiss = () => setDismissing(true);
  const swipeProps = {
    onTouchStart: (event: React.TouchEvent) => { touchStartY.current = event.touches[0]?.clientY ?? null; suppressClick.current = false; },
    onTouchEnd: (event: React.TouchEvent) => {
      const endY = event.changedTouches[0]?.clientY;
      if (touchStartY.current !== null && endY !== undefined && touchStartY.current - endY >= 35) {
        suppressClick.current = true;
        dismiss();
      }
      touchStartY.current = null;
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (!suppressClick.current) return;
      event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
    },
  };
  const closeButton = <button type="button" onClick={dismiss} aria-label="Close advertisement" className="absolute -right-2 -top-2 z-20 grid h-8 w-8 place-items-center rounded-full border border-white/30 bg-slate-950 text-xl font-bold leading-none text-white shadow-lg transition hover:scale-110 hover:bg-red-600">×</button>;
  const swipeHandle = <div aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/40" />;
  const exitClass = dismissing ? 'ludosom-ad-exit-up' : entranceClasses[entrance];

  if (ad.format === 'ticker') {
    const tickerSeconds = Math.max(12, Math.min(40, 12 + `${ad.companyName || ''}${ad.title || ''}${ad.message || ''}`.length * 0.08));
    const ticker = <div className="ludosom-ticker-track inline-flex items-center gap-3 whitespace-nowrap px-4 py-2 text-white" style={{ animationDuration: `${tickerSeconds}s` }}>
      {ad.imageUrl && <img src={ad.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover"/>}
      <div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase text-yellow-300">{ad.companyName || 'Sponsored'}</span><strong className="text-sm">{ad.title}</strong>{ad.message && <span className="text-xs text-slate-200">{ad.message}</span>}</div>
    </div>;
    return <div {...swipeProps} className={`fixed inset-x-0 top-0 z-[100] touch-pan-y overflow-hidden border-b border-yellow-400/30 bg-slate-950/95 pb-1 shadow-xl backdrop-blur ${dismissing ? 'ludosom-ad-exit-up' : ''}`}>{ad.linkUrl ? <a href={ad.linkUrl} target="_blank" rel="noreferrer" className="block w-max">{ticker}</a> : ticker}<button type="button" onClick={dismiss} aria-label="Close notice" className="absolute right-2 top-1/2 z-20 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-lg text-white">×</button>{swipeHandle}</div>;
  }

  const mediaUrl = ad.imageUrl || (videoSource(ad.linkUrl) ? ad.linkUrl : '');
  const video = videoSource(mediaUrl);
  const media = video?.kind === 'embed'
    ? <iframe src={video.url} title={ad.title || 'Sponsored video'} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="aspect-video w-full border-0" />
    : video?.kind === 'direct'
      ? <video src={video.url} autoPlay muted playsInline loop controls className="aspect-video w-full bg-black object-contain" />
      : mediaUrl ? <img src={mediaUrl} alt={ad.title || 'Advertisement'} className="max-h-[52vh] w-full object-cover" /> : null;
  const details = <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-4 text-center text-white">
    <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">{ad.companyName || 'Sponsored'}</span>
    {ad.title && <h3 className="mt-2 text-xl font-black leading-tight">{ad.title}</h3>}
    {ad.message && <p className="mt-1 text-sm leading-relaxed text-slate-300">{ad.message}</p>}
    {ad.linkUrl && !videoSource(ad.linkUrl) && <span className="mt-3 inline-flex rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-5 py-2 text-xs font-black text-slate-950 shadow-lg">Learn more</span>}
  </div>;

  return <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-5 backdrop-blur-sm transition-opacity ${dismissing ? 'opacity-0' : 'opacity-100'}`}>
    <section {...swipeProps} className={`relative max-h-[88vh] w-full max-w-md touch-pan-y overflow-visible rounded-3xl border border-white/15 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] ${exitClass}`}>
      {closeButton}
      <div className="overflow-hidden rounded-3xl">
        {ad.format === 'adsense' && ad.adsenseClient && ad.adsenseSlot
          ? <div className="min-h-28 bg-white p-3"><ins className="adsbygoogle block min-h-24" data-ad-client={ad.adsenseClient} data-ad-slot={ad.adsenseSlot} data-ad-format="rectangle" data-full-width-responsive="true" /></div>
          : ad.linkUrl && !videoSource(ad.linkUrl)
            ? <a href={ad.linkUrl} target="_blank" rel="noreferrer" className="block">{media}{details}</a>
            : <>{media}{details}</>}
      </div>
      {swipeHandle}
    </section>
  </div>;
}
