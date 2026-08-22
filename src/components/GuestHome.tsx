import { useEffect, useState } from 'react';
import { Gamepad2, ShieldCheck, Sparkles, Trophy, Wallet } from 'lucide-react';
import ActiveGamesList from './ActiveGamesList';
import LanguageToggle from './LanguageToggle';

interface GuestHomeProps {
  onRequireAuth: (reason?: string) => void;
}

export default function GuestHome({ onRequireAuth }: GuestHomeProps) {
  const [games, setGames] = useState<any[]>([]);

  useEffect(() => {
    let stopped = false;
    const load = () => fetch(`/api/rooms/active?_t=${Date.now()}`)
      .then(response => response.ok ? response.json() : [])
      .then(data => { if (!stopped) setGames(Array.isArray(data) ? data : []); })
      .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050313] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(124,58,237,.25),transparent_34%),radial-gradient(circle_at_90%_25%,rgba(14,165,233,.16),transparent_30%)]" />
      <header className="relative z-10 flex items-center justify-between border-b border-white/10 bg-[#08051a]/85 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-2.5"><img src="/ludosom-logo.png" alt="LudoSom" className="h-10 w-10 rounded-xl object-cover ring-1 ring-amber-300/40" /><div><div className="text-sm font-black tracking-wider">LUDOSOM</div><div className="text-[8px] font-bold uppercase tracking-[.25em] text-purple-300">Play · Watch · Win</div></div></div>
        <div className="flex items-center gap-2"><LanguageToggle /><button onClick={() => onRequireAuth('Gal account-kaaga si aad u bilowdo ciyaarta.')} className="rounded-xl bg-white px-4 py-2 text-[11px] font-black text-slate-950 shadow-lg">Login / Sign up</button></div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-9 sm:px-8 sm:pt-16">
        <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-purple-200"><Sparkles className="h-3 w-3" /> Ludo Soomaaliyeed oo toos ah</span>
            <h1 className="mt-5 max-w-2xl text-4xl font-black leading-[1.05] sm:text-6xl">Daawo ciyaaraha.<br /><span className="bg-gradient-to-r from-amber-300 via-white to-purple-300 bg-clip-text text-transparent">La tartan ciyaartoyda.</span></h1>
            <p className="mt-5 max-w-xl text-sm font-medium leading-7 text-slate-300 sm:text-base">Baro LudoSom adigoon account samaysan. Daawo ciyaaraha tooska ah, arag qaabka tartanka, kadibna login samee marka aad diyaar u tahay inaad ciyaarto ama bet dhigato.</p>
            <div className="mt-7 flex flex-wrap gap-3"><button onClick={() => onRequireAuth('Login samee si aad ciyaar cusub u bilowdo.')} className="rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3.5 text-xs font-black shadow-xl shadow-purple-700/25">Ciyaar hadda</button><a href="#live-games" className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-xs font-black">Daawo live games</a></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['Live Games', 'Daawo ciyaaraha socda', Gamepad2], ['Secure Wallet', 'Lacagtaada si ammaan ah', Wallet], ['Fair Play', 'Natiijo server-ku xukumo', ShieldCheck], ['Champions', 'Tartamo iyo abaalmarino', Trophy]].map(([title, text, Icon]: any) => <div key={title} className="rounded-2xl border border-white/10 bg-white/[.055] p-4 backdrop-blur"><Icon className="h-6 w-6 text-purple-300" /><h2 className="mt-5 text-sm font-black">{title}</h2><p className="mt-1 text-[10px] font-medium leading-5 text-slate-400">{text}</p></div>)}
          </div>
        </section>

        <section id="live-games" className="mt-12 scroll-mt-20">
          {games.length > 0 ? <ActiveGamesList games={games} /> : <div className="rounded-2xl border border-white/10 bg-white/[.04] p-7 text-center"><Gamepad2 className="mx-auto h-8 w-8 text-purple-300" /><h2 className="mt-3 text-sm font-black">Ciyaar toos ah hadda ma socoto</h2><p className="mt-1 text-[11px] text-slate-400">Marka ciyaar bilaabato halkan ayaad ka daawan kartaa adigoon login samayn.</p></div>}
        </section>
      </div>
    </main>
  );
}
