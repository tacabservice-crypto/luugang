/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Wallet, 
  Plus, 
  LogIn, 
  User, 
  Trophy, 
  Flame,
  Bot, 
  Users,
  Search, 
  TrendingUp, 
  Volume2, 
  Info, 
  CheckCircle,
  LogOut,
  ChevronDown,
  MoreVertical,
  HelpCircle,
  Download,
  X
} from 'lucide-react';
import { UserProfile, GameRoom } from '../types/game';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import { formatCurrency } from '../utils/number';
import { userErrorMessage } from '../utils/userError';
import { apiUrl } from '../api-runtime';
import MatchmakingRadar from './MatchmakingRadar';
import AboutUs from './AboutUs';
import Help from './Help';
import ActiveGamesList from './ActiveGamesList';
import UserEditModal from './UserEditModal';
import AvatarDisplay from './AvatarDisplay';
import LiveAdBanner from './LiveAdBanner';
import { useNavigate } from 'react-router-dom';
import { NATIVE_BACK_EVENT } from './NativeBackHandler';

interface DashboardProps {
  noticeSlot?: React.ReactNode;
  user: UserProfile;
  onOpenWallet: () => void;
  onLogout: () => void;
  onCreatePrivateRoom: (betAmount: number, capacity: number, gameMode: 'solo' | 'team') => void;
  onJoinPrivateRoom: (roomCode: string) => void;
  onStartMatchmaking: (betAmount: number, capacity: number, gameMode: 'solo' | 'team', opponentId?: string) => void;
  onLeaveMatchmaking: (betAmount: number, capacity?: number, gameMode?: 'solo' | 'team') => void;
  matchmakingState: {
    isQueued: boolean;
    betAmount: number;
    capacity?: number;
    gameMode?: 'solo' | 'team';
  };
  rejoinableRoom: GameRoom | null;
  onRejoin: () => void;
  onDismissRejoin: () => void;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<void>;
  isGuest?: boolean;
  onRequireAuth?: (reason?: string) => void;
}

