import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { LudoPlayer } from '../types/game';
import { useStableCallback } from '../hooks/useStableCallback';

interface VoiceChatContextType {
  isMuted: boolean;
  isSpeakerOn: boolean;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  initializeVoiceChat: (localUserId: string, roomId: string) => void;
  updatePlayers: (players: LudoPlayer[]) => void;
  closeVoiceChat: () => void;
  speakingPlayers: Record<string, boolean>;
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

const getIceServers = (): RTCIceServer[] => {
  // Default Google STUN servers
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // Add TURN server from environment variables if configured
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl) {
    const turnServer: RTCIceServer = { urls: turnUrl };
    if (turnUsername && turnCredential) {
      turnServer.username = turnUsername;
      turnServer.credential = turnCredential;
    }
    iceServers.push(turnServer);
    console.log(`${LOG_PREFIX} TURN server configured. URL: ${turnUrl}, Has Username: ${!!turnUsername}, Has Credential: ${!!turnCredential}`);
  } else {
    console.log(`${LOG_PREFIX} VITE_TURN_URL not found. Using STUN servers only.`);
  }

  return iceServers;
};

export const VoiceChatProvider: React.FC<VoiceChatProviderProps> = ({ children }) => {
  const localStreamRef = useRef<MediaStream | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [speakingPlayers, setSpeakingPlayers] = useState<Record<string, boolean>>({});
  const [peerIds, setPeerIds] = useState<string[]>([]);

  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const remoteAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const localUserIdRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);

  const sendSignalingMessage = useStableCallback(async (targetId: string, signal: any) => {
    if (!roomIdRef.current || !localUserIdRef.current) {
      console.error(`${LOG_PREFIX} Cannot send signaling message, room or user ID is not set.`);
      return;
    }
    console.log(`${LOG_PREFIX} Sending signal to ${targetId}:`, signal.type);
    try {
      await fetch('/api/rooms/voice-signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomIdRef.current,
          senderId: localUserIdRef.current,
          targetId,
          signal
        })
      });
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
    setIsInitialized(false);
    setPeerIds([]);
  }, [closeSinglePeerConnection]);

  const updatePlayers = useStableCallback((players: LudoPlayer[]) => {
    if (!isInitialized || !localUserIdRef.current) {
      return;
    }

    const localUserId = localUserIdRef.current;
    const isSpectator = !localStreamRef.current;
    const otherPlayers = players.filter(p => p.userId !== localUserId);
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

        pc.onconnectionstatechange = () => console.log(`${LOG_PREFIX} Connection state with ${p.userId}: ${pc.connectionState}`);
        
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
          const audio = remoteAudioRefs.current[p.userId];
          if (audio) {
            audio.srcObject = event.streams[0];
            audio.muted = !isSpeakerOn;
            audio.play().catch(e => console.error(`${LOG_PREFIX} Failed to play remote audio for ${p.userId}:`, e));
          }
        };
        
        // Resolve glare: only one peer (the one with the "smaller" userId) creates the offer.
        const shouldMakeOffer = localUserId < p.userId;
        
        if (!isSpectator && shouldMakeOffer) {
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
    if (isInitialized || localStreamRef.current) return;
    
    localUserIdRef.current = userId;
    roomIdRef.current = roomId;

    if (isSpectator) {
      console.log(`${LOG_PREFIX} Initializing voice chat for SPECTATOR ${userId} in room ${roomId}.`);
      setIsInitialized(true);
    } else {
      console.log(`${LOG_PREFIX} Initializing voice chat for PLAYER ${userId} in room ${roomId}.`);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        console.log(`${LOG_PREFIX} Successfully acquired microphone stream.`);
        stream.getAudioTracks().forEach(track => track.enabled = !isMuted);
        localStreamRef.current = stream;
        setIsInitialized(true);
      } catch (err) {
        console.error(`${LOG_PREFIX} Could not get microphone access:`, err);
        setIsInitialized(false);
      }
    }
  });
  
  useEffect(() => {
    const handleVoiceSignal = async (e: any) => {
        const { roomId: signalRoomId, senderId, signal } = e.detail;
        if (!isInitialized || signalRoomId !== roomIdRef.current) return;

        let pc = peerConnectionsRef.current[senderId];
        const isSpectator = !localStreamRef.current;
        
        if (signal.type === 'offer' && !pc) {
            console.log(`${LOG_PREFIX} Received offer from new peer ${senderId}. Setting up connection.`);
            
            pc = new RTCPeerConnection({
              iceServers: getIceServers()
            });

            pc.onconnectionstatechange = () => console.log(`${LOG_PREFIX} Connection state with ${senderId}: ${pc.connectionState}`);
            
            if (isSpectator) {
              pc.addTransceiver('audio', { direction: 'recvonly' });
            } else {
              if (!localStreamRef.current) return; // Should not happen for players
              localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
            }

            pc.onicecandidate = event => event.candidate && sendSignalingMessage(senderId, { type: 'candidate', candidate: event.candidate });
            pc.ontrack = event => {
                console.log(`${LOG_PREFIX} Received remote track from ${senderId}`);
                const audio = remoteAudioRefs.current[senderId];
                if (audio) {
                    audio.srcObject = event.streams[0];
                    audio.muted = !isSpeakerOn;
                    audio.play().catch(e => console.error(`${LOG_PREFIX} Failed to play remote audio for ${senderId}:`, e));
                }
            };
            peerConnectionsRef.current[senderId] = pc;
            setPeerIds(Object.keys(peerConnectionsRef.current));
        }

        if (!pc) return;

        try {
            if (signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignalingMessage(senderId, { type: 'answer', sdp: pc.localDescription.toJSON() });
            } else if (signal.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            } else if (signal.type === 'candidate') {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        } catch (err) {
            console.error(`${LOG_PREFIX} Error handling signal from ${senderId}:`, err);
        }
    };

    window.addEventListener('voice_signal_received', handleVoiceSignal);
    return () => {
        window.removeEventListener('voice_signal_received', handleVoiceSignal);
    };
  }, [isInitialized, isSpeakerOn, sendSignalingMessage]);

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

  const value = {
    isMuted,
    isSpeakerOn,
    toggleMute,
    toggleSpeaker,
    initializeVoiceChat,
    updatePlayers,
    closeVoiceChat,
    speakingPlayers,
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

