/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import Confetti from 'react-confetti';
import { GameRoom, PlayerColor, ChatMessage, GameLog, LudoToken, UserProfile } from '../types/game';
import LudoBoard from './LudoBoard';
import PhysicalDice from './PhysicalDice';
import LanguageToggle from './LanguageToggle';
import UserEditModal from './UserEditModal';
import LiveAdBanner from './LiveAdBanner';

import {
  ArrowLeft,
  ArrowLeftRight,
  Bot,
  Copy, // Added for copy functionality
  Edit,
  Eye, // Import the Eye icon
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MoreVertical,
  Play,
  Scroll,
  Send,
  Share2, // Added Share2 for sharing functionality
  ShieldAlert,
  ShieldCheck,
  Timer,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { useVoiceChat } from '../context/VoiceChatContext';
import { formatCurrency } from '../utils/number';
import { useLocation, useNavigate } from 'react-router-dom';
import { NATIVE_BACK_EVENT } from './NativeBackHandler';
import { useLanguage } from '../context/LanguageContext';

const QUICK_REACTIONS = [
  { id: 'laugh', emoji: '\u{1F602}', label: 'Qosol' },
  { id: 'love', emoji: '\u{1F60D}', label: 'Jacayl' },
  { id: 'shock', emoji: '\u{1F631}', label: 'Yaab' },
  { id: 'angry', emoji: '\u{1F621}', label: 'Xanaaq' },
  { id: 'clap', emoji: '\u{1F44F}', label: 'Sacab' },
  { id: 'fire', emoji: '\u{1F525}', label: 'Dab' },
  { id: 'hammer', emoji: '\u{1F528}', label: 'Buruus' },
] as const;

// Import audio assets directly
import diceAudioSrc from '../assets/dice.mp3';
import winAudioSrc from '../assets/win.mp3';
import forfeitAudioSrc from '../assets/forfeit.mp3';
import captureAudioSrc from '../assets/capture.mp3';
import tokenOutAudioSrc from '../assets/token_out.mp3';

interface GameRoomProps {
  noticeSlot?: React.ReactNode;
  room: GameRoom;
  user: UserProfile;
  userId: string;
  onLeave: (force: boolean) => void;
  onLogout: () => void;
  onToggleReady: () => void;
  onAddBot: () => void;
  onChangeTeam: (playerId: string, targetTeam: 'A' | 'B', swapWithUserId?: string) => void;
  onStartMatch: () => void;
  onRollDice: () => void | Promise<void>;
  onMoveToken: (tokenId: string) => void;
  onSendChat: (text: string) => void;
  onProfileUpdate: (updatedData: Partial<UserProfile>) => Promise<void>;
  onRetryJoin: () => void;
  isGuest?: boolean;
  onRequireAuth?: (reason?: string) => void;
}

const COLOR_MAP: Record<PlayerColor, string> = {
  red: 'bg-[#E53170]',
  green: 'bg-[#00B074]',
  yellow: 'bg-[#F2C94C]',
  blue: 'bg-[#0090FF]'
};

const COLOR_TEXT_MAP: Record<PlayerColor, string> = {
  red: 'text-[#E53170]',
  green: 'text-[#00B074]',
  yellow: 'text-[#F2C94C]',
  blue: 'text-[#0090FF]'
};

function PlayerAvatar({ avatar, className = 'h-8 w-8 text-2xl' }: { avatar?: string; className?: string }) {
  const value = avatar || '🎮';
  const isImage = value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image/');

  return isImage ? (
    <img src={value} alt="Player avatar" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${className} shrink-0 items-center justify-center`} aria-hidden="true">{value}</span>
  );
}

function usePersistentAudio(source: string) {
  const [audio] = useState<HTMLAudioElement | null>(() => {
    if (typeof Audio === 'undefined') return null;
    const instance = new Audio(source);
    instance.preload = 'auto';
    return instance;
  });
  const ref = useRef<HTMLAudioElement | null>(audio);
  useEffect(() => {
    audio?.load();
    return () => {
      audio?.pause();
      if (audio) audio.currentTime = 0;
    };
  }, [audio]);
  return ref;
}

// Custom hook to get window size
function useWindowSize() {
  const [size, setSize] = useState([0, 0]);
  useEffect(() => {
    function updateSize() {
      setSize([window.innerWidth, window.innerHeight]);
    }
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);
  return { width: size[0], height: size[1] };
}

export default function GameRoomView({
  noticeSlot,
  room,
  user,
  userId,
  onLeave,
  onLogout,
  onToggleReady,
  onAddBot,
  onChangeTeam,
  onStartMatch,
  onRollDice,
  onMoveToken,
  onSendChat,
  onProfileUpdate,
  onRetryJoin,
  isGuest = false,
  onRequireAuth,
}: GameRoomProps) {
  const { language } = useLanguage();
  const so = language === 'so';
  const [chatInput, setChatInput] = useState('');
  const [activePanel, setActivePanel] = useState<'chat' | 'logs' | null>(null);
  const isUtilityPanelOpen = activePanel !== null;
  const [isRolling, setIsRolling] = useState(false);
  const [isRollRequestPending, setIsRollRequestPending] = useState(false);
  const [displayTurnTimer, setDisplayTurnTimer] = useState(room.gameState.turnTimer);
  const [autoRoll, setAutoRoll] = useState(false);
  const [showDicePrompt, setShowDicePrompt] = useState(false);
  const [showOpponentNudge, setShowOpponentNudge] = useState(false);
  const [isNudgePending, setIsNudgePending] = useState(false);
  const [playReminderStrike, setPlayReminderStrike] = useState<number | null>(null);
  const [panelDragY, setPanelDragY] = useState(0);
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isVoiceControlsOpen, setIsVoiceControlsOpen] = useState(false); // New state for voice controls popover
  const [spectatorBet, setSpectatorBet] = useState<any | null>(null);
  const [spectatorMarkets, setSpectatorMarkets] = useState<any[]>([]);
  const [betTargetId, setBetTargetId] = useState('');
  const [betPrediction, setBetPrediction] = useState<'W' | 'L'>('W');
  const [betStake, setBetStake] = useState('0.10');
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [betError, setBetError] = useState('');
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const panelTouchStartYRef = useRef<number | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const voiceControlsRef = useRef<HTMLDivElement>(null); // New ref for voice controls popover
  // Keep audio instances mounted for the entire room session. Conditional
  // result rendering must not recreate and re-download them after game over.
  const diceAudioRef = usePersistentAudio(diceAudioSrc);
  const winAudioRef = usePersistentAudio(winAudioSrc);
  const forfeitAudioRef = usePersistentAudio(forfeitAudioSrc);
  const captureAudioRef = usePersistentAudio(captureAudioSrc);
  const tokenOutAudioRef = usePersistentAudio(tokenOutAudioSrc);
  const resultSoundPlayedRef = useRef<string | null>(null);
  const onRollDiceRef = useRef(onRollDice);
  const rollRequestInFlightRef = useRef(false);
  const optimisticRollRef = useRef(false);
  const rollAnimationStartedAtRef = useRef<number | null>(null);
  const optimisticRollTimeoutRef = useRef<number | null>(null);
  const autoMoveRollRef = useRef<string | null>(null);
  const lastShownInactivityStrikeAtRef = useRef(Number(
    room.players.find(player => player.userId === userId)?.lastInactivityStrikeAt || 0
  ));
  const playReminderTimeoutRef = useRef<number | null>(null);
  const timerAnchorRef = useRef({
    turn: room.gameState.turn,
    seconds: room.gameState.turnTimer,
    receivedAt: Date.now(),
  });
  const prevTokensRef = useRef<LudoToken[]>(room.gameState.tokens);
  const hasPlayedFirstTokenOutSound = useRef<string[]>([]);
  const { width, height } = useWindowSize();
  const { 
    initializeVoiceChat,
    updatePlayers,
    closeVoiceChat, 
    isMuted, 
    toggleMute, 
    isSpeakerOn, 
    toggleSpeaker,
    voiceStatus,
    voiceError,
    retryVoiceChat,
    unlockAudio,
    audioNeedsUnlock,
  } = useVoiceChat();
  const speakerOnRef = useRef(isSpeakerOn);

  useEffect(() => {
    const handleNativeBack = (event: Event) => {
      if (isEditProfileModalOpen) setIsEditProfileModalOpen(false);
      else if (isVoiceControlsOpen) setIsVoiceControlsOpen(false);
      else if (isUserMenuOpen) setIsUserMenuOpen(false);
      else if (activePanel) setActivePanel(null);
      else return;
      event.preventDefault();
    };
    window.addEventListener(NATIVE_BACK_EVENT, handleNativeBack);
    return () => window.removeEventListener(NATIVE_BACK_EVENT, handleNativeBack);
  }, [activePanel, isEditProfileModalOpen, isUserMenuOpen, isVoiceControlsOpen]);

  // Freeze the page behind the floating chat/log panel. Touch gestures may
  // move the panel itself, but the game board must remain at the exact same
  // scroll position until the panel closes.
  useEffect(() => {
    if (!isUtilityPanelOpen) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const previousOverscrollBehavior = root.style.overscrollBehavior;

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';

    return () => {
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      body.style.overflow = previousBodyStyles.overflow;
      root.style.overscrollBehavior = previousOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [isUtilityPanelOpen]);

  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const isSpectator = queryParams.get('spectate') === 'true';

  onRollDiceRef.current = onRollDice;
  speakerOnRef.current = isSpeakerOn;

  const requestDiceRoll = useCallback(async () => {
    if (rollRequestInFlightRef.current) return;
    setPlayReminderStrike(null);
    if (playReminderTimeoutRef.current) window.clearTimeout(playReminderTimeoutRef.current);
    rollRequestInFlightRef.current = true;
    setIsRollRequestPending(true);
    // Give immediate tactile feedback from the user's tap. The authoritative
    // result still comes from the server, but database/network latency should
    // never make the dice look unresponsive.
    optimisticRollRef.current = true;
    rollAnimationStartedAtRef.current = Date.now();
    setIsRolling(true);
    if (speakerOnRef.current && diceAudioRef.current) {
      diceAudioRef.current.volume = 0.5;
      diceAudioRef.current.currentTime = 0;
      void diceAudioRef.current.play().catch(() => undefined);
    }
    try {
      await onRollDiceRef.current();
    } finally {
      rollRequestInFlightRef.current = false;
      setIsRollRequestPending(false);
      if (optimisticRollTimeoutRef.current) window.clearTimeout(optimisticRollTimeoutRef.current);
      optimisticRollTimeoutRef.current = window.setTimeout(() => {
        if (optimisticRollRef.current) {
          optimisticRollRef.current = false;
          setIsRolling(false);
        }
      }, 2500);
    }
  }, []);

  const requestTokenMove = useCallback((tokenId: string) => {
    setPlayReminderStrike(null);
    if (playReminderTimeoutRef.current) window.clearTimeout(playReminderTimeoutRef.current);
    onMoveToken(tokenId);
  }, [onMoveToken]);

  // Render the countdown continuously between authoritative server updates.
  // This removes the visible freezes for clients connected to a non-leader
  // production worker while preserving the server as the source of truth.
  useEffect(() => {
    timerAnchorRef.current = {
      turn: room.gameState.turn,
      seconds: room.gameState.turnTimer,
      receivedAt: Date.now(),
    };
    setDisplayTurnTimer(room.gameState.turnTimer);
  }, [room.gameState.turn, room.gameState.turnTimer, room.gameState.lastActivity]);

  useEffect(() => {
    const updateDisplayTimer = () => {
      const anchor = timerAnchorRef.current;
      const elapsed = Math.floor((Date.now() - anchor.receivedAt) / 1000);
      const next = Math.max(0, anchor.seconds - elapsed);
      setDisplayTurnTimer(current => current === next ? current : next);
    };
    const interval = window.setInterval(updateDisplayTimer, 250);
    document.addEventListener('visibilitychange', updateDisplayTimer);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', updateDisplayTimer);
      if (optimisticRollTimeoutRef.current) window.clearTimeout(optimisticRollTimeoutRef.current);
      if (playReminderTimeoutRef.current) window.clearTimeout(playReminderTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (isSpectator) {
      const startSpectating = async () => {
        try {
          await fetch(`/api/rooms/${room.id}/spectate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });
        } catch (err) {
          console.error("Failed to start spectating:", err);
          toast.error("Could not connect as spectator. Returning to dashboard.");
          navigate('/');
        }
      };
      startSpectating();

      return () => {
        const stopSpectating = async () => {
          try {
            await fetch(`/api/rooms/${room.id}/stop-spectating`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId }),
            });
          } catch (err) {
            // It's less critical to show an error if this fails, as the user is leaving anyway.
            console.error("Failed to stop spectating:", err);
          }
        };
        stopSpectating();
      };
    }
  }, [isSpectator, room.id, userId, navigate]);

  useEffect(() => {
    if (!isSpectator) return;
    const loadMarkets = () => fetch(`/api/rooms/${encodeURIComponent(room.id)}/spectator-bet?userId=${encodeURIComponent(userId)}&_t=${Date.now()}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (data?.bet) setSpectatorBet(data.bet);
        if (Array.isArray(data?.markets)) setSpectatorMarkets(data.markets);
      })
      .catch(() => undefined);
    void loadMarkets();
    const interval = window.setInterval(loadMarkets, 3_000);
    return () => window.clearInterval(interval);
  }, [isSpectator, room.id, userId]);

  const placeSpectatorBet = async () => {
    if (isGuest) {
      onRequireAuth?.('Login ama signup samee si aad bet ugu dhigato ciyaartan.');
      return;
    }
    if (!betTargetId || isPlacingBet) return;
    setIsPlacingBet(true);
    setBetError('');
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(room.id)}/spectator-bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, targetPlayerId: betTargetId, prediction: betPrediction, stake: Number(betStake) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Bet-ka lama dhigi karin.');
      setSpectatorBet(data.bet);
    } catch (error) {
      setBetError(error instanceof Error ? error.message : 'Bet-ka lama dhigi karin.');
    } finally {
      setIsPlacingBet(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      // New: Close voice controls popover when clicking outside
      if (voiceControlsRef.current && !voiceControlsRef.current.contains(event.target as Node)) {
        setIsVoiceControlsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuRef, voiceControlsRef]);

    const handleSaveProfile = async (updatedUser: Partial<UserProfile>) => {
      try {
        await onProfileUpdate(updatedUser);
        setIsEditProfileModalOpen(false);
      } catch (error) {
        console.error('Failed to save profile:', error);
        // Re-throw the error so the modal can catch it and display a message
        throw error;
      }
    };

  const hasVoicePeer = isSpectator
    ? room.players.some(player => !/^(bot_|bot-|computer_|computer-|user_sim_|sim_)/i.test(player.userId))
    : [...room.players, ...(room.pendingPlayers || [])].some(player => player.userId !== userId && !/^(bot_|bot-|computer_|computer-|user_sim_|sim_)/i.test(player.userId));

  // Initialize only when another real person can participate. Bot-only games
  // must not request microphone permission or create dead signaling traffic.
  useEffect(() => {
    if (room.id && userId && hasVoicePeer) {
      // Pass the isSpectator flag to the initialization function
      initializeVoiceChat(userId, room.id, isSpectator);
    }
    // Cleanup when the GameRoom is left completely.
    return () => {
      closeVoiceChat();
    };
  }, [userId, room.id, isSpectator, hasVoicePeer, initializeVoiceChat, closeVoiceChat]);

  // Update peer connections whenever the player list changes.
  useEffect(() => {
    if (room.status === 'playing' || room.status === 'waiting') {
      const allPresentPlayers = [...room.players, ...(room.pendingPlayers || [])];
      // Deduplicate players, just in case of state transition inconsistencies.
      const uniquePlayers = Array.from(new Map(allPresentPlayers.map(p => [p.userId, p])).values());
      
      const isUserInRoom = uniquePlayers.some(p => p.userId === userId);

      // Spectators should connect to all players, while players connect to each other.
      if (isSpectator) {
        updatePlayers(room.players);
      } else if (isUserInRoom) {
        updatePlayers(uniquePlayers);
      }
    }
  }, [room.status, room.players, room.pendingPlayers, updatePlayers, userId, isSpectator]);

  const myPlayer = room.players.find(p => p.userId === userId);
  const canPlay = myPlayer && !isSpectator;
  
  // A user has been specifically rejected if they are not in the room's player list,
  // but the room object they received contains a rejectionReason.
  const hasBeenRejected = !myPlayer && room.rejectionReason;
  // A user is a pending guest if they are not a full player, have not been rejected,
  // and their ID appears in the list of pending players.
  const isPendingGuest = !myPlayer && !hasBeenRejected && room.pendingPlayers?.some(p => p.userId === userId);
  const isActiveTurn = canPlay && room.status === 'playing' && room.players[room.gameState.turn]?.userId === userId;
  const inactivityStrikes = Number(myPlayer?.inactivityStrikes || 0);
  const activePlayer = room.status === 'playing' ? room.players[room.gameState.turn] : null;
  const reactionTargets = room.players.filter(player => player.userId !== userId && player.status !== 'left');
  const teammateColor = myPlayer?.color === 'red' ? 'yellow'
    : myPlayer?.color === 'yellow' ? 'red'
      : myPlayer?.color === 'green' ? 'blue' : 'green';
  const defaultReactionTarget = activePlayer?.userId !== userId
    ? activePlayer
    : reactionTargets.find(player => room.gameMode !== 'team' || player.color !== teammateColor) || reactionTargets[0];
  const host = room.players.find(p => p.isHost);
  const lobbyCapacity = room.capacity || 2;
  const getLobbyTeam = (color: PlayerColor): 'A' | 'B' => color === 'red' || color === 'yellow' ? 'A' : 'B';
  const teamACount = room.players.filter(player => getLobbyTeam(player.color) === 'A').length;
  const teamBCount = room.players.filter(player => getLobbyTeam(player.color) === 'B').length;
  const teamAPlayers = room.players.filter(player => getLobbyTeam(player.color) === 'A');
  const teamBPlayers = room.players.filter(player => getLobbyTeam(player.color) === 'B');
  const teamsAreBalanced = room.gameMode !== 'team' || (teamACount === 2 && teamBCount === 2);
  const canStartLobby = room.players.length === lobbyCapacity && room.players.every(player => player.isReady) && teamsAreBalanced;

  // Show each server-issued 30-second warning exactly once. Keeping this as a
  // short fixed overlay makes it visible in Android WebView/mobile browsers,
  // while a real dice roll or token move dismisses it immediately.
  useEffect(() => {
    const strikeAt = Number(myPlayer?.lastInactivityStrikeAt || 0);
    if (!strikeAt || strikeAt <= lastShownInactivityStrikeAtRef.current) return;
    lastShownInactivityStrikeAtRef.current = strikeAt;
    setPlayReminderStrike(inactivityStrikes);
    if (playReminderTimeoutRef.current) window.clearTimeout(playReminderTimeoutRef.current);
    playReminderTimeoutRef.current = window.setTimeout(() => setPlayReminderStrike(null), 3500);
  }, [myPlayer?.lastInactivityStrikeAt, inactivityStrikes]);


  // Auto-scroll chats/logs
  useEffect(() => {
    if (panelContainerRef.current) {
      const container = panelContainerRef.current;
      window.requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [room.gameState.chat.length, room.gameState.logs.length, activePanel]);

  // Dice roll trigger animation & sound
  useEffect(() => {
    if (room.gameState.diceRoll !== null && room.gameState.hasRolled) {
      const alreadyStartedFromTap = optimisticRollRef.current;
      optimisticRollRef.current = false;
      if (optimisticRollTimeoutRef.current) {
        window.clearTimeout(optimisticRollTimeoutRef.current);
        optimisticRollTimeoutRef.current = null;
      }
      const animationStartedAt = alreadyStartedFromTap && rollAnimationStartedAtRef.current
        ? rollAnimationStartedAtRef.current
        : Date.now();
      rollAnimationStartedAtRef.current = animationStartedAt;
      setIsRolling(true);
      if (!alreadyStartedFromTap && isSpeakerOn && diceAudioRef.current) {
        diceAudioRef.current.volume = 0.5;
        diceAudioRef.current.currentTime = 0;
        diceAudioRef.current.play().catch(e => console.error("Error playing dice sound:", e));
      }
      // A server response must finish the animation that began with the tap,
      // not restart it. This keeps the tumble and its sound on one timeline.
      const remainingAnimationMs = Math.max(0, 800 - (Date.now() - animationStartedAt));
      const timer = setTimeout(() => {
        setIsRolling(false);
        rollAnimationStartedAtRef.current = null;
      }, remainingAnimationMs);
      return () => clearTimeout(timer);
    }
    // A fast token move can change the turn before the animation timer ends.
    // Always unlock the dice as soon as the new turn is unrolled.
    setIsRolling(false);
    rollAnimationStartedAtRef.current = null;
  }, [room.gameState.diceRoll, room.gameState.hasRolled, room.gameState.turn, activePlayer?.userId, isSpeakerOn]);

  // Win/Loss sound effect
  useLayoutEffect(() => {
    if (room.status === 'completed' && room.gameState.winnerId) {
      const resultKey = `${room.id}:${room.gameState.winnerId}`;
      if (resultSoundPlayedRef.current === resultKey) return;
      resultSoundPlayedRef.current = resultKey;
      if (!isSpeakerOn) return;
      const winnerIds = room.gameState.winnerIds?.length ? room.gameState.winnerIds : [room.gameState.winnerId];
      if (isSpectator) {
        winAudioRef.current?.play().catch(() => undefined);
      } else if (winnerIds.includes(userId)) {
        // I am the winner
        if (winAudioRef.current) {
          winAudioRef.current.volume = 0.7;
          winAudioRef.current.play().catch(e => console.error("Error playing win sound:", e));
        }
      } else {
        // I am not the winner, so I lost.
        if (forfeitAudioRef.current) {
          forfeitAudioRef.current.volume = 0.6;
          forfeitAudioRef.current.play().catch(e => console.error("Error playing forfeit/loss sound:", e));
        }
      }
    }
  }, [room.status, room.gameState.winnerId, room.gameState.winnerIds, userId, isSpeakerOn, isSpectator]);

  // Sound effects based on token state changes (Capture, Token Out)
  useEffect(() => {
    const prevTokens = prevTokensRef.current;
    const currentTokens = room.gameState.tokens;

    // Only proceed if tokens have actually changed
    if (prevTokens === currentTokens) {
      // Update the ref for the next render.
      prevTokensRef.current = currentTokens;
      return;
    }

    // Check for captures or tokens leaving base
    if (isSpeakerOn) {
      for (const currentToken of currentTokens) {
        const prevToken = prevTokens.find(t => t.id === currentToken.id);
        if (prevToken) {
          // CAPTURE: Token moved from board to base
          if (prevToken.position > -1 && currentToken.position === -1) {
            if (captureAudioRef.current) {
              captureAudioRef.current.volume = 0.5;
              captureAudioRef.current.play().catch(e => console.error("Error playing capture sound:", e));
              // Break early to play only one sound per token state update, if multiple events occurred simultaneously.
              break; 
            }
          }
          
          // TOKEN OUT: Token moved from base to board
          if (prevToken.position === -1 && currentToken.position > -1) {
            // Check if the sound has already been played for this player
            if (!hasPlayedFirstTokenOutSound.current.includes(currentToken.ownerId)) {
              if (tokenOutAudioRef.current) {
                tokenOutAudioRef.current.volume = 0.6;
                tokenOutAudioRef.current.play().catch(e => console.error("Error playing token out sound:", e));
                
                // Add the player to the list of players for whom the sound has been played
                hasPlayedFirstTokenOutSound.current.push(currentToken.ownerId);

                // Break early to play only one sound per token state update.
                break;
              }
            }
          }
        }
      }
    }

    // Update the ref for the next render. This must be outside the sound playing logic.
    // It's crucial for the next comparison.
    prevTokensRef.current = currentTokens;
  }, [room.gameState.tokens, isSpeakerOn, userId]);


  // Automated Auto-Roll checker
  useEffect(() => {
    if (autoRoll && isActiveTurn && !room.gameState.hasRolled && !isRolling) {
      const delay = setTimeout(() => {
        void requestDiceRoll();
      }, 1000);
      return () => clearTimeout(delay);
    }
  }, [autoRoll, isActiveTurn, room.gameState.hasRolled, isRolling, requestDiceRoll]);

  // Auto mode owns the complete turn: after rolling, select a legal token that
  // matches the result. Prefer releasing a token on six, otherwise advance the
  // token furthest along. The authoritative server still validates every move.
  useEffect(() => {
    const diceValue = room.gameState.diceRoll;
    if (!autoRoll || !isActiveTurn || !room.gameState.hasRolled || diceValue === null) return;

    const playableColor = room.gameMode === 'team' && myPlayer?.teamAssistUnlocked
      ? (myPlayer.color === 'red' ? 'yellow' : myPlayer.color === 'yellow' ? 'red' : myPlayer.color === 'green' ? 'blue' : 'green')
      : myPlayer?.color;
    const validTokens = room.gameState.tokens.filter(token => {
      if (token.color !== playableColor || token.position === 56) return false;
      if (token.position === -1) return diceValue === 6;
      return token.position + diceValue <= 56;
    });
    if (!validTokens.length) return;

    const selectedToken = (diceValue === 6 ? validTokens.find(token => token.position === -1) : undefined)
      || [...validTokens].sort((left, right) => right.position - left.position)[0];
    const rollKey = `${room.id}:${room.gameState.turn}:${room.gameState.lastActivity}:${diceValue}`;
    if (autoMoveRollRef.current === rollKey) return;
    autoMoveRollRef.current = rollKey;

    // The physical dice animation lasts 800ms. Leave the result visible briefly
    // so this player and every opponent can follow the roll before auto-moving.
    const delay = window.setTimeout(() => requestTokenMove(selectedToken.id), 1100);
    return () => window.clearTimeout(delay);
  }, [autoRoll, isActiveTurn, room.id, room.gameMode, room.gameState.hasRolled, room.gameState.diceRoll, room.gameState.lastActivity, room.gameState.tokens, room.gameState.turn, myPlayer?.color, myPlayer?.teamAssistUnlocked, requestTokenMove]);

  // Remind the active player to roll after five seconds of inactivity.
  useEffect(() => {
    setShowDicePrompt(false);

    if (!isActiveTurn || room.gameState.hasRolled || isRolling) return;

    const promptDelay = setTimeout(() => setShowDicePrompt(true), 5000);
    return () => clearTimeout(promptDelay);
  }, [isActiveTurn, room.gameState.turn, room.gameState.hasRolled, isRolling]);

  useEffect(() => {
    setShowOpponentNudge(false);
    if (!canPlay || isActiveTurn || room.status !== 'playing' || !activePlayer) return;
    if (/^(bot_|user_sim_|sim_)/.test(activePlayer.userId)) return;
    const timer = window.setTimeout(() => setShowOpponentNudge(true), 7000);
    return () => window.clearTimeout(timer);
  }, [canPlay, isActiveTurn, room.status, room.gameState.turn, room.gameState.lastActivity, room.gameState.hasRolled, activePlayer?.userId]);

  const nudgeActivePlayer = useCallback(async () => {
    if (!activePlayer || isNudgePending) return;
    setIsNudgePending(true);
    try {
      const response = await fetch('/api/rooms/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, roomId: room.id }),
      });
      if (!response.ok) throw new Error('Nudge request failed');
    } catch (error) {
      console.error('Failed to remind active player:', error);
    } finally {
      setIsNudgePending(false);
    }
  }, [activePlayer, isNudgePending, room.id, userId]);

  // Handle the case where the player has been rejected by the host.
  if (hasBeenRejected) {
    return (
      <div className="min-h-screen bg-[#050b18] text-white flex flex-col pb-10 selection:bg-blue-500 selection:text-white relative overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-600/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
        </div>
        <header className="sticky top-0 z-30 bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between relative z-10">
          <button onClick={() => onLeave(isSpectator)} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-all cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
          <div className="text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Ludo Room</span>
            <span className="font-black text-sm tracking-widest text-red-400 block">{room.id}</span>
          </div>
          <div className="text-xs font-black bg-black/40 px-2.5 py-1 rounded-lg border border-white/10 text-red-400 uppercase">
            REJECTED
          </div>
        </header>
        {noticeSlot}
        <main className="max-w-md w-full mx-auto px-4 py-12 flex flex-col justify-center items-center h-[75vh] relative z-10">
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center space-y-4 w-full shadow-2xl">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full bg-red-500/10" />
              <ShieldAlert className="w-8 h-8 text-red-400 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2" />
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-lg text-red-400 uppercase tracking-wider">{so ? 'Waa Lagu Diiday' : 'Request Declined'}</h3>
              <p className="text-sm text-slate-300 font-bold">
                {host ? (so ? `Martigeliyaha qolka (${host.username}) wuu diiday codsigaaga.` : `The room host (${host.username}) declined your request.`) : (room.rejectionReason || (so ? 'Codsigaaga waa la diiday.' : 'Your request was declined.'))}
              </p>
              <p className="text-xs text-slate-500 font-semibold">
                {so ? 'Ma rabtaa inaad mar kale isku daydo mise aad Bogga Hore ku laabato?' : 'Would you like to try again or return Home?'}
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => onLeave(isSpectator)}
                className="w-full bg-slate-700/50 hover:bg-slate-700/80 text-slate-300 border border-slate-600 font-black text-xs py-3 rounded-xl active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
              >
                {so ? 'Bogga Hore' : 'Home'}
              </button>
              <button
                onClick={onRetryJoin}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-black text-xs py-3 rounded-xl active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
              >
                {so ? 'Mar Kale Isku Day' : 'Try Again'}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Handle the case where the player is waiting for the host to accept them.
  if (isPendingGuest) {
    return (
      <div className="min-h-screen bg-[#050b18] text-white flex flex-col pb-10 selection:bg-blue-500 selection:text-white relative overflow-hidden">
        {/* Ambient background glows */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
        </div>

        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between relative z-10">
          <button onClick={() => onLeave(isSpectator)} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-all cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
          <div className="text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Ludo Room</span>
            <span className="font-black text-sm tracking-widest text-blue-400 block">{room.id}</span>
          </div>
          <div className="text-xs font-black bg-black/40 px-2.5 py-1 rounded-lg border border-white/10 text-blue-400 uppercase">
            {room.betAmount > 0 ? `$${room.betAmount} STAKE` : 'FREE DEMO'}
          </div>
        </header>

        {noticeSlot}

        <main className="max-w-md w-full mx-auto px-4 py-12 flex flex-col justify-center items-center h-[75vh] relative z-10">
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center space-y-4 w-full shadow-2xl">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-t-blue-500 border-r-blue-500/20 border-b-blue-500/20 border-l-blue-500/20 animate-spin" />
              <Zap className="w-6 h-6 text-blue-400 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-base text-blue-400 uppercase tracking-wider">{so ? 'Sugidda Oggolaanshaha' : 'Waiting for Approval'}</h3>
              <p className="text-xs text-slate-300 font-bold">{so ? 'Codsigaaga ku biirista qolka waa la gudbiyey.' : 'Your request to join the room has been submitted.'}</p>
              <p className="text-[10px] text-slate-500 font-semibold">
                {so ? 'Sug inta martigeliyaha qolka uu kaa aqbalayo si aad ciyaarta u bilowdo!' : 'Wait for the room host to approve you before the game begins.'}
              </p>
            </div>
            
            <div className="border-t border-white/10 pt-4 space-y-2 text-left text-xs text-slate-400">
              <div className="flex justify-between">
                <span>{so ? 'Koodhka Qolka:' : 'Lobby Code:'}</span>
                <span className="font-bold text-white font-mono">{room.id}</span>
              </div>
              <div className="flex justify-between">
                <span>{so ? 'Saamiga Ciyaarta:' : 'Game Stake:'}</span>
                <span className="font-bold text-green-400">${room.betAmount}</span>
              </div>
              <div className="flex justify-between">
                <span>{so ? 'Habka Ciyaarta:' : 'Game Mode:'}</span>
                <span className="font-bold text-purple-400 capitalize">{room.gameMode === 'team' ? 'Partnership 2v2' : 'Solo FFA'}</span>
              </div>
            </div>

            <button
              onClick={() => onLeave(isSpectator)}
              className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-black text-xs py-2.5 rounded-xl active:scale-95 transition-all cursor-pointer uppercase tracking-wider mt-4"
            >
              Cancel Request & Exit
            </button>
          </div>
        </main>
      </div>
    );
  }

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendChat(chatInput.trim());
      setChatInput('');
    }
  };

  // List of token IDs that are selectable to move
  const getSelectableTokenIds = (): string[] => {
    if (room.status !== 'playing' || !isActiveTurn || !room.gameState.hasRolled || room.gameState.diceRoll === null) {
      return [];
    }
    const d = room.gameState.diceRoll;
    const playableColor = room.gameMode === 'team' && myPlayer?.teamAssistUnlocked
      ? (myPlayer.color === 'red' ? 'yellow' : myPlayer.color === 'yellow' ? 'red' : myPlayer.color === 'green' ? 'blue' : 'green')
      : myPlayer?.color;
    const playerTokens = room.gameState.tokens.filter(t => t.color === playableColor);
    
    // Check which tokens have valid moves
    return playerTokens
      .filter(t => {
        if (t.position === 56) return false;
        if (t.position === -1) return d === 6;
        return t.position + d <= 56;
      })
      .map(t => t.id);
  };

  const validTokenMoves = getSelectableTokenIds();

  // Custom Dice Dot Renderer
  const renderDiceDots = (value: number) => {
    const dotPositions: Record<number, number[]> = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8]
    };

    const activeDots = dotPositions[value] || [];

    return (
      <div className="grid grid-cols-3 gap-1.5 w-10 h-10 p-1 bg-white rounded-lg shadow-md border-2 border-gray-100">
        {[...Array(9)].map((_, idx) => (
          <div key={idx} className="flex items-center justify-center">
            {activeDots.includes(idx) && (
              <div className="w-2 h-2 bg-gray-950 rounded-full" />
            )}
          </div>
        ))}
      </div>
    );
  };

  if (room.status === 'completed') {
    const winnerId = room.gameState.winnerId;
    const winnerIds = room.gameState.winnerIds?.length ? room.gameState.winnerIds : (winnerId ? [winnerId] : []);
    const isMeWinner = winnerIds.includes(userId);
    const winnerPlayer = room.players.find(p => p.userId === winnerId) || room.players[0];
    const winnerNames = room.players.filter(player => winnerIds.includes(player.userId)).map(player => player.username).join(' & ');
    const losers = room.players.filter(p => !winnerIds.includes(p.userId));
    const myNetPayout = room.gameState.winnerPayouts?.[userId] ?? room.gameState.winnerPayout ?? 0;

    if (isSpectator) {
      const betStatus = spectatorBet?.status as 'open' | 'won' | 'lost' | 'refunded' | undefined;
      const isBetWon = betStatus === 'won';
      const isBetLost = betStatus === 'lost';
      const isBetRefunded = betStatus === 'refunded';
      const isBetSettling = betStatus === 'open';
      const betPayout = Number(spectatorBet?.payout ?? spectatorBet?.potentialPayout ?? 0);
      const betStakeAmount = Number(spectatorBet?.stake ?? 0);
      const betProfit = Math.max(0, betPayout - betStakeAmount);

      return (
        <div className="min-h-screen overflow-hidden bg-gradient-to-b from-[#170d38] via-[#09051d] to-[#02010a] px-4 py-6 text-white selection:bg-purple-500">
          {isBetWon && <Confetti width={width} height={height} numberOfPieces={180} recycle={false} />}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-purple-600/15 blur-[90px]" />
            <div className="absolute right-[-5rem] top-[-5rem] h-64 w-64 rounded-full bg-blue-500/10 blur-[90px]" />
          </div>

          <main className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm flex-col justify-center">
            <div className="mb-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-purple-300">
              <Eye className="h-3.5 w-3.5" /> Match Result
            </div>

            <section className={`overflow-hidden rounded-3xl border shadow-2xl ${
              isBetWon ? 'border-emerald-400/30 shadow-emerald-950/40' :
              isBetLost ? 'border-red-400/25 shadow-red-950/30' :
              isBetRefunded ? 'border-amber-300/30 shadow-amber-950/30' :
              'border-purple-400/20 shadow-purple-950/40'
            }`}>
              <div className={`p-6 text-center ${
                isBetWon ? 'bg-gradient-to-br from-emerald-500/25 to-slate-950' :
                isBetLost ? 'bg-gradient-to-br from-red-500/20 to-slate-950' :
                isBetRefunded ? 'bg-gradient-to-br from-amber-500/20 to-slate-950' :
                'bg-gradient-to-br from-purple-500/20 to-slate-950'
              }`}>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-3xl shadow-inner">
                  {isBetWon ? '✅' : isBetLost ? '❌' : isBetRefunded ? '↩️' : isBetSettling ? <Timer className="h-8 w-8 animate-spin text-blue-300" /> : '🏁'}
                </div>
                <h2 className="text-xl font-black tracking-tight">
                  {isBetWon ? (so ? 'Saadaashaadu Way Guuleysatay!' : 'Your Bet Won!') :
                   isBetLost ? (so ? 'Saadaashaada Waa Laga Badiyey' : 'Your Bet Lost') :
                   isBetRefunded ? (so ? 'Saadaashaada Waa La Celiyey' : 'Your Bet Was Refunded') :
                   isBetSettling ? (so ? 'Saadaasha Waa La Xisaabinayaa…' : 'Settling Your Bet…') :
                   (so ? 'Ciyaartu Way Dhammaatay' : 'Game Over')}
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {so ? `${winnerNames || winnerPlayer?.username} ayaa ku guuleystay ciyaarta` : `${winnerNames || winnerPlayer?.username} won the game`}
                </p>
              </div>

              {spectatorBet ? (
                <div className="space-y-3 bg-[#0b0820]/95 p-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-white/5 bg-white/[0.04] p-2 text-center">
                      <span className="block text-[8px] font-black uppercase text-slate-500">{so ? 'Doorashada' : 'Selection'}</span>
                      <span className="mt-1 block truncate text-xs font-black">{spectatorBet.targetUsername} · {spectatorBet.prediction}</span>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.04] p-2 text-center">
                      <span className="block text-[8px] font-black uppercase text-slate-500">Stake</span>
                      <span className="mt-1 block font-mono text-xs font-black">{formatCurrency(betStakeAmount)}</span>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.04] p-2 text-center">
                      <span className="block text-[8px] font-black uppercase text-slate-500">Final Odds</span>
                      <span className="mt-1 block font-mono text-xs font-black">{spectatorBet.odds ? Number(spectatorBet.odds).toFixed(2) : '—'}</span>
                    </div>
                  </div>

                  <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                    isBetWon ? 'border-emerald-400/20 bg-emerald-500/10' :
                    isBetLost ? 'border-red-400/20 bg-red-500/10' :
                    isBetRefunded ? 'border-amber-300/20 bg-amber-500/10' :
                    'border-blue-400/20 bg-blue-500/10'
                  }`}>
                    <div>
                      <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400">
                        {isBetWon ? (so ? 'Boorsada lagu daray' : 'Added to Wallet') : isBetLost ? (so ? 'Saamiga lumay' : 'Stake Lost') : isBetRefunded ? (so ? 'Boorsada lagu celiyey' : 'Returned to Wallet') : (so ? 'Xaaladda' : 'Status')}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-bold text-slate-300">
                        {isBetWon ? (so ? `Faa’iido saafi ah ${formatCurrency(betProfit)}` : `Net profit ${formatCurrency(betProfit)}`) : isBetLost ? (so ? 'Saadaashu ma aysan guuleysan' : 'The prediction did not win') : isBetRefunded ? (so ? 'Suuqa saadaasha waa la baajiyey' : 'The betting market was cancelled') : (so ? 'Natiijada lacagta ayaa la xaqiijinayaa' : 'The financial result is being confirmed')}
                      </span>
                    </div>
                    <strong className={`font-mono text-xl ${isBetWon ? 'text-emerald-300' : isBetLost ? 'text-red-300' : isBetRefunded ? 'text-amber-300' : 'text-blue-300'}`}>
                      {isBetWon ? `+${formatCurrency(betPayout)}` : isBetLost ? `-${formatCurrency(betStakeAmount)}` : isBetRefunded ? `+${formatCurrency(betStakeAmount)}` : '•••'}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0b0820]/95 p-4 text-center">
                  <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-purple-300" />
                  <p className="text-xs font-bold text-slate-300">{so ? 'Waxaad ciyaarta u daawatay daawade ahaan.' : 'You watched this game as a spectator.'}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{so ? 'Saadaal lagama dhigin ciyaartan.' : 'You did not place a bet on this game.'}</p>
                </div>
              )}
            </section>

            <button onClick={() => onLeave(true)} className="mt-4 w-full rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-lg shadow-amber-950/20 transition active:scale-[0.98]">
              {so ? 'Bogga Hore Ku Laabo' : 'Return Home'}
            </button>
          </main>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex flex-col items-center justify-between p-4 selection:bg-purple-500 selection:text-white relative overflow-hidden">
        {isMeWinner && <Confetti width={width} height={height} />}
        {/* Background Concentric Ripples */}
        <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
          <div className="absolute w-[200px] h-[200px] rounded-full border border-purple-500/20 animate-pulse" />
          <div className="absolute w-[400px] h-[400px] rounded-full border border-purple-500/15 animate-pulse [animation-delay:0.5s]" />
          <div className="absolute w-[600px] h-[600px] rounded-full border border-purple-500/10 animate-pulse [animation-delay:1s]" />
          <div className="absolute w-[800px] h-[800px] rounded-full border border-purple-500/5" />
          <div className="absolute w-[1000px] h-[1000px] rounded-full border border-purple-500/5" />
        </div>

        {/* Top Header Arched Banner */}
        <div className="w-full max-w-sm mt-6 z-10 text-center">
          {isMeWinner ? (
            <div className="bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600 border border-green-400/30 p-4 rounded-2xl shadow-lg shadow-green-500/20 transform -rotate-1">
              <h2 className="text-2xl font-black tracking-widest text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                WAAD GUULEYSATAY! 🏆
              </h2>
              <p className="text-[10px] text-emerald-100 font-extrabold uppercase tracking-wider mt-0.5">
                YOU WON THE MATCH
              </p>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-indigo-700 via-purple-600 to-indigo-700 border border-purple-500/30 p-4 rounded-2xl shadow-lg shadow-purple-500/20 transform rotate-1">
              <h2 className="text-2xl font-black tracking-widest text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                WAA LAGU HELAY! 😭
              </h2>
              <p className="text-[10px] text-indigo-200 font-extrabold uppercase tracking-wider mt-0.5">
                YOU LOST THE MATCH
              </p>
            </div>
          )}
        </div>

        {/* Middle Section: Winner Profile with Golden Crown */}
        <div className="relative flex flex-col items-center justify-center z-10 my-6">
          {/* Pulsing crown badge or light circle background */}
          <div className="absolute w-44 h-44 rounded-full bg-yellow-500/10 blur-xl animate-pulse" />
          
          {/* The Crown */}
          <div className="text-5xl animate-bounce mb-[-12px] z-20">👑</div>

          {/* Winner Profile Card */}
          <div className="relative bg-[#1A0C40] border-4 border-yellow-400 rounded-2xl p-6 text-center w-52 shadow-2xl shadow-yellow-500/20">
            <div className="text-5xl bg-black/40 border border-white/5 w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <PlayerAvatar avatar={winnerPlayer?.avatar} className="h-16 w-16 text-5xl" />
            </div>
            <h3 className="font-black text-sm text-yellow-300 truncate max-w-[150px] mx-auto">
              {winnerPlayer?.userId === userId ? 'Adiga (You)' : winnerPlayer?.username}
            </h3>
            <p className="text-[8px] font-black text-purple-400 uppercase tracking-widest mt-1">Guuleyste (Winner)</p>
          </div>

          {/* Total Winnings update */}
          <div className="mt-4 bg-black/40 border border-yellow-500/30 px-6 py-2 rounded-xl text-center shadow-lg">
            <span className="text-[9px] text-yellow-400 font-black uppercase tracking-widest block">
              {isMeWinner ? 'Dakhliga Guusha (Net Winnings)' : 'Lacagta Khasaaray (Stake Lost)'}
            </span>
            <span className={`text-2xl font-mono font-black block mt-0.5 ${isMeWinner ? 'text-green-400' : 'text-red-400'}`}>
              {room.betAmount > 0
                ? `${isMeWinner ? '+' : '-'}${formatCurrency(isMeWinner ? myNetPayout : room.betAmount)}`
                : 'FREE DEMO'}
            </span>
          </div>
        </div>

        {/* Separator "VS" Badge */}
        <div className="relative flex items-center justify-center w-full max-w-xs my-3 z-10">
          <div className="w-full h-[1px] bg-purple-500/20" />
          <span className="absolute bg-[#110530] border border-purple-500/30 text-purple-300 text-xs font-black p-1 px-3 rounded-full uppercase tracking-widest font-mono">
            VS
          </span>
        </div>

        {/* Losers Grid */}
        <div className="w-full max-w-sm z-10 space-y-2 max-h-48 overflow-y-auto pr-1">
          {losers.map((player) => (
            <div 
              key={player.userId} 
              className="bg-black/30 border border-white/5 p-3 rounded-xl flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <PlayerAvatar avatar={player.avatar} />
                <div>
                  <h4 className="font-extrabold text-xs text-slate-200">
                    {player.userId === userId ? 'You' : player.username}
                  </h4>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${COLOR_MAP[player.color]}`} />
                    <span className="text-[8px] text-slate-500 font-black uppercase">{player.color}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full uppercase font-black">
                  -{room.betAmount > 0 ? `${formatCurrency(room?.betAmount)}` : '0'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTAs */}
        <div className="w-full max-w-sm z-10 mt-6 space-y-2">
          <button
            onClick={() => onLeave(isSpectator)}
            className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-black text-xs py-4 rounded-2xl active:scale-95 transition-all uppercase tracking-widest shadow-lg shadow-yellow-500/10 cursor-pointer"
          >
            {so ? 'Ciyaar Kale Bilow' : 'Play Another Game'} ⚔️
          </button>
        </div>

      </div>
    );
  }

  // Logic to determine which colors to display in which box
  // The user (myPlayer) should always see their color in the bottom-left (green) box.
  // The challenger should appear in the top-right (blue) box.
  const hostPlayer = room.players.find(p => p.isHost);
  const challengerPlayer = room.players.find(p => !p.isHost);

  const bottomBoxColor = myPlayer?.isHost ? hostPlayer?.color : challengerPlayer?.color;
  const topBoxColor = myPlayer?.isHost ? challengerPlayer?.color : hostPlayer?.color;
  const selectedSpectatorMarket = spectatorMarkets.find(market => market.targetPlayerId === betTargetId);
  const enteredBetStake = Math.max(0, Number(betStake || 0));
  const selectedSidePool = Number(betPrediction === 'W' ? selectedSpectatorMarket?.winPool || 0 : selectedSpectatorMarket?.lossPool || 0);
  const oppositeSidePool = Number(betPrediction === 'W' ? selectedSpectatorMarket?.lossPool || 0 : selectedSpectatorMarket?.winPool || 0);
  const estimatedPoolTotal = selectedSidePool + oppositeSidePool + enteredBetStake;
  const estimatedDynamicOdds = enteredBetStake > 0
    ? Number((estimatedPoolTotal * 0.90 / (selectedSidePool + enteredBetStake)).toFixed(2))
    : null;
  const estimatedDynamicReturn = estimatedDynamicOdds && estimatedDynamicOdds > 1
    ? Number((enteredBetStake * estimatedDynamicOdds).toFixed(2))
    : enteredBetStake;

  return (
    <>{!isSpectator && <LiveAdBanner placement="game" />}
    <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex flex-col pb-10 selection:bg-purple-500 selection:text-white relative overflow-hidden">
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
      
      {/* 1. ROOM HEADER */}
      <header className="sticky top-0 z-30 bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between relative z-10">
        <button
          onClick={() => onLeave(isSpectator)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Exit
        </button>

        <div className="text-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Ludo Lobby Code</span>
          <span className="font-black text-sm tracking-widest text-blue-400 block">{room.id}</span>
        </div>

        {isSpectator ? (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-red-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> Live</div>
            <button onClick={audioNeedsUnlock ? unlockAudio : toggleSpeaker} className={`rounded-lg border p-1.5 ${audioNeedsUnlock ? 'animate-pulse border-amber-400/50 bg-amber-400/20 text-amber-200' : 'border-blue-400/30 bg-blue-500/15 text-blue-300'}`} title={audioNeedsUnlock ? 'Tap to hear players' : 'Toggle player audio'}>{isSpeakerOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}</button>
            {(voiceStatus === 'failed' || voiceStatus === 'blocked') && <button onClick={retryVoiceChat} className="rounded-lg border border-red-400/40 bg-red-500/15 px-2 py-1.5 text-[8px] font-black text-red-200">RETRY AUDIO</button>}
          </div>
        ) : <div className="flex items-center gap-3">
          {/* Voice Controls Popover Trigger */}
          {hasVoicePeer && <div className="relative" ref={voiceControlsRef}>
            <button
              onClick={() => setIsVoiceControlsOpen(prev => !prev)}
              className={`relative p-1.5 rounded-xl border transition-all cursor-pointer ${
                (!isMuted || isSpeakerOn) 
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'
              }`}
              title="Voice Controls"
            >
              <Users className="w-3.5 h-3.5" />
              <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${voiceStatus === 'connected' ? 'bg-emerald-400' : voiceStatus === 'blocked' || voiceStatus === 'failed' ? 'bg-red-400' : 'animate-pulse bg-amber-300'}`} />
            </button>

            {isVoiceControlsOpen && (
              <div className="absolute top-full right-0 mt-2 min-w-48 p-2 bg-[#100a29]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-lg z-50">
                <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase text-white">Voice · {voiceStatus}</p><p className="max-w-36 text-[8px] text-slate-400">{voiceError || 'Mic and player audio controls'}</p></div>{(voiceStatus === 'failed' || voiceStatus === 'blocked') && <button onClick={retryVoiceChat} className="rounded-lg bg-red-500/20 px-2 py-1 text-[8px] font-black text-red-200">RETRY</button>}</div>
                <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                    !isMuted
                      ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'
                  }`}
                  title={!isMuted ? "Mute Mic" : "Unmute Mic"}
                >
                  {!isMuted ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 text-slate-500" />}
                </button>
                <button
                  onClick={audioNeedsUnlock ? unlockAudio : toggleSpeaker}
                  className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                    isSpeakerOn
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'
                  }`}
                  title={isSpeakerOn ? "Mute Sound" : "Unmute Sound"}
                >
                  {isSpeakerOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
                </button>
                {audioNeedsUnlock && <button onClick={unlockAudio} className="animate-pulse rounded-lg bg-amber-400 px-2 py-1.5 text-[8px] font-black text-slate-950">TAP TO HEAR</button>}
                </div>
              </div>
            )}
          </div>}
        
          <div ref={userMenuRef} className="relative">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setIsUserMenuOpen(prev => !prev)}
              >
                <PlayerAvatar avatar={user.avatar} className="h-9 w-9 text-2xl" />
                <div className="text-xs hidden sm:block"> {/* Hide on small screens */}
                  <span className="font-bold text-white block">{user.username}</span>
                  <span className="text-slate-400">{formatCurrency(user?.balance)}</span>
                </div>
                <MoreVertical className="w-4 h-4 text-slate-400" />
              </div>

              {isUserMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#1A0C40] border border-purple-500/40 rounded-xl shadow-2xl z-50 text-sm">
                  <div className="p-2 border-b border-purple-500/20">
                    <p className="font-bold text-white">{user.username}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => {
                        setIsEditProfileModalOpen(true);
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-purple-500/20 hover:text-white rounded-md"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit Profile</span>
                    </button>
                    <LanguageToggle />
                    <button
                      onClick={onLogout}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-md"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
          </div>
        </div>}
      </header>

      {noticeSlot}

      {/* 2. GAME INFO BAR */}
      <div className="grid grid-cols-3 items-center px-4 py-2 bg-black/20 text-xs border-b border-white/10">
        {/* Escrow */}
        <div className="flex items-center gap-1.5 font-bold text-yellow-400">
            <ShieldCheck className="w-4 h-4" />
            <span>{formatCurrency(room?.gameState?.escrowBalance)}</span>
        </div>
        {/* Timer */}
        <div className="flex items-center justify-center gap-1.5 font-bold text-slate-400">
            <Timer className="w-4 h-4" />
            <span>{displayTurnTimer}s</span>
        </div>
        {/* Spectators */}
        <div className="flex items-center justify-end gap-1.5 font-bold text-slate-400">
            <button
              onClick={() => setActivePanel(activePanel === 'logs' ? null : 'logs')}
              className={`relative h-7 w-7 rounded-lg border flex items-center justify-center transition active:scale-90 ${activePanel === 'logs' ? 'bg-blue-600 border-blue-300 text-white' : 'bg-white/5 border-white/10 text-blue-300'}`}
              title="Game Logs"
            >
              <Scroll className="h-3.5 w-3.5" />
              {room.gameState.logs.length > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-0.5 rounded-full bg-amber-500 text-[7px] font-black text-black flex items-center justify-center">{room.gameState.logs.length > 99 ? '99+' : room.gameState.logs.length}</span>}
            </button>
            <button
              onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
              className={`relative h-7 w-7 rounded-lg border flex items-center justify-center transition active:scale-90 ${activePanel === 'chat' ? 'bg-cyan-600 border-cyan-300 text-white' : 'bg-white/5 border-white/10 text-cyan-300'}`}
              title="Chat Lobby"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {room.gameState.chat.length > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-0.5 rounded-full bg-red-500 text-[7px] font-black text-white flex items-center justify-center">{room.gameState.chat.length > 99 ? '99+' : room.gameState.chat.length}</span>}
            </button>
            <Eye className="w-4 h-4 text-yellow-300" />
            <span className="text-white">{room.spectators?.length || 0}</span>
        </div>
      </div>



      <main className="max-w-md w-full mx-auto px-4 py-4 flex flex-col space-y-4 relative z-10">
        

        


        {/* ==========================================
            TEAM ALLIANCE & ACTIVE PLAYERS BOARD
           ========================================== */}
        {room.status === 'playing' && room.players.length === 2 && room.gameMode === 'solo' && (
          <div className={`grid grid-cols-2 gap-2 relative z-10`}>
            {/* Render players directly */}
            {room.players.map(pl => {
              const isCurrent = activePlayer?.color === pl.color;
              return (
                <div key={pl.userId} className={`p-2.5 rounded-xl border transition-all duration-300 bg-black/20 border-white/5`}>
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider mb-2">
                    <span className={`${COLOR_TEXT_MAP[pl.color]} tracking-widest font-black text-[9px]`}>
                      CIYAARTOY {pl.color.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className={`flex items-center justify-between p-1 rounded-lg transition-all ${activePlayer?.color === pl.color ? 'bg-white/5 border border-blue-500/30 shadow-md shadow-blue-500/5' : 'bg-black/30 border border-transparent'}`}>
                      <div className="flex items-center gap-1 text-[10px] truncate">
                        <PlayerAvatar avatar={pl.avatar} className="h-5 w-5 text-sm" />
                        <span className="font-semibold text-white text-[10px] truncate max-w-[70px]">{pl.userId === userId ? 'You' : pl.username}</span>
                      </div>
                      <span className={`w-2.5 h-2.5 rounded-full ${COLOR_MAP[pl.color]} ${isCurrent ? 'animate-pulse ring-2 ring-white shadow-[0_0_8px_currentColor]' : ''}`} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {room.status === 'playing' && (room.players.length !== 2 || room.gameMode !== 'solo') && (
          // The original 4-player and teams rendering logic
          <div className={`grid grid-cols-2 gap-2 relative z-10`}>
            {/* Player Group 1 (Green / Red+Yellow) */}
            <div className={`p-2.5 rounded-xl border transition-all duration-300 ${
              room.gameMode === 'team'
                ? 'bg-gradient-to-br from-red-500/5 to-yellow-500/5 border-red-500/20 shadow-lg shadow-red-500/5'
                : 'bg-black/20 border-white/5'
            }`}>
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider mb-2">
                <span className="text-red-400 tracking-widest font-black text-[9px]">
                  {room.gameMode === 'team' ? 'TEAM CAS & JAALLE' : 'CAS & JAALLE'}
                </span>
                {room.gameMode === 'team' && <span className="text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded text-[8px] font-bold">XULAFA</span>}
              </div>
              <div className="space-y-1.5">
              {['red', 'yellow'].map((color) => {
                const pl = room.players.find(p => p.color === color);
                const isCurrent = activePlayer?.color === color;
                if (!pl) {
                  return (
                    <div key={color} className="flex items-center justify-between p-1.5 rounded-lg bg-black/20 border border-dashed border-white/5 text-[9px] text-slate-600 font-bold">
                      <span>Ma Jiro</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${color === 'red' ? 'bg-red-950' : 'bg-yellow-950'}`} />
                    </div>
                  );
                }
                return (
                  <div key={pl.color} className={`flex items-center justify-between p-1 rounded-lg transition-all ${pl.status === 'left' ? 'bg-red-500/5 border border-red-500/20 opacity-45' : activePlayer?.color === pl.color ? 'bg-white/5 border border-blue-500/30 shadow-md shadow-blue-500/5' : 'bg-black/30 border border-transparent'}`}>
                    <div className="flex items-center gap-1 text-[10px] truncate">
                      <PlayerAvatar avatar={pl.avatar} className="h-5 w-5 text-sm" />
                      <span className="font-semibold text-white text-[10px] truncate max-w-[70px]">{pl.userId === userId ? 'You' : pl.username}</span>
                    </div>
                    {pl.status === 'left' ? (
                      <span className="text-[7px] font-black uppercase text-red-400">Inactive</span>
                    ) : (
                      <span className={`w-2.5 h-2.5 rounded-full ${pl.color === 'red' ? 'bg-red-500' : 'bg-yellow-500'} ${isCurrent ? 'animate-pulse ring-2 ring-white shadow-[0_0_8px_currentColor]' : ''}`} />
                    )}
                  </div>
                );
              })}
              </div>
            </div>

            {/* Player Group 2 (Yellow / Green+Blue) */}
            <div className={`p-2.5 rounded-xl border transition-all duration-300 ${
              room.gameMode === 'team' 
                ? 'bg-gradient-to-br from-green-500/5 to-blue-500/5 border-green-500/20 shadow-lg shadow-green-500/5' 
                : 'bg-black/20 border-white/5'
            }`}>
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider mb-2">
                <span className="text-green-400 tracking-widest font-black text-[9px]">
                  {room.gameMode === 'team' ? 'TEAM CAGAAR & BULUUG' : 'CAGAAR & BULUUG'}
                </span>
                {room.gameMode === 'team' && (
                  <span className="text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded text-[8px] font-bold">🤝 XULAFA</span>
                )}
              </div>
              <div className="space-y-1.5">
                {['green', 'blue'].map((color) => {
                  const pl = room.players.find(p => p.color === color);
                  const isCurrent = activePlayer?.color === color;
                  if (!pl) {
                    return (
                      <div key={color} className="flex items-center justify-between p-1.5 rounded-lg bg-black/20 border border-dashed border-white/5 text-[9px] text-slate-600 font-bold">
                        <span>Ma Jiro</span>
                        <span className={`w-2.5 h-2.5 rounded-full ${color === 'green' ? 'bg-green-950' : 'bg-blue-950'}`} />
                      </div>
                    );
                  }
                  return (
                    <div key={pl.color} className={`flex items-center justify-between p-1 rounded-lg transition-all ${pl.status === 'left' ? 'bg-red-500/5 border border-red-500/20 opacity-45' : activePlayer?.color === pl.color ? 'bg-white/5 border border-blue-500/30 shadow-md shadow-blue-500/5' : 'bg-black/30 border border-transparent'}`}>
                      <div className="flex items-center gap-1 text-[10px] truncate">
                        <PlayerAvatar avatar={pl.avatar} className="h-5 w-5 text-sm" />
                        <span className="font-semibold text-white text-[10px] truncate max-w-[70px]">{pl.userId === userId ? 'You' : pl.username}</span>
                      </div>
                      {pl.status === 'left' ? (
                        <span className="text-[7px] font-black uppercase text-red-400">Inactive</span>
                      ) : (
                        <span className={`w-2.5 h-2.5 rounded-full ${COLOR_MAP[pl.color]} ${isCurrent ? 'animate-pulse ring-2 ring-white shadow-[0_0_8px_currentColor]' : ''}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {/* 3. GAMEPLAY LUDO BOARD BOARD */}
        <div className={`flex justify-center py-2 relative transition-transform duration-500 ${room.status === 'waiting' ? 'order-2' : ''}`}>
          {playReminderStrike !== null && playReminderStrike < 5 && (
            <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center px-4" aria-live="assertive">
              <div className="ludosom-play-reminder rounded-2xl border-2 border-yellow-300 bg-slate-950/90 px-8 py-4 text-center shadow-[0_0_40px_rgba(250,204,21,0.7)]">
                <div className="text-4xl font-black tracking-[0.2em] text-yellow-300 sm:text-6xl">CIYAAR</div>
                <div className="mt-1 text-xs font-bold text-white">Fursad {playReminderStrike}/5</div>
              </div>
            </div>
          )}
          <LudoBoard
            tokens={room.gameState.tokens}
            players={room.players}
            activeColor={activePlayer ? activePlayer.color : null}
            validTokenMoves={canPlay ? validTokenMoves : []}
            onTokenClick={canPlay ? requestTokenMove : () => {}}
            userColor={myPlayer?.color}
            showTurnDice={isSpectator}
            diceValue={room.gameState.hasRolled ? room.gameState.diceRoll : null}
            diceRolling={isRolling}
          />
        </div>

        {/* ==========================================
            4. ACTIVE CONTROLLER PANEL (DICE ROLLER)
           ========================================== */}
        {room.status === 'playing' ? (isSpectator ? (
          <div className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-slate-950/95 via-[#111936] to-emerald-950/40 p-3 shadow-xl shadow-emerald-950/20">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">Live Match Market</div>
                <div className="text-xs font-black text-white">Dooro dhinaca iyo natiijada</div>
              </div>
              <div className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-right">
                <div className="text-[7px] font-black uppercase text-amber-300">Live Odds</div>
                <div className="font-mono text-sm font-black text-white">{estimatedDynamicOdds && estimatedDynamicOdds > 1 ? estimatedDynamicOdds.toFixed(2) : 'Pool'}</div>
              </div>
            </div>

            {spectatorBet ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-black text-white">{spectatorBet.targetUsername} · {spectatorBet.prediction}</div>
                  <div className="text-[9px] font-bold text-slate-400">Stake ${Number(spectatorBet.stake).toFixed(2)} · Return ${Number(spectatorBet.potentialPayout).toFixed(2)}</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${spectatorBet.status === 'won' ? 'bg-emerald-500/20 text-emerald-300' : spectatorBet.status === 'lost' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'}`}>
                  {spectatorBet.status}
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  {spectatorMarkets.map((market, marketIndex) => {
                    const memberIds = market.memberIds || [market.targetPlayerId];
                    const marketPlayers = room.players.filter(player => memberIds.includes(player.userId));
                    const selected = betTargetId === market.targetPlayerId;
                    const anotherSelected = Boolean(betTargetId) && !selected;
                    return (
                      <div key={market.targetPlayerId} className={`rounded-xl border p-2 transition-all ${selected ? 'border-emerald-400/60 bg-emerald-500/10 shadow-lg shadow-emerald-950/30' : anotherSelected ? 'border-white/5 bg-black/20 opacity-40' : 'border-white/10 bg-black/25'}`}>
                        <div className="mb-2 flex items-center gap-1.5">
                          <div className="flex -space-x-1.5">
                            {marketPlayers.map(player => <PlayerAvatar key={player.userId} avatar={player.avatar} className="h-6 w-6 border border-slate-800 text-sm" />)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[9px] font-black text-white">{room.gameMode === 'team' ? `TEAM ${marketIndex + 1}` : market.targetUsername}</div>
                            <div className="truncate text-[7px] font-bold text-slate-500">{room.gameMode === 'team' ? market.targetUsername : `${market.progress || 0}% progress`}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {(['W', 'L'] as const).map(choice => {
                            const choiceSelected = selected && betPrediction === choice;
                            return (
                              <button key={choice} type="button" onClick={() => { setBetTargetId(market.targetPlayerId); setBetPrediction(choice); setBetError(''); }} className={`rounded-lg border py-2 text-[9px] font-black transition ${choiceSelected ? (choice === 'W' ? 'border-emerald-300 bg-emerald-500 text-slate-950' : 'border-red-300 bg-red-500 text-white') : 'border-white/10 bg-white/5 text-slate-400'}`}>
                                {choice === 'W' ? `WIN ${market.winOdds || '—'}` : `LOSS ${market.lossOdds || '—'}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={`rounded-xl border border-white/10 bg-black/25 p-2 transition ${betTargetId ? 'opacity-100' : 'pointer-events-none opacity-35'}`}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">{so ? 'Dooro lacagta' : 'Choose amount'}</span>
                    <span className="text-[8px] font-bold text-emerald-300">Min $0.10 · Max $10</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {['0.10', '0.25', '0.50', '1.00'].map(amount => (
                      <button key={amount} type="button" onClick={() => setBetStake(amount)} className={`rounded-lg border py-2 font-mono text-[9px] font-black ${Number(betStake) === Number(amount) ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-white/10 bg-white/5 text-slate-300'}`}>${amount}</button>
                    ))}
                    <input value={betStake} onChange={event => setBetStake(event.target.value)} type="number" min="0.10" max="10" step="0.10" className="min-w-0 rounded-lg border border-white/10 bg-black/40 px-1 text-center font-mono text-[9px] font-black text-white outline-none focus:border-amber-300" aria-label="Bet stake" />
                  </div>
                </div>
                <button type="button" disabled={!betTargetId || isPlacingBet} onClick={() => void placeSpectatorBet()} className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-emerald-950/30 disabled:opacity-40">
                  {isPlacingBet ? 'Confirming…' : `Submit ${betPrediction} Bet · Est. $${estimatedDynamicReturn.toFixed(2)}`}
                </button>
                {betError && <p className="text-center text-[9px] font-bold text-red-300">{betError}</p>}
                <p className="text-center text-[8px] font-semibold text-slate-500">Dynamic pool · 10% app commission · Unmatched market = refund · Closes at home stretch</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 sm:p-4 flex flex-col items-center justify-center space-y-2 sm:space-y-3 relative overflow-hidden shadow-xl">
            {/* Turn Announcement Banner */}
            <div className="hidden text-center sm:block">
              {isActiveTurn ? (
                <div className="space-y-1">
                  <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center justify-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-blue-400 animate-bounce" /> Your Turn to Play!
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">Roll the dice to unleash or advance your tokens.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-ping mr-1" />
                    Waiting for {activePlayer?.username}
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Player is thinking... Assigned color: 
                    <span className={`font-black ${COLOR_TEXT_MAP[activePlayer?.color || 'red']} uppercase ml-1`}>
                      {activePlayer?.color}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* 3D Physical Dice Controller */}
            <div className="flex flex-col items-center justify-center w-full">
              <PhysicalDice
                // Keep the most recent result visible between turns. Whether
                // rolling is allowed is controlled separately by `disabled`.
                value={room.gameState.diceRoll ?? room.gameState.lastDiceRoll ?? null}
                isRolling={isRolling}
                onClick={canPlay ? requestDiceRoll : () => {}}
                disabled={!canPlay || !isActiveTurn || room.gameState.hasRolled || isRollRequestPending}
                color={
                  activePlayer?.color === 'red' ? '#E53170' :
                  activePlayer?.color === 'green' ? '#00B074' :
                  activePlayer?.color === 'yellow' ? '#F2C94C' :
                  activePlayer?.color === 'blue' ? '#0090FF' : '#E53170'
                }
              />

              {isActiveTurn && room.gameState.hasRolled && validTokenMoves.length > 0 && (
                <span className="absolute right-2 top-2 z-10 animate-pulse text-[10px] font-black uppercase tracking-wide text-blue-400 sm:right-3 sm:top-3">
                  Dooro Boorinka
                </span>
              )}

              {showDicePrompt && isActiveTurn && !room.gameState.hasRolled && (
                <span className="absolute right-2 top-2 z-10 animate-pulse text-[10px] font-black uppercase tracking-wide text-yellow-400 sm:right-3 sm:top-3">
                  {so ? 'Taabo Laadhuuga' : 'Tap the Dice'}
                </span>
              )}

              {showOpponentNudge && !isActiveTurn && activePlayer && (
                <button
                  type="button"
                  disabled={isNudgePending}
                  onClick={() => void nudgeActivePlayer()}
                  className="absolute right-2 top-2 z-10 animate-pulse rounded-lg border border-yellow-300/70 bg-yellow-400 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-950 shadow-[0_0_18px_rgba(250,204,21,0.45)] transition active:scale-95 disabled:opacity-60 sm:right-3 sm:top-3"
                >
                  {isNudgePending ? 'Sug...' : `Ciyaar ${activePlayer.username}`}
                </button>
              )}
            </div>

            {/* Auto-roll toggle pinned to the card's top-left without taking layout space. */}
            <div className="absolute left-2 top-2 z-10 sm:left-3 sm:top-3">
              <button
                onClick={() => setAutoRoll(!autoRoll)}
                type="button"
                role="switch"
                aria-checked={autoRoll}
                aria-label="Duubid Toos Ah"
                title="Duubid Toos Ah"
                className={`w-10 h-5 rounded-full p-0.5 transition-all relative shadow-md ${
                  autoRoll ? 'bg-purple-600' : 'bg-slate-700'
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-all absolute top-0.5 ${
                  autoRoll ? 'right-0.5' : 'left-0.5'
                }`} />
              </button>
            </div>

            {/* Interactive Somali Quick Reactions */}
            <div className="w-full border-t border-white/5 pt-2 mt-2 text-center">
              <span className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                Dareeno Degdeg Ah {defaultReactionTarget ? `→ ${defaultReactionTarget.username}` : ''}
              </span>
              <div className="flex items-center justify-center gap-1 overflow-x-auto px-0.5 pb-1 sm:gap-1.5">
                {QUICK_REACTIONS.map((reaction) => (
                  <button
                    key={reaction.id}
                    type="button"
                    title={`${reaction.label}${defaultReactionTarget ? ` → ${defaultReactionTarget.username}` : ''}`}
                    disabled={!defaultReactionTarget}
                    onClick={async () => {
                      if (!defaultReactionTarget) return;
                      try {
                        await fetch('/api/rooms/emoji', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId, roomId: room.id, reactionId: reaction.id, targetId: defaultReactionTarget.userId })
                        });
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="group flex min-w-9 flex-col items-center rounded-lg border border-white/10 bg-gradient-to-b from-white/10 to-black/30 px-1 py-1 shadow-md transition-all hover:-translate-y-0.5 hover:border-purple-400/50 hover:bg-purple-500/15 active:scale-90 disabled:opacity-40 sm:min-w-10 sm:rounded-xl sm:px-1.5"
                  >
                    <span className="text-lg leading-none drop-shadow-lg transition-transform group-hover:scale-110 sm:text-xl">{reaction.emoji}</span>
                    <span className="mt-0.5 hidden text-[6px] font-black uppercase text-slate-400 sm:block">{reaction.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )) : (
          /* ==========================================
              LOBBY / WAITING SCREEN SETUP
             ========================================== */
          <div className="order-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-4">
            {/* Host Player Approvals List */}
            {myPlayer?.isHost && room.pendingPlayers && room.pendingPlayers.length > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-2 mb-2">
                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                  <span>🔔 Codsi ku soo biiritaan cusub (New Join Request)</span>
                </h4>
                <div className="space-y-1.5">
                  {room.pendingPlayers.map((p) => (
                    <div key={p.userId} className="bg-black/30 border border-white/5 p-2 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar avatar={p.avatar} className="h-8 w-8 text-xl" />
                        <div>
                          <p className="font-extrabold text-[11px] text-white truncate max-w-[120px]">{p.username}</p>
                          <p className="text-[8px] text-slate-500 font-bold">
                            Win: {p.winCount || 0} • Loss: {p.lossCount || 0}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/rooms/accept-player', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, roomId: room.id, challengerId: p.userId })
                              });
                              if (!response.ok) {
                                const data = await response.json().catch(() => null);
                                throw new Error(data?.error || 'Player could not be accepted.');
                              }
                            } catch (err) {
                              console.error(err);
                              toast.error(err instanceof Error ? err.message : 'Player could not be accepted.');
                            }
                          }}
                          className="bg-green-600 hover:bg-green-500 text-white font-extrabold text-[9px] py-1 px-2.5 rounded-md active:scale-95 transition-all cursor-pointer"
                        >
                          Ogolow
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/rooms/decline-player', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, roomId: room.id, challengerId: p.userId })
                              });
                              if (!response.ok) {
                                const data = await response.json().catch(() => null);
                                throw new Error(data?.error || 'Request could not be declined.');
                              }
                              toast.success(`${p.username} Codsigaaga waa la diiday!`);
                            } catch (err) {
                              console.error(err);
                              toast.error(err instanceof Error ? err.message : 'Request could not be declined.');
                            }
                          }}
                          className="bg-red-600/20 hover:bg-red-600 text-red-400 border border-red-500/20 font-extrabold text-[9px] py-1 px-2.5 rounded-md active:scale-95 transition-all cursor-pointer"
                        >
                          {so ? 'Diid' : 'Decline'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-black/20 border border-white/10 rounded-xl p-3 text-center space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                {so ? 'Koodhka Qolka Ciyaarta' : 'Game Lobby Code'}
              </span>
              <div className="flex items-center justify-center gap-2">
                <span className="font-black text-2xl text-blue-400 tracking-widest">{room.id}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(room.id);
                    toast.success('Lobby Code copied to clipboard!');
                  }}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                  title="Copy Lobby Code"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: 'Join my Ludo Game!',
                          text: `Join my Ludo game with code: ${room.id}`,
                          url: window.location.href, // Or a specific join URL if available
                        });
                        toast.success('Lobby Code shared!');
                      } catch (error) {
                        console.error('Error sharing:', error);
                        toast.error('Failed to share Lobby Code.');
                      }
                    } else {
                      // Fallback for browsers that do not support Web Share API
                      navigator.clipboard.writeText(`Join my Ludo game with code: ${room.id}\n${window.location.href}`);
                      toast.success('Lobby Code and link copied to clipboard!');
                    }
                  }}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                  title="Share Lobby Code"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
              <span className="text-[10px] text-slate-400 font-bold flex items-center justify-center gap-1">
                <Users className="w-3.5 h-3.5 text-blue-400" /> {room.players.length}/{room.capacity || 2} Joined
              </span>
            </div>

            {/* List Joined Players */}
            {room.gameMode === 'team' ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                <div className="grid grid-cols-[1fr_38px_1fr] gap-1 pb-2 text-center text-[10px] font-black">
                  <span className="text-rose-400">TEAM A ({teamACount}/2)</span><span /><span className="text-emerald-400">TEAM B ({teamBCount}/2)</span>
                </div>
                {[0, 1].map(index => {
                  const left = teamAPlayers[index];
                  const right = teamBPlayers[index];
                  const onlyPlayer = left || right;
                  const enabled = Boolean(onlyPlayer && (myPlayer?.isHost || ((!left || !right) && onlyPlayer.userId === userId)));
                  const playerCard = (pl?: typeof left, side?: 'A' | 'B') => (
                    <div className={`min-h-14 rounded-lg border p-2 flex items-center gap-1.5 overflow-hidden ${side === 'A' ? 'border-rose-500/20 bg-rose-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
                      {pl ? <><PlayerAvatar avatar={pl.avatar} className="h-7 w-7 text-lg" /><div className="min-w-0"><p className="truncate text-[10px] font-black">{pl.userId === userId ? 'You' : pl.username}</p><p className="text-[7px] font-bold text-slate-500">{pl.isHost ? 'HOST' : pl.isReady ? 'READY' : 'WAITING'}</p></div></> : <span className="m-auto text-[8px] font-bold text-slate-600">OPEN</span>}
                    </div>
                  );
                  return (
                    <div key={index} className="grid grid-cols-[1fr_38px_1fr] items-stretch gap-1 mb-1 last:mb-0">
                      {playerCard(left, 'A')}
                      <button type="button" disabled={!enabled} onClick={() => left && right ? onChangeTeam(left.userId, 'B', right.userId) : onlyPlayer && onChangeTeam(onlyPlayer.userId, left ? 'B' : 'A')} className="my-auto mx-auto h-8 w-8 rounded-full border border-cyan-400/30 bg-cyan-500/10 text-cyan-300 flex items-center justify-center active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed" title="Beddel kooxda">
                        <ArrowLeftRight className="h-4 w-4" />
                      </button>
                      {playerCard(right, 'B')}
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-2">
              {room.players.map((pl) => (
                <div 
                  key={pl.userId} 
                  className={`bg-black/30 border p-3 rounded-xl flex items-center justify-between ${pl.status === 'left' ? 'opacity-45 border-red-500/20' : 'border-white/5'}`}
                >
                  <div className="flex items-center gap-2">
                    <PlayerAvatar avatar={pl.avatar} />
                    <div className="space-y-0.5">
                      <p className="font-extrabold text-xs text-slate-200 truncate max-w-[80px]">
                        {pl.userId === userId ? 'You' : pl.username}
                      </p>
                      <div className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${COLOR_MAP[pl.color]}`} />
                        <span className="text-[8px] text-slate-500 font-bold capitalize">
                          {room.gameMode === 'team' ? `Team ${getLobbyTeam(pl.color)} · ${pl.color}` : pl.color}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    {pl.status === 'left' ? (
                      <span className="text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-1 py-0.5 rounded uppercase font-black">Inactive</span>
                    ) : pl.isHost ? (
                      <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1 py-0.5 rounded uppercase font-black">Host</span>
                    ) : pl.isReady ? (
                      <span className="text-[8px] bg-green-500/10 text-green-400 border border-green-500/20 px-1 py-0.5 rounded uppercase font-black">Ready</span>
                    ) : (
                      <span className="text-[8px] bg-slate-500/10 text-slate-500 border border-slate-500/20 px-1 py-0.5 rounded uppercase font-black">Waiting</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Empty slot indicators */}
              {[...Array(Math.max(0, (room.capacity || 2) - room.players.length))].map((_, idx) => {
                const isChallengeSlot = idx === 0 && myPlayer?.isHost && Boolean(room.challengeTargetUserId);
                const canRetryChallenge = isChallengeSlot && room.challengeStatus === 'declined' && (room.challengeAttempt || 1) < 3;
                return (
                <div
                  key={idx} 
                  className="bg-black/20 border border-dashed border-white/10 p-2 rounded-xl flex items-center justify-center text-slate-500 text-[9px] font-semibold"
                >
                  {canRetryChallenge ? (
                    <button onClick={onRetryJoin} className="rounded-lg bg-amber-500/15 px-3 py-1 font-black text-amber-300 transition active:scale-95">
                      ↻ Retry
                    </button>
                  ) : isChallengeSlot && room.challengeStatus === 'pending' ? (
                    <span className="animate-pulse text-cyan-300">⌛ {so ? 'Sugid...' : 'Waiting...'}</span>
                  ) : (
                    <>⌛ {so ? 'Boos Bannaan' : 'Open Slot'}</>
                  )}
                </div>
              )})}
            </div>
            )}

            {/* Add Bot Lobby controls */}
            <div className="flex gap-2">
              {canPlay && room.players.length < (room.capacity || 2) && myPlayer?.isHost && (
                <button
                  onClick={onAddBot}
                  className="flex-1 bg-black/30 hover:bg-white/5 border border-white/10 text-slate-200 font-bold text-xs py-2 px-2 rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5 text-purple-400" /> Add Bot Player
                </button>
              )}

              {canPlay && (
                myPlayer?.isHost ? (
                  <button
                    onClick={onStartMatch}
                    disabled={!canStartLobby}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-extrabold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
                  >
                    <Play className="w-3.5 h-3.5" /> {canStartLobby ? 'Start Match ⚔️' : `Waiting ${room.players.length}/${lobbyCapacity}`}
                  </button>
                ) : (
                  <button
                    onClick={onToggleReady}
                    className={`flex-1 font-extrabold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer uppercase tracking-wider ${
                      myPlayer?.isReady 
                        ? 'bg-black/40 border border-white/10 text-slate-300' 
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" /> {myPlayer?.isReady ? 'De-Ready' : 'Set Ready'}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* ==========================================
            5. UTILITY TABS (CHAT & LOGS PANEL)
           ========================================== */}
        {activePanel && (
        <div
          className={`fixed top-24 left-3 right-3 z-40 h-[min(24rem,60dvh)] max-w-md ml-auto bg-[#091225]/95 backdrop-blur-xl border border-white/15 rounded-2xl overflow-hidden flex flex-col shadow-2xl shadow-black/60 ${isPanelDragging ? '' : 'transition-transform duration-200'}`}
          style={{ transform: `translateY(${panelDragY}px)` }}
          onTouchStart={(event) => {
            if ((event.target as HTMLElement).closest('[data-panel-scroll], form, input, button')) {
              panelTouchStartYRef.current = null;
              return;
            }
            panelTouchStartYRef.current = event.touches[0]?.clientY ?? null;
            setIsPanelDragging(true);
          }}
          onTouchMove={(event) => {
            const startY = panelTouchStartYRef.current;
            const currentY = event.touches[0]?.clientY;
            if (startY === null || currentY === undefined) return;
            if (event.cancelable) event.preventDefault();
            setPanelDragY(Math.min(0, currentY - startY));
          }}
          onTouchEnd={(event) => {
            const startY = panelTouchStartYRef.current;
            const endY = event.changedTouches[0]?.clientY;
            panelTouchStartYRef.current = null;
            setIsPanelDragging(false);
            if (startY !== null && endY !== undefined && startY - endY > 55) setActivePanel(null);
            setPanelDragY(0);
          }}
          onTouchCancel={() => {
            panelTouchStartYRef.current = null;
            setIsPanelDragging(false);
            setPanelDragY(0);
          }}
        >
          {/* Tabs Selector */}
          <div className="relative grid grid-cols-[1fr_1fr_44px] pt-3 text-xs font-bold border-b border-white/10 bg-white/5">
            <div className="absolute top-1 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/30" />
            <button
              onClick={() => setActivePanel('logs')}
              className={`py-3 text-center flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activePanel === 'logs' 
                  ? 'border-blue-400 text-blue-400 bg-black/20' 
                  : 'border-transparent text-slate-500'
              }`}
            >
              <Scroll className="w-3.5 h-3.5" /> Game Logs ({room.gameState.logs.length})
            </button>
            <button
              onClick={() => setActivePanel('chat')}
              className={`py-3 text-center flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activePanel === 'chat' 
                  ? 'border-blue-400 text-blue-400 bg-black/20' 
                  : 'border-transparent text-slate-500'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Chat Lobby ({room.gameState.chat.length})
            </button>
            <button onClick={() => setActivePanel(null)} className="flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close panel">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Panel Display */}
          <div data-panel-scroll ref={panelContainerRef} className="p-3 min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y text-xs font-medium space-y-2 bg-black/20">
            {activePanel === 'logs' ? (
              /* GAMEPLAY LAUNCH LOGS */
              room.gameState.logs.map((log) => (
                <div key={log.id} className="text-slate-400 flex gap-2">
                  <span className="text-slate-600 shrink-0 font-bold">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-slate-300 leading-normal">{log.text}</span>
                </div>
              ))
            ) : (
              /* INTERACTIVE CHAT BOX */
              room.gameState.chat.map((chat) => {
                const isMe = chat.senderId === userId;
                const isSpectatorMsg = chat.isSpectator;

                return (
                  <div key={chat.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1 text-[9px] text-slate-500 font-bold mb-0.5">
                      {isSpectatorMsg && <span className="text-yellow-400">👁️</span>}
                      <span>{chat.senderName}</span>
                      <span>•</span>
                      <span>{new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className={`px-3 py-2 rounded-2xl max-w-[82%] break-words whitespace-pre-wrap leading-relaxed shadow-sm ${
                      isMe 
                        ? 'bg-blue-600 text-white font-semibold' 
                        : isSpectatorMsg
                        ? 'bg-yellow-600/20 text-yellow-200 border border-yellow-500/20'
                        : 'bg-black/40 text-slate-200 border border-white/5'
                    }`}>
                      {chat.text}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Chat text box input */}
          {activePanel === 'chat' && (
            <form onSubmit={handleSendChat} className="shrink-0 p-2 border-t border-white/10 bg-[#101a30] flex gap-2">
              <input
                type="text"
                required
                placeholder="Say hello in lobby..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={300}
                className="min-w-0 h-10 bg-black/30 border border-white/10 text-xs font-semibold rounded-xl px-3 outline-none flex-1 focus:border-blue-400 text-white"
              />
              <button
                type="submit"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black p-1.5 px-3 rounded-xl hover:from-blue-500 hover:to-indigo-500 active:scale-95 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
        )}

      </main>

      {isEditProfileModalOpen && user && (
        <UserEditModal
          user={user}
          onClose={() => setIsEditProfileModalOpen(false)}
          onSave={handleSaveProfile}
        />
      )}
    </div></>
  );
}
