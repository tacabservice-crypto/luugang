
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, GameRoom } from './types/game';
import InstallPwaPrompt from './components/InstallPwaPrompt';
import { Toaster } from 'react-hot-toast';
import { VoiceChatProvider } from './context/VoiceChatContext';
import { useLanguage } from './context/LanguageContext';
import { auth } from './firebase-client';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { userErrorMessage } from './utils/userError';

const AuthScreen = React.lazy(() => import('./components/AuthScreen'));
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const GameRoomView = React.lazy(() => import('./components/GameRoom'));
const WalletModal = React.lazy(() => import('./components/WalletModal'));
const RejoinPrompt = React.lazy(() => import('./components/RejoinPrompt'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const BecomeVip = React.lazy(() => import('./pages/BecomeVip'));
const Tournaments = React.lazy(() => import('./pages/Tournaments'));

function shouldAcceptRoomUpdate(current: GameRoom | null, incoming: GameRoom): boolean {
  if (!current || current.id !== incoming.id) return true;
  if (current.status === 'completed' || current.status === 'cancelled') return false;
  if (incoming.status === 'completed' || incoming.status === 'cancelled') return true;
  const currentRevision = Number(current.gameState?.lastActivity || 0);
  const incomingRevision = Number(incoming.gameState?.lastActivity || 0);
  if (incomingRevision < currentRevision) return false;

  // Timer-only snapshots can arrive out of order through SSE/reconnects. A
  // snapshot for the same gameplay revision must never rewind the countdown.
  if (
    incomingRevision === currentRevision &&
    incoming.gameState.turn === current.gameState.turn &&
    incoming.gameState.turnTimer > current.gameState.turnTimer
  ) return false;

  return true;
}

export default function App() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const API_BASE_URL = (() => {
    if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
    if (typeof window === 'undefined') return 'http://localhost:3002';
    return '';
  })();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true); // Add a loading state for auth
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);
  const [rejoinableRoom, setRejoinableRoom] = useState<GameRoom | null>(null);
  const rejoinableRoomRef = useRef<GameRoom | null>(rejoinableRoom);
  const routedRoomIdRef = useRef<string | null>(roomId || null);
  const suppressNextRoomRestoreRef = useRef(false);
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

  // Connectivity is separate from authentication. Losing mobile data/Wi-Fi
  // must never be interpreted as a logout or send a verified user to sign-in.
  useEffect(() => {
    const restoreCachedSession = () => {
      setIsOnline(false);
      try {
        const cached = JSON.parse(localStorage.getItem('ludosom_cached_profile') || 'null') as UserProfile | null;
        if (cached?.id) setUser(current => current || cached);
      } catch {
        // A malformed cache is ignored; the offline screen remains available.
      }
      setAuthLoading(false);
    };
    const markOnline = () => setIsOnline(true);
    window.addEventListener('offline', restoreCachedSession);
    window.addEventListener('online', markOnline);
    if (!navigator.onLine) restoreCachedSession();
    return () => {
      window.removeEventListener('offline', restoreCachedSession);
      window.removeEventListener('online', markOnline);
    };
  }, []);

  // Detect a new server/web deployment, remove stale PWA responses, and reload
  // exactly once. This also refreshes the live frontend used by the Android APK.
  useEffect(() => {
    let stopped = false;
    let checking = false;
    const versionKey = 'ludosom_deploy_version';

    const checkForDeployment = async () => {
      if (checking || stopped || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const response = await fetch(`${API_BASE_URL}/api/version?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json() as { version?: string };
        const incomingVersion = String(data.version || '').trim();
        if (!incomingVersion) return;
        const currentVersion = localStorage.getItem(versionKey);
        if (!currentVersion) {
          localStorage.setItem(versionKey, incomingVersion);
          return;
        }
        if (currentVersion === incomingVersion) return;

        // Store first to prevent a reload loop if service-worker cleanup takes
        // longer than navigation on a slow phone.
        localStorage.setItem(versionKey, incomingVersion);
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.filter(name => /workbox|vite|ludosom|precache/i.test(name)).map(name => caches.delete(name)));
        }
        const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
        registrations.forEach(registration => registration.update().catch(() => undefined));
        window.location.reload();
      } catch {
        // Offline users keep the last working app; the next focus/poll retries.
      } finally {
        checking = false;
      }
    };

    const timer = window.setInterval(checkForDeployment, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void checkForDeployment(); };
    document.addEventListener('visibilitychange', onVisible);
    void checkForDeployment();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [API_BASE_URL]);

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

  // Keep game state and browser history aligned. Opening a room creates a real
  // history entry, while browser/mobile Back hides the room without forfeiting.
  useEffect(() => {
    if (activeRoom) {
      if (roomId === activeRoom.id) {
        routedRoomIdRef.current = activeRoom.id;
        return;
      }
      if (routedRoomIdRef.current !== activeRoom.id) {
        routedRoomIdRef.current = activeRoom.id;
        navigate(`/room/${encodeURIComponent(activeRoom.id)}`);
        return;
      }

      // The URL moved away from an already-routed room via browser/mobile Back.
      suppressNextRoomRestoreRef.current = true;
      setActiveRoom(null);
      return;
    }

    if (!roomId) routedRoomIdRef.current = null;
  }, [activeRoom, roomId, navigate]);

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
        console.warn('Firebase Auth initialization timed out; preserving any cached session.');
        if (!navigator.onLine) {
          try {
            const cached = JSON.parse(localStorage.getItem('ludosom_cached_profile') || 'null') as UserProfile | null;
            if (cached?.id) setUser(cached);
          } catch { /* ignore invalid cache */ }
        }
        setAuthLoading(false);
      }
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      authStateResolved = true;
      window.clearTimeout(authLoadingTimeout);
      if (firebaseUser) {
        try {
          await firebaseUser.reload();
          const providerId = firebaseUser.providerData[0]?.providerId;
          if (sessionStorage.getItem('ludosom_auth_onboarding_pending') === '1') {
            setAuthLoading(false);
            return;
          }
          const token = await firebaseUser.getIdToken();
          let response: Response | null = null;
          let profileData: UserProfile | null = null;
          for (let attempt = 0; attempt < 12; attempt += 1) {
            try {
              response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ email: firebaseUser.email, username: undefined, avatar: undefined }),
              });
              if (response.ok) {
                profileData = await response.json();
                break;
              }
              if (response.status === 401) {
                await signOut(auth);
                throw new Error('Your session has expired. Please sign in again.');
              }
              if (response.status === 428 || response.status === 403) {
                const details = await response.json().catch(() => ({}));
                await signOut(auth);
                throw new Error(details.error || 'Email verification is required. Please sign in again to verify your account.');
              }
            } catch (requestError) {
              if (/session has expired|verification is required|OTP verification/i.test(String((requestError as Error)?.message || ''))) throw requestError;
              if (attempt === 11) throw requestError;
            }
            await new Promise(resolve => window.setTimeout(resolve, 2500));
          }
          if (!profileData) throw new Error(`The server is still restarting (${response?.status || 'offline'}).`);
          setUser(profileData);
          localStorage.setItem('ludosom_cached_profile', JSON.stringify(profileData));
          // Initiate rejoin check without awaiting to not block authLoading
          void checkAndPromptRejoin(profileData.id);
        } catch (err) {
          console.error("Auth session restore error:", err);
          // A deployment restart must not throw an authenticated player out of
          // the app. Keep the last verified profile visible while the backend
          // reconnects; Firebase remains the source of authentication truth.
          try {
            const cached = JSON.parse(localStorage.getItem('ludosom_cached_profile') || 'null') as UserProfile | null;
            if (auth.currentUser && cached?.id) {
              setUser(cached);
              setErrorToast('Server is reconnecting after an update. Your session is still active.');
            } else {
              setError((err as Error).message || 'Your account needs verification. Please sign in again.');
              setUser(null);
            }
          } catch {
            setUser(null);
          }
        }
      } else {
        if (!navigator.onLine) {
          try {
            const cached = JSON.parse(localStorage.getItem('ludosom_cached_profile') || 'null') as UserProfile | null;
            if (cached?.id) setUser(current => current || cached);
          } catch { /* ignore invalid cache */ }
        } else {
          setUser(null);
        }
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
        if (suppressNextRoomRestoreRef.current) {
          suppressNextRoomRestoreRef.current = false;
          return;
        }
        // We have a stored room ID but no active room in the app state.
        // This can happen on page load/re-login. Let's try to rejoin.
        if (user?.id) {
          checkAndPromptRejoin(user.id);
        }
      }
    }
  }, [activeRoom, user?.id]);

  // SSE is instant on a single server process. Production hosts may route two
  // players to different processes, so refresh the active room from the shared
  // MySQL copy as a lightweight cross-process fallback.
  useEffect(() => {
    if (!activeRoom?.id || !user?.id) return;
    let stopped = false;
    let requestInFlight = false;

    const refreshActiveRoom = async () => {
      if (requestInFlight || document.visibilityState === 'hidden') return;
      requestInFlight = true;
      try {
        const response = await fetch(`${API_BASE_URL}/api/rooms/${activeRoom.id}?userId=${encodeURIComponent(user.id)}`);
        if (!response.ok) return;
        const room = await response.json() as GameRoom;
        if (!stopped && room?.id === activeRoom.id) {
          setActiveRoom(previous => previous?.id === room.id && shouldAcceptRoomUpdate(previous, room)
            ? { ...room, rejectionReason: previous.rejectionReason || room.rejectionReason }
            : previous);
        }
      } catch {
        // The existing SSE connection remains the primary real-time channel.
      } finally {
        requestInFlight = false;
      }
    };

    const timer = window.setInterval(refreshActiveRoom, 10000);
    void refreshActiveRoom();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeRoom?.id, user?.id]);


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
            if (!shouldAcceptRoomUpdate(prevRoom, updatedRoom)) return prevRoom;
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
        const tick = JSON.parse(e.data) as { turn: number; turnTimer: number; inactivityTimer?: number; lastActivity?: number };
        setActiveRoom(prev => {
          if (!prev) return null;
          if (Number(tick.lastActivity || 0) !== Number(prev.gameState.lastActivity || 0)) return prev;
          if (tick.turn === prev.gameState.turn && tick.turnTimer > prev.gameState.turnTimer) return prev;
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
        const data = JSON.parse(e.data) as { roomId: string; room?: GameRoom };
        setMatchmakingState({ isQueued: false, betAmount: 0 });
        if (data.room) setActiveRoom(data.room);
        else fetchRoomStateAndRedirect(data.roomId);
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
          if (roomId === roomData.id) {
            setActiveRoom(roomData);
            setRejoinableRoom(null);
          } else {
            setRejoinableRoom(roomData);
          }
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
    localStorage.setItem('ludosom_cached_profile', JSON.stringify(profile));
    // No need to set localStorage here, onAuthStateChanged is the source of truth
    checkAndPromptRejoin(profile.id);
  };

  const handleLogout = () => {
    signOut(auth).catch((error) => console.error('Sign out error', error));
    setUser(null);
    setActiveRoom(null);
    setMatchmakingState({ isQueued: false, betAmount: 0 });
    localStorage.removeItem('ludo_active_room_id');
    localStorage.removeItem('ludosom_cached_profile');
    navigate('/', { replace: true });
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
      setErrorToast(userErrorMessage(err, 'The room could not be created.'));
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
      setErrorToast(userErrorMessage(err, 'The room could not be watched.'));
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
      setErrorToast(userErrorMessage(err, 'Could not join the lobby.'));
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
        setErrorToast(userErrorMessage(err, 'Matchmaking failed.'));
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
        body: JSON.stringify({ userId: user?.id, roomId: activeRoom.id })
      });
      if (response.ok) {
        const data = await response.json();
        setActiveRoom(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangeTeam = async (playerId: string, targetTeam: 'A' | 'B', swapWithUserId?: string) => {
    if (!user || !activeRoom) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/change-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, roomId: activeRoom.id, playerId, targetTeam, swapWithUserId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Team-ka lama beddeli karin.');
      setActiveRoom(data);
    } catch (err) {
      setErrorToast(userErrorMessage(err, 'Team-ka lama beddeli karin.'));
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
      setErrorToast(userErrorMessage(err, 'The game could not be started.'));
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
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'The dice could not be rolled.');
      }

      const data = await response.json();
      setActiveRoom(data);
    } catch (err) {
      console.error(err);
      setErrorToast(userErrorMessage(err, 'The dice could not be rolled. Please try again.'));
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
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'The token could not be moved.');
      setActiveRoom(data);
    } catch (err) {
      console.error(err);
      setErrorToast(userErrorMessage(err, 'The token could not be moved. Please try again.'));
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
        setActiveRoom(previousRoom => {
          if (!previousRoom || previousRoom.id !== data.id) return data;
          const mergedChat = Array.from(new Map([
            ...previousRoom.gameState.chat,
            ...data.gameState.chat,
          ].map(message => [message.id, message])).values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-30);
          return { ...data, gameState: { ...data.gameState, chat: mergedChat } };
        });
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
        const isPendingPlayer = activeRoom.pendingPlayers?.some(p => p.userId === user.id);
        if (isPendingPlayer) {
          try {
            await fetch(`${API_BASE_URL}/api/rooms/leave`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id, roomId: activeRoom.id })
            });
          } catch (err) {
            console.error('Failed to remove pending room request:', err);
          }
        }
        setActiveRoom(null);
        localStorage.removeItem('ludo_active_room_id');
        navigate('/', { replace: true });
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
      navigate('/', { replace: true });
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

      const data = await response.json();
      // During a running game the server returns the completed forfeit result.
      // Keep it mounted so the leaving player sees "WAA LAGU HELAY" and the
      // final result before choosing Play Another Game.
      if (data?.room?.status === 'completed') {
        setActiveRoom(data.room);
      } else {
        setActiveRoom(null);
        navigate('/', { replace: true });
      }
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
        const data = await response.json() as { roomId: string; room?: GameRoom };
        if (data.room) setActiveRoom(data.room);
        else fetchRoomStateAndRedirect(data.roomId || incomingInvite.roomId);
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

  if (window.location.pathname === '/cashier') {
    return <AdminDashboard cashierMode />;
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
    if (!isOnline) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex items-center justify-center p-6">
          <div className="max-w-sm w-full rounded-2xl border border-amber-400/30 bg-black/30 p-7 text-center shadow-2xl">
            <div className="text-5xl">📡</div>
            <h1 className="mt-4 text-xl font-black">Internet ma jiro</h1>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-300">
              Hubi in Mobile Data ama Wi-Fi uu shidan yahay, kadibna isku day mar kale. Login page-ka wuxuu soo noqonayaa marka xiriirku soo laabto.
            </p>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-purple-600 px-5 py-3 text-sm font-black">
              Isku day mar kale
            </button>
          </div>
        </div>
      );
    }
    return <AuthScreen onLoginSuccess={handleLoginSuccess} initialError={error} />;
  }

  // This function renders overlays that should appear above the main content.
  const renderOverlays = () => (
    <>
      {!isOnline && (
        <div className="fixed inset-x-3 top-3 z-[120] mx-auto max-w-md rounded-xl border border-amber-400/40 bg-amber-950/95 p-3 text-center shadow-2xl backdrop-blur-md">
          <p className="text-xs font-black text-amber-200">📡 Internetku wuu go'an yahay. Hubi Mobile Data ama Wi-Fi. Account-kaaga lama logout-gareyn.</p>
        </div>
      )}
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
            onChangeTeam={handleChangeTeam}
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
            onChangeTeam={handleChangeTeam}
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
