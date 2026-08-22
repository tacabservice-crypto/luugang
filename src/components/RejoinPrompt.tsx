/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { GameRoom } from '../types/game';
import { useLanguage } from '../context/LanguageContext';

interface RejoinPromptProps {
  rejoinableRoom: GameRoom;
  onRejoin: () => void;
  onDismissRejoin: () => void;
}

export default function RejoinPrompt({ rejoinableRoom, onRejoin, onDismissRejoin }: RejoinPromptProps) {
  const { language } = useLanguage();
  const so = language === 'so';
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0c40] to-[#020012] text-white flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-4 bg-black/30 backdrop-blur-lg border border-purple-500/30 p-8 rounded-2xl shadow-2xl shadow-purple-500/20 max-w-sm w-full">
        <h1 className="text-2xl font-black tracking-wider bg-gradient-to-r from-yellow-400 to-white bg-clip-text text-transparent">
          {so ? 'Ciyaar Lagu Jiro!' : 'Active Game Found!'}
        </h1>
        <p className="text-sm text-slate-300">
          {so ? 'Waxay u muuqataa inaad ka tagtay ciyaar oo ay weli socoto. Ma rabtaa inaad dib ugu biirto?' : 'You appear to have left a game that is still active. Would you like to rejoin it?'}
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
            {so ? 'Dib ugu Biir Ciyaarta' : 'Rejoin Game'}
          </button>
          <button
            onClick={onDismissRejoin}
            className="flex-1 bg-slate-700/50 hover:bg-slate-700/80 text-slate-300 border border-slate-600 font-black text-xs py-3 rounded-xl active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
          >
            {so ? 'Iska Indho Tir' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
}
