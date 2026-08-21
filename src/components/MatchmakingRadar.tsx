import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { UserProfile } from '../types/game';
import { CircleDollarSign, Users } from 'lucide-react';
import AvatarDisplay from './AvatarDisplay';

interface Player {
    id: string;
    username: string;
    avatar: string;
    winCount: number;
    lossCount: number;
    status: 'online' | 'seeking';
    seekingDetails?: {
      betAmount: number;
      capacity?: number;
      gameMode?: 'solo' | 'team';
    };
    isSimulated?: boolean;
    balance?: number;
    seekingJoinedAt?: number;
}

interface MatchmakingRadarProps {
  onlinePlayers: Player[];
  currentUser: UserProfile;
  matchmakingState: {
    isQueued: boolean;
    betAmount: number;
    capacity?: number;
    gameMode?: 'solo' | 'team';
  };
  fetchOnlinePlayers: () => void;
  isFetchingPlayers: boolean;
  onStartMatchmaking: (betAmount: number, capacity: number, gameMode: 'solo' | 'team', opponentId?: string) => void;
  inviteStatus: Record<string, 'idle' | 'sending' | 'sent'>;
  className?: string; // Add className prop
}

const MatchmakingRadar: React.FC<MatchmakingRadarProps> = ({ 
  onlinePlayers, 
  currentUser, 
  matchmakingState, 
  onStartMatchmaking, 
  inviteStatus,
  className // Destructure className
}) => {
  const { t, language } = useLanguage();
  const [displayedPlayers, setDisplayedPlayers] = useState<Player[]>([]);
  const rotationIndexRef = useRef(0);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;

    const otherOnlinePlayers = onlinePlayers.filter(p => p.id !== currentUser.id);

    if (otherOnlinePlayers.length <= 4) {
      setDisplayedPlayers(otherOnlinePlayers);
    } else {
      const shuffledPlayers = [...otherOnlinePlayers].sort(() => Math.random() - 0.5);

      const updateDisplayedPlayers = () => {
        const currentIndex = rotationIndexRef.current;
        let nextSlice = shuffledPlayers.slice(currentIndex, currentIndex + 4);
        
        let nextIndex = currentIndex + 4;

        if (nextSlice.length < 4) {
          const remainingCount = 4 - nextSlice.length;
          nextSlice = nextSlice.concat(shuffledPlayers.slice(0, remainingCount));
          nextIndex = remainingCount;
        }

        if (nextIndex >= shuffledPlayers.length) {
          nextIndex = 0;
        }
        
        rotationIndexRef.current = nextIndex;
        setDisplayedPlayers(nextSlice);
      };

      updateDisplayedPlayers(); // Initial display

      intervalId = setInterval(updateDisplayedPlayers, 7000); // 7 seconds
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [onlinePlayers, currentUser.id]);

  const playersToList = [...onlinePlayers];
  const otherOnlinePlayers = playersToList.filter(p => p.id !== currentUser.id);

  if (otherOnlinePlayers.length === 0) {
    return null;
  }

  return (
    <div className={`bg-transparent backdrop-blur-md overflow-hidden ${className || ''}`}>
      <div className="relative">
        <div className="flex flex-col">
          {displayedPlayers.length === 0 && otherOnlinePlayers.length > 0 ? (
             <div className="w-full p-4 text-center space-y-1">
                <div className="text-lg animate-pulse">📡</div>
                 <p className="text-[11px] text-green-400 font-black uppercase tracking-wide animate-pulse">
                   {t('radarActive')}
                 </p>
               </div>
          ) : (
            <>
              {displayedPlayers.map((player, index) => {
                const isSelf = player.id === currentUser.id;
                const isSeeking = player.status === 'seeking';
                return (
                  <div key={`${player.id}-${index}`} className="px-2 py-1.5 flex items-center justify-between text-[11px] transition-colors hover:bg-purple-900/30">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <AvatarDisplay avatar={player.avatar} username={player.username} className="h-8 w-8 object-cover bg-black/30 border border-white/5 flex items-center justify-center shadow-inner overflow-hidden" textClassName="text-xl" />
                        <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-[#120738] ${isSeeking ? 'bg-purple-400 animate-ping' : 'bg-green-400'}`} />
                      </div>
                      <div className="space-y-0">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-slate-200 text-[11px]">
                            {player.username} {isSelf && <span className="text-[9px] text-purple-300 font-normal">({t('you')})</span>}
                          </span>
                          {isSeeking ? (
                            <div className="flex items-center gap-1 text-[8px] font-bold uppercase">
                                <span className="flex items-center gap-1 bg-purple-500/20 text-purple-200 px-1.5 py-0.5 rounded-full border border-purple-400/30">
                                    <CircleDollarSign className="h-2.5 w-2.5" />
                                    {player.seekingDetails?.betAmount ? `$${player.seekingDetails.betAmount}` : 'Free'}
                                </span>
                                <span className="flex items-center gap-1 bg-purple-500/20 text-purple-200 px-1.5 py-0.5 rounded-full border border-purple-400/30">
                                    <Users className="h-2.5 w-2.5" />
                                    {player.seekingDetails?.gameMode === 'team' ? 4 : (player.seekingDetails?.capacity || 2)} Players
                                </span>
                            </div>
                          ) : (
                            <span className="text-[7px] px-1 py-0.5 rounded-full font-black uppercase border bg-green-500/20 text-green-300 border-green-500/30">
                              🟢 {language === 'so' ? 'ONLAYN' : 'ONLINE'}
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase">
                          {t('wins')}: {player.winCount} • {t('losses')}: {player.lossCount}
                        </p>
                      </div>
                    </div>
                    <div>
                      {isSelf ? (
                        <div className="flex items-center gap-1 text-[8px] font-bold uppercase animate-pulse">
                            <span className="flex items-center gap-1 bg-purple-500/20 text-purple-200 px-1.5 py-0.5 rounded-full border border-purple-400/30">
                                <CircleDollarSign className="h-2.5 w-2.5" />
                                {matchmakingState.betAmount ? `$${matchmakingState.betAmount}` : 'Free'}
                            </span>
                            <span className="flex items-center gap-1 bg-purple-500/20 text-purple-200 px-1.5 py-0.5 rounded-full border border-purple-400/30">
                                <Users className="h-2.5 w-2.5" />
                                {matchmakingState.capacity || 2} Players
                            </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={inviteStatus[player.id] === 'sending'}
                          onClick={() => {
                            const bet = player.seekingDetails?.betAmount ?? 0;
                            const mode = player.seekingDetails?.gameMode ?? 'solo';
                            const cap = mode === 'team' ? 4 : (player.seekingDetails?.capacity ?? 2);
                            // Accepting a 4-player Search Live request joins the
                            // same queue. Only a 2-player Solo request uses the
                            // direct head-to-head challenge endpoint.
                            onStartMatchmaking(bet, cap, mode, cap === 2 && mode === 'solo' ? player.id : undefined);
                          }}
                          className="bg-green-500 hover:bg-green-400 text-black font-black text-[8.5px] px-2 py-0.5 rounded-lg active:scale-95 transition-all uppercase tracking-wider cursor-pointer shadow-md shadow-green-500/25 animate-bounce flex items-center gap-1"
                        >
                          {(player.seekingDetails?.gameMode === 'team' || player.seekingDetails?.capacity === 4) ? 'Accept 4P' : 'Challenge'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MatchmakingRadar;
