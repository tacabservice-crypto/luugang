import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { LudoPlayer } from '../types/game';
import { useStableCallback } from '../hooks/useStableCallback';
import { auth } from '../firebase-client';

type VoiceStatus = 'idle' | 'requesting' | 'connecting' | 'connected' | 'blocked' | 'failed';

interface VoiceChatContextType {
  isMuted: boolean;
  isSpeakerOn: boolean;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  initializeVoiceChat: (localUserId: string, roomId: string, isSpectator?: boolean) => void;
  updatePlayers: (players: LudoPlayer[]) => void;
  closeVoiceChat: () => void;
  speakingPlayers: Record<string, boolean>;
  voiceStatus: VoiceStatus;
  voiceError: string | null;
  retryVoiceChat: () => void;
  unlockAudio: () => void;
  audioNeedsUnlock: boolean;
}

const VoiceChatContext = createContext<VoiceChatContextType | undefined>(undefined);

export const useVoiceChat = () => {
  const context = useContext(VoiceChatContext);
  if (!context) {
    throw new Error('useVoiceChat must be used within a VoiceChatProvider');
  }
  return context;
};

interface VoiceChatProviderProps {
  children: React.ReactNode;
}

const LOG_PREFIX = '[VOICE_CHAT]';
const isBotPeer = (userId: string) => /^(bot_|bot-|computer_|computer-|user_sim_|sim_)/i.test(userId);

const getIceServers = (): RTCIceServer[] => {
  // Default Google STUN servers
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // Add TURN server from environment variables if configured
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUrls = String(import.meta.env.VITE_TURN_URLS || turnUrl || '').split(',').map(url => url.trim()).filter(Boolean);
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrls.length) {
    const turnServer: RTCIceServer = { urls: turnUrls };
    if (turnUsername && turnCredential) {
      turnServer.username = turnUsername;
      turnServer.credential = turnCredential;
    }
    iceServers.push(turnServer);
    console.log(`${LOG_PREFIX} TURN server configured (${turnUrls.length} transport URL(s)). Has Username: ${!!turnUsername}, Has Credential: ${!!turnCredential}`);
  } else {
    console.log(`${LOG_PREFIX} VITE_TURN_URL not found. Using STUN servers only.`);
  }

  return iceServers;
};

