/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GameRoom, LudoPlayer } from '../types/game';
import { TranslationKey } from '../context/LanguageContext';
import {
  Shield,
  Clock,
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import AvatarDisplay from './AvatarDisplay';

interface GameHeaderProps {
  room: GameRoom;
  userId: string;
  isMicMuted: boolean;
  isSoundMuted: boolean;
  onToggleMic: () => void;
  onToggleSound: () => void;
  onLeave: () => void;
  t: (key: TranslationKey) => string;
  sortedPlayers: LudoPlayer[];
}

export default function GameHeader({
  room,
  userId,
  isMicMuted,
  isSoundMuted,
  onToggleMic,
  onToggleSound,
  onLeave,
  t,
  sortedPlayers,
}: GameHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl mb-4 px-3 py-2 flex items-center justify-between gap-4 shadow-lg">
      {/* Left side: Mic and Sound */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleMic}
          className={`p-2 rounded-lg transition-all border ${
            isMicMuted
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : 'bg-green-500/10 text-green-400 border-green-500/20'
          }`}
          title={isMicMuted ? t('micMuted') : t('micOn')}
        >
          {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button
          onClick={onToggleSound}
          className={`p-2 rounded-lg transition-all border ${
            isSoundMuted
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : 'bg-green-500/10 text-green-400 border-green-500/20'
          }`}
          title={isSoundMuted ? t('speakersMuted') : t('speakersOn')}
        >
          {isSoundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Center: Players */}
      <div className="flex items-center gap-3 text-xs font-bold">
        {sortedPlayers.map(p => (
          <div key={p.userId} className="flex items-center gap-1.5">
            <AvatarDisplay avatar={p.avatar} username={p.username} className="h-7 w-7 rounded-full object-cover flex items-center justify-center overflow-hidden" textClassName="text-lg" />
            <span className="hidden sm:inline">{p.userId === userId ? t('you') : p.username.split(' ')[0]}</span>
            <MicOff className="w-3.5 h-3.5 text-red-400/70" />
          </div>
        ))}
      </div>

      {/* Right side: Escrow, Timer, Leave */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-yellow-400 bg-black/20 px-3 py-1.5 rounded-lg border border-white/10">
          <Shield className="w-4 h-4" />
          <span>${(room?.gameState?.escrowBalance || 0).toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-black/20 px-3 py-1.5 rounded-lg border border-white/10">
          <Clock className="w-4 h-4" />
          <span>{room.gameState.turnTimer}s</span>
        </div>
        <button
          onClick={onLeave}
          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors cursor-pointer border border-red-500/20"
          title={t('forfeitGame')}
        >
          <X className="w-4 h-4 text-red-400" />
        </button>
      </div>
    </header>
  );
}
