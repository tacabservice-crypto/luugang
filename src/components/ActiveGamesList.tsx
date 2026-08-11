import React, { useState } from 'react';
import { GameRoom } from '../types/game';
import { Eye, Loader2, Gamepad2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ActiveGamesListProps {
  games: GameRoom[];
}

const ActiveGamesList: React.FC<ActiveGamesListProps> = ({ games }) => {
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSpectate = (roomId: string) => {
    setLoadingRoomId(roomId);
    navigate(`/room/${roomId}?spectate=true`);
  };

  // If there are no games, don't render anything to keep the UI clean.
  if (games.length === 0) {
    return null;
  }

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-xl">
      <div className="bg-white/5 px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Gamepad2 className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-black uppercase tracking-wider text-slate-200">Ciyaaraha Tooska Ah (Live Games)</span>
      </div>

      <div className="p-1.5 divide-y divide-white/5 bg-black/10">
        {games.map((game) => (
          <div key={game.id} className="px-2 py-2 flex items-center justify-between text-xs">
            {/* Left side: Avatars and Game ID */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-3 items-center shrink-0">
                {game.players.slice(0, 2).map(player => (
                  <div key={player.userId} title={player.username} className="w-7 h-7 rounded-full bg-black/40 flex items-center justify-center text-sm border-2 border-slate-700">
                    {player.avatar}
                  </div>
                ))}
                {game.players.length > 2 && (
                  <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold border-2 border-slate-600">
                    +{game.players.length - 2}
                  </div>
                )}
              </div>
              <div>
                <p className="font-bold text-slate-200 text-sm">{game.id}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{game.players.length} Players / {game.capacity}</p>
              </div>
            </div>

            {/* Right side: Bet amount and Watch button */}
            <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-black bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded">
                    ${game.betAmount}
                </span>
                <button
                    onClick={() => handleSpectate(game.id)}
                    disabled={loadingRoomId === game.id}
                    className="bg-purple-600/80 hover:bg-purple-600 text-white font-bold px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md disabled:bg-gray-500 disabled:cursor-wait"
                >
                    {loadingRoomId === game.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Eye className="h-4 w-4" />
                    )}
                </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


export default ActiveGamesList;
