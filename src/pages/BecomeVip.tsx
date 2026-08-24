import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Crown, ShieldCheck, Sparkles, Trophy, Wallet } from 'lucide-react';
import { useAuth } from '../firebase-client';
import { userErrorMessage } from '../utils/userError';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

interface VipTier {
  name: string;
  price: number;
  durationMonths: number;
  rakeDiscount: number;
  features: string[];
}

const tierStyles: Record<string, { icon: string; accent: string; border: string; button: string }> = {
  silver: { icon: '🥈', accent: 'text-slate-200', border: 'border-slate-400/30', button: 'from-slate-300 to-slate-500' },
  gold: { icon: '👑', accent: 'text-amber-300', border: 'border-amber-400/40', button: 'from-amber-300 to-orange-500' },
  platinum: { icon: '💎', accent: 'text-cyan-300', border: 'border-cyan-400/40', button: 'from-cyan-300 to-blue-500' },
  diamond: { icon: '✦', accent: 'text-fuchsia-300', border: 'border-fuchsia-400/40', button: 'from-fuchsia-400 to-purple-600' },
};

const fallbackVipTiers: Record<string, VipTier> = {
  silver: { name: 'Silver VIP', price: 4, durationMonths: 1, rakeDiscount: 0.01, features: ['VIP profile badge', '1% rake discount', 'Save $1 on every $100 prize pool'] },
  gold: { name: 'Gold VIP', price: 10, durationMonths: 1, rakeDiscount: 0.02, features: ['Gold profile badge', '2% rake discount', 'Save $2 on every $100 prize pool'] },
  platinum: { name: 'Platinum VIP', price: 25, durationMonths: 3, rakeDiscount: 0.04, features: ['Platinum profile badge', '4% rake discount', 'Save $4 on every $100 prize pool', '3 months of access'] },
  diamond: { name: 'Diamond VIP', price: 45, durationMonths: 6, rakeDiscount: 0.05, features: ['Diamond profile badge', '5% rake discount', 'Save $5 on every $100 prize pool', '6 months of access'] },
};

