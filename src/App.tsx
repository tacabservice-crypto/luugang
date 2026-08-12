
import { useLocation, useParams } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, GameRoom } from './types/game';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import GameRoomView from './components/GameRoom';
import WalletModal from './components/WalletModal';
import RejoinPrompt from './components/RejoinPrompt';
import AdminDashboard from './pages/AdminDashboard';
import BecomeVip from './pages/BecomeVip';
import Tournaments from './pages/Tournaments';
import InstallPwaPrompt from './components/InstallPwaPrompt';
import { Toaster } from 'react-hot-toast';
import { VoiceChatProvider } from './context/VoiceChatContext';
import { useLanguage } from './context/LanguageContext';
import { auth } from './firebase-client';
import { onAuthStateChanged, signOut } from 'firebase/auth';

export default function App() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const { language } = useLanguage();
  const API_BASE_URL = (() => {
    if (typeof window === 'undefined') {
      // Server-side rendering
      return 'http://localhost:3002';
    }
    // In browser, use relative paths so requests hit the current hosting origin directly
    return '';
  })();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true); // Add a loading state for auth
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);
  const [rejoinableRoom, setRejoinableRoom] = useState<GameRoom | null>(null);
  const rejoinableRoomRef = useRef<GameRoom | null>(rejoinableRoom);
  useEffect(() => {
    rejoinableRoomRef.current = rejoinableRoom;
  }, [rejoinableRoom]);

  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [matchmakingState, setMatchmakingState] = useState<{ isQueued: boolean; betAmount: number; capacity?: number; gameMode?: 'solo' | 'team' }>({
    isQueued: false,
    betAmount: 0,
    capacity: 2,
    gameMode: 'solo'
  });
  const [error, setError] = useState<string | null>(null);

  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [showConfirmLeave, setShowConfirmLeave] = useState(false);
  const [activeReaction, setActiveReaction] = useState<{ senderName: string; emoji: string } | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<{
    senderId: string;
    senderName: string;
    senderAvatar: string;
    betAmount: number;
    capacity: number;
    gameMode: 'solo' | 'team';
    roomId: string;
  } | null>(null);

  const [seekingAlert, setSeekingAlert] = useState<{
    senderId: string;
    username: string;
    avatar: string;
    betAmount: number;
    capacity: number;
    gameMode: 'solo' | 'team';
  } | null>(null);

  const matchmakingTimeoutRef = useRef<any>(null);

  // When the URL has a roomId, try to join it.
  useEffect(() => {
    // If there's a roomId in the URL, and the user is logged in,
    // and we're not already in that room, try to join/spectate it.
    if (roomId && user && (!activeRoom || activeRoom.id !== roomId)) {
      const queryParams = new URLSearchParams(location.search);
      const isSpectate = queryParams.get('spectate') === 'true';

      if (isSpectate) {
        handleSpectateRoom(roomId);
      } else {
        handleJoinPrivateRoom(roomId);
      }
    }
  }, [roomId, user, location.search]); // This effect depends on the roomId from the URL and the user's login state.

  // Clear matchmaking timeout on unmount
  useEffect(() => {
    return () => {
      if (matchmakingTimeoutRef.current) {
        clearTimeout(matchmakingTimeoutRef.current);
      }
    };
  }, []);

  // Firebase Auth State Listener
  useEffect(() => {
    let authStateResolved = false;
    const authLoadingTimeout = window.setTimeout(() => {
      if (!authStateResolved) {
        console.warn('Firebase Auth initialization timed out; showing the sign-in screen.');
        setAuthLoading(false);
      }
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      authStateResolved = true;
      window.clearTimeout(authLoadingTimeout);
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          // Fetch user profile from your backend
          const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ email: firebaseUser.email, username: undefined, avatar: undefined }),
          });

          if (!response.ok) {
            throw new Error('Failed to fetch user profile from backend.');
          }

          const profileData: UserProfile = await response.json();
          setUser(profileData);
          // Initiate rejoin check without awaiting to not block authLoading
          void checkAndPromptRejoin(profileData.id);
        } catch (err) {
          console.error("Auth session restore error:", err);
          setUser(null); // Ensure user is logged out on error
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      window.clearTimeout(authLoadingTimeout);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (activeRoom) {
      localStorage.setItem('ludo_active_room_id', activeRoom.id);
    } else {
      // If there's no active room, we should not have an active room ID in storage.
      // This is handled more explicitly in handleLeaveRoom, but this is a good safeguard.
      const storedRoomId = localStorage.getItem('ludo_active_room_id');
      if (storedRoomId) {
        // We have a stored room ID but no active room in the app state.
        // This can happen on page load/re-login. Let's try to rejoin.
        if (user?.id) {
          checkAndPromptRejoin(user.id);
        }
      }
    }
  }, [activeRoom]);


  const userIdRef = useRef(user?.id);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  // Sync real-time updates via SSE stream when user is logged in
  useEffect(() => {
    if (!user) return;

    const sseUrl = `${API_BASE_URL}/api/updates?userId=${user.id}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.addEventListener('init', () => {
      console.log('SSE Real-time connection established for user:', user.username);
    });

    eventSource.addEventListener('user_update', (e: any) => {
      try {
        const updatedProfile = JSON.parse(e.data) as UserProfile;
        setUser(updatedProfile);
      } catch (err) {
        console.error('Failed to parse user update', err);
      }
    });

    eventSource.addEventListener('game_update', (e: any) => {
      try {
        const updatedRoom = JSON.parse(e.data) as GameRoom;
        
        // If a rejoin prompt is currently active for this specific room,
        // just update the data for the prompt, but don't automatically join the game.
        if (rejoinableRoomRef.current && rejoinableRoomRef.current.id === updatedRoom.id) {
          setRejoinableRoom(updatedRoom);
          return; // Prevent automatically setting the active room
        }
        
        setActiveRoom(prevRoom => {
          // Only update activeRoom if the user is already currently in this specific room
          if (prevRoom && prevRoom.id === updatedRoom.id) {
            if (prevRoom.rejectionReason) {
              return { ...updatedRoom, rejectionReason: prevRoom.rejectionReason };
            }
            return updatedRoom;
          }
          // Do not automatically force-open a game room if user is not currently in it
          return prevRoom;
        });
      } catch (err) {
        console.error('Failed to parse game update', err);
      }
    });

    eventSource.addEventListener('timer_tick', (e: any) => {
      try {
        const tick = JSON.parse(e.data) as { turn: number; turnTimer: number };
        setActiveRoom(prev => {
          if (!prev) return null;
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              turn: tick.turn,
              turnTimer: tick.turnTimer
            }
          };
        });
      } catch (err) {
        console.error('Failed to parse timer tick', err);
      }
    });

    eventSource.addEventListener('inactivity_warning', (e: any) => {
      try {
        const data = JSON.parse(e.data) as { message: string };
        setErrorToast(`⏱️ ${data.message}`);
      } catch (err) {
        console.error('Failed to parse inactivity warning', err);
      }
    });

    eventSource.addEventListener('matchmaker_success', (e: any) => {
      try {
        console.log('Received matchmaker_success event:', e.data);
        const data = JSON.parse(e.data) as { roomId: string, room?: GameRoom };
        setMatchmakingState({ isQueued: false, betAmount: 0 });
        if (data.room) {
          setActiveRoom(data.room);
        } else {
          // Fallback if missing
          fetchRoomStateAndRedirect(data.roomId);
        }
      } catch (err) {
        console.error('Failed to parse matchmaking success', err);
      }
    });

    eventSource.addEventListener('player_emoji', (e: any) => {
      try {
        const data = JSON.parse(e.data) as { senderName: string, emoji: string };
        setActiveReaction({ senderName: data.senderName, emoji: data.emoji });
        // Auto clear reaction after 3 seconds
        setTimeout(() => {
          setActiveReaction(null);
        }, 3000);
      } catch (err) {
        console.error('Failed to parse player emoji', err);
      }
    });

    eventSource.addEventListener('player_nudged', (e: any) => {
      try {
        const data = JSON.parse(e.data) as { nudgedBy: string };
        setErrorToast(`⏰ ${data.nudgedBy} ku dhiirigeliyay inaad dhaqaaqdo! (Nudged you to play!)`);
      } catch (err) {
        console.error('Failed to parse player nudge', err);
      }
    });

    eventSource.addEventListener('game_invite', (e: any) => {
      try {
        const data = JSON.parse(e.data) as {
          senderId: string;
          senderName: string;
          senderAvatar: string;
          betAmount: number;
          capacity: number;
          gameMode: 'solo' | 'team';
          roomId: string;
        };
        setIncomingInvite(data);
      } catch (err) {
        console.error('Failed to parse game invite', err);
      }
    });

    eventSource.addEventListener('game_invite_accepted', (e: any) => {
      try {
        const data = JSON.parse(e.data) as { roomId: string };
        setMatchmakingState({ isQueued: false, betAmount: 0 });
        fetchRoomStateAndRedirect(data.roomId);
      } catch (err) {
        console.error('Failed to parse game invite accepted', err);
      }
    });

    eventSource.addEventListener('game_invite_declined', (e: any) => {
      try {
        const data = JSON.parse(e.data) as { receiverName: string };
        setErrorToast(`❌ ${data.receiverName} waa uu diiday martiqaadkaaga. (Declined your challenge)`);
      } catch (err) {
        console.error('Failed to parse game invite declined', err);
      }
    });

    eventSource.addEventListener('room_join_rejected', (e: any) => {
      try {
        const data = JSON.parse(e.data) as { roomId: string; reason: string };
        setActiveRoom(prevRoom => {
          if (prevRoom && prevRoom.id === data.roomId) {
            return { ...prevRoom, rejectionReason: data.reason };
          }
          return prevRoom;
        });
        setErrorToast(`Waa lagu diiday qolka: ${data.reason}`);
      } catch (err) {
        console.error('Failed to parse room_join_rejected event', err);
      }
    });

    eventSource.addEventListener('matchmaker_seeking', () => {
      window.dispatchEvent(new Event('refresh_online_players'));
    });

    eventSource.addEventListener('matchmaker_seeking_cancelled', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        if (data.senderId) {
          // Optimistic update for other clients
          window.dispatchEvent(new CustomEvent('player_left_queue', { detail: { userId: data.senderId } }));
        } else {
          // Fallback if senderId is missing for some reason
          window.dispatchEvent(new Event('refresh_online_players'));
        }
      } catch (err) {
        console.error('Failed to parse matchmaker_seeking_cancelled, refreshing all players.', err);
        window.dispatchEvent(new Event('refresh_online_players'));
      }
    });

    eventSource.addEventListener('online_players_updated', () => {
      window.dispatchEvent(new Event('refresh_online_players'));
    });

    eventSource.addEventListener('voice_signal', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        window.dispatchEvent(new CustomEvent('voice_signal_received', { detail: data }));
      } catch (err) {
        console.error('Failed to parse voice signal event', err);
      }
    });

    eventSource.onerror = (err) => {
      if (eventSource.readyState === EventSource.CLOSED) {
        console.warn('SSE Connection closed.', err);
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.log('SSE connection lost; browser is auto-reconnecting...');
      } else {
        console.error('SSE Error:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [user?.id]);

  const checkAndPromptRejoin = async (userId: string) => {
    const roomId = localStorage.getItem('ludo_active_room_id');
    if (!roomId) return;
  
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/check-status/${roomId}?userId=${userId}`);
      if (response.ok) {
        const roomData = await response.json();
        if (roomData.error) {
          // Game is over or user not in it, so clean up.
          localStorage.removeItem('ludo_active_room_id');
        } else {
          setRejoinableRoom(roomData);
        }
      } else {
        // If status is not OK (e.g., 404, 403), the room is not accessible. Clean up.
        localStorage.removeItem('ludo_active_room_id');
      }
    } catch (err) {
      console.error('Failed to check rejoin status:', err);
      localStorage.removeItem('ludo_active_room_id');
    }
  };

  const handleRejoin = () => {
    if (rejoinableRoom) {
      setActiveRoom(rejoinableRoom);
      setRejoinableRoom(null);
    }
  };

  const handleDismissRejoin = () => {
    setRejoinableRoom(null);
    localStorage.removeItem('ludo_active_room_id');
  };

  const fetchRoomStateAndRedirect = async (roomId: string) => {
    try {
      // Join endpoint also works as getter if already joined
      const response = await fetch(`${API_BASE_URL}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, roomCode: roomId })
      });
      if (response.ok) {
        const roomData = await response.json();
        setActiveRoom(roomData);
      }
    } catch (err) {
      console.error('Failed to load matched room state', err);
    }
  };

  const handleLoginSuccess = (profile: UserProfile) => {
    setUser(profile);
    // No need to set localStorage here, onAuthStateChanged is the source of truth
    checkAndPromptRejoin(profile.id);
  };

  const handleLogout = () => {
    signOut(auth).catch((error) => console.error('Sign out error', error));
    setUser(null);
    setActiveRoom(null);
    setMatchmakingState({ isQueued: false, betAmount: 0 });
    localStorage.removeItem('ludo_active_room_id');
  };

  const handleRefreshBalance = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch (err) {
      console.error('Failed to reload balance', err);
    }
  };

  // Lobby actions
  const handleCreatePrivateRoom = async (betAmount: number, capacity: number, gameMode: 'solo' | 'team') => {
    if (!user) return;
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, betAmount, capacity, gameMode })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Lobby creation failed');
      }

    const roomData = await response.json();
      setActiveRoom(roomData);
    } catch (err: any) {
      setErrorToast(err.message || 'Cilad baa ka dhacday abuurista qolka.');
    }
  };

  const handleSpectateRoom = async (roomCode: string) => {
    if (!user) return;
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomCode}`);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to get room for spectating.');
      }

      const roomData = await response.json();
      setActiveRoom(roomData);
    } catch (err: any) {
      setErrorToast(err.message || 'Could not spectate room.');
    }
  };

  const handleJoinPrivateRoom = async (roomCode: string) => {
    console.log('handleJoinPrivateRoom called with roomCode:', roomCode);
    if (!user) return;
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomCode })
      });

      console.log('handleJoinPrivateRoom response:', response);
      if (!response.ok) {
        const err = await response.json();
        console.error('Error joining private room:', err);
        throw new Error(err.error || 'Failed to join lobby.');
      }

      const roomData = await response.json();
      console.log('handleJoinPrivateRoom roomData:', roomData);
      setActiveRoom(roomData);
    } catch (err: any) {
      setErrorToast(err.message || 'Lobby ku biirista waa ay fashilantay.');
    }
  };

  const handleStartMatchmaking = async (betAmount: number, capacity: number, gameMode: 'solo' | 'team', opponentId?: string) => {
    console.log('handleStartMatchmaking called with:', { betAmount, capacity, gameMode, opponentId });
    if (!user) return;
    setError(null);

    // Cancel any previous pending matchmaking attempts
    if (matchmakingTimeoutRef.current) {
      clearTimeout(matchmakingTimeoutRef.current);
      matchmakingTimeoutRef.current = null;
    }

    // Set local state instantly to show the rotating radar to Player A
    setMatchmakingState({ isQueued: true, betAmount, capacity, gameMode });

    const isDirectChallenge = (typeof opponentId === 'string' && opponentId.length > 0);
    const url = isDirectChallenge ? `${API_BASE_URL}/api/rooms/matchmaking/join` : `${API_BASE_URL}/api/rooms/matchmaking/enter-queue`;
    const body = isDirectChallenge 
      ? { userId: user.id, betAmount, capacity, gameMode, opponentId }
      : { userId: user.id, betAmount, capacity, gameMode };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      console.log('handleStartMatchmaking response:', response);
      if (!response.ok) {
        const err = await response.json();
        console.error('Error starting matchmaking:', err);
        throw new Error(err.error || 'Failed to join matchmaking.');
      }

      const resData = await response.json();
      console.log('handleStartMatchmaking resData:', resData);
      if (resData.matched && resData.roomId) {
        setMatchmakingState({ isQueued: false, betAmount: 0 });
        if (resData.room) {
          setActiveRoom(resData.room);
        } else {
          fetchRoomStateAndRedirect(resData.roomId);
        }
      } else {
        // Confirm we're queued on the server
        setMatchmakingState({ isQueued: true, betAmount, capacity, gameMode });
      }
      window.dispatchEvent(new Event('refresh_online_players'));
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setErrorToast('Lama xidhiidhi karo server-ka. Fadlan isku day mar kale hadhow. (Could not connect to the server. Please try again later.)');
      } else {
        setErrorToast(err.message || 'Cilad matchmaking.');
      }
      setMatchmakingState({ isQueued: false, betAmount: 0 });
    }
  };

  const handleLeaveMatchmaking = async (betAmount: number, capacity?: number, gameMode?: 'solo' | 'team') => {
    if (!user) return;
    if (matchmakingTimeoutRef.current) {
      clearTimeout(matchmakingTimeoutRef.current);
      matchmakingTimeoutRef.current = null;
    }
    try {
      await fetch(`${API_BASE_URL}/api/rooms/matchmaking/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, betAmount, capacity, gameMode })
      });
      setMatchmakingState({ isQueued: false, betAmount: 0 });
      window.dispatchEvent(new Event('refresh_online_players'));
    } catch (err) {
      console.error(err);
    }
  };

  // Gameplay room actions
  const handleToggleReady = async () => {
    if (!user || !activeRoom) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomId: activeRoom.id })
      });
      if (response.ok) {
        const data = await response.json();
        setActiveRoom(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddBot = async () => {
    if (!activeRoom) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/add-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: activeRoom.id })
      });
      if (response.ok) {
        const data = await response.json();
        setActiveRoom(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartMatch = async () => {
    if (!user || !activeRoom) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomId: activeRoom.id })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start match.');
      }
      const data = await response.json();
      setActiveRoom(data);
    } catch (err: any) {
      setErrorToast(err.message || 'Cilad baa ka dhacday bilaabista ciyaarta.');
    }
  };

  const handleRollDice = async () => {
    if (!user || !activeRoom) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/roll-dice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomId: activeRoom.id })
      });
      if (response.ok) {
        const data = await response.json();
        setActiveRoom(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMoveToken = async (tokenId: string) => {
    if (!user || !activeRoom) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/move-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomId: activeRoom.id, tokenId })
      });
      if (response.ok) {
        const data = await response.json();
        setActiveRoom(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendChat = async (text: string) => {
    if (!user || !activeRoom) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomId: activeRoom.id, text })
      });
      if (response.ok) {
        const data = await response.json();
        setActiveRoom(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeaveRoom = async (force: boolean = false) => {
    if (!user || !activeRoom) return;

    const isPlayer = activeRoom.players.some(p => p.userId === user.id);

    // A spectator is leaving. Just clear the room and let the GameRoom's cleanup effect handle the API call.
    if (!isPlayer) {
        setActiveRoom(null);
        localStorage.removeItem('ludo_active_room_id');
        return;
    }
    
    if (activeRoom.status === 'playing' && !force) {
      setShowConfirmLeave(true);
      return;
    }

    // If the game is already completed, clicking "Play Another Game" should just take us to the dashboard.
    if (activeRoom.status === 'completed') {
      setActiveRoom(null);
      localStorage.removeItem('ludo_active_room_id');
      handleRefreshBalance();
      return;
    }

    try {
      // Close the confirmation immediately so the action has clear feedback.
      setShowConfirmLeave(false);

      const response = await fetch(`${API_BASE_URL}/api/rooms/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomId: activeRoom.id })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to leave room.');
      }

      // Leaving means leaving: clear the room after the server records the forfeit.
      setActiveRoom(null);
      localStorage.removeItem('ludo_active_room_id');
      handleRefreshBalance();
    } catch (err) {
      console.error(err);
      setErrorToast(
        language === 'so'
          ? 'Qolka lagama bixi karin. Fadlan mar kale isku day.'
          : 'Failed to leave the room. Please try again.'
      );
    }
  };

  const handleAcceptInvite = async () => {
    if (!incomingInvite || !user) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/challenge/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomId: incomingInvite.roomId })
      });
      if (response.ok) {
        // Redirect to the challenged game room!
        fetchRoomStateAndRedirect(incomingInvite.roomId);
      } else {
        const err = await response.json();
        setErrorToast(err.error || 'Ku biirista martiqaadka waa ay guuldaraysatay.');
      }
    } catch (err) {
      console.error(err);
      setErrorToast('Waxaa dhacay cilad farsamo.');
    } finally {
      setIncomingInvite(null);
    }
  };

  const handleDeclineInvite = async () => {
    if (!incomingInvite || !user) return;
    try {
      await fetch(`${API_BASE_URL}/api/rooms/challenge/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomId: incomingInvite.roomId })
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIncomingInvite(null);
    }
  };

  const handleProfileUpdate = async (updatedData: Partial<UserProfile>) => {
    if (!user) return;

    const oldUser = user;
    const newUser = { ...user, ...updatedData };

    // Optimistic update
    setUser(newUser);

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${user.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });

      if (!response.ok) {
        // If the server fails, revert the change
        const errorData = await response.json().catch(() => ({ message: 'Failed to update profile.' }));
        throw new Error(errorData.message);
      }
      
      // The SSE event will eventually provide the canonical update.
      // For now, the optimistic update is what the user sees.
      
    } catch (error) {
      // Revert on error
      setUser(oldUser);
      setErrorToast((error as Error).message || 'Profile update failed. Please try again.');
      // Re-throw so the calling component knows about the failure
      throw error;
    }
  };

  // Auto dismiss toast after 5 seconds
  useEffect(() => {
    if (errorToast) {
      const t = setTimeout(() => setErrorToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [errorToast]);

  // Rendering orchestration
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (window.location.pathname === '/admin') {
    return <AdminDashboard />;
  }

  if (window.location.pathname === '/vip') {
    return <BecomeVip />;
  }
  
  if (window.location.pathname === '/tournaments') {
    return <Tournaments />;
  }
  
  if (rejoinableRoom) {
    return <RejoinPrompt rejoinableRoom={rejoinableRoom} onRejoin={handleRejoin} onDismissRejoin={handleDismissRejoin} />;
  }

  if (!user) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} initialError={error} />;
  }

  // This function renders overlays that should appear above the main content.
  const renderOverlays = () => (
    <>
      {activeReaction && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] bg-[#1A0C40]/90 border border-purple-500/40 p-3 px-5 rounded-2xl flex items-center gap-3 shadow-2xl animate-bounce backdrop-blur-md">
          <span className="text-3xl animate-pulse">{activeReaction.emoji}</span>
          <p className="text-xs font-black text-slate-100 whitespace-nowrap">
            <span className="text-purple-400 font-extrabold">{activeReaction.senderName}</span>: {activeReaction.emoji === '😂' ? 'Wuu qoslay!' : activeReaction.emoji === '😍' ? 'Aad buu u helay!' : activeReaction.emoji === '😱' ? 'Wuu la yaabay!' : activeReaction.emoji === '😡' ? 'Wuu carooday!' : activeReaction.emoji === '👍' ? 'Waa sax!' : 'Waa gubtay!'}
          </p>
        </div>
      )}

      {errorToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99] max-w-sm w-[90%] bg-red-950/95 border border-red-500/40 p-3.5 rounded-xl shadow-2xl shadow-red-950/50 flex items-center justify-between backdrop-blur-md">
          <p className="text-xs font-bold text-red-400 leading-relaxed">{errorToast}</p>
          <button onClick={() => setErrorToast(null)} className="text-red-400 hover:text-white text-xs font-black p-1 ml-2 cursor-pointer">✕</button>
        </div>
      )}

      {showConfirmLeave && (
        <div className="fixed inset-0 z-[98] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1220] border border-white/10 max-w-xs w-full rounded-2xl p-5 text-center space-y-4 shadow-2xl">
            <h3 className="font-black text-xs text-red-400 uppercase tracking-widest">
              ⚠️ {language === 'so' ? 'KA BIXITAANKA CIYAARTA' : 'LEAVE GAME'}
            </h3>
            <p className="text-xs text-slate-200 font-bold leading-relaxed">
              {language === 'so'
                ? 'Ciyaartu hadda way socotaa. Haddii aad hadda ka baxdo, lacagta aad gelisay waad luminaysaa!'
                : 'The game is currently in progress. If you leave now, you will lose the money you entered!' }
            </p>
            <p className="text-[10px] text-slate-500 font-bold">
              {language === 'so'
                ? 'Miyaad hubtaa inaad rabto inaad ka baxdo ciyaarta oo aad khasaarto?'
                : 'Are you sure you want to leave the game and forfeit your stake?'}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleLeaveRoom(true)}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black text-xs py-2 rounded-xl cursor-pointer"
              >
                {language === 'so' ? 'Haa, Ka Bax' : 'Yes, Leave'}
              </button>
              <button
                onClick={() => setShowConfirmLeave(false)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-black text-xs py-2 rounded-xl cursor-pointer"
              >
                {language === 'so' ? 'Maya, Joog' : 'No, Stay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {incomingInvite && (
        <div className="fixed inset-0 z-[99] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-gradient-to-b from-[#1b0d44] to-[#0d0526] border-2 border-yellow-400/80 max-w-sm w-full rounded-2xl p-6 text-center space-y-5 shadow-[0_0_40px_rgba(234,179,8,0.25)] relative overflow-hidden">
            {/* Pulsing decoration */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-yellow-400 animate-pulse" />
            
            <div className="space-y-2">
              <span className="inline-block text-5xl bg-black/40 border border-white/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                {incomingInvite.senderAvatar}
              </span>
              <h3 className="font-black text-sm text-yellow-400 uppercase tracking-widest">
                LOBBY CHALLENGE INVITE!
              </h3>
              <p className="text-xs text-slate-300 font-bold">
                <span className="text-white text-sm font-black">{incomingInvite.senderName}</span> wuxuu kuu soo diray tartan Ludo ah!
              </p>
            </div>

            <div className="bg-black/40 border border-white/5 p-3 rounded-xl flex items-center justify-around text-xs">
              <div className="text-center space-y-0.5">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase block">Stake Bet</span>
                <span className="font-black text-blue-400 font-mono">${incomingInvite.betAmount}</span>
              </div>
              <div className="w-[1px] h-6 bg-white/10" />
              <div className="text-center space-y-0.5">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase block">Habka</span>
                <span className="font-black text-purple-400 uppercase">{incomingInvite.gameMode === 'team' ? 'Partnership 2v2' : 'Solo ' + incomingInvite.capacity + 'P'}</span>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 font-semibold leading-normal">
              Haddii aad aqbasho, waxaa laguu wareejin doonaa qolka lobby-ga, waxaana laguu diyaarin doonaa bilowga ciyaarta.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={handleAcceptInvite}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black text-xs py-3 rounded-xl active:scale-95 transition-all cursor-pointer shadow-md shadow-green-500/10 uppercase tracking-wide"
              >
                Aqbal (Accept)
              </button>
              <button
                onClick={handleDeclineInvite}
                className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-black text-xs py-3 rounded-xl active:scale-95 transition-all cursor-pointer uppercase tracking-wide"
              >
                Diid (Decline)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (activeRoom) {
    return (
      <>
        <VoiceChatProvider>
          <GameRoomView
            room={activeRoom}
            user={user}
            userId={user.id}
            onLeave={handleLeaveRoom}
            onLogout={handleLogout}
            onToggleReady={handleToggleReady}
            onAddBot={handleAddBot}
            onStartMatch={handleStartMatch}
            onRollDice={handleRollDice}
            onMoveToken={handleMoveToken}
            onSendChat={handleSendChat}
            onProfileUpdate={handleProfileUpdate}
            onRetryJoin={() => {
              if (activeRoom) {
                // Clear the rejection reason and retry joining
                setActiveRoom(prev => prev ? { ...prev, rejectionReason: undefined } : null);
                handleJoinPrivateRoom(activeRoom.id);
              }
            }}
          />
        {isWalletOpen && (
          <WalletModal
            user={user}
            onClose={() => setIsWalletOpen(false)}
            onBalanceUpdated={handleRefreshBalance}
          />
        )}
        {renderOverlays()}
        <Toaster />
      </VoiceChatProvider>
      </>
      );
  }
  
  const renderAppContent = () => {
    if (activeRoom) {
      return (
        <VoiceChatProvider>
          <GameRoomView
            room={activeRoom}
            user={user}
            userId={user.id}
            onLeave={handleLeaveRoom}
            onLogout={handleLogout}
            onToggleReady={handleToggleReady}
            onAddBot={handleAddBot}
            onStartMatch={handleStartMatch}
            onRollDice={handleRollDice}
            onMoveToken={handleMoveToken}
            onSendChat={handleSendChat}
            onProfileUpdate={handleProfileUpdate}
            onRetryJoin={() => {
              if (activeRoom) {
                setActiveRoom(prev => prev ? { ...prev, rejectionReason: undefined } : null);
                handleJoinPrivateRoom(activeRoom.id);
              }
            }}
          />
          {isWalletOpen && (
            <WalletModal
              user={user}
              onClose={() => setIsWalletOpen(false)}
              onBalanceUpdated={handleRefreshBalance}
            />
          )}
          {renderOverlays()}
          <Toaster />
        </VoiceChatProvider>
      );
    }

    return (
      <VoiceChatProvider>
          <Dashboard
            user={user}
            onOpenWallet={() => setIsWalletOpen(true)}
            onLogout={handleLogout}
            onCreatePrivateRoom={handleCreatePrivateRoom}
            onJoinPrivateRoom={handleJoinPrivateRoom}
            onStartMatchmaking={handleStartMatchmaking}
            onLeaveMatchmaking={handleLeaveMatchmaking}
            matchmakingState={matchmakingState}
            rejoinableRoom={rejoinableRoom}
            onRejoin={handleRejoin}
            onDismissRejoin={handleDismissRejoin}
            onProfileUpdate={handleProfileUpdate}
          />
          {isWalletOpen && (
            <WalletModal
              user={user}
              onClose={() => setIsWalletOpen(false)}
              onBalanceUpdated={handleRefreshBalance}
            />
          )}
          {renderOverlays()}
          <Toaster />
        </VoiceChatProvider>
    );
  };

  return (
    <div id="app-root">
      {renderAppContent()}
      <InstallPwaPrompt />
    </div>
  )
}
