import React, { useState } from 'react';
import { ChevronDown, Eye, Gamepad2, Loader2, Radio, TrendingUp, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AvatarDisplay from './AvatarDisplay';
import { formatCurrency } from '../utils/number';
import { useLanguage } from '../context/LanguageContext';

interface ActiveGamePlayer {
  userId: string; username: string; avatar: string;
  color?: 'red' | 'green' | 'yellow' | 'blue'; status: string;
}

interface ActiveGame {
  id: string; players: ActiveGamePlayer[]; betAmount: number; capacity?: number; gameMode?: 'solo' | 'team';
  currentTurnUsername?: string; progress?: number; spectatorCount?: number;
  betting?: { betCount: number; totalPool: number; marketOpen: boolean };
  myBet?: { targetUsername: string; prediction: 'W' | 'L'; stake: number; odds: number; potentialPayout: number; status: 'open' | 'won' | 'lost' | 'refunded' } | null;
}

interface ActiveGamesListProps { games: ActiveGame[]; }

const colorDot: Record<string, string> = { red: 'bg-rose-500', green: 'bg-emerald-500', yellow: 'bg-amber-400', blue: 'bg-blue-500' };

const ActiveGamesList: React.FC<ActiveGamesListProps> = ({ games }) => {
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const [expandedGameIds, setExpandedGameIds] = useState<Set<string>>(() => new Set());
  const navigate = useNavigate();
  const { language } = useLanguage();
  const so = language === 'so';
  if (games.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0920]/80 shadow-xl backdrop-blur-md">
      <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/15 text-purple-300"><Gamepad2 className="h-4 w-4" /></span>
          <div><h2 className="text-[11px] font-black uppercase tracking-wider text-white">{so ? 'Ciyaaraha Tooska ah' : 'Live Games'}</h2><p className="text-[8px] font-bold text-slate-500">{so ? 'Daawo ciyaarta ama raac saadaashaada' : 'Watch a match or follow your bet'}</p></div>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-red-400/20 bg-red-500/10 px-2 py-1 text-[8px] font-black text-red-300"><Radio className="h-2.5 w-2.5 animate-pulse" /> {games.length} LIVE</span>
      </header>

      <div className="grid gap-2 p-2 sm:grid-cols-2">
        {games.map(game => {
          const progress = Math.max(0, Math.min(100, Number(game.progress || 0)));
          const hasActiveBets = Number(game.betting?.betCount || 0) > 0;
          const teamMode = game.gameMode === 'team';
          const expanded = expandedGameIds.has(game.id);
          return (
            <article key={game.id} className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-black/20 transition hover:border-purple-400/30">
              <button type="button" aria-expanded={expanded} onClick={() => setExpandedGameIds(previous => { const next = new Set(previous); if (next.has(game.id)) next.delete(game.id); else next.add(game.id); return next; })} className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left sm:cursor-default sm:border-b sm:border-white/5">
                <div className="flex min-w-0 items-center gap-1.5"><span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-400" /><span className="truncate font-mono text-[9px] font-black text-slate-300">#{game.id}</span><span className="shrink-0 rounded bg-purple-500/10 px-1.5 py-0.5 text-[7px] font-black uppercase text-purple-300">{teamMode ? 'Team 2v2' : `Solo ${game.capacity || game.players.length}P`}</span></div>
                <div className="flex shrink-0 items-center gap-2"><span className="font-mono text-[10px] font-black text-emerald-300">{game.betAmount > 0 ? formatCurrency(game.betAmount) : (so ? 'BILAASH' : 'FREE')}</span><ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-300 sm:hidden ${expanded ? 'rotate-180' : ''}`} /></div>
              </button>
              <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out sm:grid-rows-[1fr] sm:opacity-100 ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="min-h-0 overflow-hidden">
              <div className="p-2.5">
                <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {game.players.slice(0, 4).map(player => <div key={player.userId} className="relative"><AvatarDisplay avatar={player.avatar} username={player.username} className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-[#17142c] bg-black/40" textClassName="text-sm" /><span className={`absolute bottom-0 right-0 h-2 w-2 rounded-full border border-[#17142c] ${colorDot[player.color || ''] || 'bg-slate-500'}`} /></div>)}
                      </div>
                      <div className="min-w-0"><p className="truncate text-[9px] font-black text-slate-200">{game.players.map(player => player.username).join(teamMode ? ' · ' : ' vs ')}</p><p className="mt-0.5 truncate text-[8px] font-bold text-amber-300">{so ? 'Wareegga' : 'Turn'}: {game.currentTurnUsername || (so ? 'Sugaya…' : 'Loading…')}</p></div>
                </div>

                <div className="mt-2.5">
                  <div className="mb-1 flex items-center justify-between text-[7px] font-black uppercase text-slate-500"><span>{so ? 'Horumarka' : 'Progress'} {progress}%</span><span>{progress >= 75 ? (so ? 'Dhammaad ku dhow' : 'Nearly finished') : progress >= 35 ? (so ? 'Ciyaar dhexe' : 'Mid-game') : (so ? 'Bilowga ciyaarta' : 'Early game')}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 via-blue-400 to-emerald-400 transition-all duration-700" style={{ width: `${progress}%` }} /></div>
                </div>

                {game.myBet ? (
                  <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-400/[0.07] p-2">
                    <div className="flex items-center justify-between gap-2"><div className="min-w-0"><span className="block text-[7px] font-black uppercase tracking-wider text-amber-300">Bet-kaaga · {game.myBet.status === 'open' ? 'Socda' : game.myBet.status}</span><span className="block truncate text-[9px] font-black text-white">{game.myBet.targetUsername} · {game.myBet.prediction === 'W' ? 'WIN' : 'LOSS'}</span></div><div className="shrink-0 text-right"><span className="block font-mono text-[10px] font-black text-amber-200">{formatCurrency(game.myBet.stake)} @ {Number(game.myBet.odds).toFixed(2)}</span><span className="text-[7px] font-bold text-slate-500">Est. {formatCurrency(game.myBet.potentialPayout)}</span></div></div>
                  </div>
                ) : (
                  <div className={`mt-2 flex items-center justify-between rounded-lg border px-2 py-1.5 ${hasActiveBets ? 'border-emerald-400/20 bg-emerald-500/[0.07]' : 'border-white/5 bg-black/15'}`}><div className="flex items-center gap-1.5"><TrendingUp className={`h-3 w-3 ${hasActiveBets ? 'text-emerald-300' : 'text-slate-600'}`} /><span className={`text-[8px] font-black ${hasActiveBets ? 'text-emerald-200' : 'text-slate-500'}`}>{hasActiveBets ? `${game.betting?.betCount} bet ayaa ku jira` : 'Weli bet laguma jiro'}</span></div><span className="font-mono text-[8px] font-black text-slate-400">Pool {formatCurrency(game.betting?.totalPool || 0)}</span></div>
                )}
              </div>
              </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/5 bg-black/15 px-2.5 py-2">
                <div className="flex items-center gap-2.5 text-[8px] font-bold text-slate-500"><span className="flex items-center gap-1"><Users className="h-3 w-3" /> {game.spectatorCount || 0}</span><span className={game.betting?.marketOpen ? 'text-emerald-400' : 'text-amber-400'}>{game.betting?.marketOpen ? 'BET OPEN' : 'BET CLOSED'}</span></div>
                <button onClick={() => { setLoadingRoomId(game.id); navigate(`/room/${game.id}?spectate=true`); }} disabled={loadingRoomId === game.id} className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[8px] font-black uppercase tracking-wider text-white shadow-md transition hover:bg-purple-400 active:scale-95 disabled:opacity-50">{loadingRoomId === game.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} {game.myBet ? (so ? 'Raac Saadaasha' : 'Follow Bet') : (so ? 'Daawo' : 'Watch')}</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default ActiveGamesList;