export default function Dashboard({
  noticeSlot,
  user,
  onOpenWallet,
  onLogout,
  onCreatePrivateRoom,
  onJoinPrivateRoom,
  onStartMatchmaking,
  onLeaveMatchmaking,
  matchmakingState,
  rejoinableRoom,
  onRejoin,
  onDismissRejoin,
  onProfileUpdate,
  isGuest = false,
  onRequireAuth
}: DashboardProps) {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [selectedStake, setSelectedStake] = useState<number>(0.30); // Default to $0.30 Micro stake
  const [isStakeDropdownOpen, setIsStakeDropdownOpen] = useState<boolean>(false);
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState<boolean>(false);
  const [showAboutUs, setShowAboutUs] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);

  const downloadLatestApk = () => {
    const link = document.createElement('a');
    link.href = `/downloads/LudoSom.apk?update=${Date.now()}`;
    link.download = 'LudoSom-latest.apk';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setIsSettingsDropdownOpen(false);
  };

  const STAKE_TIERS = [
    {
      amount: 0.30,
      label: 'Micro Stakes ($0.30)',
      desc: 'Bet $0.30 • Win $0.60'
    },
    {
      amount: 0.50,
      label: 'Small Stakes ($0.50)',
      desc: 'Bet $0.50 • Win $1.00'
    },
    {
      amount: 0.75,
      label: 'Small Stakes ($0.75)',
      desc: 'Bet $0.75 • Win $1.50'
    },
    { 
      amount: 1, 
      label: 'Micro Stakes ($1)', 
      desc: 'Bet $1 • Win $2.00' 
    },
    { 
      amount: 2, 
      label: 'Starter ($2)', 
      desc: 'Bet $2 • Win $4.00' 
    },
    { 
      amount: 5, 
      label: 'Bronze Arena ($5)', 
      desc: 'Bet $5 • Win $10.00' 
    },
    { 
      amount: 10, 
      label: 'Silver League ($10)', 
      desc: 'Bet $10 • Win $20.00' 
    },
    { 
      amount: 25, 
      label: 'Gold Masters ($25)', 
      desc: 'Bet $25 • Win $50.00' 
    },
    { 
      amount: 50, 
      label: 'Diamond High-Roller ($50)', 
      desc: 'Bet $50 • Win $100.00' 
    },
    { 
      amount: 100, 
      label: 'Elite Pro ($100)', 
      desc: 'Bet $100 • Win $200.00' 
    }
  ];

  const selectedTier = STAKE_TIERS.find(t => t.amount === selectedStake) || STAKE_TIERS[1];

  const [joinCode, setJoinCode] = useState('');
  const [editName, setEditName] = useState(user.username);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [avatarIcon, setAvatarIcon] = useState(user.avatar);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [capacity, setCapacity] = useState<number>(2);
  const [gameMode, setGameMode] = useState<'solo' | 'team'>('solo');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const radarPanelRef = useRef<HTMLDivElement>(null);

  const scrollToRadar = () => {
    radarPanelRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsStakeDropdownOpen(false);
      }
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(event.target as Node)) {
        setIsSettingsDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef, settingsDropdownRef]);

  const [onlinePlayers, setOnlinePlayers] = useState<any[]>([]);
  const [showOnlinePlayers, setShowOnlinePlayers] = useState(false);

  useEffect(() => {
    const handleNativeBack = (event: Event) => {
      if (showHelp) setShowHelp(false);
      else if (showAboutUs) setShowAboutUs(false);
      else if (isEditingProfile) setIsEditingProfile(false);
      else if (showOnlinePlayers) setShowOnlinePlayers(false);
      else if (isSettingsDropdownOpen) setIsSettingsDropdownOpen(false);
      else if (isStakeDropdownOpen) setIsStakeDropdownOpen(false);
      else return;
      event.preventDefault();
    };
    window.addEventListener(NATIVE_BACK_EVENT, handleNativeBack);
    return () => window.removeEventListener(NATIVE_BACK_EVENT, handleNativeBack);
  }, [isEditingProfile, isSettingsDropdownOpen, isStakeDropdownOpen, showAboutUs, showHelp, showOnlinePlayers]);
  const [isFetchingPlayers, setIsFetchingPlayers] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<Record<string, 'idle' | 'sending' | 'sent'>>({});
  const recentlyLeftRef = useRef<string[]>([]);
  // Only users who are currently on Home and available for a direct challenge.
  const availableHomePlayers = onlinePlayers.filter(player => player.status === 'online');

  const fetchOnlinePlayers = async () => {
    try {
      setIsFetchingPlayers(true);
      const res = await fetch(apiUrl(`/api/users/online?userId=${encodeURIComponent(user.id)}&_t=${Date.now()}`));
      if (res.ok) {
        let data = await res.json();
        // Filter out players who have very recently left to prevent reappearing due to race conditions
        if (recentlyLeftRef.current.length > 0) {
          data = data.filter((p: any) => !recentlyLeftRef.current.includes(p.id));
        }
        setOnlinePlayers(data);
      }
    } catch (err: any) {
      if (err?.message !== 'Failed to fetch' && err?.message !== 'Load failed') {
        console.error('Error fetching online players:', err);
      }
    } finally {
      setIsFetchingPlayers(false);
    }
  };

  useEffect(() => {
    fetchOnlinePlayers();
    // SSE refreshes immediately. Poll only as a cross-process safety net and
    // use a shorter interval solely while the radar/list is actively needed.
    const pollInterval = matchmakingState.isQueued || showOnlinePlayers ? 15_000 : 60_000;
    const liveSearchInterval = window.setInterval(fetchOnlinePlayers, pollInterval);
    const handleRefresh = () => fetchOnlinePlayers();
    const handlePlayerLeft = (e: CustomEvent) => {
      const { userId } = e.detail;
      // Optimistically remove from state
      setOnlinePlayers(prev => prev.filter(p => p.id !== userId));
      
      // Add to temporary ignore list to prevent race conditions
      if (!recentlyLeftRef.current.includes(userId)) {
        recentlyLeftRef.current.push(userId);
      }
      
      // Remove from ignore list after 5 seconds
      setTimeout(() => {
        recentlyLeftRef.current = recentlyLeftRef.current.filter(id => id !== userId);
      }, 5000);
    };

    window.addEventListener('refresh_online_players', handleRefresh);
    window.addEventListener('player_left_queue', handlePlayerLeft as EventListener);

    return () => {
      window.clearInterval(liveSearchInterval);
      window.removeEventListener('refresh_online_players', handleRefresh);
      window.removeEventListener('player_left_queue', handlePlayerLeft as EventListener);
    };
  }, [user.id, matchmakingState.isQueued, showOnlinePlayers]);

  useEffect(() => {
    if (isGuest) return;
    let stopped = false;
    const announceHomePresence = async () => {
      if (stopped || document.visibilityState === 'hidden') return;
      try {
        await fetch(apiUrl('/api/users/presence'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            isOfflinePreference: Boolean(user.isOfflinePreference),
          }),
          keepalive: true,
        });
      } catch { /* The next heartbeat retries automatically. */ }
    };
    const timer = window.setInterval(announceHomePresence, 20_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void announceHomePresence(); };
    document.addEventListener('visibilitychange', onVisible);
    void announceHomePresence();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isGuest, user.id, user.username, user.avatar, user.isOfflinePreference]);

  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const handleToggleOnlineStatus = async () => {
    if (isGuest) return onRequireAuth?.('Login samee si aad online status-kaaga u maamusho.');
    try {
      setIsTogglingStatus(true);
      const nextOffline = !user.isOfflinePreference;
      const res = await fetch(apiUrl(`/api/users/${encodeURIComponent(user.id)}/status`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOffline: nextOffline })
      });
      if (res.ok) {
        fetchOnlinePlayers();
      }
    } catch (err) {
      console.error('Error toggling status:', err);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/users/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (err: any) {
      if (err?.message !== 'Failed to fetch' && err?.message !== 'Load failed') {
        console.error('Error fetching leaderboard:', err);
      }
    } finally {
      setLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 10000);
    return () => clearInterval(interval);
  }, []);

  const [isStartingBotMatch, setIsStartingBotMatch] = useState(false);

  const handlePlayWithBot = async () => {
    if (isGuest) return onRequireAuth?.('Login samee si aad Bot ula ciyaarto.');
    try {
      setIsStartingBotMatch(true);
      const res = await fetch('/api/rooms/create-bot-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          betAmount: selectedStake,
          capacity,
          gameMode
        })
      });
      const data = await res.json();
      if (res.ok && data.roomId) {
        onJoinPrivateRoom(data.roomId);
      } else if (data.error) {
        alert(userErrorMessage(data.error));
      }
    } catch (err) {
      console.error('Failed to create bot match', err);
    } finally {
      setIsStartingBotMatch(false);
    }
  };

  const [matchmakingSeconds, setMatchmakingSeconds] = useState(0);
  const [isStartingPartialMatch, setIsStartingPartialMatch] = useState(false);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
  const [radarQueue, setRadarQueue] = useState<{ members: any[]; isOwner: boolean } | null>(null);

  useEffect(() => {
    if (!matchmakingState.isQueued) {
      setMatchmakingSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setMatchmakingSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [matchmakingState.isQueued]);

  const fetchRadarQueue = async () => {
    if (!matchmakingState.isQueued) return;
    try {
      const response = await fetch(apiUrl(`/api/rooms/matchmaking/status?userId=${encodeURIComponent(user.id)}&_t=${Date.now()}`));
      if (!response.ok) return;
      const data = await response.json();
      if (data.active) {
        setRadarQueue({ members: Array.isArray(data.members) ? data.members : [], isOwner: Boolean(data.isOwner) });
      }
    } catch {
      // Keep the last confirmed queue visible during a transient network error.
    }
  };

  useEffect(() => {
    if (!matchmakingState.isQueued) {
      setRadarQueue(null);
      return;
    }
    void fetchRadarQueue();
    const interval = window.setInterval(fetchRadarQueue, 2_000);
    return () => window.clearInterval(interval);
  }, [matchmakingState.isQueued, user.id]);

  const formatMMSS = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartPartialMatch = async () => {
    if (isStartingPartialMatch) return;
    try {
      setIsStartingPartialMatch(true);
      const response = await fetch('/api/rooms/matchmaking/start-partial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The game could not be started.');
      if (data.roomId) onJoinPrivateRoom(data.roomId);
    } catch (error) {
      alert(userErrorMessage(error, 'The game could not be started.'));
    } finally {
      setIsStartingPartialMatch(false);
    }
  };

  const handleRemoveMatchedPlayer = async (targetUserId: string) => {
    if (removingPlayerId) return;
    try {
      setRemovingPlayerId(targetUserId);
      const response = await fetch('/api/rooms/matchmaking/remove-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, targetUserId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The player could not be removed.');
      setRadarQueue(prev => prev ? { ...prev, members: prev.members.filter(player => player.id !== targetUserId) } : prev);
      await Promise.all([fetchOnlinePlayers(), fetchRadarQueue()]);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : userErrorMessage(error, 'The player could not be removed.');
      alert(message);
    } finally {
      setRemovingPlayerId(null);
    }
  };

  const handleChallengePlayer = async (targetUserId: string, betAmount: number) => {
    if (isGuest) return onRequireAuth?.('Login samee si aad ciyaaryahan u challenge-gareyso.');
    if (user.balance < betAmount) {
      alert(`Wallet-kaaga kuma filna! Waxaad u baahan tahay ugu yaraan $${betAmount} si aad u tartanto.`);
      return;
    }

    setInviteStatus(prev => ({ ...prev, [targetUserId]: 'sending' }));
    try {
      const response = await fetch('/api/rooms/challenge/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user.id,
          receiverId: targetUserId,
          betAmount: betAmount,
          capacity,
          gameMode: 'solo'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setInviteStatus(prev => ({ ...prev, [targetUserId]: 'sent' }));
        if (data.roomId) {
          onJoinPrivateRoom(data.roomId);
        }
        setTimeout(() => {
          setInviteStatus(prev => ({ ...prev, [targetUserId]: 'idle' }));
        }, 10000);
      } else {
        const err = await response.json();
        alert(err.error || 'Cilad baa dhacday marka la dirayay martiqaadka.');
        setInviteStatus(prev => ({ ...prev, [targetUserId]: 'idle' }));
      }
    } catch (err) {
      console.error(err);
      setInviteStatus(prev => ({ ...prev, [targetUserId]: 'idle' }));
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) return onRequireAuth?.('Login samee si aad profile u yeelato.');
    try {
      await onProfileUpdate({ username: editName, avatar: avatarIcon });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      setIsEditingProfile(false);
    } catch (e) {
      // Error toast is already handled by the App component
      console.error("Profile update failed:", e);
    }
  };

  const handleCreatePrivate = () => {
    onCreatePrivateRoom(selectedStake, capacity, gameMode);
  };

  const handleJoinPrivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      onJoinPrivateRoom(joinCode.trim().toUpperCase());
    }
  };

  const [activeGames, setActiveGames] = useState<GameRoom[]>([]);

  const fetchActiveGames = async () => {
    try {
      const res = await fetch(`/api/rooms/active?userId=${encodeURIComponent(user.id)}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setActiveGames(data);
      }
    } catch (err) {
      console.error('Error fetching active games:', err);
    }
  };

  useEffect(() => {
    fetchActiveGames();
    const interval = setInterval(fetchActiveGames, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [user.id]);

  if (rejoinableRoom) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0c40] to-[#020012] text-white flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4 bg-black/30 backdrop-blur-lg border border-purple-500/30 p-8 rounded-2xl shadow-2xl shadow-purple-500/20 max-w-sm w-full">
          <h1 className="text-2xl font-black tracking-wider bg-gradient-to-r from-yellow-400 to-white bg-clip-text text-transparent">
            Ciyaar Lagu Jiro!
          </h1>
          <p className="text-sm text-slate-300">
            Waxay u muuqataa inaad ka tagtay ciyaar oo ay weli socoto. Ma rabtaa inaad dib ugu biirto?
          </p>
          <div className="bg-black/20 border border-white/10 p-3 rounded-xl flex justify-around text-xs">
            <div>
              <span className="text-slate-400 font-bold block uppercase">Bet</span>
              <span className="font-mono font-black text-blue-400">${rejoinableRoom.betAmount}</span>
            </div>
            <div>
              <span className="text-slate-400 font-bold block uppercase">Players</span>
              <span className="font-mono font-black text-purple-400">{rejoinableRoom.players.length}/{rejoinableRoom.capacity}</span>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onRejoin}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 text-white font-black text-base py-3 rounded-xl shadow-lg shadow-green-500/20 active:scale-95 transition-all uppercase tracking-widest cursor-pointer"
            >
              Dib u Biiro Ciyaarta (Rejoin)
            </button>
            <button
              onClick={onDismissRejoin}
              className="flex-1 bg-slate-700/50 hover:bg-slate-700/80 text-slate-300 border border-slate-600 font-black text-xs py-3 rounded-xl active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
            >
              Iska Indho Tir (Dismiss)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (matchmakingState.isQueued) {
    // Find all seeking players
    let allSeekingPlayers = onlinePlayers.filter(p => p.status === 'seeking');
    
    // Ensure current user is instantly listed in the global seeking players list when seeking
    const alreadyInList = allSeekingPlayers.some(p => p.id === user.id);
    if (!alreadyInList) {
      allSeekingPlayers = [
        {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          winCount: user.winCount || 0,
          lossCount: user.lossCount || 0,
          balance: user.balance,
          isSimulated: false,
          status: 'seeking',
          seekingDetails: {
            betAmount: matchmakingState.betAmount || 0,
            capacity: matchmakingState.capacity || 2,
            gameMode: matchmakingState.gameMode || 'solo'
          },
          seekingJoinedAt: Date.now()
        },
        ...allSeekingPlayers
      ];
    }

    const selectedCapacity = matchmakingState.gameMode === 'team' ? 4 : (matchmakingState.capacity || 2);
    const selectedMode = matchmakingState.gameMode || 'solo';
    const presenceSeekingPlayers = allSeekingPlayers.filter(player => {
      if (player.id === user.id) return false;
      const details = player.seekingDetails;
      return Number(details?.betAmount ?? 0) === Number(matchmakingState.betAmount || 0)
        && Number(details?.capacity ?? 2) === selectedCapacity
        && (details?.gameMode || 'solo') === selectedMode;
    }).slice(0, Math.max(1, selectedCapacity - 1));
    const confirmedQueueMembers = radarQueue?.members.filter(player => player.id !== user.id) || [];
    const otherSeekingPlayers = radarQueue ? confirmedQueueMembers : presenceSeekingPlayers;
    const joinedCount = Math.min(selectedCapacity, 1 + otherSeekingPlayers.length);
    const compatibleQueueMembers = allSeekingPlayers.filter(player => {
      const details = player.seekingDetails;
      return Number(details?.betAmount ?? 0) === Number(matchmakingState.betAmount || 0)
        && Number(details?.capacity ?? 2) === selectedCapacity
        && (details?.gameMode || 'solo') === selectedMode;
    }).sort((a, b) => Number(a.seekingJoinedAt || 0) - Number(b.seekingJoinedAt || 0));
    const isOriginalSeeker = radarQueue?.isOwner ?? (compatibleQueueMembers[0]?.id === user.id);

    return (
      <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex flex-col items-center py-8 px-4 selection:bg-purple-500 selection:text-white relative overflow-y-auto">
        {/* Concentric ripples background like the image */}
        <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
          <div className="absolute w-[200px] h-[200px] rounded-full border border-purple-500/20 animate-pulse" />
          <div className="absolute w-[400px] h-[400px] rounded-full border border-purple-500/15 animate-pulse [animation-delay:0.5s]" />
          <div className="absolute w-[600px] h-[600px] rounded-full border border-purple-500/10 animate-pulse [animation-delay:1s]" />
          <div className="absolute w-[800px] h-[800px] rounded-full border border-purple-500/5" />
          <div className="absolute w-[1000px] h-[1000px] rounded-full border border-purple-500/5" />
          <div className="absolute w-[1200px] h-[1200px] rounded-full border border-purple-500/5" />
          {/* Colorful soft spotlights */}
          <div className="absolute top-[10%] left-[10%] w-[350px] h-[350px] bg-purple-600/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-[10%] right-[10%] w-[450px] h-[450px] bg-indigo-600/10 rounded-full blur-[120px]" />
        </div>

        {/* Top Header */}
        <div className="text-center z-10 space-y-1 mb-4">
          <img src="/ludosom-logo.png" alt="LudoSom Landhu" className="mx-auto mb-2 h-14 w-14 rounded-xl object-cover shadow-lg shadow-purple-500/20 ring-1 ring-yellow-400/40" />
          <h1 className="text-3xl font-black tracking-widest bg-gradient-to-r from-yellow-400 via-white to-purple-400 bg-clip-text text-transparent">
            Ludo$om
          </h1>
          <p className="text-[10px] font-black text-purple-400 tracking-wider uppercase">{t('searchingPlayers')}</p>
          <div className="inline-block bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest mt-1">
            Stake: ${matchmakingState.betAmount} · {selectedMode === 'team' ? '2v2' : `Solo ${selectedCapacity}P`} · {joinedCount}/{selectedCapacity}
          </div>
        </div>

        {/* Radar Orbits */}
        <div className="relative w-64 h-64 flex items-center justify-center z-10 my-4 shrink-0">
          {/* Outer rotating orbit line */}
          <div className="absolute w-64 h-64 rounded-full border border-purple-500/20 animate-spin [animation-duration:15s]" />
          {/* Middle rotating orbit line */}
          <div className="absolute w-48 h-48 rounded-full border border-purple-500/10 animate-spin [animation-duration:8s] [animation-direction:reverse]" />
          {/* Inner orbit line */}
          <div className="absolute w-32 h-32 rounded-full border border-dashed border-purple-500/30 animate-pulse" />

          {/* Radar sweeping scan line */}
          <div className="absolute w-32 h-32 origin-bottom-right bottom-1/2 right-1/2 bg-gradient-to-br from-purple-500/20 to-transparent rounded-tl-full animate-[spin_4s_linear_infinite]" />

          {/* Opponent 1 profile (orbiting / searching) */}
          <div className="absolute -top-4 left-1/4 bg-[#1B0D44] border-2 border-purple-500/40 p-2 rounded-full shadow-lg animate-pulse">
            <span className="text-2xl">👥</span>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-purple-600/80 text-[8px] font-bold px-1.5 rounded whitespace-nowrap">{t('searchingPlayers')}</div>
          </div>

          {/* Opponent 2 profile */}
          <div className="absolute bottom-4 -right-2 bg-[#1B0D44] border-2 border-purple-500/40 p-2 rounded-full shadow-lg animate-pulse [animation-delay:0.5s]">
            <span className="text-2xl">❓</span>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-slate-600 text-[8px] font-bold px-1.5 rounded whitespace-nowrap">{t('searchingPlayers')}</div>
          </div>

          {/* Opponent 3 profile */}
          <div className="absolute bottom-6 left-0 bg-[#1B0D44] border-2 border-purple-500/40 p-2 rounded-full shadow-lg animate-pulse [animation-delay:1s]">
            <span className="text-2xl">❓</span>
          </div>

          {/* Center User Profile */}
          <div className="relative bg-gradient-to-tr from-purple-600 to-indigo-600 p-4 rounded-full border-4 border-yellow-400 shadow-2xl shadow-purple-500/50 z-20">
            <AvatarDisplay avatar={user.avatar} username={user.username} className="h-16 w-16 rounded-full object-cover flex items-center justify-center overflow-hidden" textClassName="text-4xl" />
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-[9px] font-black px-2 py-0.5 rounded-full uppercase shadow">
              {t('you')}
            </div>
          </div>
        </div>

        {/* Counter & Loading bar */}
        <div className="text-center z-10 w-full max-w-xs space-y-3 my-2">
          <div className="space-y-0.5">
            <span className="text-4xl font-black tracking-widest font-mono bg-gradient-to-r from-yellow-300 to-white bg-clip-text text-transparent">
              {formatMMSS(matchmakingSeconds)}
            </span>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest animate-pulse">
              {t('searchingPlayers').toUpperCase()}...
            </p>
          </div>

          {/* Loading bar */}
          <div className="w-full bg-black/40 h-2 rounded-full border border-white/5 overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-400 via-purple-500 to-indigo-600 h-full w-[70%] animate-[pulse_2s_infinite]" />
          </div>
        </div>

        {/* RADERKA TARTANKA PANEL - Added inside the radar search screen */}
        {otherSeekingPlayers.length > 0 ? (
          <div className="w-full max-w-sm z-10 my-4">
            <div className="bg-white/5 backdrop-blur-md border border-purple-500/20 rounded-2xl overflow-hidden shadow-xl shadow-purple-500/10">
              <div className="bg-purple-900/30 px-4 py-3 border-b border-purple-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping" />
                  <span className="text-xs font-black uppercase tracking-wider text-purple-100 flex items-center gap-1.5">
                    {t('matchmakingRadar')} ({joinedCount}/{selectedCapacity})
                  </span>
                </div>
                <button 
                  onClick={fetchOnlinePlayers}
                  disabled={isFetchingPlayers}
                  className="text-[10px] text-purple-300 font-extrabold uppercase hover:underline cursor-pointer disabled:opacity-50"
                >
                  {isFetchingPlayers ? t('loading') : t('refresh')}
                </button>
              </div>

              <div className="p-1 divide-y divide-white/5 bg-black/20 max-h-[171px] overflow-y-auto">
                {otherSeekingPlayers.length === 0 ? (
                  <div className="p-4 text-center space-y-1">
                    <div className="text-lg animate-pulse">📡</div>
                    <p className="text-[11px] text-green-400 font-black uppercase tracking-wide animate-pulse">
                      {t('radarActive')}
                    </p>
                    <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                      {t('radarVisible')}
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium leading-relaxed max-w-xs mx-auto">
                      {t('radarWait')}
                    </p>
                  </div>
                ) : (
                  otherSeekingPlayers.map((player) => {
                    return (
                      <div key={player.id} className="p-2.5 flex items-center justify-between text-xs transition-colors bg-purple-900/20 border-l-2 border-purple-400 hover:bg-purple-900/30">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <AvatarDisplay avatar={player.avatar} username={player.username} className="h-8 w-8 rounded-lg object-cover bg-black/30 border border-white/5 flex items-center justify-center shadow-inner overflow-hidden" textClassName="text-xl" />
                            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-[#120738] bg-purple-400 animate-ping" />
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-200 text-[11px]">
                                {player.username}
                              </span>
                              <span className="text-[7.5px] px-1 py-0.2 rounded-full font-black uppercase border bg-purple-500/30 text-purple-200 border-purple-400/50">
                                🔍 ({player.seekingDetails?.betAmount ? '$' + player.seekingDetails.betAmount : 'Free'})
                              </span>
                            </div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase">
                              Wins: {player.winCount} • Defeats: {player.lossCount}
                            </p>
                          </div>
                        </div>
                        {isOriginalSeeker ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveMatchedPlayer(player.id)}
                            disabled={removingPlayerId === player.id}
                            className="rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[9.5px] font-black uppercase tracking-wider text-red-300 disabled:opacity-50"
                          >
                            {removingPlayerId === player.id ? 'Removing…' : 'Remove'}
                          </button>
                        ) : (
                          <div className="rounded-lg border border-green-400/30 bg-green-500/10 px-2.5 py-1 text-[9.5px] font-black uppercase tracking-wider text-green-300">
                            Joined {joinedCount}/{selectedCapacity}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm z-10 my-4">
            <div className="bg-white/5 backdrop-blur-md border border-purple-500/20 rounded-2xl overflow-hidden shadow-xl shadow-purple-500/10">
              <div className="p-4 text-center space-y-1">
                <div className="text-lg animate-pulse">📡</div>
                <p className="text-[11px] text-green-400 font-black uppercase tracking-wide animate-pulse">
                  {t('radarActive')}
                </p>
                <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                  {t('radarVisible')}
                </p>
                <p className="text-[9px] text-slate-400 font-medium leading-relaxed max-w-xs mx-auto">
                  {t('radarWait')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid w-full max-w-xs grid-cols-2 gap-2 z-10 mt-2">
          {selectedCapacity === 4 && isOriginalSeeker && joinedCount >= 2 && (
            <button
              onClick={handleStartPartialMatch}
              disabled={isStartingPartialMatch}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 border border-emerald-300/50 font-black text-xs py-3 rounded-xl active:scale-95 transition-all cursor-pointer uppercase tracking-wider disabled:opacity-50"
            >
              {isStartingPartialMatch ? 'Starting…' : `Start Game (${joinedCount}P)`}
            </button>
          )}
          <button
            onClick={() => onLeaveMatchmaking(matchmakingState.betAmount, matchmakingState.capacity, matchmakingState.gameMode)}
            className={`${selectedCapacity === 4 && isOriginalSeeker && joinedCount >= 2 ? 'w-full' : 'col-span-2 w-full'} bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-black text-xs py-3 rounded-xl active:scale-95 transition-all cursor-pointer uppercase tracking-wider`}
          >
            Cancel Radar
          </button>
        </div>
      </div>
    );
  }

  return (
    <><LiveAdBanner placement="dashboard" />
    <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex flex-col pb-12 selection:bg-purple-500 selection:text-white relative overflow-hidden">
      {/* Concentric ripples background like the image */}
      <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
        <div className="absolute w-[200px] h-[200px] rounded-full border border-purple-500/10" />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-purple-500/5 animate-pulse" />
        <div className="absolute w-[600px] h-[600px] rounded-full border border-purple-500/5" />
        <div className="absolute w-[800px] h-[800px] rounded-full border border-purple-500/5" />
        {/* Soft purple gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]" />
      </div>
      
      {/* 1. STICKY TOP HEADER */}
      <header className="sticky top-0 z-30 bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <img src="/ludosom-logo.png" alt="LudoSom Landhu" className="h-10 w-10 rounded-lg object-cover shadow-md shadow-purple-500/15 ring-1 ring-yellow-400/40" />
          <div>
            <span className="font-black text-sm tracking-widest block text-yellow-400">Ludo<span className="text-white">$om</span></span>
            <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest block">Ludo Arena Soomaaliyeed</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Wallet Balance Badge */}
          <button
            onClick={onOpenWallet}
            className="bg-black/40 hover:bg-black/60 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-mono text-white font-bold">{isGuest ? 'Login' : formatCurrency(user.balance)}</span>
            {!isGuest && <span className="bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black flex items-center justify-center">+</span>}
          </button>

          {/* Settings Dropdown */}
          <div className="relative" ref={settingsDropdownRef}>
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setIsSettingsDropdownOpen(prev => !prev)}
            >
              <AvatarDisplay avatar={user.avatar} username={user.username} className="h-9 w-9 rounded-full object-cover bg-black/20 flex items-center justify-center overflow-hidden" textClassName="text-2xl" />
              <MoreVertical className="w-4 h-4 text-slate-400" />
            </div>

            {isSettingsDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-[#1A0C40] border border-purple-500/40 rounded-xl shadow-2xl z-40 text-sm">
                <div className="p-2 border-b border-purple-500/20">
                  <p className="font-bold text-white">{user.username}</p>
                  {user.email && <p className="text-xs text-slate-400">{user.email}</p>}
                </div>
                <div className="p-1">
                  <button
                    onClick={() => {
                      if (isGuest) onRequireAuth?.('Login samee si aad profile-kaaga u maamusho.');
                      else setIsEditingProfile(true);
                      setIsSettingsDropdownOpen(false);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-purple-500/20 hover:text-white rounded-md"
                  >
                    <User className="w-4 h-4" />
                    <span>{t('profileSettings')}</span>
                  </button>
                  <LanguageToggle />
                  <button
                    onClick={() => {
                      setShowAboutUs(true);
                      setIsSettingsDropdownOpen(false);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-purple-500/20 hover:text-white rounded-md"
                  >
                    <Info className="w-4 h-4" />
                    <span>{t('aboutUs')}</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('/vip');
                      setIsSettingsDropdownOpen(false);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-300 rounded-md"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{t('becomeVip')}</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('/tournaments');
                      setIsSettingsDropdownOpen(false);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-green-400 hover:bg-green-500/20 hover:text-green-300 rounded-md"
                  >
                    <Trophy className="w-4 h-4" />
                    <span>{t('tournaments')}</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowHelp(true);
                      setIsSettingsDropdownOpen(false);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-purple-500/20 hover:text-white rounded-md"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>{t('help')}</span>
                  </button>
                  <button
                    onClick={downloadLatestApk}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 rounded-md"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download App</span>
                  </button>
                  <button
                    onClick={() => {
                      onLogout();
                      setIsSettingsDropdownOpen(false);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-md"
                  >
                    {isGuest ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                    <span>{isGuest ? 'Login / Sign up' : t('logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {noticeSlot}

      {/* 2. BODY SCROLLER CONTAINER */}
      <main className="max-w-md w-full mx-auto px-4 py-6 relative z-10 space-y-4">

        {/* PROFILE CARD */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 p-3 sm:p-4 shadow-xl backdrop-blur-xl flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 flex-1">
            <div className="relative shrink-0">
              <AvatarDisplay avatar={user.avatar} username={user.username} className="flex h-10 w-10 sm:h-12 sm:w-12 object-cover items-center justify-center rounded-xl border border-purple-500/30 bg-purple-950/40 shadow-inner overflow-hidden" textClassName="text-xl sm:text-2xl" />
              <span 
                className={`absolute -bottom-1 -right-1 h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full border-2 border-slate-900 ${
                  user.isOfflinePreference ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'
                }`} 
              />
            </div>

            <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <h2 className="text-xs sm:text-base font-bold text-white tracking-wide truncate max-w-[100px] xs:max-w-[140px] sm:max-w-none" title={user.username}>
                  {user.username} {user.vip && user.vip.expires > Date.now() && <span className="ml-1 text-yellow-400 text-lg">👑</span>}
                </h2>
                <button 
                  onClick={() => isGuest ? onRequireAuth?.('Login samee si aad profile-kaaga u maamusho.') : setIsEditingProfile(!isEditingProfile)}
                  className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-blue-400 hover:bg-white/10 transition-all cursor-pointer active:scale-95"
                >
                  Edit
                </button>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-300 font-medium whitespace-nowrap">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <Flame className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-400" />
                  {user.winCount} Wins
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">{user.lossCount} Defeats</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleToggleOnlineStatus}
            disabled={isTogglingStatus}
            className={`shrink-0 flex items-center gap-1.5 sm:gap-2 rounded-xl border px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold transition-all cursor-pointer shadow-md active:scale-95 ${
              user.isOfflinePreference
                ? 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
            } disabled:opacity-50`}
          >
            <span className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${user.isOfflinePreference ? 'bg-slate-400' : 'bg-emerald-400 animate-pulse'}`} />
            <span>{user.isOfflinePreference ? 'Offline' : 'Online'}</span>
          </button>
        </div>

        {/* PROFILE EDITOR MODAL */}
        {isEditingProfile && user && (
          <UserEditModal
            user={user}
            onClose={() => setIsEditingProfile(false)}
            onSave={async (updatedUser) => {
              await onProfileUpdate(updatedUser);
              setIsEditingProfile(false);
              setSaveSuccess(true);
              setTimeout(() => setSaveSuccess(false), 3000);
            }}
          />
        )}

        {saveSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>Profile settings updated successfully!</span>
          </div>
        )}
        {showOnlinePlayers && (
          <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/45 px-3 pt-[72px] backdrop-blur-[2px]">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-400/20 bg-[#0b1220]/98 shadow-[0_18px_55px_rgba(0,0,0,0.55)]">
              <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
                <div>
                  <h3 className="text-xs font-black text-white">Online Players</h3>
                  <p className="text-[9px] font-semibold text-emerald-400">Home · Ready to challenge</p>
                </div>
                <button onClick={() => setShowOnlinePlayers(false)} className="rounded-full bg-white/5 p-1.5 text-slate-300"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="max-h-[48vh] space-y-1 overflow-y-auto p-2">
                {availableHomePlayers.length === 0 ? (
                  <div className="py-8 text-center text-[10px] font-bold text-slate-500">Hadda ma jiro ciyaaryahan Home-ka jooga.</div>
                ) : availableHomePlayers.map(player => {
                  const status = inviteStatus[player.id] || 'idle';
                  return (
                    <div key={player.id} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-2 py-1.5">
                      <AvatarDisplay avatar={player.avatar} username={player.username} className="h-8 w-8 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-black text-white">{player.username}</div>
                        <div className="flex items-center gap-1 text-[8px] font-bold text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online · Home</div>
                      </div>
                      <button
                        disabled={status !== 'idle'}
                        onClick={() => void handleChallengePlayer(player.id, selectedStake)}
                        className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-1.5 text-[8px] font-black uppercase text-white disabled:opacity-50"
                      >
                        {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent ✓' : 'Challenge'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <MatchmakingRadar 
          onlinePlayers={onlinePlayers.filter(player => player.status === 'seeking')}
          currentUser={user}
          matchmakingState={matchmakingState}
          fetchOnlinePlayers={fetchOnlinePlayers}
          isFetchingPlayers={isFetchingPlayers}
          onStartMatchmaking={onStartMatchmaking}
          inviteStatus={inviteStatus}
          className="mt-[3px]"
        />

        {/* 3. CORE BETTING MATCHMAKER BLOCK */}
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl shadow-2xl space-y-0 relative">
          <div className="bg-black/30 px-4 py-3 border-b border-white/10 flex items-center justify-between rounded-t-2xl">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Choose Bet Stake</span>
            <button onClick={() => { setShowOnlinePlayers(true); void fetchOnlinePlayers(); }} className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
    <TrendingUp className="w-3.5 h-3.5" /> {availableHomePlayers.length} Online
</button>
          </div>

          <div className="p-4 space-y-4">
            {/* COLLAPSIBLE / DROPDOWN SELECTOR FOR STAKE */}
            <div className="relative" ref={dropdownRef}>
              {/* Dropdown Trigger Button */}
              <button
                type="button"
                disabled={matchmakingState.isQueued}
                onClick={() => setIsStakeDropdownOpen(!isStakeDropdownOpen)}
                className="w-full bg-black/40 hover:bg-black/60 border border-blue-500/30 focus:border-blue-400 p-2.5 px-3 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer shadow-inner disabled:opacity-50"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-black text-[11px] text-white shadow-md shrink-0">
                    {selectedTier.amount === 0 ? 'PRO' : `$${selectedTier.amount}`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs text-white truncate">
                      {selectedTier.label}
                    </div>
                    <div className="text-[10px] text-blue-300 font-medium truncate">{selectedTier.desc}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                    {selectedTier.amount === 0 ? 'FREE' : `$${selectedTier.amount}`}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isStakeDropdownOpen ? 'rotate-180 text-blue-400' : ''}`} />
                </div>
              </button>

              {/* Collapsible Dropdown List */}
              {isStakeDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#12082b]/95 backdrop-blur-xl border border-blue-500/30 rounded-xl shadow-2xl z-40 overflow-hidden divide-y divide-white/5 max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in duration-150">
                  {STAKE_TIERS.map((tier) => {
                    const isSelected = selectedStake === tier.amount;
                    return (
                      <button
                        key={tier.amount}
                        type="button"
                        onClick={() => {
                          setSelectedStake(tier.amount);
                          setIsStakeDropdownOpen(false);
                        }}
                        className={`w-full p-2 px-3 text-left flex items-center justify-between transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-blue-600/30 text-white font-bold border-l-4 border-blue-400' 
                            : 'hover:bg-white/5 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 ${
                            tier.amount === 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {tier.amount === 0 ? '0' : `$${tier.amount}`}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-white truncate">{tier.label}</div>
                            <div className="text-[9.5px] text-slate-400 font-normal leading-tight truncate">{tier.desc}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {tier.amount > 0 && (
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                              ${tier.amount}
                            </span>
                          )}
                          {isSelected && <CheckCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* GAME OPTIONS: CAPACITY */}
            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <div className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider">{t('players')}</div>
              <div className="grid grid-cols-2 gap-2">
                {[2, 4].map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    disabled={matchmakingState.isQueued}
                    onClick={() => {
                      setCapacity(cap);
                      if (cap === 2) {
                        setGameMode('solo');
                      }
                    }}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      capacity === cap
                        ? 'bg-purple-600/30 border-purple-500 text-white shadow-md'
                        : 'bg-black/20 border-white/5 hover:border-white/10 text-slate-400'
                    } disabled:opacity-50`}
                  >
                    {cap} {t('players')}
                  </button>
                ))}
              </div>
            </div>

            {/* GAME OPTIONS: GAME MODE */}
            {capacity === 4 && (
            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <div className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider">{t('gameMode')}</div>
              <div className="grid grid-cols-2 gap-2">
                {(['solo', 'team'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={matchmakingState.isQueued}
                    onClick={() => setGameMode(mode)}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      gameMode === mode
                        ? 'bg-purple-600/30 border-purple-500 text-white shadow-md'
                        : 'bg-black/20 border-white/5 hover:border-white/10 text-slate-400'
                    } disabled:opacity-50`}
                  >
                    {t(mode === 'solo' ? 'soloMode' : 'partnershipMode')}
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* ACTION BUTTON (MATCHMAKE OR QUEUE STATE) */}
            {matchmakingState.isQueued ? (
              <div className="bg-black/40 border border-blue-500/30 p-4 rounded-xl flex flex-col items-center justify-center space-y-3 text-center">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-2 border-t-blue-500 border-r-blue-500/20 border-b-blue-500/20 border-l-blue-500/20 animate-spin" />
                  <Search className="w-5 h-5 text-blue-400 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-blue-400">{t('searchingPlayers')}</h4>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    Bet: ${matchmakingState.betAmount} • Mode: {matchmakingState.gameMode === 'team' ? t('partnershipMode') : `${t('soloMode')} (${matchmakingState.capacity || 2} ${t('players')})`}
                  </p>
                </div>
                <button
                  onClick={() => onLeaveMatchmaking(matchmakingState.betAmount, matchmakingState.capacity, matchmakingState.gameMode)}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold text-xs py-1.5 px-4 rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  {t('cancelSearch')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={() => onStartMatchmaking(selectedStake, capacity, gameMode)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm py-3.5 px-3 rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-1.5 border border-blue-400/30 active:scale-95 transition-all uppercase tracking-wider cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-yellow-300 animate-bounce shrink-0" />
                  <span>{t('searchLivePlayers')}</span>
                </button>

                <button
                  onClick={handlePlayWithBot}
                  disabled={isStartingBotMatch}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm py-3.5 px-3 rounded-xl shadow-lg shadow-purple-600/20 flex items-center justify-center gap-1.5 border border-purple-400/30 active:scale-95 transition-all uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  <Bot className="w-4 h-4 text-purple-200 shrink-0" />
                  <span>{isStartingBotMatch ? t('loadingBot') : t('playAgainstBot')}</span>
                </button>
              </div>
            )}
          </div>
        </div>


        {/* 4. PRIVATE ROOM CODES WITH FRIENDS */}
        <div className="bg-gradient-to-br from-purple-900/50 to-indigo-900/50 backdrop-blur-md border border-purple-700/50 rounded-2xl p-4 space-y-4 shadow-lg">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-yellow-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">{t('privateMatchTitle')}</h3>
          </div>

          <div className="text-xs text-slate-300 font-medium leading-normal bg-black/40 p-3 rounded-xl border border-purple-800/60 text-center shadow-inner">
            {t('privateMatchDesc')}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleCreatePrivate}
              disabled={matchmakingState.isQueued}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md shadow-yellow-500/20"
            >
              <Plus className="w-4 h-4" /> <span>{t('createCustomLobby')}</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-full h-px bg-purple-700/50"></div>
              <span className="text-xs font-bold text-slate-400">OR</span>
              <div className="w-full h-px bg-purple-700/50"></div>
            </div>

            <form onSubmit={handleJoinPrivate} className="flex gap-2">
              <input
                type="text"
                maxLength={5}
                required
                placeholder={t('lobbyCode')}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                disabled={matchmakingState.isQueued}
                className="flex-grow bg-black/50 border-2 border-purple-700/80 focus:border-yellow-400 text-white font-mono text-lg tracking-[0.5em] text-center rounded-lg px-3 py-2 outline-none transition-all duration-300 disabled:opacity-50 placeholder-purple-400/50"
              />
              <button
                type="submit"
                disabled={matchmakingState.isQueued || !joinCode.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 rounded-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:bg-gray-600 shadow-md shadow-indigo-600/20"
              >
                <LogIn className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>

        {/* ACTIVE GAMES (SPECTATOR) LIST */}
        <ActiveGamesList games={activeGames} />

        {/* 5. LEADERBOARD */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-xl shadow-blue-500/5">
          <div className="bg-white/5 px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-200">{t('globalLeaderboard')}</span>
          </div>

          <div className="p-3 divide-y divide-white/5 bg-black/10">
            {leaderboardLoading ? (
              <p className="py-6 text-center text-xs font-semibold text-slate-500">Loading earnings...</p>
            ) : leaderboard.length === 0 ? (
              <p className="py-6 text-center text-xs font-semibold text-slate-500">No game earnings yet.</p>
            ) : leaderboard.map((player) => (
              <div key={player.id || player.rank} className="py-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-5 font-black ${player.rank === 1 ? 'text-yellow-400' : 'text-slate-500'}`}>
                    #{player.rank}
                  </span>
                  <AvatarDisplay avatar={player.avatar} username={player.name} className="h-6 w-6 rounded-full object-cover flex items-center justify-center overflow-hidden" textClassName="text-sm" />
                  <span className="font-bold text-slate-200">{player.name}</span>
                </div>
                <div className="text-right space-y-0.5">
                  <p className="font-black text-blue-400 font-mono">{formatCurrency(player.earnings)}</p>
                  <p className="text-[9px] text-slate-500 font-semibold">{player.wins} Match Wins</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. SYSTEM DESCR */}
        <div className="text-center text-[10px] text-slate-500 space-y-1 mt-4">
          <p className="font-semibold flex items-center justify-center gap-1">
            <Info className="w-3 h-3 text-slate-400" /> Verified Fair Play & Authoritative RNG Roll Engine
          </p>
          <p>Ludo Arena uses cryptography-secured server-authoritative random seeds for dice computations. Handshake escrow prevents early-rage quitting exploits.</p>
        </div>

      </main>
      {showAboutUs && <AboutUs onClose={() => setShowAboutUs(false)} />}
      {showHelp && <Help onClose={() => setShowHelp(false)} />}
    </div>
  </>);
}
