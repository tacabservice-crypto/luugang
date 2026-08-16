import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../firebase-client';
import { useLanguage } from '../context/LanguageContext';
import { Tournament } from '../types/game';
import TournamentBracket from '../components/TournamentBracket';
import WalletModal from '../components/WalletModal';
import LanguageToggle from '../components/LanguageToggle';
import AvatarDisplay from '../components/AvatarDisplay';
import { userErrorMessage } from '../utils/userError';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  ArrowLeft,
  Wallet,
  Search,
  Users,
  Calendar,
  DollarSign,
  Sparkles,
  Clock,
  Flame,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Play,
  Swords,
  Crown,
  AlertCircle,
  ShieldCheck,
  HelpCircle,
  Bot
} from 'lucide-react';

const Tournaments: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'open' | 'live' | 'completed' | 'my'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmRegisterTournament, setConfirmRegisterTournament] = useState<Tournament | null>(null);

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/tournaments`);
      if (!response.ok) {
        throw new Error('Failed to fetch tournaments.');
      }
      const data = await response.json();
      setTournaments(data);
    } catch (err: any) {
      setError(userErrorMessage(err, 'Tournaments could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();

    // SSE listener for real-time updates
    const eventSource = new EventSource(`${import.meta.env.VITE_API_BASE_URL || ''}/api/updates?userId=tournaments_hub`);
    
    const handleTournamentEvent = (event: MessageEvent) => {
      try {
        const updatedTournament = JSON.parse(event.data);
        setTournaments((prev) => {
          const index = prev.findIndex((t) => t.id === updatedTournament.id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = updatedTournament;
            return next;
          }
          return [updatedTournament, ...prev];
        });
      } catch (e) {
        console.error('Error handling SSE tournament update:', e);
      }
    };

    eventSource.addEventListener('tournament_update', handleTournamentEvent);
    eventSource.addEventListener('tournament_started', handleTournamentEvent);
    eventSource.addEventListener('tournament_check_in', handleTournamentEvent);
    eventSource.addEventListener('tournament_ended', handleTournamentEvent);

    return () => {
      eventSource.close();
    };
  }, []);

  const handleRegister = async (tournamentId: string) => {
    if (!user || !user.idToken) {
      setMessage('Please log in to register for a tournament.');
      return;
    }
    setActionLoadingId(tournamentId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/tournaments/${tournamentId}/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.idToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.error && data.error.includes('Insufficient funds')) {
          setShowWalletModal(true);
          throw new Error('Insufficient wallet balance. Please top up your wallet to join this tournament!');
        }
        throw new Error(data.error || 'Failed to register for the tournament.');
      }

      setMessage(data.message || 'Successfully registered for the tournament!');
      await fetchTournaments();
    } catch (err: any) {
      console.error('Tournament registration error:', err);
      setError(userErrorMessage(err, 'Tournament registration failed.'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnregister = async (tournamentId: string) => {
    if (!user || !user.idToken) return;
    setActionLoadingId(tournamentId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/tournaments/${tournamentId}/unregister`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.idToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to unregister.');
      }

      setMessage(data.message || 'Unregistered successfully!');
      await fetchTournaments();
    } catch (err: any) {
      console.error('Unregister error:', err);
      setError(userErrorMessage(err, 'Tournament withdrawal failed.'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCheckIn = async (tournamentId: string) => {
    if (!user?.idToken) return;
    setActionLoadingId(tournamentId);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/check-in`, { method: 'POST', headers: { Authorization: `Bearer ${user.idToken}` } });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Check-in failed.');
      setMessage(data.message); await fetchTournaments();
    } catch (err:any) { setError(userErrorMessage(err, 'Tournament check-in failed.')); } finally { setActionLoadingId(null); }
  };

  // Filter logic
  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      // Search term
      if (searchQuery.trim() && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Tab filter
      if (filterTab === 'open') return t.status === 'registration_open';
      if (filterTab === 'live') return t.status === 'in_progress' || t.status === 'check_in';
      if (filterTab === 'completed') return t.status === 'completed';
      if (filterTab === 'my') return user && t.players?.some((p) => p.userId === user.id);
      return true;
    });
  }, [tournaments, filterTab, searchQuery, user]);

  // Featured / Hero Tournament
  const featuredTournament = useMemo(() => {
    return (
      tournaments.find((t) => t.status === 'registration_open') ||
      tournaments.find((t) => t.status === 'check_in') ||
      tournaments.find((t) => t.status === 'in_progress') ||
      tournaments[0]
    );
  }, [tournaments]);

  if (selectedTournamentId) {
    return (
      <TournamentBracket
        tournamentId={selectedTournamentId}
        onBack={() => setSelectedTournamentId(null)}
        currentUserId={user?.id}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0826] text-white font-sans selection:bg-purple-500 selection:text-white pb-12">
      {/* 1. TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-[#1A0C40]/90 backdrop-blur-xl border-b border-purple-500/20 px-4 sm:px-8 py-3.5 shadow-2xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Back Button & Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all cursor-pointer text-gray-300 hover:text-white flex items-center gap-2"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-5 h-5 text-purple-300" />
              <span className="hidden sm:inline text-xs font-black uppercase tracking-wider">{t('dashboardNav')}</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-yellow-500 via-amber-400 to-purple-600 p-0.5 shadow-lg shadow-purple-500/20 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-slate-950 fill-current" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-purple-300 tracking-wide">
                  LUDO$OM
                </h1>
                <p className="text-[10px] text-purple-300 font-bold uppercase tracking-widest -mt-1">
                  TOURNAMENTS HUB
                </p>
              </div>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* User Profile Badge */}
            {user && (
              <div className="hidden md:flex items-center gap-2 bg-white/5 border border-purple-500/20 px-3 py-1.5 rounded-2xl">
                <AvatarDisplay avatar={user.avatar} username={user.username} className="w-7 h-7 rounded-xl bg-purple-900/60 border border-purple-400/30 flex items-center justify-center shrink-0" />
                <span className="text-xs font-bold text-gray-200 truncate max-w-[100px]">{user.username}</span>
              </div>
            )}

            {/* Wallet Balance Badge */}
            {user ? (
              <button
                onClick={() => setShowWalletModal(true)}
                className="bg-white/5 hover:bg-white/10 border border-purple-500/30 p-1.5 sm:px-3.5 sm:py-2 rounded-2xl flex items-center gap-2 cursor-pointer transition-all shadow-inner"
              >
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Wallet className="w-4 h-4" />
                </div>
                <div className="text-left hidden sm:block">
                  <span className="text-[9px] text-gray-400 font-bold uppercase block">{t('balance')}</span>
                  <span className="text-xs font-black text-emerald-400 font-mono">
                    ${(user.balance || 0).toFixed(2)}
                  </span>
                </div>
              </button>
            ) : null}

            {/* Language Switcher */}
            <div className="w-24">
              <LanguageToggle />
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchTournaments}
              disabled={loading}
              className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all cursor-pointer text-gray-300 hover:text-white"
              title="Refresh Tournaments"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-400' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-8">
        {/* Alerts / Feedback Banner */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/40 text-red-300 p-4 rounded-2xl flex items-center gap-3 text-xs sm:text-sm font-semibold shadow-xl animate-shake">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-gray-400 hover:text-white font-bold">✕</button>
          </div>
        )}

        {message && (
          <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-4 rounded-2xl flex items-center gap-3 text-xs sm:text-sm font-semibold shadow-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="flex-1">{message}</span>
            <button onClick={() => setMessage(null)} className="text-gray-400 hover:text-white font-bold">✕</button>
          </div>
        )}

        {/* 2. HERO FEATURED CHAMPIONSHIP BANNER */}
        {featuredTournament && (
          <section className="relative overflow-hidden bg-gradient-to-r from-purple-900/60 via-[#1F0E4D] to-indigo-900/60 border border-purple-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <Trophy className="w-64 h-64 text-yellow-300" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-xl">
                <div className="inline-flex items-center gap-2 bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
                  <Flame className="w-3.5 h-3.5 fill-current text-yellow-400 animate-pulse" />
                  FEATURED CHAMPIONSHIP
                </div>

                <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight">
                  {featuredTournament.name}
                </h2>

                <p className="text-xs sm:text-sm text-purple-200/80 leading-relaxed">
                  {t('tournamentsSub')}
                </p>

                {/* Stat Badges */}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <div className="bg-black/30 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2.5">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase font-bold block">{t('prizePool')}</span>
                      <span className="text-lg font-black text-yellow-300 font-mono">
                        ${featuredTournament.prizePool.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-black/30 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2.5">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase font-bold block">{t('entryFee')}</span>
                      <span className="text-lg font-black text-emerald-300 font-mono">
                        {featuredTournament.entryFee > 0 ? `$${featuredTournament.entryFee.toFixed(2)}` : 'FREE'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-black/30 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2.5">
                    <Users className="w-5 h-5 text-indigo-400" />
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase font-bold block">{t('registeredPlayers')}</span>
                      <span className="text-lg font-black text-indigo-200 font-mono">
                        {featuredTournament.players.length} / {featuredTournament.maxPlayers}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Box */}
              <div className="flex flex-col items-center justify-center bg-black/40 border border-purple-500/30 p-6 rounded-3xl min-w-[260px] text-center space-y-4 shadow-xl">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">
                    {featuredTournament.status === 'registration_open' ? 'REGISTRATION ENDS IN' : 'STATUS'}
                  </span>
                  <div className="text-sm font-bold font-mono text-yellow-300 flex items-center justify-center gap-1">
                    <Clock className="w-4 h-4 text-yellow-400" />
                    {featuredTournament.status === 'registration_open'
                      ? new Date(featuredTournament.startDate).toLocaleString()
                      : featuredTournament.status.replace('_', ' ').toUpperCase()}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedTournamentId(featuredTournament.id)}
                  className="w-full bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 hover:from-yellow-400 hover:to-amber-400 text-black font-black py-3 px-6 rounded-2xl shadow-xl shadow-yellow-500/20 transition-all hover:scale-102 cursor-pointer flex items-center justify-center gap-2 text-sm"
                >
                  <Swords className="w-4 h-4" />
                  <span>VIEW DETAILS & BRACKET</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* 2.5 MATCHMAKING & PAIRINGS EXPLANATION BANNER */}
        <section className="bg-gradient-to-r from-purple-950/40 via-[#1A0C40]/60 to-indigo-950/40 border border-purple-500/30 rounded-3xl p-6 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <ShieldCheck className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                {t('matchmakingInfoTitle')}
              </h2>
              <p className="text-xs text-purple-200/70">{t('matchmakingInfoDesc')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Pairing Rule 1 */}
            <div className="bg-black/30 border border-white/10 p-4 rounded-2xl space-y-1.5">
              <div className="flex items-center gap-2 text-yellow-300 font-black">
                <Swords className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{t('pairingTypeTitle')}</span>
              </div>
              <p className="text-gray-300 leading-relaxed">
                {t('pairingTypeDesc')}
              </p>
            </div>

            {/* Pairing Rule 2 */}
            <div className="bg-black/30 border border-white/10 p-4 rounded-2xl space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-300 font-black">
                <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t('whoDecidesTitle')}</span>
              </div>
              <p className="text-gray-300 leading-relaxed">
                {t('whoDecidesDesc')}
              </p>
            </div>
          </div>
        </section>

        {/* 3. TABS & SEARCH CONTROLS */}
        <section className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/5 border border-white/10 p-4 rounded-3xl backdrop-blur-md">
          {/* Tab Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
            {[
              { id: 'all', label: t('tabAll'), icon: Trophy },
              { id: 'open', label: t('tabOpen'), icon: Flame },
              { id: 'live', label: t('tabLive'), icon: Swords },
              { id: 'completed', label: t('tabCompleted'), icon: Crown },
              { id: 'my', label: t('tabMy'), icon: Users },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id as any)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Input Box */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tournament..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-purple-500 transition-all"
            />
          </div>
        </section>

        {/* 4. TOURNAMENT CARDS GRID */}
        <section>
          {loading && tournaments.length === 0 ? (
            <div className="p-12 text-center text-purple-300 space-y-3">
              <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="font-bold text-sm">Loading tournament arena...</p>
            </div>
          ) : filteredTournaments.length === 0 ? (
            /* SLEEK BILINGUAL EMPTY STATE */
            <div className="bg-white/5 border border-white/10 rounded-3xl p-10 sm:p-16 text-center space-y-4 max-w-xl mx-auto backdrop-blur-md shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-300">
                <Trophy className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-white">{t('noTournamentsFound')}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Check back soon or switch filter tabs to view upcoming knockout cups!
              </p>
              <button
                onClick={() => {
                  setFilterTab('all');
                  setSearchQuery('');
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-2xl text-xs transition-all shadow-lg cursor-pointer inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> View All Tournaments
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTournaments.map((tournament) => {
                const isRegistered = user && tournament.players.some((p) => p.userId === user.id);
                const isFull = tournament.players.length >= tournament.maxPlayers;
                const percentFilled = Math.min(
                  100,
                  Math.round((tournament.players.length / tournament.maxPlayers) * 100)
                );

                return (
                  <div
                    key={tournament.id}
                    onClick={() => setSelectedTournamentId(tournament.id)}
                    className="group bg-[#1A0C40]/80 hover:bg-[#20104e] border border-purple-500/20 hover:border-purple-500/50 rounded-3xl p-6 shadow-xl hover:shadow-purple-500/10 transition-all duration-300 flex flex-col justify-between space-y-5 cursor-pointer relative overflow-hidden"
                  >
                    {/* Top Status Bar */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border ${
                          tournament.status === 'registration_open'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : tournament.status === 'in_progress'
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse'
                            : tournament.status === 'completed'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            tournament.status === 'registration_open'
                              ? 'bg-emerald-400'
                              : tournament.status === 'in_progress'
                              ? 'bg-blue-400'
                              : 'bg-amber-400'
                          }`}
                        ></span>
                        {tournament.status.replace('_', ' ')}
                      </span>

                      <span className="bg-purple-950/80 border border-purple-500/30 text-purple-300 font-mono text-xs font-black px-3 py-1 rounded-full">
                        {tournament.entryFee > 0 ? `$${tournament.entryFee.toFixed(2)} Entry` : 'FREE ENTRY'}
                      </span>
                    </div>

                    {/* Title & Grand Prize */}
                    <div className="space-y-2">
                      <h3 className="text-xl font-black text-white group-hover:text-yellow-300 transition-colors">
                        {tournament.name}
                      </h3>

                      <div className="bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-transparent border border-yellow-500/20 p-3 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
                          <span className="text-xs font-bold text-gray-300 uppercase">{t('prizePool')}</span>
                        </div>
                        <span className="text-lg font-black text-yellow-300 font-mono">
                          ${tournament.prizePool.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Registration Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400 font-bold flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-purple-400" />
                          <span>{t('registeredPlayers')}</span>
                        </span>
                        <span className="font-mono font-black text-purple-300">
                          {tournament.players.length} / {tournament.maxPlayers}
                        </span>
                      </div>
                      <div className="w-full bg-black/40 h-2.5 rounded-full overflow-hidden border border-white/5">
                        <div
                          className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentFilled}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Schedule Date */}
                    <div className="flex items-center gap-2 text-xs text-gray-400 font-mono border-t border-white/5 pt-3">
                      <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Starts: {new Date(tournament.startDate).toLocaleString()}</span>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2">
                      {tournament.status === 'check_in' && isRegistered ? (
                        tournament.players.find(p=>p.userId===user?.id)?.checkedInAt ? <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/20 py-3 text-center text-xs font-black text-emerald-300">CHECKED IN — READY</div> : <button onClick={(e)=>{e.stopPropagation();handleCheckIn(tournament.id);}} disabled={actionLoadingId===tournament.id} className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 py-3 text-xs font-black text-slate-950">CHECK IN NOW</button>
                      ) : tournament.status === 'registration_open' ? (
                        isRegistered ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTournamentId(tournament.id);
                              }}
                              className="flex-1 bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 font-bold py-2.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>{t('registered')}</span>
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Unregister from "${tournament.name}"? A 10% cancellation fee will be deducted.`)) {
                                  handleUnregister(tournament.id);
                                }
                              }}
                              disabled={actionLoadingId === tournament.id}
                              className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 p-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer"
                              title="Unregister & Refund"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!user) {
                                setMessage('Please log in to register for a tournament.');
                                return;
                              }
                              if (user.balance < tournament.entryFee) {
                                setShowWalletModal(true);
                                setError('Insufficient wallet balance. Please top up your wallet to join this tournament!');
                                return;
                              }
                              setConfirmRegisterTournament(tournament);
                            }}
                            disabled={isFull || actionLoadingId === tournament.id}
                            className={`w-full font-black py-3 px-4 rounded-2xl text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                              isFull
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/20'
                            }`}
                          >
                            {actionLoadingId === tournament.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : isFull ? (
                              'TOURNAMENT FULL'
                            ) : (
                              <>
                                <Swords className="w-4 h-4" />
                                <span>{t('registerNow')} ({tournament.entryFee > 0 ? `$${tournament.entryFee}` : 'FREE'})</span>
                              </>
                            )}
                          </button>
                        )
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTournamentId(tournament.id);
                          }}
                          className="w-full bg-white/10 hover:bg-white/20 text-white font-black py-3 px-4 rounded-2xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/10"
                        >
                          <Play className="w-4 h-4 fill-current text-yellow-400" />
                          <span>{t('viewBracket')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* REGISTRATION CONFIRMATION MODAL */}
      {confirmRegisterTournament && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1F0E4D] border border-purple-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 text-white text-center relative">
            <div className="w-16 h-16 rounded-3xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center mx-auto text-purple-300 shadow-inner">
              <Swords className="w-8 h-8 text-yellow-400" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">
                {t('confirmRegistration')}
              </h3>
              <p className="text-xs text-purple-200/80">
                {t('entryFeeNotice')}
              </p>
            </div>

            {/* Tournament Summary Card */}
            <div className="bg-black/40 border border-purple-500/30 p-4 rounded-2xl text-left space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-bold">{t('tournaments')}:</span>
                <span className="font-black text-yellow-300">{confirmRegisterTournament.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-bold">{t('entryFee')}:</span>
                <span className="font-mono font-black text-emerald-400">
                  {confirmRegisterTournament.entryFee > 0 ? `$${confirmRegisterTournament.entryFee.toFixed(2)}` : 'FREE'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 font-bold">{t('yourBalance')}:</span>
                <span className="font-mono font-black text-emerald-300">
                  ${(user?.balance || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                disabled={actionLoadingId === confirmRegisterTournament.id}
                onClick={async () => {
                  const targetId = confirmRegisterTournament.id;
                  setConfirmRegisterTournament(null);
                  await handleRegister(targetId);
                }}
                className="flex-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-black font-black py-3 px-4 rounded-2xl text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {actionLoadingId === confirmRegisterTournament.id ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t('confirmYes')}</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setConfirmRegisterTournament(null)}
                className="bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white font-bold py-3 px-5 rounded-2xl text-xs transition-all cursor-pointer border border-white/10"
              >
                {t('cancelBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WALLET DEPOSIT MODAL */}
      {showWalletModal && user && (
        <WalletModal
          user={user}
          onClose={() => setShowWalletModal(false)}
          onBalanceUpdated={() => {
            fetchTournaments();
          }}
        />
      )}
    </div>
  );
};

export default Tournaments;