const BecomeVip: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [vipTiers, setVipTiers] = useState<Record<string, VipTier>>({});
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [processingTier, setProcessingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState('platinum');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/vip/tiers`)
      .then(async response => {
        if (!response.ok) throw new Error('VIP plans could not be loaded.');
        setVipTiers(await response.json());
      })
      .catch(() => setVipTiers(fallbackVipTiers))
      .finally(() => setLoadingTiers(false));
  }, []);

  const handleSubscribe = async (tier: string) => {
    if (!user?.idToken) {
      setError('Please log in before purchasing a VIP plan.');
      return;
    }
    setProcessingTier(tier);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/vip/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
        body: JSON.stringify({ tier }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'VIP purchase failed.');
      setMessage(data.message || 'VIP activated successfully.');
    } catch (err: any) {
      setError(userErrorMessage(err, 'VIP purchase failed.'));
    } finally {
      setProcessingTier(null);
    }
  };

  const activeVip = user?.vip && user.vip.expires > Date.now() ? user.vip : null;
  const tierEntries = Object.entries(vipTiers);
  const selectedEntry = tierEntries.find(([key]) => key === selectedTier) || tierEntries[0];
  const so = language === 'so';

  return (
    <main className="min-h-screen bg-[#09051d] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#4c1d9560,transparent_42%),radial-gradient(circle_at_bottom_right,#0369a140,transparent_35%)]" />
      <div className="relative max-w-6xl mx-auto px-4 pb-8 pt-3 sm:px-6 sm:py-10">
        <div className="sticky top-0 z-20 -mx-4 mb-5 flex items-center justify-between border-b border-white/10 bg-[#09051d]/90 px-4 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:mb-6 sm:border-0 sm:bg-transparent sm:p-0">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> {so ? 'Dib u noqo' : 'Back'}
          </button>
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-amber-300"><Crown className="h-4 w-4" /> VIP Club</span>
        </div>

        <section className="text-center max-w-3xl mx-auto mb-6 sm:mb-8">
          <div className="mx-auto mb-3 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-300 to-purple-600 grid place-items-center shadow-lg shadow-purple-600/30">
            <Crown className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-5xl font-black tracking-tight">{so ? 'Ciyaar badan. Hayso badan.' : 'Play more. Keep more.'}</h1>
          <p className="mt-2 text-sm text-slate-400">{so ? 'Dooro qorshe, dhimistiisuna si toos ah ayay u shaqaynaysaa.' : 'Pick a plan. Your discount works automatically.'}</p>
        </section>

        {activeVip && (
          <div className="mb-6 mx-auto max-w-3xl rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><ShieldCheck className="text-emerald-300" /><div><p className="font-black">Your {activeVip.tier} plan is active</p><p className="text-xs text-emerald-100/70">Valid until {new Date(activeVip.expires).toLocaleDateString()}</p></div></div>
            <span className="text-xs font-bold text-emerald-300">Benefits apply automatically</span>
          </div>
        )}

        {(message || error) && <div className={`mb-6 rounded-xl border px-4 py-3 text-sm font-bold ${error ? 'border-red-400/30 bg-red-500/10 text-red-300' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'}`}>{error || message}</div>}

        {loadingTiers ? (
          <div className="py-20 text-center text-slate-400">Loading VIP plans...</div>
        ) : (
          <>
          <div className="sm:hidden">
            <div className="grid grid-cols-2 gap-2">
              {tierEntries.map(([key, tier]) => {
                const style = tierStyles[key] || tierStyles.silver;
                const chosen = selectedEntry?.[0] === key;
                return <button key={key} onClick={() => setSelectedTier(key)} className={`relative rounded-2xl border p-3 text-left transition-all ${chosen ? `${style.border} bg-white/10 ring-2 ring-purple-400/50` : 'border-white/10 bg-white/[0.04]'}`}>
                  {key === 'platinum' && <span className="absolute right-2 top-2 rounded-full bg-cyan-300 px-1.5 py-0.5 text-[8px] font-black text-slate-950">{so ? 'UGU FIICAN' : 'BEST'}</span>}
                  <span className="text-xl">{style.icon}</span>
                  <p className={`mt-1 text-sm font-black ${style.accent}`}>{tier.name.replace(' VIP', '')}</p>
                  <div className="mt-1 flex items-baseline gap-1"><span className="text-xl font-black">${tier.price}</span><span className="text-[10px] text-slate-500">/{tier.durationMonths}{so ? ' bil' : ' mo'}</span></div>
                  <p className="mt-1 text-[10px] font-bold text-emerald-300">{Math.round(tier.rakeDiscount * 100)}% {so ? 'dhimis' : 'discount'}</p>
                </button>;
              })}
            </div>
            {selectedEntry && (() => {
              const [key, tier] = selectedEntry;
              const style = tierStyles[key] || tierStyles.silver;
              const isActive = activeVip?.tier === key;
              return <article className={`mt-3 rounded-3xl border ${style.border} bg-gradient-to-br from-white/[0.09] to-white/[0.03] p-4 shadow-2xl`}>
                <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{so ? 'Qorshaha la doortay' : 'Selected plan'}</p><h2 className={`mt-1 text-xl font-black ${style.accent}`}>{tier.name}</h2></div><div className="rounded-2xl bg-black/30 px-3 py-2 text-right"><p className="text-2xl font-black">${tier.price}</p><p className="text-[10px] text-slate-400">{tier.durationMonths} {so ? 'bilood' : tier.durationMonths === 1 ? 'month' : 'months'}</p></div></div>
                <div className="my-4 h-px bg-white/10" />
                <ul className="space-y-2">{tier.features.slice(0, 3).map(feature => <li key={feature} className="flex items-center gap-2 text-xs text-slate-300"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/15"><Check className="h-3 w-3 text-emerald-300" /></span>{feature}</li>)}</ul>
                <button onClick={() => handleSubscribe(key)} disabled={processingTier !== null} className={`mt-4 w-full rounded-2xl bg-gradient-to-r ${style.button} py-3.5 text-sm font-black text-white shadow-lg disabled:opacity-50`}>{processingTier === key ? (so ? 'Waa la hawlgelinayaa...' : 'Processing...') : isActive ? (so ? `Cusboonaysii $${tier.price}` : `Renew for $${tier.price}`) : (so ? `Dooro ${tier.name}` : `Choose ${tier.name}`)}</button>
              </article>;
            })()}
          </div>
          <div className="hidden sm:grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Object.entries(vipTiers).map(([key, tier]) => {
              const style = tierStyles[key] || tierStyles.silver;
              const isActive = activeVip?.tier === key;
              const perMonth = tier.price / tier.durationMonths;
              return (
                <article key={key} className={`relative flex flex-col rounded-3xl border ${style.border} bg-white/[0.06] backdrop-blur-xl p-5 shadow-2xl transition-transform hover:-translate-y-1 ${key === 'platinum' ? 'ring-2 ring-cyan-400/30' : ''}`}>
                  {key === 'platinum' && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-950">Best value</span>}
                  <div className="flex items-center justify-between"><span className="text-3xl">{style.icon}</span>{isActive && <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-black text-emerald-300">ACTIVE</span>}</div>
                  <h2 className={`mt-4 text-xl font-black ${style.accent}`}>{tier.name}</h2>
                  <div className="mt-2 flex items-end gap-1"><span className="text-4xl font-black">${tier.price}</span><span className="pb-1 text-xs text-slate-400">/{tier.durationMonths === 1 ? 'month' : `${tier.durationMonths} months`}</span></div>
                  {tier.durationMonths > 1 && <p className="mt-1 text-xs text-slate-500">Only ${perMonth.toFixed(2)} per month</p>}
                  <div className="my-5 h-px bg-white/10" />
                  <ul className="flex-1 space-y-3">
                    {tier.features.map(feature => <li key={feature} className="flex gap-2 text-sm text-slate-300"><Check className={`w-4 h-4 shrink-0 ${style.accent}`} />{feature}</li>)}
                  </ul>
                  <button onClick={() => handleSubscribe(key)} disabled={processingTier !== null} className={`mt-6 w-full rounded-xl bg-gradient-to-r ${style.button} py-3 text-sm font-black text-white shadow-lg disabled:opacity-50`}>
                    {processingTier === key ? 'Processing...' : isActive ? `Renew for $${tier.price}` : `Choose ${tier.name}`}
                  </button>
                </article>
              );
            })}
          </div></>
        )}

        <section className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:mt-8 sm:gap-3 sm:p-4">
          <div className="flex flex-col items-center gap-1 text-center sm:flex-row sm:gap-3 sm:text-left"><Trophy className="w-5 h-5 text-amber-300" /><div><p className="text-[10px] sm:text-sm font-bold">{so ? 'Dhimis' : 'Save more'}</p><p className="hidden text-xs text-slate-500 sm:block">Applied when prize money is paid.</p></div></div>
          <div className="flex flex-col items-center gap-1 text-center sm:flex-row sm:gap-3 sm:text-left"><Wallet className="w-5 h-5 text-cyan-300" /><div><p className="text-[10px] sm:text-sm font-bold">{so ? 'Wallet' : 'Wallet pay'}</p><p className="hidden text-xs text-slate-500 sm:block">The plan price comes from your balance.</p></div></div>
          <div className="flex flex-col items-center gap-1 text-center sm:flex-row sm:gap-3 sm:text-left"><Sparkles className="w-5 h-5 text-fuchsia-300" /><div><p className="text-[10px] sm:text-sm font-bold">{so ? 'Isla markiiba' : 'Instant'}</p><p className="hidden text-xs text-slate-500 sm:block">No manual approval is required.</p></div></div>
        </section>
      </div>
    </main>
  );
};

export default BecomeVip;
