import React, { useEffect, useState } from 'react';
import { Tournament, TournamentMatch } from '../types/game';
import { Trophy, ArrowLeft, Swords, Crown, Play, Users, DollarSign, Calendar, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface TournamentBracketProps {
  tournamentId: string;
  onBack?: () => void;
  currentUserId?: string;
}

const TournamentBracket: React.FC<TournamentBracketProps> = ({ tournamentId, onBack, currentUserId }) => {
  const { t } = useLanguage();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTournament = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/tournaments/${tournamentId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch tournament details.');
        }
        const data = await response.json();
        setTournament(data);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching tournament details.');
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();

    // Set up SSE for real-time updates
    const eventSource = new EventSource(`${import.meta.env.VITE_API_BASE_URL || ''}/api/updates?userId=tournament_spectator_${tournamentId}`);
    
    const handleUpdate = (event: MessageEvent) => {
      try {
        const updated = JSON.parse(event.data);
        if (updated.id === tournamentId) {
          setTournament(updated);
        }
      } catch (e) {
        console.error('Error parsing tournament event:', e);
      }
    };

    eventSource.addEventListener('tournament_update', handleUpdate);
    eventSource.addEventListener('tournament_started', handleUpdate);
    eventSource.addEventListener('tournament_ended', handleUpdate);

    return () => {
      eventSource.close();
    };
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0826] text-white flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-purple-300 font-bold animate-pulse text-sm">Loading tournament bracket & live state...</p>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-[#0F0826] text-white p-6 flex flex-col items-center justify-center space-y-4">
        <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-2xl text-center max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h3 className="text-lg font-black text-red-400 mb-2">Tournament Error</h3>
          <p className="text-xs text-gray-300 mb-4">{error || 'Tournament not found'}</p>
          {onBack && (
            <button
              onClick={onBack}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs flex items-center gap-2 mx-auto"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Tournaments
            </button>
          )}
        </div>
      </div>
    );
  }

  const rounds = (tournament.matches || []).reduce((acc, match) => {
    (acc[match.round] = acc[match.round] || []).push(match);
    return acc;
  }, {} as Record<number, TournamentMatch[]>);

  const winner = tournament.winnerId
    ? tournament.players.find(p => p.userId === tournament.winnerId)
    : null;

  return (
    <div className="min-h-screen bg-[#0F0826] text-white p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5 border border-white/10 p-4 sm:p-6 rounded-2xl backdrop-blur-md shadow-2xl">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all cursor-pointer text-gray-300 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-400 animate-pulse" />
              <h1 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-purple-300">
                {tournament.name}
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-3">
              <span>Status: <strong className="text-purple-300 uppercase">{tournament.status.replace('_', ' ')}</strong></span>
              <span>•</span>
              <span>Players: <strong className="text-emerald-400">{tournament.players.length} / {tournament.maxPlayers}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-yellow-500/40 px-4 py-2 rounded-xl flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <div>
              <span className="text-[10px] text-yellow-300/80 uppercase font-bold block">{t('prizePool')}</span>
              <span className="text-base font-black text-yellow-300 font-mono">${tournament.prizePool.toFixed(2)}</span>
            </div>
          </div>
          <div className="bg-purple-500/20 border border-purple-500/30 px-4 py-2 rounded-xl flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-purple-400" />
            <div>
              <span className="text-[10px] text-purple-300 uppercase font-bold block">{t('entryFee')}</span>
              <span className="text-base font-black text-purple-200 font-mono">
                {tournament.entryFee > 0 ? `$${tournament.entryFee.toFixed(2)}` : 'FREE'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* WINNER PODIUM CHAMPION BANNER */}
      {winner && (
        <div className="relative overflow-hidden bg-gradient-to-r from-yellow-600/30 via-amber-500/20 to-purple-600/30 border border-yellow-500/50 p-6 sm:p-8 rounded-3xl shadow-2xl text-center space-y-3">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Crown className="w-48 h-48 text-yellow-300" />
          </div>
          <Crown className="w-12 h-12 text-yellow-400 mx-auto animate-bounce" />
          <h2 className="text-2xl sm:text-3xl font-black text-yellow-300 uppercase tracking-widest flex items-center justify-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-400" /> TOURNAMENT CHAMPION <Sparkles className="w-6 h-6 text-yellow-400" />
          </h2>
          <div className="flex items-center justify-center gap-4 pt-2">
            <img
              src={winner.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=winner'}
              alt={winner.username}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-yellow-400 shadow-xl object-cover bg-purple-900"
            />
            <div className="text-left">
              <p className="text-xl sm:text-2xl font-black text-white">{winner.username}</p>
              <p className="text-xs text-yellow-400 font-bold font-mono">Won Grand Prize: ${tournament.prizePool.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* BRACKET KNOCKOUT ROUNDS DISPLAY */}
      <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-md shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 className="text-lg font-black text-purple-300 flex items-center gap-2">
            <Swords className="w-5 h-5 text-amber-400" /> Knockout Bracket & Live Matches
          </h2>
          <span className="text-xs text-gray-400">Scroll horizontally to view all rounds</span>
        </div>

        {Object.keys(rounds).length === 0 ? (
          <div className="p-8 text-center text-gray-400 space-y-2">
            <Users className="w-10 h-10 text-gray-500 mx-auto" />
            <p className="font-bold text-sm">Bracket matches will be generated once the tournament starts!</p>
            <p className="text-xs text-gray-500">
              Starts at: {new Date(tournament.startDate).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="flex gap-6 overflow-x-auto pb-4 pt-2 scrollbar-thin scrollbar-thumb-purple-600/50">
            {Object.keys(rounds).map((roundNumberStr) => {
              const roundNum = parseInt(roundNumberStr, 10);
              const roundMatches = rounds[roundNum];
              const roundTitle =
                roundNum === Object.keys(rounds).length
                  ? '🏆 Finals'
                  : roundNum === Object.keys(rounds).length - 1 && Object.keys(rounds).length > 2
                  ? '⚡ Semi-Finals'
                  : `Round ${roundNum}`;

              return (
                <div key={roundNumberStr} className="flex-shrink-0 w-80 space-y-4">
                  <div className="bg-purple-950/60 border border-purple-500/30 px-4 py-2.5 rounded-2xl text-center">
                    <span className="text-sm font-black text-purple-300 uppercase tracking-wider">
                      {roundTitle}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {roundMatches.map((match) => {
                      const isUserMatch =
                        currentUserId &&
                        (match.player1?.userId === currentUserId || match.player2?.userId === currentUserId);

                      return (
                        <div
                          key={match.id}
                          className={`relative bg-[#1A0C40]/90 border ${
                            isUserMatch
                              ? 'border-yellow-400 shadow-yellow-500/20 shadow-lg'
                              : match.status === 'in_progress'
                              ? 'border-blue-500/50 shadow-blue-500/10 shadow-lg'
                              : 'border-white/10'
                          } rounded-2xl p-4 space-y-3 transition-all hover:border-purple-400`}
                        >
                          {/* Match Status Header */}
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 pb-2">
                            <span>Match #{match.id.split('_').pop()}</span>
                            {match.status === 'in_progress' ? (
                              <span className="flex items-center gap-1.5 text-blue-400 bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 rounded-full animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Live In Progress
                              </span>
                            ) : match.status === 'completed' ? (
                              <span className="text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                ✓ Completed
                              </span>
                            ) : (
                              <span className="text-amber-400 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                Pending
                              </span>
                            )}
                          </div>

                          {/* Player 1 Slot */}
                          <div
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                              match.winnerId === match.player1?.userId
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-black'
                                : 'bg-black/30 border-white/5 text-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <img
                                src={
                                  match.player1?.avatar ||
                                  'https://api.dicebear.com/7.x/bottts/svg?seed=' + (match.player1?.username || 'tbd')
                                }
                                alt=""
                                className="w-8 h-8 rounded-lg object-cover bg-purple-950 shrink-0 border border-white/10"
                              />
                              <span className="text-xs font-bold truncate">
                                {match.player1?.username || 'TBD (Waiting)'}
                              </span>
                            </div>
                            {match.winnerId === match.player1?.userId && (
                              <Crown className="w-4 h-4 text-yellow-400 shrink-0" />
                            )}
                          </div>

                          {/* VS Divider */}
                          <div className="flex items-center justify-center gap-2 my-1">
                            <span className="text-[10px] font-black text-gray-500 tracking-widest uppercase">VS</span>
                          </div>

                          {/* Player 2 Slot */}
                          <div
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                              match.winnerId === match.player2?.userId
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-black'
                                : 'bg-black/30 border-white/5 text-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <img
                                src={
                                  match.player2?.avatar ||
                                  'https://api.dicebear.com/7.x/bottts/svg?seed=' + (match.player2?.username || 'tbd2')
                                }
                                alt=""
                                className="w-8 h-8 rounded-lg object-cover bg-purple-950 shrink-0 border border-white/10"
                              />
                              <span className="text-xs font-bold truncate">
                                {match.player2?.username || 'TBD (Waiting)'}
                              </span>
                            </div>
                            {match.winnerId === match.player2?.userId && (
                              <Crown className="w-4 h-4 text-yellow-400 shrink-0" />
                            )}
                          </div>

                          {/* Action Button to Join Room */}
                          {match.roomId && match.status === 'in_progress' && (
                            <button
                              onClick={() => {
                                window.location.assign(`/room/${match.roomId}`);
                              }}
                              className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all ${
                                isUserMatch
                                  ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black hover:scale-102 animate-bounce'
                                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              }`}
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              {isUserMatch ? 'JOIN YOUR MATCH NOW 🎲' : 'SPECTATE MATCH 👁️'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* REGISTERED PLAYERS ROSTER */}
      <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-3xl backdrop-blur-md shadow-2xl space-y-4">
        <h3 className="text-md font-black text-purple-300 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-400" /> Registered Players ({tournament.players.length} / {tournament.maxPlayers})
        </h3>
        {tournament.players.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No players have registered yet. Be the first to join!</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {tournament.players.map((p, idx) => (
              <div
                key={p.userId || idx}
                className="bg-black/30 border border-white/10 p-2.5 rounded-2xl flex items-center gap-2.5"
              >
                <img
                  src={p.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + p.username}
                  alt={p.username}
                  className="w-8 h-8 rounded-xl object-cover bg-purple-950 border border-white/10 shrink-0"
                />
                <span className="text-xs font-bold text-gray-200 truncate">{p.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TournamentBracket;