export const VoiceChatProvider: React.FC<VoiceChatProviderProps> = ({ children }) => {
  const localStreamRef = useRef<MediaStream | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [speakingPlayers, setSpeakingPlayers] = useState<Record<string, boolean>>({});
  const [peerIds, setPeerIds] = useState<string[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioNeedsUnlock, setAudioNeedsUnlock] = useState(false);

  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const remoteAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const localUserIdRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const latestPlayersRef = useRef<LudoPlayer[]>([]);
  const pendingCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const spectatorRef = useRef(false);
  const reconnectAttemptsRef = useRef<Record<string, number>>({});

  const attachRemoteAudio = useStableCallback((peerId: string, stream: MediaStream) => {
    let audio = remoteAudioRefs.current[peerId];
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      remoteAudioRefs.current[peerId] = audio;
    }
    audio.srcObject = stream;
    audio.muted = !isSpeakerOn;
    void audio.play().then(() => setAudioNeedsUnlock(false)).catch(e => {
      setAudioNeedsUnlock(true);
      console.warn(`${LOG_PREFIX} Browser deferred remote audio for ${peerId}:`, e);
    });
  });

  const sendSignalingMessage = useStableCallback(async (targetId: string, signal: any) => {
    if (!roomIdRef.current || !localUserIdRef.current) {
      console.error(`${LOG_PREFIX} Cannot send signaling message, room or user ID is not set.`);
      return;
    }
    console.log(`${LOG_PREFIX} Sending signal to ${targetId}:`, signal.type);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Voice signaling requires an authenticated session.');
      const response = await fetch('/api/rooms/voice-signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          roomId: roomIdRef.current,
          senderId: localUserIdRef.current,
          targetId,
          signal
        })
      });
      if (!response.ok) throw new Error(`Voice signaling failed (${response.status}).`);
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to send voice signaling message:`, err);
    }
  });

  const closeSinglePeerConnection = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current[peerId];
    if (pc) {
      console.log(`${LOG_PREFIX} Closing peer connection for ${peerId}`);
      pc.close();
      delete peerConnectionsRef.current[peerId];
    }
    const audio = remoteAudioRefs.current[peerId];
    if (audio) {
      audio.srcObject = null;
      delete remoteAudioRefs.current[peerId];
    }
  }, []);

  const closeVoiceChat = useCallback(() => {
    console.log(`${LOG_PREFIX} Closing all connections and stopping media stream.`);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    Object.keys(peerConnectionsRef.current).forEach(closeSinglePeerConnection);
    localUserIdRef.current = null;
    roomIdRef.current = null;
    initializedRef.current = false;
    latestPlayersRef.current = [];
    pendingCandidatesRef.current = {};
    reconnectAttemptsRef.current = {};
    setIsInitialized(false);
    setPeerIds([]);
    setVoiceStatus('idle');
    setVoiceError(null);
    setAudioNeedsUnlock(false);
  }, [closeSinglePeerConnection]);

  const updatePlayers = useStableCallback((players: LudoPlayer[]) => {
    latestPlayersRef.current = players;
    if (!initializedRef.current || !localUserIdRef.current) {
      return;
    }

    const localUserId = localUserIdRef.current;
    const isSpectator = !localStreamRef.current;
    const otherPlayers = players.filter(p => p.userId !== localUserId && !isBotPeer(p.userId));
    const existingPeerIds = Object.keys(peerConnectionsRef.current);

    // Remove connections to players who have left
    existingPeerIds.forEach(peerId => {
      if (!otherPlayers.some(p => p.userId === peerId)) {
        closeSinglePeerConnection(peerId);
      }
    });

    // Add connections for new players
    otherPlayers.forEach(p => {
      if (!peerConnectionsRef.current[p.userId]) {
        console.log(`${LOG_PREFIX} New player ${p.userId} joined. Setting up peer connection (Spectator: ${isSpectator}).`);
        const pc = new RTCPeerConnection({
          iceServers: getIceServers()
        });

        pc.onconnectionstatechange = () => {
          console.log(`${LOG_PREFIX} Connection state with ${p.userId}: ${pc.connectionState}`);
          if (pc.connectionState === 'connected') {
            reconnectAttemptsRef.current[p.userId] = 0;
            setVoiceStatus('connected');
            setVoiceError(null);
          } else if (pc.connectionState === 'connecting') {
            setVoiceStatus('connecting');
          } else if (pc.connectionState === 'failed' && (reconnectAttemptsRef.current[p.userId] || 0) < 2) {
            reconnectAttemptsRef.current[p.userId] = (reconnectAttemptsRef.current[p.userId] || 0) + 1;
            pc.restartIce();
            void pc.createOffer({ iceRestart: true }).then(offer => pc.setLocalDescription(offer)).then(() => {
              if (pc.localDescription) return sendSignalingMessage(p.userId, { type: 'offer', sdp: pc.localDescription.toJSON() });
            }).catch(error => console.error(`${LOG_PREFIX} ICE restart failed:`, error));
          } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            setVoiceStatus('failed');
            setVoiceError('Players could not connect by voice. Tap retry.');
          }
        };
        
        if (isSpectator) {
          // Spectators only receive audio
          pc.addTransceiver('audio', { direction: 'recvonly' });
        } else {
          // Players send their audio stream
          localStreamRef.current!.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
        }
        
        pc.onicecandidate = (event) => event.candidate && sendSignalingMessage(p.userId, { type: 'candidate', candidate: event.candidate });
        pc.ontrack = (event) => {
          console.log(`${LOG_PREFIX} Received remote track from ${p.userId}`);
          attachRemoteAudio(p.userId, event.streams[0]);
        };
        
        // Resolve glare: only one peer (the one with the "smaller" userId) creates the offer.
        const shouldMakeOffer = localUserId < p.userId;
        
        if (shouldMakeOffer || isSpectator) {
          console.log(`${LOG_PREFIX} I have the smaller ID. Creating offer for ${p.userId}.`);
          pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
              if (pc.localDescription) {
                sendSignalingMessage(p.userId, { type: 'offer', sdp: pc.localDescription.toJSON() });
              }
            })
            .catch(e => console.error(`${LOG_PREFIX} Error creating offer for ${p.userId}:`, e));
        } else {
          console.log(`${LOG_PREFIX} I have the larger ID. Waiting for offer from ${p.userId}.`);
        }

        peerConnectionsRef.current[p.userId] = pc;
      }
    });

    setPeerIds(Object.keys(peerConnectionsRef.current));
  });

  const initializeVoiceChat = useStableCallback(async (userId: string, roomId: string, isSpectator: boolean = false) => {
    if (initializedRef.current || localStreamRef.current) return;
    
    localUserIdRef.current = userId;
    roomIdRef.current = roomId;
    spectatorRef.current = isSpectator;
    setVoiceError(null);

    if (isSpectator) {
      console.log(`${LOG_PREFIX} Initializing voice chat for SPECTATOR ${userId} in room ${roomId}.`);
      initializedRef.current = true;
      setIsInitialized(true);
      setVoiceStatus('connecting');
      updatePlayers(latestPlayersRef.current);
    } else {
      console.log(`${LOG_PREFIX} Initializing voice chat for PLAYER ${userId} in room ${roomId}.`);
      try {
        setVoiceStatus('requesting');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Voice chat is not supported on this device.');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        console.log(`${LOG_PREFIX} Successfully acquired microphone stream.`);
        stream.getAudioTracks().forEach(track => track.enabled = true);
        localStreamRef.current = stream;
        initializedRef.current = true;
        setIsMuted(false);
        setIsInitialized(true);
        setVoiceStatus('connecting');
        updatePlayers(latestPlayersRef.current);
      } catch (err) {
        console.error(`${LOG_PREFIX} Could not get microphone access:`, err);
        setIsInitialized(false);
        const permissionBlocked = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        setVoiceStatus(permissionBlocked ? 'blocked' : 'failed');
        setVoiceError(permissionBlocked ? 'Microphone access is blocked. Allow it, then tap retry.' : 'The microphone could not start. Tap retry.');
      }
    }
  });
  
  useEffect(() => {
    const handleVoiceSignal = async (e: any) => {
        const { roomId: signalRoomId, senderId, signal } = e.detail;
        if (!initializedRef.current || signalRoomId !== roomIdRef.current) return;

        let pc = peerConnectionsRef.current[senderId];
        const isSpectator = !localStreamRef.current;

        // ICE messages can race ahead of the SDP offer because signaling uses
        // separate HTTP requests. Never discard them while the peer is forming.
        if (signal.type === 'candidate' && !pc) {
          (pendingCandidatesRef.current[senderId] ||= []).push(signal.candidate);
          return;
        }
        
        if (signal.type === 'offer' && !pc) {
            console.log(`${LOG_PREFIX} Received offer from new peer ${senderId}. Setting up connection.`);
            
            pc = new RTCPeerConnection({
              iceServers: getIceServers()
            });

            pc.onconnectionstatechange = () => {
              console.log(`${LOG_PREFIX} Connection state with ${senderId}: ${pc.connectionState}`);
              if (pc?.connectionState === 'connected') {
                setVoiceStatus('connected');
                setVoiceError(null);
              } else if (pc?.connectionState === 'connecting') {
                setVoiceStatus('connecting');
              } else if (pc?.connectionState === 'failed' || pc?.connectionState === 'disconnected') {
                setVoiceStatus('failed');
                setVoiceError('Players could not connect by voice. Tap retry.');
              }
            };
            
            if (isSpectator) {
              pc.addTransceiver('audio', { direction: 'recvonly' });
            } else {
              if (!localStreamRef.current) return; // Should not happen for players
              localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
            }

            pc.onicecandidate = event => event.candidate && sendSignalingMessage(senderId, { type: 'candidate', candidate: event.candidate });
            pc.ontrack = event => {
                console.log(`${LOG_PREFIX} Received remote track from ${senderId}`);
                attachRemoteAudio(senderId, event.streams[0]);
            };
            peerConnectionsRef.current[senderId] = pc;
            setPeerIds(Object.keys(peerConnectionsRef.current));
        }

        if (!pc) return;

        try {
            if (signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                for (const candidate of pendingCandidatesRef.current[senderId] || []) await pc.addIceCandidate(new RTCIceCandidate(candidate));
                delete pendingCandidatesRef.current[senderId];
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignalingMessage(senderId, { type: 'answer', sdp: pc.localDescription.toJSON() });
            } else if (signal.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                for (const candidate of pendingCandidatesRef.current[senderId] || []) await pc.addIceCandidate(new RTCIceCandidate(candidate));
                delete pendingCandidatesRef.current[senderId];
            } else if (signal.type === 'candidate') {
                if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                else (pendingCandidatesRef.current[senderId] ||= []).push(signal.candidate);
            }
        } catch (err) {
            console.error(`${LOG_PREFIX} Error handling signal from ${senderId}:`, err);
        }
    };

    window.addEventListener('voice_signal_received', handleVoiceSignal);
    return () => {
        window.removeEventListener('voice_signal_received', handleVoiceSignal);
    };
  }, [attachRemoteAudio, sendSignalingMessage]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const nextIsMuted = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextIsMuted;
      });
      setIsMuted(nextIsMuted);
    }
  }, [isMuted]);

  const toggleSpeaker = useCallback(() => {
    const nextIsSpeakerOn = !isSpeakerOn;
    setIsSpeakerOn(nextIsSpeakerOn);
    Object.values(remoteAudioRefs.current).forEach(audio => {
      if (audio) {
        audio.muted = !nextIsSpeakerOn;
      }
    });
  }, [isSpeakerOn]);

  const unlockAudio = useCallback(() => {
    setIsSpeakerOn(true);
    Object.values(remoteAudioRefs.current).forEach(audio => {
      if (!audio) return;
      audio.muted = false;
      void audio.play().then(() => setAudioNeedsUnlock(false)).catch(() => setAudioNeedsUnlock(true));
    });
  }, []);

  const retryVoiceChat = useStableCallback(() => {
    const userId = localUserIdRef.current;
    const roomId = roomIdRef.current;
    const isSpectator = spectatorRef.current;
    if (!userId || !roomId) return;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    Object.keys(peerConnectionsRef.current).forEach(closeSinglePeerConnection);
    pendingCandidatesRef.current = {};
    reconnectAttemptsRef.current = {};
    initializedRef.current = false;
    setIsInitialized(false);
    setPeerIds([]);
    void initializeVoiceChat(userId, roomId, isSpectator);
  });

  const value = {
    isMuted,
    isSpeakerOn,
    toggleMute,
    toggleSpeaker,
    initializeVoiceChat,
    updatePlayers,
    closeVoiceChat,
    speakingPlayers,
    voiceStatus,
    voiceError,
    retryVoiceChat,
    unlockAudio,
    audioNeedsUnlock,
  };

  return (
    <VoiceChatContext.Provider value={value}>
      {children}
      {peerIds.map(peerId => (
        <audio key={peerId} autoPlay playsInline ref={el => { if (el) remoteAudioRefs.current[peerId] = el; }} />
      ))}
    </VoiceChatContext.Provider>
  );
};
