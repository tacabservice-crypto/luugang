/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer, ViteDevServer } from 'vite';
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

import {
  UserProfile,
  WalletTransaction,
  GameRoom,
  LudoPlayer,
  LudoToken,
  PlayerColor,
  ChatMessage,
  GameLog,
  Agent,
  AgentTransaction,
  AgentRequest,
  PlayerAgentRequest,
  VipSubscription,
  Tournament,
  TournamentMatch,
} from './src/types/game.ts';

interface VipTier {
  name: string;
  price: number; // Monthly price
  durationMonths: number; // Duration of subscription in months
  rakeDiscount: number; // Percentage discount on rake, e.g., 0.02 for 2%
  features: string[];
}

const VIP_TIERS: Record<string, VipTier> = {
  gold: {
    name: 'Gold VIP',
    price: 10,
    durationMonths: 1,
    rakeDiscount: 0.02, // 2% discount on rake
    features: ['Ad-free experience', 'Exclusive avatar borders', '2% Rake Discount', 'Priority Customer Support'],
  },
  platinum: {
    name: 'Platinum VIP',
    price: 25,
    durationMonths: 3,
    rakeDiscount: 0.05, // 5% discount on rake
    features: ['All Gold features', 'Unique animated avatars', '5% Rake Discount', 'Early access to new game modes'],
  },
};

const RAKE_PERCENTAGE = 0.10; // 10% rake

const app = express();

// Enable CORS for the frontend origin
const configuredAllowedOrigins = [
  process.env.VITE_APP_URL,
  process.env.PUBLIC_URL,
  process.env.RENDER_EXTERNAL_URL,
  process.env.ALLOWED_ORIGINS,
].flatMap(value => {
  if (!value) return [];
  return value.split(',').map(v => v.trim()).filter(Boolean);
});

const allowedOrigins = Array.from(new Set([
  'https://ludosom.com',
  'https://dhili-dhili-ludo.onrender.com',
  'https://dhilidhili.onrender.com',
  'http://localhost:3000',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3002',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...configuredAllowedOrigins,
]));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

const PORT = Number(process.env.PORT) || 3002;
const DB_FILE = path.join(process.cwd(), 'db_store.json');

app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(process.cwd(), 'public')));


// ==========================================
// FIREBASE FIRESTORE PERSISTENCE SETUP
// ==========================================
let db: Firestore | null = null;
let auth: Auth | null = null;

function getFirebaseServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  const envValue =
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_ADMIN_CREDENTIALS;

  if (envValue) {
    try {
      const parsed = JSON.parse(envValue);

      if (parsed && parsed.project_id && parsed.private_key) {
        return parsed;
      }

      console.warn(
        'Firebase credentials did not contain project_id/private_key.'
      );
    } catch (error) {
      console.error('Failed to parse Firebase credentials JSON:', error);
    }
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    : path.join(process.cwd(), 'firebase-admin-key.json');

  if (!fs.existsSync(serviceAccountPath)) {
    return null;
  }

  try {
    const serviceAccountFile = fs.readFileSync(serviceAccountPath, 'utf8');
    return JSON.parse(serviceAccountFile);
  } catch (error) {
    console.error('Failed to read Firebase service account file:', error);
    return null;
  }
}

const serviceAccount = getFirebaseServiceAccount();
if (serviceAccount) {
  try {
    serviceAccount.private_key = (serviceAccount.private_key || '').replace(/\\n/g, '\n');

    try {
      getApp();
    } catch (error) {
      initializeApp({
        credential: cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
    }
    db = getFirestore();
    auth = getAuth();
    console.log('Firebase Firestore and Auth initialized successfully with Admin SDK.');
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err);
  }
} else {
  console.log('No Firebase Admin credentials configured. Set FIREBASE_SERVICE_ACCOUNT or firebase-admin-key.json for login/auth to work.');
}

// ==========================================
// 1. DATA STORE SETUP & PERSISTENCE
// ==========================================
interface PaymentProviderConfig {
  enabled: boolean;
  apiKey?: string;
  apiUrl?: string;
  accountNumber?: string;
}

type PaymentProviderKey = 'evc' | 'edahab' | 'sahal' | 'premier';

const DEFAULT_PAYMENT_PROVIDERS: Record<PaymentProviderKey, PaymentProviderConfig> = {
  evc: { enabled: false },
  edahab: { enabled: false },
  sahal: { enabled: false },
  premier: { enabled: false },
};

interface AdminRoleTemplate {
  id: string;
  name: string;
  permissions: string[];
}

interface AdminSettings {
  username: string;
  password: string;
  roles: AdminRoleTemplate[];
}

interface DBStore {
  users: Record<string, UserProfile>;
  transactions: WalletTransaction[];
  rooms: Record<string, GameRoom>;
  matchmakingQueues: Record<string, string[]>; // betAmount -> array of userIds
  houseRevenue: number;
  pendingManualTransactions: ManualTransactionRequest[];
  paymentProviders: Record<PaymentProviderKey, PaymentProviderConfig>;
  agentFloatInstructions: string;
  adminSettings: AdminSettings;
  agents: Record<string, Agent>;
  agentTransactions: AgentTransaction[];
  tournaments: Record<string, Tournament>;
}

const DEFAULT_ADMIN_ROLES: AdminRoleTemplate[] = [
  { id: 'admin', name: 'Administrator', permissions: ['all'] },
  { id: 'editor', name: 'Editor', permissions: ['manage_users', 'manage_content'] },
];

const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'password',
  roles: DEFAULT_ADMIN_ROLES,
};

let store: DBStore = {
  users: {},
  transactions: [],
  rooms: {},
  matchmakingQueues: {
    0: [],
    1: [],
    5: [],
    10: [],
    25: [],
    50: []
  },
  houseRevenue: 0,
  pendingManualTransactions: [],
  paymentProviders: { ...DEFAULT_PAYMENT_PROVIDERS },
  agentFloatInstructions: '',
  adminSettings: { ...DEFAULT_ADMIN_SETTINGS },
  agents: {},
  agentTransactions: [],
  tournaments: {}
};

// Load store from disk (local backup/fallback)
function loadStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      // Re-initialize lists to make sure they match expected shapes
      store.users = parsed.users || {};
      store.transactions = parsed.transactions || [];
      store.rooms = parsed.rooms || {};
      store.matchmakingQueues = parsed.matchmakingQueues || {
        0: [], 1: [], 5: [], 10: [], 25: [], 50: []
      };
      store.houseRevenue = parsed.houseRevenue || 0;
      store.pendingManualTransactions = parsed.pendingManualTransactions || [];
      store.paymentProviders = {
        ...DEFAULT_PAYMENT_PROVIDERS,
        ...(parsed.paymentProviders || {})
      };
      store.agentFloatInstructions = parsed.agentFloatInstructions || '';
      store.tournaments = parsed.tournaments || {};
      const persistedRoles = Array.isArray(parsed.adminSettings?.roles) ? parsed.adminSettings.roles : [];
      store.adminSettings = {
        username: parsed.adminSettings?.username || process.env.ADMIN_USERNAME || 'admin',
        password: parsed.adminSettings?.password || process.env.ADMIN_PASSWORD || 'password',
        roles: persistedRoles.length ? persistedRoles : DEFAULT_ADMIN_ROLES,
      };
      store.agents = parsed.agents || {};
      store.agentTransactions = parsed.agentTransactions || [];
      console.log('Database loaded successfully from disk.');
    } else {
      saveStoreAndWait();
    }
  } catch (error) {
    console.error('Failed to load database. Starting fresh.', error);
  }
}

// Load store from Firebase Firestore
async function loadStoreFromFirestore() {
  if (!db) {
    loadStore();
    return;
  }
  try {
    console.log('Fetching latest state from Firebase Firestore...');
    const storeRef = db.collection('ludo_store').doc('main');
    const docSnap = await storeRef.get();
    if (docSnap.exists) {
      const payload = docSnap.data();
      if (payload && payload.data) {
        const parsed = JSON.parse(payload.data);
        store.users = parsed.users || {};
        store.transactions = parsed.transactions || [];
        store.rooms = parsed.rooms || {};
        store.matchmakingQueues = parsed.matchmakingQueues || {
          0: [], 1: [], 5: [], 10: [], 25: [], 50: []
        };
        store.houseRevenue = parsed.houseRevenue || 0;
        store.pendingManualTransactions = parsed.pendingManualTransactions || [];
        store.paymentProviders = {
          ...DEFAULT_PAYMENT_PROVIDERS,
          ...(parsed.paymentProviders || {})
        };
        store.agentFloatInstructions = parsed.agentFloatInstructions || '';
        const persistedRoles = Array.isArray(parsed.adminSettings?.roles) ? parsed.adminSettings.roles : [];
        store.adminSettings = {
          username: parsed.adminSettings?.username || process.env.ADMIN_USERNAME || 'admin',
          password: parsed.adminSettings?.password || process.env.ADMIN_PASSWORD || 'password',
          roles: persistedRoles.length ? persistedRoles : DEFAULT_ADMIN_ROLES,
        };
        store.agents = parsed.agents || {};
        store.agentTransactions = parsed.agentTransactions || [];
        store.tournaments = parsed.tournaments || {};
        console.log('Database loaded successfully from Firebase Firestore.');
        // Update local file backup
        fs.writeFileSync(DB_FILE, payload.data, 'utf8');
        return;
      }
    }
    console.log('No existing state in Firestore. Loading from local store fallback...');
    loadStore();
    // Immediately seed the empty Firestore with the loaded local data
    // syncToFirestore();
  } catch (err) {
    console.error('Failed to load store from Firestore:', err);
    loadStore();
  }
}

async function syncToFirestore() {
  if (!db) return;

  try {
    const storeRef = db.collection('ludo_store').doc('main');
    const serialized = JSON.stringify(store);
    await storeRef.set({ data: serialized, updatedAt: Date.now() });
    console.log('Successfully synchronized store to Firebase Firestore.');
  } catch (err) {
    console.error('Failed to sync store to Firestore:', err);
  }
}

// Save store to disk and sync with Firestore
function saveStore() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf8');
    // syncToFirestore(); // Fire-and-forget for non-critical updates
  } catch (error) {
    console.error('Failed to write database to disk.', error);
  }
}

// Slower, awaited version for critical updates
async function saveStoreAndWait() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf8');
      await syncToFirestore();
    } catch (error) {
      console.error('Failed to write database to disk.', error);
    }
  }

loadStoreFromFirestore();

// ==========================================
// PURGE SIMULATED USERS TO KEEP ONLY REAL REGISTERED USER SESSIONS ON THE RADAR
// ==========================================
function purgeSimulatedUsers() {
  let changed = false;
  Object.keys(store.users).forEach(id => {
    if (id.startsWith('user_sim_')) {
      delete store.users[id];
      changed = true;
    }
  });
  if (changed) {
    saveStore();
  }
}
purgeSimulatedUsers();

// ==========================================
// 2. REAL-TIME EVENT STREAM (SSE)
// ==========================================
interface SSEClient {
  userId: string;
  res: any;
  spectatingRoomId?: string;
}

let activeClients: SSEClient[] = [];

// Send update to specific user
function sendEventToUser(userId: string, eventName: string, data: any) {
  const clients = activeClients.filter(c => c.userId === userId);
  clients.forEach(client => {
    try {
      client.res.write(`event: ${eventName}
data: ${JSON.stringify(data)}

`);
      if (typeof client.res.flush === 'function') {
        client.res.flush();
      }
    } catch (e) {
      console.error(`Error sending SSE event to user ${userId}. Closing connection.`, e);
      client.res.end();
    }
  });
}

// Send update to all active connected SSE clients globally
function broadcastToAll(eventName: string, data: any) {
  const payload = `event: ${eventName}
data: ${JSON.stringify(data)}

`;
  activeClients.forEach(client => {
    try {
      client.res.write(payload);
      if (typeof (client.res as any).flush === 'function') {
        (client.res as any).flush();
      }
    } catch (e) {
      console.error(`Error broadcasting SSE event. Closing connection for client ${client.userId}.`, e);
      client.res.end();
    }
  });
}

// Send update to all players AND SPECTATORS in a room
function broadcastToRoom(roomId: string, eventName: string, data: any) {
  const room = store.rooms[roomId];
  if (!room) return;

  let payload = { ...data };

  // If this is a game update, dynamically attach the list of current spectators.
  if (eventName === 'game_update' || eventName === 'timer_tick') {
    const spectatorClients = activeClients.filter(c => c.spectatingRoomId === roomId);
    const spectatorsInfo = spectatorClients
      .map(c => {
        const user = store.users[c.userId];
        // Only include if user profile exists
        if (user) {
          return {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
          };
        }
        return null;
      })
      .filter(Boolean);
    
    payload.spectators = spectatorsInfo;
  }

  // Send to players
  room.players.forEach(p => {
    sendEventToUser(p.userId, eventName, payload);
  });

  // Send to spectators
  const spectatorConnections = activeClients.filter(c => c.spectatingRoomId === roomId);
  spectatorConnections.forEach(s => {
    // Avoid sending duplicate events if a player is also marked as a spectator
    const isPlayer = room.players.some(p => p.userId === s.userId);
    if (!isPlayer) {
      sendEventToUser(s.userId, eventName, payload);
    }
  });
}

// Global user update broadcast (for dashboard balance/profile syncing)
function broadcastUserUpdate(userId: string) {
  const user = store.users[userId];
  if (user) {
    sendEventToUser(userId, 'user_update', user);
  }
}

// Remove disconnected client
function removeSSEClient(res: any) {
  const client = activeClients.find(c => c.res === res);
  activeClients = activeClients.filter(c => c.res !== res);
  if (client) {
    const stillConnected = activeClients.some(c => c.userId === client.userId);
    if (!stillConnected) {
      // User has no more active connections. Mark as offline in any active games.
      const activeRoom = Object.values(store.rooms).find(r => 
        r.status === 'playing' && r.players.some(p => p.userId === client.userId && p.status === 'online')
      );

      if (activeRoom) {
        const player = activeRoom.players.find(p => p.userId === client.userId);
        if (player) {
          player.status = 'offline';
          addLog(activeRoom, `🔌 ${player.username} has disconnected. They have time to reconnect before being forfeited.`);
          broadcastToRoom(activeRoom.id, 'game_update', activeRoom);
          saveStore();
        }
      }

      // Clean up from matchmaking queues
      let changed = false;
      for (const qKey of Object.keys(store.matchmakingQueues)) {
        const lenBefore = store.matchmakingQueues[qKey].length;
        store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter(id => id !== client.userId);
        if (store.matchmakingQueues[qKey].length !== lenBefore) changed = true;
      }
      if (changed) {
        saveStoreAndWait();
      }
      if (db) {
        db.collection('matchmaking').doc(client.userId).delete().catch(err => {
          console.error('Failed to delete matchmaking record from Firestore on disconnect:', err);
        });
      }
    }
    broadcastToAll('online_players_updated', {});
  }
}


// Clean up stale users from matchmaking queues
function cleanupMatchmakingQueues() {
  let changed = false;
  for (const qKey of Object.keys(store.matchmakingQueues)) {
    const beforeLen = store.matchmakingQueues[qKey].length;
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter(userId => {
      if (!store.users[userId]) return false;
      const inGame = Object.values(store.rooms).some(r =>
        r.status === 'playing' && r.players.some(p => p.userId === userId && p.status !== 'left')
      );
      if (inGame) return false;
      return true;
    });
    if (store.matchmakingQueues[qKey].length !== beforeLen) {
      changed = true;
    }
  }
  if (changed) {
    saveStore();
  }
}

// ==========================================
// 3. LUDO GAME PATH & RECONCILIATION HELPERS
// ==========================================
const START_OFFSETS: Record<PlayerColor, number> = {
  green: 0,
  yellow: 13,
  blue: 26,
  red: 39
};

const SAFE_GLOBAL_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];
const HOME_ENTRY_POSITIONS: Record<PlayerColor, number> = {
  green: 50,
  yellow: 11,
  blue: 24,
  red: 37
};

// Translate a player's relative position to global coordinate on common track
function getGlobalPosition(color: PlayerColor, relativePos: number): number | null {
  if (relativePos < 0 || relativePos > 50) return null; // home base or home stretch
  const offset = START_OFFSETS[color];
  return (offset + relativePos) % 52;
}

// Generate the initial tokens for a player color
function createInitialTokens(userId: string, color: PlayerColor): LudoToken[] {
  return [0, 1, 2, 3].map(i => ({
    id: `token_${color}_${i}`,
    ownerId: userId,
    color,
    position: -1 // Home Base
  }));
}

// Check if a move is possible for a token
function isMoveValid(token: LudoToken, roll: number): boolean {
  if (token.position === 56) return false; // Already finished
  if (token.position === -1) {
    return roll === 6; // Can only leave base with a 6
  }

  // In the relative coordinate system (0-50 is main track, 51-56 is home stretch),
  // any move is valid as long as it doesn't overshoot the final home square (56).
  // The logic in `moveTokenLogic` will handle the transition correctly.
  return token.position + roll <= 56;
}

// Auto-advance turn to next player
function advanceTurn(room: GameRoom) {
  const gs = room.gameState;
  const oldTurn = gs.turn;
  const numPlayers = room.players.length;

  // Reset inactivity timer for the new player's turn
  const newPlayer = room.players[gs.turn];
  if (newPlayer) newPlayer.inactivityTimer = 300; // Reset to 5 minutes (300s)
  
  // Clean dice roll states
  gs.diceRoll = null;
  gs.hasRolled = false;
  gs.turnTimer = 30;
  
  // Find next active player
  let found = false;
  let nextTurn = oldTurn;
  for (let i = 1; i <= numPlayers; i++) {
    const checkIdx = (oldTurn + i) % numPlayers;
    const p = room.players[checkIdx];
    if (p && p.status !== 'left') {
      nextTurn = checkIdx;
      found = true;
      break;
    }
  }

  if (found) {
    gs.turn = nextTurn;
    const nextPlayer = room.players[nextTurn];
    addLog(room, `It is now ${nextPlayer.username}'s turn. Please roll the dice!`);
  }
}

// Add a transaction helper
function addTransaction(userId: string, type: WalletTransaction['type'], amount: number, matchId?: string, description = '') {
  const tx: WalletTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId,
    type,
    amount,
    timestamp: Date.now(),
    matchId,
    description
  };
  store.transactions.unshift(tx);
  saveStore();
  return tx;
}

// Add a log to the room
function addLog(room: GameRoom, text: string) {
  const log: GameLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: Date.now(),
    text
  };
  room.gameState.logs.push(log);
  if (room.gameState.logs.length > 50) {
    room.gameState.logs.shift();
  }
}

// Helper to detect if player is an AI bot player
function isBotPlayer(userId: string): boolean {
  return userId.startsWith('bot_') || userId.startsWith('user_sim_');
}

// Trigger game auto-play bot actions
function executeBotTurnIfActive(room: GameRoom) {
  const activePlayer = room.players[room.gameState.turn];
  if (!activePlayer || !isBotPlayer(activePlayer.userId)) return;

  // Bot logic
  setTimeout(() => {
    // If bot has not rolled, roll the dice
    if (!room.gameState.hasRolled) {
      const d = Math.floor(Math.random() * 6) + 1;
      room.gameState.diceRoll = d;
      room.gameState.hasRolled = true;
      addLog(room, `🤖 Bot ${activePlayer.username} rolled a ${d}!`);

      // Determine valid moves for bot
      const playerTokens = room.gameState.tokens.filter(t => t.color === activePlayer.color);
      const validTokens = playerTokens.filter(t => isMoveValid(t, d));

      if (validTokens.length === 0) {
        // No moves possible, pass turn
        addLog(room, `🤖 Bot ${activePlayer.username} has no valid moves.`);
        setTimeout(() => {
          advanceTurn(room);
          broadcastToRoom(room.id, 'game_update', room);
          executeBotTurnIfActive(room);
        }, 500);
      } else {
        // Prioritize moves:
        // 1. Cut opponent
        // 2. Move out of base (if d == 6 and base has tokens)
        // 3. Move token closest to finishing
        // 4. Fallback: random valid move
        let selectedToken = validTokens[0];

        // Check if we can cut anyone
        for (const token of validTokens) {
          const nextRelative = token.position === -1 ? 0 : token.position + d;
          const globalPos = getGlobalPosition(token.color, nextRelative);
          if (globalPos !== null && !SAFE_GLOBAL_SQUARES.includes(globalPos)) {
            const hasOpponent = room.gameState.tokens.some(t => {
              if (t.color === token.color || t.position < 0 || t.position > 50) return false;
              const opGlobal = getGlobalPosition(t.color, t.position);
              return opGlobal === globalPos;
            });
            if (hasOpponent) {
              selectedToken = token;
              break;
            }
          }
        }

        // If no cut, check if we can release token from base
        if (selectedToken === validTokens[0] && d === 6) {
          const baseToken = validTokens.find(t => t.position === -1);
          if (baseToken) selectedToken = baseToken;
        }

        // Apply movement
        setTimeout(() => {
          moveTokenLogic(room, selectedToken.id, d);
          broadcastToRoom(room.id, 'game_update', room);
          executeBotTurnIfActive(room);
        }, 500);
      }
    }
  }, 400);
}

// Core token movement logic
function moveTokenLogic(room: GameRoom, tokenId: string, diceValue: number) {
  const gs = room.gameState;
  const token = gs.tokens.find(t => t.id === tokenId);
  if (!token) return;

  const activePlayer = room.players[gs.turn];
  const oldPos = token.position;
  let newPos = oldPos;

  const RELATIVE_HOME_ENTRY_SQUARE = 51; // The first square of the home stretch in relative terms (e.g., green enters at relative 51)
  const MAIN_TRACK_LENGTH = 52; // Main track has squares 0-51

  // Logic for leaving home base
  if (oldPos === -1 && diceValue === 6) {
    newPos = 0; // Relative start position is 0
    addLog(room, `${activePlayer.username} moved token out of base!`);
  }
  // Logic for tokens already on the board (0 or more)
  else if (oldPos >= 0) {
    // Case 1: Token is currently on the main track (0-50)
    if (oldPos < RELATIVE_HOME_ENTRY_SQUARE) {
      const theoreticalNewPos = oldPos + diceValue;
      // A token can only enter the home stretch if it is on the approach path.
      // This prevents a token at the start from jumping to the end with a large roll.
      // We check if the old position is within 6 squares of the home entry point.
      if (oldPos >= (RELATIVE_HOME_ENTRY_SQUARE - 6) && oldPos < RELATIVE_HOME_ENTRY_SQUARE && theoreticalNewPos >= RELATIVE_HOME_ENTRY_SQUARE) {
        // Move enters or passes into home stretch (51-56)
        newPos = theoreticalNewPos;
      } else {
        // Standard move on the main circular track.
        newPos = theoreticalNewPos;
        if (newPos >= MAIN_TRACK_LENGTH) {
            newPos = newPos % MAIN_TRACK_LENGTH;
        }
      }
    }
    // Case 2: Token is already in home stretch (51-55)
    else { // oldPos >= RELATIVE_HOME_ENTRY_SQUARE
      newPos = oldPos + diceValue;
    }
  }

  // If a token overshoots 56, it stays at its old position.
  // This prevents moving out of the home stretch once inside.
  if (newPos > 56) {
      newPos = oldPos; // Revert to old position
      addLog(room, `${activePlayer.username}'s token overshot the final home square and could not move.`);
  }
  
  // Update token position
  token.position = newPos;

  // Only log if the position actually changed
  if (oldPos !== newPos) {
      addLog(room, `${activePlayer.username} moved token by ${diceValue} spaces (from ${oldPos === -1 ? 'base' : oldPos} to ${newPos}).`);
  }

  // Check cutting mechanism
  let bonusTurn = diceValue === 6; // Rolling 6 grants bonus turn
  const finalGlobal = getGlobalPosition(token.color, token.position);

  if (finalGlobal !== null && !SAFE_GLOBAL_SQUARES.includes(finalGlobal)) {
    // Check if opponent is here
    const opponentsAtSquare = gs.tokens.filter(t => {
      if (t.color === token.color) return false; // same color
      
      // In Partnership/Team mode, allied partners do not capture each other
      if (room.gameMode === 'team') {
        const isAlly = (token.color === 'red' && t.color === 'yellow') ||
                       (token.color === 'yellow' && t.color === 'red') ||
                       (token.color === 'green' && t.color === 'blue') ||
                       (token.color === 'blue' && t.color === 'green');
        if (isAlly) return false;
      }

      if (t.position < 0 || t.position >= RELATIVE_HOME_ENTRY_SQUARE) return false; // base or stretch (only check main track 0-50)
      const otherGlobal = getGlobalPosition(t.color, t.position);
      return otherGlobal === finalGlobal;
    });

    if (opponentsAtSquare.length > 0) {
      opponentsAtSquare.forEach(opToken => {
        opToken.position = -1; // Send back to base
        const opUser = store.users[opToken.ownerId] || { username: 'Opponent' };
        addLog(room, `💥 CUT! ${activePlayer.username} cut ${opUser.username}'s token back to base!`);
      });
      bonusTurn = true; // Cutting grants bonus turn
    }
  }

  // Check if player has finished this token
  if (token.position === 56) { // Assuming 56 is the final spot.
    addLog(room, `🎉 Token finished! ${activePlayer.username} has safely brought a token home!`);
    bonusTurn = true; // Completing token grants bonus turn
  }

  // Check if active player won
  const playerTokens = gs.tokens.filter(t => t.color === token.color);
  const allFinished = playerTokens.every(t => t.position === 56);

  if (allFinished) {
    // WINNER DETECTED!
    room.status = 'completed';
    gs.winnerId = activePlayer.userId;

    if (room.tournamentDetails) {
      addLog(room, `🏆 ${activePlayer.username} has won the tournament match!`);
      handleTournamentMatchWin(room.tournamentDetails.tournamentId, room.tournamentDetails.matchId, activePlayer.userId);
      gs.escrowBalance = 0;
      return;
    }

    if (room.gameMode === 'team') {
      const isRedYellow = token.color === 'red' || token.color === 'yellow';
      const winningColors = isRedYellow ? ['red', 'yellow'] : ['green', 'blue'];
      const winningTeammates = room.players.filter(p => winningColors.includes(p.color));
      const winningNames = winningTeammates.map(p => p.username).join(' & ');
      
      addLog(room, `🏆 CHAMPIONS! Team ${winningNames} has finished all tokens and WON the game!`);

      if (room.betAmount > 0) {
        const share = gs.escrowBalance / 2;
        winningTeammates.forEach(p => {
          if (!isBotPlayer(p.userId)) {
            const user = store.users[p.userId];
            if (user) {
              user.balance += share;
              user.winCount += 1;
              addTransaction(p.userId, 'win_payout', share, room.id, `Team Win payout for match ${room.id}.`);
              broadcastUserUpdate(p.userId);
            }
          }
        });

        // Record losses for other real players
        room.players.forEach(p => {
          if (!winningColors.includes(p.color) && !isBotPlayer(p.userId)) {
            const user = store.users[p.userId];
            if (user) {
              user.lossCount += 1;
              broadcastUserUpdate(p.userId);
            }
          }
        });
      }
    } else {
      addLog(room, `🏆 CHAMPION! ${activePlayer.username} has finished all 4 tokens and WON the game!`);

      // Escrow payout
      if (room.betAmount > 0) {
        const winnerProfile = store.users[activePlayer.userId];
        if (winnerProfile) {
          let effectiveRakePercentage = RAKE_PERCENTAGE;
          if (winnerProfile.vip && winnerProfile.vip.expires > Date.now()) {
            const vipTier = VIP_TIERS[winnerProfile.vip.tier];
            if (vipTier) {
              effectiveRakePercentage = Math.max(0, RAKE_PERCENTAGE - vipTier.rakeDiscount);
            }
          }

          const rakeAmount = gs.escrowBalance * effectiveRakePercentage;
          const payoutAmount = gs.escrowBalance - rakeAmount;

          winnerProfile.balance += payoutAmount;
          winnerProfile.winCount += 1;
          addTransaction(
            activePlayer.userId,
            'win_payout',
            payoutAmount,
            room.id,
            `Payout for winning match ${room.id} with $${room.betAmount} bet (Rake: $${rakeAmount.toFixed(2)}).`
          );
          broadcastUserUpdate(activePlayer.userId);

          store.houseRevenue += rakeAmount;
          addTransaction(
            'house', // A special ID for house transactions
            'app_commission',
            rakeAmount,
            room.id,
            `Rake from match ${room.id} (${(effectiveRakePercentage * 100).toFixed(0)}%).`
          );
        }

        // Record losses for other real players
        room.players.forEach(p => {
          if (p.userId !== activePlayer.userId && !isBotPlayer(p.userId)) {
            const user = store.users[p.userId];
            if (user) {
              user.lossCount += 1;
              broadcastUserUpdate(p.userId);
            }
          }
        });
      }
    }
    gs.escrowBalance = 0;
  } else {
    // Reset roll and determine next turn
    gs.diceRoll = null;
    gs.hasRolled = false;
    
    if (bonusTurn) {
      addLog(room, `🎲 Bonus roll! ${activePlayer.username} gets to roll again.`);
      gs.turnTimer = 30;
    } else {
      advanceTurn(room);
    }
  }

  saveStore();
}

// Helper to handle inactivity forfeit
function handleInactivityForfeit(room: GameRoom, inactivePlayer: LudoPlayer) {
  if (room.status !== 'playing') return;

  addLog(room, `⏱️ ${inactivePlayer.username} has been forfeited due to inactivity.`);
  inactivePlayer.status = 'left';

  // Check if only 1 active player remains
  const activePlayers = room.players.filter(pl => pl.status !== 'left');
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    room.status = 'completed';
    room.gameState.winnerId = winner.userId;

    if (room.tournamentDetails) {
      addLog(room, `🏆 ${winner.username} has won the tournament match by forfeit!`);
      handleTournamentMatchWin(room.tournamentDetails.tournamentId, room.tournamentDetails.matchId, winner.userId);
      room.gameState.escrowBalance = 0;
    } else {
      const totalPayout = room.gameState.escrowBalance;
      addLog(room, `🏆 Game Over! ${winner.username} wins by forfeit and takes the pot of $${totalPayout.toFixed(2)}!`);

      if (room.betAmount > 0 && totalPayout > 0) {
        const winnerProfile = store.users[winner.userId];
        if (winnerProfile && !isBotPlayer(winnerProfile.id)) {
          let effectiveRakePercentage = RAKE_PERCENTAGE;
          if (winnerProfile.vip && winnerProfile.vip.expires > Date.now()) {
            const vipTier = VIP_TIERS[winnerProfile.vip.tier];
            if (vipTier) {
              effectiveRakePercentage = Math.max(0, RAKE_PERCENTAGE - vipTier.rakeDiscount);
            }
          }

          const rakeAmount = totalPayout * effectiveRakePercentage;
          const payoutAmount = totalPayout - rakeAmount;

          winnerProfile.balance += payoutAmount;
          winnerProfile.winCount += 1;
          addTransaction(winner.userId, 'win_payout', payoutAmount, room.id, `Win by opponent inactivity forfeit (Rake: $${rakeAmount.toFixed(2)}).`);
          broadcastUserUpdate(winner.userId);

          store.houseRevenue += rakeAmount;
          addTransaction(
            'house', // A special ID for house transactions
            'app_commission',
            rakeAmount,
            room.id,
            `Rake from forfeit match ${room.id} (${(effectiveRakePercentage * 100).toFixed(0)}%).`
          );
        }
      }
      room.gameState.escrowBalance = 0;
    }
  }

  saveStore();
  broadcastToRoom(room.id, 'game_update', room);
}

// Initialize continuous turn timers thread (1s interval)
setInterval(() => {
  let changed = false;
  Object.keys(store.rooms).forEach(roomId => {
    const room = store.rooms[roomId];
    if (room.status === 'playing') {
      const gs = room.gameState;
      const activePlayer = room.players[gs.turn];

      // New Inactivity Timer Logic (5 minutes)
      if (activePlayer && activePlayer.inactivityTimer && !isBotPlayer(activePlayer.userId)) {
        activePlayer.inactivityTimer -= 1;
        changed = true;

        // Send warning every minute (60 seconds)
        if (activePlayer.inactivityTimer > 0 && activePlayer.inactivityTimer % 60 === 0) {
          const minutesLeft = activePlayer.inactivityTimer / 60;
          const warningMsg = `Waqtigaagu wuu sii dhamaanayaa! Waxaa kuu harsan ${minutesLeft} daqiiqo. (Your time is running out! ${minutesLeft} minutes left.)`;
          sendEventToUser(activePlayer.userId, 'inactivity_warning', { message: warningMsg });
          addLog(room, `⏱️ Digniin: ${activePlayer.username} waxaa u harsan ${minutesLeft} daqiiqo. (Warning: ${activePlayer.username} has ${minutesLeft} minutes left.)`);
        }

        // Forfeit if 5 minutes are up
        if (activePlayer.inactivityTimer <= 0) {
          handleInactivityForfeit(room, activePlayer);
          // Skip the rest of the turn logic for this room
          return; 
        }
      }


      // Short Turn Timer Logic (30 seconds)
      if (gs.turnTimer > 0) {
        gs.turnTimer -= 1;
        changed = true;

        if (gs.turnTimer === 0) {
          // 30-second turn timer is up.
          // The 5-minute inactivity timer is already running.
          // We no longer auto-play for the user. We just let the inactivity timer handle the penalty.
          addLog(room, `⏱️ Waqtiga 30-ka ilbiriqsi wuu dhamaaday ${activePlayer.username}. Ganaaxa daahitaanka ayaa bilaabanaya.`);
          broadcastToRoom(room.id, 'game_update', room);
          // No auto-play, just wait for the 5-min timer to forfeit.
        }
      }
    }
  });

  if (changed) {
    // Notify clients about updated timers
    Object.keys(store.rooms).forEach(roomId => {
      const room = store.rooms[roomId];
      if (room.status === 'playing') {
        broadcastToRoom(roomId, 'timer_tick', { 
          turn: room.gameState.turn, 
          turnTimer: room.gameState.turnTimer,
          inactivityTimer: room.players[room.gameState.turn]?.inactivityTimer
        });
      }
    });
  }
}, 1000);

// Heartbeat interval to prevent proxy disconnects by keeping SSE stream active
setInterval(() => {
  activeClients.forEach(client => {
    try {
      client.res.write(`: heartbeat

`);
      if (typeof client.res.flush === 'function') {
        client.res.flush();
      }
    } catch (e) {
      console.error(`Error sending heartbeat. Closing connection for client ${client.userId}.`, e);
      client.res.end();
    }
  });
}, 10000);

// Matchmaking automatic bot auto-fill (PUBG style)
setInterval(() => {
  cleanupMatchmakingQueues();

  Object.keys(store.matchmakingQueues).forEach(queueKey => {
    const queueUserIds = store.matchmakingQueues[queueKey];
    if (!queueUserIds || queueUserIds.length === 0) return;

    // Get bet, cap, mode from queueKey (e.g., "1_2_solo" -> bet: 1, cap: 2, mode: "solo")
    const parts = queueKey.split('_');
    const bet = parseFloat(parts[0]) || 0;
    const cap = parseInt(parts[1]) || 2;
    const mode = (parts[2] === 'team' ? 'team' : 'solo') as 'solo' | 'team';

    // Find the first user in the queue
    const firstUserId = queueUserIds[0];
    const firstUser = store.users[firstUserId];
    if (!firstUser) return;

    const joinedAt = (firstUser as any).seekingJoinedAt || Date.now();
    const waitTimeMs = Date.now() - joinedAt;

    // If wait time exceeds 7 minutes (420000 ms), auto-fill the remaining seats with bots!
    if (waitTimeMs >= 420000) {
      console.log(`Matchmaking timeout for queue ${queueKey}. Auto-filling remaining seats with bots...`);

      // Retrieve all real players currently in this queue
      const realPlayers = queueUserIds.map(id => store.users[id]).filter(Boolean);

      // Remove these players from the queue
      store.matchmakingQueues[queueKey] = [];

      // Clean up Firestore matchmaking documents
      if (db) {
        realPlayers.forEach(p => {
          db.collection('matchmaking').doc(p.id).delete().catch(err => {
            console.error('Failed to delete matchmaking record from Firestore on auto-fill:', err);
          });
        });
      }

      // Generate bots for the remaining slots
      const matchedList = [...realPlayers];
      const botAvatars = ['🤖', '🦊', '⚡', '👑'];
      const botNames = ['Dhili Master AI', 'SomaliLudoBot', 'LudoPro AI', 'DesertFox AI', 'NomadLudo AI'];

      while (matchedList.length < cap) {
        const botIndex = matchedList.length;
        matchedList.push({
          id: `bot_match_${Date.now()}_${botIndex}`,
          username: botNames[Math.floor(Math.random() * botNames.length)] + ` #${Math.floor(10 + Math.random() * 90)}`,
          avatar: botAvatars[botIndex % botAvatars.length],
          winCount: 15 + Math.floor(Math.random() * 25),
          lossCount: 10 + Math.floor(Math.random() * 15),
          balance: 100
        });
      }

      // Create the room
      const room = startMatchedRoom(matchedList, bet, cap, mode);

      // Notify all real players
      realPlayers.forEach(p => {
        sendEventToUser(p.id, 'matchmaker_success', { roomId: room.id, room });
        broadcastToAll('matchmaker_seeking_cancelled', { senderId: p.id });
      });

      broadcastToAll('online_players_updated', {});
      saveStoreAndWait();
    }
  });
}, 2000);


// ==========================================
// 4. API ENDPOINTS
// ==========================================

const authMiddleware = async (req: any, res: any, next: () => void) => {
    const userId = req.headers['x-user-id'] as string; // Or however you pass the user ID

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: User ID is required.' });
    }

    const user = store.users[userId];
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: User not found.' });
    }

    req.user = user;
    next();
};

const verifyFirebaseToken = async (req: any, res: any, next: any) => {
  if (!auth) {
    return res.status(500).json({ error: 'Firebase Admin not configured on server.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ error: 'Unauthorized: No token provided.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(403).json({ error: 'Unauthorized: Invalid token.' });
  }
};

// Middleware to check and apply VIP status
const checkVipStatus = (req: any, res: any, next: any) => {
  req.isVip = false;
  req.vipRakeDiscount = 0; // Default no discount

  if (req.user && req.user.uid) {
    const user = Object.values(store.users).find(u => u.firebaseUid === req.user.uid);
    if (user && user.vip && user.vip.expires > Date.now()) {
      req.isVip = true;
      const vipTier = VIP_TIERS[user.vip.tier];
      if (vipTier) {
        req.vipRakeDiscount = vipTier.rakeDiscount;
      }
    }
  }
  next();
};

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Debug Firebase endpoint
app.get('/api/debug/firebase', async (req, res) => {
  if (!db) {
    return res.json({ 
      initialized: false, 
      error: 'Firebase Firestore db object is null. Check if firebase-admin-key.json exists.' 
    });
  }
  try {
    const testRef = db.collection('ludo_store').doc('debug_test');
    await testRef.set({ test: true, timestamp: Date.now() });
    const snap = await testRef.get();
    const data = snap.exists ? snap.data() : null;
    return res.json({
      initialized: true,
      writeAndReadSuccess: data?.test === true,
      data,
      projectId: getApp().options.projectId,
    });
  } catch (err: any) {
    return res.json({
      initialized: true,
      error: err.message || err.toString(),
      stack: err.stack
    });
  }
});

// SSE Connection Endpoint
app.get('/api/updates', (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  // Set response headers to support real-time streaming behind proxies
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
  
  // Write initial keepalive comment and reconnect interval
  res.write(`:ok

`);
  res.write(`retry: 3000

`);

  const client: SSEClient = { userId, res };
  activeClients.push(client);

  // Handle Reconnection: Check if this user is rejoining an active game
  const activeRoom = Object.values(store.rooms).find(r =>
    r.status === 'playing' && r.players.some(p => p.userId === userId && p.status === 'offline')
  );

  if (activeRoom) {
    const player = activeRoom.players.find(p => p.userId === userId);
    if (player) {
      player.status = 'online';
      player.inactivityTimer = 300; // Reset their full inactivity timer
      addLog(activeRoom, `🟢 ${player.username} has reconnected! Welcome back.`);
      broadcastToRoom(activeRoom.id, 'game_update', activeRoom);
      saveStore();
    }
  }

  // Send a welcome heart-beat
  res.write(`event: init
data: ${JSON.stringify({ status: 'connected' })}

`);
  
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }

  // Instantly send any active matchmaking search requests to new connected client
  setTimeout(() => {
    for (const [qKey, queueUserIds] of Object.entries(store.matchmakingQueues)) {
      for (const seekingUserId of queueUserIds) {
        if (seekingUserId !== userId && store.users[seekingUserId]) {
          const seekingUser = store.users[seekingUserId];
          const parts = qKey.split('_');
          const seekingData = {
            senderId: seekingUser.id,
            username: seekingUser.username,
            avatar: seekingUser.avatar,
            betAmount: parseFloat(parts[0]) || 0,
            capacity: parseInt(parts[1]) || 2,
            gameMode: parts[2] || 'solo',
            queueKey: qKey
          };
          res.write(`event: matchmaker_seeking
data: ${JSON.stringify(seekingData)}

`);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        }
      }
    }
  }, 500);

  req.on('close', () => {
    removeSSEClient(res);
  });
});

// Authentication / Session
app.post('/api/auth/login', verifyFirebaseToken, checkVipStatus, async (req: any, res) => {
  const { username, email, avatar, promoCode } = req.body;
  const firebaseUid = req.user.uid;

  // First, try to find an existing user by their Firebase UID.
  let foundUser = Object.values(store.users).find(u => u.firebaseUid === firebaseUid);

  if (foundUser) {
    // If user exists, just return their profile. No need for username.
    return res.json(foundUser);
  }

  // If not found by UID, maybe it's an old account we can link.
  if (email) {
    const userByEmail = Object.values(store.users).find(u => u.email === email && !u.firebaseUid);
    if (userByEmail) {
      userByEmail.firebaseUid = firebaseUid; // Link account
      await saveStoreAndWait();
      return res.json(userByEmail);
    }
  }

  // If we're here, it's a new registration. NOW we require a username.
  if (!username) {
    return res.status(400).json({ error: 'Username is required for new registration' });
  }
  const cleanUsername = username.trim().substring(0, 20);

  let linkedAgentId: string | undefined = undefined;

  // If a promo code is provided, validate it and find the agent.
  if (promoCode && typeof promoCode === 'string' && promoCode.trim() !== '') {
    if (!db) {
        return res.status(503).json({ error: 'Promo code validation is temporarily unavailable.' });
    }
    const agentsRef = db.collection('agents');
    const agentSnapshot = await agentsRef.where('promoCode', '==', promoCode.trim()).limit(1).get();

    if (agentSnapshot.empty) {
        return res.status(400).json({ error: 'Invalid or expired promo code.' });
    }

    const agent = agentSnapshot.docs[0].data() as Agent;
    linkedAgentId = agent.id;
  }

  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const newUser: UserProfile = {
    id: userId,
    firebaseUid: firebaseUid,
    username: cleanUsername,
    email: email || undefined,
    avatar: avatar || '🌸',
    balance: 10.0,
    winCount: 0,
    lossCount: 0,
    linkedAgentId: linkedAgentId, // Add the linked agent ID
  };

  store.users[userId] = newUser;
  addTransaction(userId, 'deposit', 10.0, undefined, 'Welcome signup bonus.');
  await saveStoreAndWait();

  res.json(newUser);
});

// Retrieve single profile
app.get('/api/users/:userId', (req, res, next) => {
  if (req.params.userId === 'online' || req.params.userId === 'leaderboard') {
    return next();
  }
  const user = store.users[req.params.userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// Update profile
app.post('/api/users/:userId/update', async (req, res) => {
  const user = store.users[req.params.userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { username, avatar, isOfflinePreference } = req.body;
  if (username) user.username = username.trim().substring(0, 20);
  if (avatar) user.avatar = avatar;
  if (typeof isOfflinePreference === 'boolean') user.isOfflinePreference = isOfflinePreference;

  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  res.json(user);
});

// Update online/offline status preference
app.post('/api/users/:userId/status', (req, res) => {
  const user = store.users[req.params.userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { isOffline } = req.body;
  user.isOfflinePreference = !!isOffline;

  saveStore();
  broadcastUserUpdate(user.id);
  res.json({ success: true, isOfflinePreference: user.isOfflinePreference, user });
});

// Wallet Deposits / Withdrawals
app.post('/api/wallet/deposit', (req, res) => {
  const { userId, amount } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  const depAmt = parseFloat(amount);
  if (isNaN(depAmt) || depAmt <= 0) {
    return res.status(400).json({ error: 'Invalid deposit amount' });
  }

  user.balance += depAmt;
  addTransaction(userId, 'deposit', depAmt, undefined, `Deposited funds via Simulated Net Banking.`);
  broadcastUserUpdate(userId);

  res.json({ success: true, balance: user.balance });
});

app.post('/api/wallet/withdraw', (req, res) => {
  const { userId, amount } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const withAmt = parseFloat(amount);
  if (isNaN(withAmt) || withAmt <= 0) {
    return res.status(400).json({ error: 'Invalid withdrawal amount' });
  }

  if (withAmt < 20) { // New condition for minimum withdrawal
    return res.status(400).json({ error: 'Minimum withdrawal amount is $20' });
  }

  if (user.balance < withAmt) {
    return res.status(400).json({ error: 'Insufficient funds' });
  }

  user.balance -= withAmt;
  addTransaction(userId, 'withdrawal', withAmt, undefined, `Withdrawn funds to bank account.`);
  broadcastUserUpdate(userId);

  res.json({ success: true, balance: user.balance });
});

app.post('/api/wallet/request-manual-confirmation', async (req, res) => {
  const { userId, agentId, amount, phone, senderPhone, provider, transactionType } = req.body;

  if (!userId || !agentId || !amount || !provider || !transactionType) {
    return res.status(400).json({ error: 'Missing required fields. `userId`, `agentId`, `amount`, `provider`, and `transactionType` are all required.' });
  }

  const user = store.users[userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // ==> START PROMO CODE AGENT LOCK VALIDATION
  if (user.linkedAgentId && user.linkedAgentId !== agentId) {
    return res.status(400).json({ error: 'This account is locked to a specific agent. You can only transact with your assigned agent.' });
  }
  // <== END PROMO CODE AGENT LOCK VALIDATION
  
  if (transactionType === 'withdraw' && !phone) {
    return res.status(400).json({ error: 'Phone number is required for withdrawal requests.' });
  }

  if (transactionType === 'deposit' && !senderPhone) {
    return res.status(400).json({ error: 'Sender phone number is required for deposit requests.' });
  }

  // Verify the agent exists
  if (db) {
      try {
        const agentDoc = await db.collection('agents').doc(agentId).get();
        if (!agentDoc.exists) {
            return res.status(404).json({ error: 'The selected agent does not exist.' });
        }
      } catch (err) {
        console.error("Failed to verify agent for manual transaction request:", err);
        return res.status(500).json({ error: "Could not verify the selected agent." });
      }
  }


  const newRequest: ManualTransactionRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId,
    username: user.username,
    agentId: agentId,
    amount: parseFloat(amount),
    phone, // This will be the destination for withdrawals
    senderPhone, // This is the source number for deposits
    provider,
    transactionType,
    status: 'pending',
    createdAt: Date.now(),
  };

  store.pendingManualTransactions.unshift(newRequest);
  await saveStoreAndWait();

  res.json({ success: true, message: 'Your request has been submitted for review.' });
});

app.get('/api/wallet/transactions/:userId', (req, res) => {
  const txs = store.transactions.filter(t => t.userId === req.params.userId);
  res.json(txs);
});

app.get('/api/payment/settings', (req, res) => {
  res.json(store.paymentProviders);
});

app.post('/api/wallet/process-api-payment', async (req, res) => {
  const { userId, amount, phone, senderPhone, provider, transactionType } = req.body;
  if (!userId || !amount || !provider || !transactionType) {
    return res.status(400).json({ error: 'Missing required api payment fields.' });
  }

  const providerKey = provider as PaymentProviderKey;
  const config = store.paymentProviders[providerKey];
  if (!config || !config.enabled || !config.apiKey) {
    return res.status(400).json({ error: 'API is not configured for this provider.' });
  }

  const user = store.users[userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Invalid amount.' });
  }

  if (transactionType === 'withdraw') {
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required for withdrawal requests.' });
    }
    if (user.balance < parsedAmount) {
      return res.status(400).json({ error: 'Insufficient funds.' });
    }
    user.balance -= parsedAmount;
    addTransaction(userId, 'withdrawal', parsedAmount, undefined, `API withdrawal via ${providerKey}.`);
    broadcastUserUpdate(userId);
    await saveStoreAndWait();
    return res.json({ success: true, balance: user.balance, message: 'Withdrawal processed via API.' });
  }

  if (transactionType === 'deposit') {
    if (!senderPhone) {
      return res.status(400).json({ error: 'Sender phone number is required for deposit requests.' });
    }
    user.balance += parsedAmount;
    addTransaction(userId, 'deposit', parsedAmount, undefined, `API deposit via ${providerKey}.`);
    broadcastUserUpdate(userId);
    await saveStoreAndWait();
    return res.json({ success: true, balance: user.balance, message: 'Deposit processed via API.' });
  }

  return res.status(400).json({ error: 'Unsupported transaction type.' });
});

// VIP Subscription
app.post('/api/vip/subscribe', verifyFirebaseToken, async (req: any, res) => {
  const { tier } = req.body;
  const firebaseUid = req.user.uid;

  const user = Object.values(store.users).find(u => u.firebaseUid === firebaseUid);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const vipTier = VIP_TIERS[tier];
  if (!vipTier) {
    return res.status(400).json({ error: 'Invalid VIP tier specified.' });
  }

  if (user.balance < vipTier.price) {
    return res.status(400).json({ error: 'Insufficient funds to purchase this VIP subscription.' });
  }

  // Deduct price from user's balance
  user.balance -= vipTier.price;

  // Calculate expiration date
  const startDate = Date.now();
  // Using 30 days for a month. A more accurate date calculation might use a library like moment.js or Date.UTC for precision
  const endDate = startDate + (vipTier.durationMonths * 30 * 24 * 60 * 60 * 1000); 

  // Update user's VIP status
  user.vip = {
    tier: tier,
    expires: endDate,
  };

  // Record transaction
  addTransaction(user.id, 'app_commission', vipTier.price, undefined, `VIP Subscription (${vipTier.name}) purchase.`);

  await saveStoreAndWait();
  broadcastUserUpdate(user.id);

  res.json({ success: true, user, message: `Successfully subscribed to ${vipTier.name} VIP!` });
});


// ==========================================
// TOURNAMENT SYSTEM
// ==========================================

app.get('/api/tournaments', (req, res) => {
  const availableTournaments = Object.values(store.tournaments).filter(t => t.status === 'registration_open');
  res.json(availableTournaments);
});

app.get('/api/tournaments/:id', (req, res) => {
  const { id } = req.params;
  const tournament = store.tournaments[id];
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }
  res.json(tournament);
});

app.post('/api/tournaments/:id/register', verifyFirebaseToken, async (req: any, res) => {
  const { id } = req.params;
  const firebaseUid = req.user.uid;

  const user = Object.values(store.users).find(u => u.firebaseUid === firebaseUid);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const tournament = store.tournaments[id];
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  if (tournament.status !== 'registration_open') {
    return res.status(400).json({ error: 'Tournament is not open for registration.' });
  }

  if (user.balance < tournament.entryFee) {
    return res.status(400).json({ error: 'Insufficient funds to register for this tournament.' });
  }

  if (tournament.players.length >= tournament.maxPlayers) {
    return res.status(400).json({ error: 'Tournament is already full.' });
  }

  if (tournament.players.some(p => p.userId === user.id)) {
    return res.status(400).json({ error: 'You are already registered for this tournament.' });
  }

  // Deduct entry fee
  user.balance -= tournament.entryFee;
  addTransaction(user.id, 'bet_escrow_locked', tournament.entryFee, id, `Tournament entry fee for "${tournament.name}".`);

  // Add player to tournament
  tournament.players.push({
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
  });

  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  
  // Broadcast tournament update
  broadcastToAll('tournament_update', tournament);

  res.json({ success: true, tournament, message: `Successfully registered for ${tournament.name}!` });
});

async function handleTournamentMatchWin(tournamentId: string, matchId: string, winnerId: string) {
  const tournament = store.tournaments[tournamentId];
  if (!tournament) return;

  const match = tournament.matches.find(m => m.id === matchId);
  if (!match) return;

  match.winnerId = winnerId;
  match.status = 'completed';

  const allMatchesInRoundComplete = tournament.matches
    .filter(m => m.round === tournament.currentRound)
    .every(m => m.status === 'completed');

  if (allMatchesInRoundComplete) {
    const winners = tournament.matches
      .filter(m => m.round === tournament.currentRound)
      .map(m => m.winnerId)
      .filter((id): id is string => id !== null)
      .map(id => tournament.players.find(p => p.userId === id))
      .filter((p): p is { userId: string; username: string; avatar: string; } => p !== undefined);

    if (winners.length === 1) {
      // Tournament winner!
      tournament.winnerId = winners[0].userId;
      tournament.status = 'completed';
      tournament.endDate = Date.now();

      // Distribute prize
      const winnerUser = store.users[winners[0].userId];
      if (winnerUser) {
        winnerUser.balance += tournament.prizePool;
        addTransaction(winnerUser.id, 'win_payout', tournament.prizePool, tournament.id, `Tournament "${tournament.name}" prize.`);
        broadcastUserUpdate(winnerUser.id);
      }
      broadcastToAll('tournament_ended', tournament);
    } else {
      // Generate next round
      tournament.currentRound++;
      const nextRoundMatches: TournamentMatch[] = [];
      for (let i = 0; i < winners.length; i += 2) {
        const nextMatch: TournamentMatch = {
          id: `tm_${tournament.id}_r${tournament.currentRound}_${i / 2}`,
          tournamentId: tournament.id,
          round: tournament.currentRound,
          player1: winners[i],
          player2: winners[i + 1] || null,
          winnerId: winners[i + 1] ? null : winners[i].userId,
          roomId: null,
          status: winners[i + 1] ? 'pending' : 'completed',
        };
        nextRoundMatches.push(nextMatch);
      }
      tournament.matches.push(...nextRoundMatches);

      // Create Ludo rooms for each pending match
      for (const nextMatch of nextRoundMatches) {
        if (nextMatch.status === 'pending' && nextMatch.player1 && nextMatch.player2) {
          const room = startMatchedRoom(
            [nextMatch.player1, nextMatch.player2],
            0, 2, 'solo'
          );
          nextMatch.roomId = room.id;
          nextMatch.status = 'in_progress';
          room.tournamentDetails = { tournamentId: tournament.id, matchId: nextMatch.id };
        }
      }
      broadcastToAll('tournament_update', tournament);
    }
  }

  await saveStoreAndWait();
}

function createTournamentBracket(tournament: Tournament): TournamentMatch[] {
  const players = [...tournament.players];
  // Shuffle players to randomize matchups
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }

  const matches: TournamentMatch[] = [];
  for (let i = 0; i < players.length; i += 2) {
    const match: TournamentMatch = {
      id: `tm_${tournament.id}_r1_${i / 2}`,
      tournamentId: tournament.id,
      round: 1,
      player1: players[i],
      player2: players[i + 1] || null, // Handle odd number of players (give a bye)
      winnerId: players[i + 1] ? null : players[i].userId, // If bye, player1 is winner
      roomId: null,
      status: players[i + 1] ? 'pending' : 'completed',
    };
    matches.push(match);
  }
  return matches;
}

function checkAndStartTournaments() {
  const now = Date.now();
  Object.values(store.tournaments).forEach(async (t) => {
    if (t.status === 'registration_open' && now >= t.startDate && t.players.length >= 2) {
      t.status = 'in_progress';
      t.matches = createTournamentBracket(t);
      t.currentRound = 1;

      // Create Ludo rooms for each pending match
      for (const match of t.matches) {
        if (match.status === 'pending' && match.player1 && match.player2) {
          const room = startMatchedRoom(
            [match.player1, match.player2],
            0, // No extra bet for tournament matches
            2, 'solo'
          );
          match.roomId = room.id;
          match.status = 'in_progress';
          room.tournamentDetails = { tournamentId: t.id, matchId: match.id };
        }
      }

      await saveStoreAndWait();
      broadcastToAll('tournament_started', t);
    }
  });
}

setInterval(checkAndStartTournaments, 10000); // Check every 10 seconds

// ==========================================
// 5. MATCHMAKING & LOBBY SYSTEM
// ==========================================

// GET /api/rooms/active
// Returns a list of all currently active games that can be spectated.
app.get('/api/rooms/active', (req, res) => {
  const activeGames = Object.values(store.rooms)
    .filter(r => r.status === 'playing')
    .map(r => ({
      id: r.id, // Changed from roomId to id to match GameRoom type
      players: r.players.map(p => ({
        userId: p.userId, // Added userId
        username: p.username,
        avatar: p.avatar,
      })),
      betAmount: r.betAmount,
      gameMode: r.gameMode,
      capacity: r.capacity,
    }));
  res.json(activeGames);
});

// POST /api/rooms/:roomId/spectate
// Allows a user to start spectating a game.
app.post('/api/rooms/:roomId/spectate', (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const room = store.rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  const client = activeClients.find(c => c.userId === userId);
  if (client) {
    client.spectatingRoomId = roomId;
    console.log(`User ${userId} is now spectating room ${roomId}`);
  }

  // Broadcast an update to the room so everyone gets the new spectator list
  broadcastToRoom(roomId, 'game_update', room);

  res.json({ success: true, message: 'Spectating started.' });
});

// POST /api/rooms/:roomId/stop-spectating
// Allows a user to stop spectating a game.
app.post('/api/rooms/:roomId/stop-spectating', (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const room = store.rooms[roomId];
  if (!room) {
    // It's possible the room was deleted while the user was spectating.
    // In this case, just ensure the client state is clean.
    const client = activeClients.find(c => c.userId === userId && c.spectatingRoomId === roomId);
    if (client) {
      client.spectatingRoomId = undefined;
    }
    return res.json({ success: true, message: 'Stopped spectating a room that no longer exists.' });
  }

  const client = activeClients.find(c => c.userId === userId && c.spectatingRoomId === roomId);
  if (client) {
    client.spectatingRoomId = undefined;
    console.log(`User ${userId} stopped spectating room ${roomId}`);
  }

  // Broadcast an update to the room to remove the spectator from the list
  broadcastToRoom(roomId, 'game_update', room);

  res.json({ success: true, message: 'Stopped spectating.' });
});

// Create Room (Private or Public Friends list)
app.post('/api/rooms/create', (req, res) => {
  const { userId, betAmount, capacity, gameMode } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const bet = parseFloat(betAmount);
  if (user.balance < bet) {
    return res.status(400).json({ error: 'Insufficient wallet balance for this bet amount.' });
  }

  const selectedMode = gameMode === 'team' ? 'team' : 'solo';
  const selectedCapacity = selectedMode === 'team' ? 4 : (parseInt(capacity) || 2);

  const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
  
  const newPlayer: LudoPlayer = {
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    color: (selectedCapacity === 2 && selectedMode === 'solo') ? 'green' : 'red', // Host is Green for 2-player solo, Red for others
    isHost: true,
    isReady: true,
    status: 'online',
    winCount: user.winCount,
    lossCount: user.lossCount,
    balance: user.balance
  };

  const newRoom: GameRoom = {
    id: roomId,
    status: 'waiting',
    betAmount: bet,
    players: [newPlayer],
    capacity: selectedCapacity,
    gameMode: selectedMode,
    pendingPlayers: [],
    gameState: {
      turn: 0,
      diceRoll: null,
      hasRolled: false,
      turnTimer: 30,
      tokens: [],
      winnerId: null,
      escrowBalance: 0,
      logs: [{ id: '1', timestamp: Date.now(), text: `Room created by ${user.username}. Code: ${roomId} (${selectedMode === 'team' ? 'Team 2v2' : 'Solo ' + selectedCapacity + 'P'})` }],
      chat: [],
      lastActivity: Date.now()
    },
    createdAt: Date.now()
  };

  store.rooms[roomId] = newRoom;
  saveStore();
  res.json(newRoom);
});

// Join Room via Code
app.post('/api/rooms/join', (req, res) => {
  const { userId, roomCode } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const code = (roomCode || '').trim().toUpperCase();
  const room = store.rooms[code];
  if (!room) {
    return res.status(404).json({ error: 'Room code not found.' });
  }

  // Check if player already in room or pending list - allow retrieval even if match started!
  if (room.players.some(p => p.userId === userId)) {
    return res.json(room);
  }
  if (room.pendingPlayers && room.pendingPlayers.some(p => p.userId === userId)) {
    return res.json(room);
  }

  if (room.status !== 'waiting') {
    return res.status(400).json({ error: 'Match has already started or been completed.' });
  }

  const maxPlayers = room.capacity || 2;
  if (room.players.length >= maxPlayers) {
    return res.status(400).json({ error: `Room is already full at ${maxPlayers} capacity.` });
  }

  if (user.balance < room.betAmount) {
    return res.status(400).json({ error: `You need at least $${room.betAmount} in your wallet to join this room.` });
  }

  const newPendingPlayer: LudoPlayer = {
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    color: 'green', // Assign color on host approval
    isHost: false,
    isReady: false,
    status: 'online',
    winCount: user.winCount || 0,
    lossCount: user.lossCount || 0,
    balance: user.balance || 0
  };

  if (!room.pendingPlayers) room.pendingPlayers = [];
  room.pendingPlayers.push(newPendingPlayer);
  
  addLog(room, `🔔 Challenger ${user.username} is requesting to join the match. Waiting for host approval!`);
  saveStore();

  // Notify existing room players (including host) so they see the live approval dialog
  broadcastToRoom(room.id, 'game_update', room);

  res.json(room);
});

// GET Room (for spectators or re-joining)
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = store.rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }
  res.json(room);
});

// ==========================================
// 5. PLAYER-AGENT TRANSACTION API
// ==========================================

// Get a list of all active agents for players to choose from, sorted by location
app.get('/api/agents', async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const playerLocation = req.query.location as string | undefined;

  try {
    const agentsSnapshot = await db.collection('agents').where('status', '==', 'Active').get();
    const activeAgents = agentsSnapshot.docs.map(doc => {
      const { password, ...agentData } = doc.data() as Agent;
      return agentData;
    });

    if (playerLocation) {
        const localAgents = activeAgents.filter(agent => agent.location && agent.location.toLowerCase() === playerLocation.toLowerCase());
        const otherAgents = activeAgents.filter(agent => !agent.location || agent.location.toLowerCase() !== playerLocation.toLowerCase());
        res.json([...localAgents, ...otherAgents]);
    } else {
        res.json(activeAgents);
    }
  } catch (error) {
    console.error('Failed to get active agents:', error);
    res.status(500).json({ error: 'Failed to retrieve active agents.' });
  }
});

// Player submits a deposit or withdrawal request to an agent
app.post('/api/request-to-agent', authMiddleware, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    
    const player: UserProfile = (req as any).user;
    const { agentId, amount, type, playerPhone, provider } = req.body;
    const requestAmount = parseFloat(amount);

    if (player.linkedAgentId && player.linkedAgentId !== agentId) {
      return res.status(400).json({ error: 'This account is locked to a specific agent. You can only transact with your assigned agent.' });
    }

    if (!agentId || !requestAmount || requestAmount <= 0 || !['deposit', 'withdrawal'].includes(type) || !playerPhone || !provider) {
        return res.status(400).json({ error: 'Missing or invalid parameters. Requires agentId, amount, type, playerPhone, and provider.' });
    }

    if (type === 'withdrawal' && player.balance < requestAmount) {
        return res.status(400).json({ error: 'Insufficient balance for this withdrawal request.' });
    }

    try {
        const agentDoc = await db.collection('agents').doc(agentId).get();
        if (!agentDoc.exists) {
            return res.status(404).json({ error: 'The selected agent does not exist.' });
        }
        
        const requestRef = db.collection('playerAgentRequests').doc();
        const newRequest: PlayerAgentRequest = {
            id: requestRef.id,
            playerId: player.id,
            playerUsername: player.username,
            playerAvatar: player.avatar,
            agentId: agentId,
            playerPhone: playerPhone,
            provider: provider,
            type: type,
            amount: requestAmount,
            status: 'pending',
            createdAt: Date.now(),
        };

        await requestRef.set(newRequest);

        res.status(201).json({ success: true, message: 'Your request has been sent to the agent.', request: newRequest });

    } catch (error) {
        console.error(`Player ${player.id} failed to create request to agent ${agentId}:`, error);
        res.status(500).json({ error: 'An internal server error occurred while submitting your request.' });
    }
});

// Helper to build and start a matched game room
function startMatchedRoom(matchedUsers: Array<{ id: string; username: string; avatar: string; winCount?: number; lossCount?: number; balance: number }>, bet: number, cap: number, mode: 'solo' | 'team'): GameRoom {
  const roomId = `MATCH_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  let colors: PlayerColor[];

  if (cap === 2 && mode === 'solo') {
    // For 2-player games, use Green (Host) and Blue (Challenger)
    colors = ['green', 'blue'];
  } else {
    colors = ['red', 'green', 'yellow', 'blue'];
  }
  
  const players: LudoPlayer[] = matchedUsers.map((u, index) => ({
    userId: u.id,
    username: u.username,
    avatar: u.avatar,
    color: colors[index] || 'red',
    isHost: index === 0,
    isReady: true,
    status: 'online',
    winCount: u.winCount || 0,
    lossCount: u.lossCount || 0,
    balance: u.balance || 0
  }));

  // Create escrow holding for real players
  let totalEscrow = 0;
  players.forEach(p => {
    if (!isBotPlayer(p.userId)) {
      const u = store.users[p.userId];
      if (u) {
        u.balance = Math.max(0, u.balance - bet);
        addTransaction(p.userId, 'bet_escrow_locked', bet, roomId, `Escrow stake for Ludo Match ${roomId}.`);
        broadcastUserUpdate(p.userId);
      }
    }
    totalEscrow += bet;
  });

  const tokens: LudoToken[] = [];
  players.forEach(p => {
    tokens.push(...createInitialTokens(p.userId, p.color));
  });

  const newRoom: GameRoom = {
    id: roomId,
    status: 'playing', // Starts immediately
    betAmount: bet,
    players,
    capacity: cap,
    gameMode: mode,
    gameState: {
      turn: 0,
      diceRoll: null,
      hasRolled: false,
      turnTimer: 30,
      tokens,
      winnerId: null,
      escrowBalance: totalEscrow,
      logs: [
        { id: '1', timestamp: Date.now(), text: `Match found! Mode: ${mode === 'team' ? 'Partnership 2v2' : 'Solo ' + cap + 'P'}` },
        { id: '2', timestamp: Date.now(), text: `Stake of $${bet} locked in secure escrow pool ($${totalEscrow.toFixed(2)})` }
      ],
      chat: [],
      lastActivity: Date.now()
    },
    createdAt: Date.now()
  };

  store.rooms[roomId] = newRoom;
  saveStore();

  // Notify real players instantly over SSE with redirect payload
  players.forEach(p => {
    if (!isBotPlayer(p.userId)) {
      sendEventToUser(p.userId, 'matchmaker_success', { roomId: newRoom.id, room: newRoom });
      broadcastToAll('matchmaker_seeking_cancelled', { senderId: p.userId });
    }
  });

  broadcastToAll('online_players_updated', {});

  return newRoom;
}

// Enter Matchmaking Queue (Search Live)
app.post('/api/rooms/matchmaking/enter-queue', (req, res) => {
  try {
    const { userId, betAmount, capacity, gameMode } = req.body;
    const user = store.users[userId];
    if (!user) return res.status(404).json({ error: 'User not found' });

    cleanupMatchmakingQueues();

    const bet = parseFloat(betAmount);
    if (user.balance < bet) {
      return res.status(400).json({ error: 'Insufficient balance to match stake.' });
    }

    const cap = parseInt(capacity) || 2;
    const mode = gameMode === 'team' ? 'team' : 'solo';
    const queueKey = `${bet}_${cap}_${mode}`;

    // Ensure queue exists
    if (!store.matchmakingQueues[queueKey]) {
      store.matchmakingQueues[queueKey] = [];
    }

    // Prevent duplicates
    if (store.matchmakingQueues[queueKey].includes(userId)) {
      // Re-broadcast just in case other users missed it
      broadcastToAll('matchmaker_seeking', {
        senderId: user.id,
        username: user.username,
        avatar: user.avatar,
        betAmount: bet,
        capacity: cap,
        gameMode: mode,
        queueKey
      });
      return res.json({ status: 'queued', message: 'Already in queue' });
    }

    // Add to queue
    (user as any).seekingJoinedAt = Date.now();
    store.matchmakingQueues[queueKey].push(userId);

    // Write matchmaking record to Firestore
    if (db) {
      db.collection('matchmaking').doc(userId).set({
        userId: userId,
        username: user.username,
        avatar: user.avatar,
        betAmount: bet,
        capacity: cap,
        gameMode: mode,
        status: 'WAITING_FOR_MATCH',
        timestamp: Date.now()
      }).catch(err => {
        console.error('Failed to write matchmaking record to Firestore:', err);
      });
    }

    // Broadcast seeking event to all online users on dashboard
    broadcastToAll('matchmaker_seeking', {
      senderId: user.id,
      username: user.username,
      avatar: user.avatar,
      betAmount: bet,
      capacity: cap,
      gameMode: mode,
      queueKey
    });
    broadcastToAll('online_players_updated', {});

    saveStore();
    res.json({ status: 'queued', message: 'Looking for real online opponent...' });
  } catch (error: any) {
    console.error('!!! UNHANDLED ERROR in /enter-queue:', error);
    res.status(500).json({ error: 'An unexpected server error occurred.', details: error.message });
  }
});

// Join Matchmaking Game (Challenge Player)
app.post('/api/rooms/matchmaking/join', (req, res) => {
  const { userId, betAmount, capacity, gameMode, opponentId } = req.body;
  
  if (!opponentId) {
    return res.status(400).json({ error: 'This endpoint is for direct challenges only. opponentId is required.' });
  }

  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  const oppUser = store.users[opponentId];
  if (!oppUser) return res.status(404).json({ error: 'Opponent not found' });

  cleanupMatchmakingQueues();

  const bet = parseFloat(betAmount);
  if (user.balance < bet) {
    return res.status(400).json({ error: 'Insufficient balance to match stake.' });
  }

  const cap = parseInt(capacity) || 2;
  const mode = gameMode === 'team' ? 'team' : 'solo';

  // Remove both users from all matchmaking queues
  for (const qKey of Object.keys(store.matchmakingQueues)) {
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter(id => id !== userId && id !== opponentId);
  }
  if (store.users[userId]) delete (store.users[userId] as any).seekingJoinedAt;
  if (store.users[opponentId]) delete (store.users[opponentId] as any).seekingJoinedAt;

  // Clean up Firestore matchmaking documents if they exist
  if (db) {
    db.collection('matchmaking').doc(userId).delete().catch(err => console.error('Failed to delete matchmaking record from Firestore for user:', err));
    db.collection('matchmaking').doc(opponentId).delete().catch(err => console.error('Failed to delete matchmaking record from Firestore for opponent:', err));
  }

  const matchedList = [user, oppUser];
  // For a direct 1v1 challenge, capacity is always 2 and mode is solo.
  const finalCapacity = 2;
  const finalMode = 'solo';
  const room = startMatchedRoom(matchedList, bet, finalCapacity, finalMode);
  // Notify both players instantly over SSE with redirect payload
  matchedList.forEach(p => {
    if (!isBotPlayer(p.id)) {
      sendEventToUser(p.id, 'matchmaker_success', { roomId: room.id, room });
      broadcastToAll('matchmaker_seeking_cancelled', { senderId: p.id });
    }
  });
  broadcastToAll('online_players_updated', {});
  saveStore();

  return res.json({ matched: true, roomId: room.id, room });
});

// Explicit endpoint to play against AI Bots ONLY (when user explicitly chooses)
app.post('/api/rooms/create-bot-room', (req, res) => {
  const { userId, betAmount, capacity, gameMode } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const bet = parseFloat(betAmount) || 0;
  if (user.balance < bet) {
    return res.status(400).json({ error: 'Insufficient wallet balance for this stake.' });
  }

  const cap = parseInt(capacity) || 2;
  const mode = gameMode === 'team' ? 'team' : 'solo';

  const matchedList: Array<{ id: string; username: string; avatar: string; winCount?: number; lossCount?: number; balance: number }> = [user];
  const botAvatars = ['🤖', '🦊', '⚡', '👑'];
  const botNames = ['LudoMaster AI', 'SpeedyBot', 'ProLudo AI', 'ZenBot'];

  while (matchedList.length < cap) {
    const botIndex = matchedList.length;
    matchedList.push({
      id: `bot_match_${Date.now()}_${botIndex}`,
      username: botNames[botIndex % botNames.length],
      avatar: botAvatars[botIndex % botAvatars.length],
      winCount: 10 + Math.floor(Math.random() * 20),
      lossCount: 5 + Math.floor(Math.random() * 10),
      balance: 100
    });
  }

  const room = startMatchedRoom(matchedList, bet, cap, mode);
  res.json({ success: true, roomId: room.id });
});

// Leave Matchmaking Queue
app.post('/api/rooms/matchmaking/leave', (req, res) => {
  const { userId } = req.body;
  if (userId) {
    if (store.users[userId]) {
      delete (store.users[userId] as any).seekingJoinedAt;
    }
    for (const qKey of Object.keys(store.matchmakingQueues)) {
      store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter(id => id !== userId);
    }
    saveStore();
    broadcastToAll('matchmaker_seeking_cancelled', { senderId: userId });

    // Also delete matchmaking record in Firestore if exists
    if (db) {
      db.collection('matchmaking').doc(userId).delete().catch(err => {
        console.error('Failed to delete matchmaking record from Firestore on leave:', err);
      });
    }
  }
  res.json({ success: true });
});

// WebRTC Voice Chat Signaling Route
app.post('/api/rooms/voice-signaling', (req, res) => {
  const { roomId, senderId, targetId, signal } = req.body;
  if (!roomId || !senderId || !targetId || !signal) {
    return res.status(400).json({ error: 'Missing required signaling fields' });
  }

  // Forward the signal to targetId
  sendEventToUser(targetId, 'voice_signal', {
    roomId,
    senderId,
    signal
  });

  res.json({ success: true });
});

// Get active online & registered players (real users)
app.get('/api/users/online', async (req, res) => {
  const currentUserId = req.query.userId as string;
  if (!currentUserId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  cleanupMatchmakingQueues();

  // Sync matchmaking queue from Firestore if db is available to support multi-instance
  if (db) {
    try {
      const qs = await db.collection('matchmaking').get();
      qs.forEach(docSnap => {
        const data = docSnap.data();
        if (data && data.status === 'WAITING_FOR_MATCH') {
          const qKey = `${data.betAmount}_${data.capacity}_${data.gameMode}`;
          if (!store.matchmakingQueues[qKey]) {
            store.matchmakingQueues[qKey] = [];
          }
          if (!store.matchmakingQueues[qKey].includes(data.userId)) {
            store.matchmakingQueues[qKey].push(data.userId);
            // Reconstruct user in store if not present
            if (!store.users[data.userId]) {
              store.users[data.userId] = {
                id: data.userId,
                username: data.username,
                avatar: data.avatar,
                balance: 100, // Fallback
                winCount: 0,
                lossCount: 0,
                isOfflinePreference: false
              };
            }
            (store.users[data.userId] as any).seekingJoinedAt = data.timestamp || Date.now();
          }
        }
      });
    } catch (e) {
      console.error('Failed to sync matchmaking from Firestore:', e);
    }
  }

  // Real connected clients via SSE
  const activeIds = new Set(activeClients.map(c => c.userId));

  const onlineList: any[] = [];

  // Return all registered users searching or online
  Object.values(store.users).forEach(u => {
    if (u.id.startsWith('user_sim_')) return; // Skip simulated players
    const isConnected = activeIds.has(u.id);
    const inGame = Object.values(store.rooms).some(r =>
      r.status === 'playing' && r.players.some(p => p.userId === u.id && p.status !== 'left')
    );

    let status = 'offline';
    let seekingDetails: any = null;

    // Check if user is currently searching in matchmaking queue
    for (const [qKey, queueUserIds] of Object.entries(store.matchmakingQueues)) {
      if (queueUserIds.includes(u.id)) {
        const parts = qKey.split('_');
        seekingDetails = {
          betAmount: parseFloat(parts[0]) || 0,
          capacity: parseInt(parts[1]) || 2,
          gameMode: parts[2] || 'solo'
        };
        status = 'seeking';
        break;
      }
    }

    // ONLY include users who are actively searching in matchmaking queues right now
    if (status === 'seeking') {
      onlineList.push({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        winCount: u.winCount || 0,
        lossCount: u.lossCount || 0,
        balance: u.balance,
        isSimulated: false,
        status,
        seekingDetails,
        seekingJoinedAt: (u as any).seekingJoinedAt || Date.now()
      });
    }
  });

  // Sort seeking players by seekingJoinedAt descending (most recent first)
  onlineList.sort((a, b) => {
    if (a.status === 'seeking' && b.status === 'seeking') {
      return (b.seekingJoinedAt || 0) - (a.seekingJoinedAt || 0);
    }
    if (a.status === 'seeking') return -1;
    if (b.status === 'seeking') return 1;
    return 0;
  });

  res.json(onlineList);
});

// Challenge / Invite a player (PUBG-style)
app.post('/api/rooms/challenge/invite', (req, res) => {
  const { senderId, receiverId, betAmount, capacity, gameMode } = req.body;
  const sender = store.users[senderId];
  if (!sender) return res.status(404).json({ error: 'Sender user not found.' });

  const bet = parseFloat(betAmount) || 0;
  if (sender.balance < bet) {
    return res.status(400).json({ error: `Insufficient wallet balance for $${bet} bet.` });
  }

  const selectedMode = gameMode === 'team' ? 'team' : 'solo';
  const selectedCapacity = selectedMode === 'team' ? 4 : (parseInt(capacity) || 2);

  // If receiver is a featured/simulated player, start match directly
  if (receiverId.startsWith('sim_') || receiverId.startsWith('bot_')) {
    const receiverUser = {
      id: receiverId,
      username: receiverId.includes('1') ? 'Kaptan_Ludo 👑' : receiverId.includes('2') ? 'SomaliGamer_252' : receiverId.includes('3') ? 'Pro_Dice_Master' : 'Speedy_Runner',
      avatar: receiverId.includes('1') ? '🦁' : receiverId.includes('2') ? '⚡' : receiverId.includes('3') ? '🦊' : '🐉',
      winCount: 20,
      lossCount: 8,
      balance: 100
    };
    const matchedList = [sender, receiverUser];
    const botAvatars = ['🤖', '🦊', '⚡', '👑'];
    const botNames = ['LudoMaster AI', 'SpeedyBot', 'ProLudo AI', 'ZenBot'];
    while (matchedList.length < selectedCapacity) {
      const idx = matchedList.length;
      matchedList.push({
        id: `bot_match_${Date.now()}_${idx}`,
        username: botNames[idx % botNames.length],
        avatar: botAvatars[idx % botAvatars.length],
        winCount: 10 + Math.floor(Math.random() * 20),
        lossCount: 5 + Math.floor(Math.random() * 10),
        balance: 100
      });
    }

    const room = startMatchedRoom(matchedList, bet, selectedCapacity, selectedMode);
    return res.json({ success: true, roomId: room.id, room });
  }

  // Check if receiver is currently in any matchmaking queue (i.e. seen on radar)
  const receiverUser = store.users[receiverId];
  let isReceiverSeeking = false;
  if (receiverUser) {
    for (const qKey of Object.keys(store.matchmakingQueues)) {
      if (store.matchmakingQueues[qKey].includes(receiverId)) {
        isReceiverSeeking = true;
        break;
      }
    }
  }

  /*
  if (isReceiverSeeking) {
    // Both are ready, create match instantly!
    const matchedList = [sender, receiverUser];
    // If capacity > 2, add bots to fill the room
    const botAvatars = ['🤖', '🦊', '⚡', '👑'];
    const botNames = ['LudoMaster AI', 'SpeedyBot', 'ProLudo AI', 'ZenBot'];
    while (matchedList.length < selectedCapacity) {
      const idx = matchedList.length;
      matchedList.push({
        id: `bot_match_${Date.now()}_${idx}`,
        username: botNames[idx % botNames.length],
        avatar: botAvatars[idx % botAvatars.length],
        winCount: 10 + Math.floor(Math.random() * 20),
        lossCount: 5 + Math.floor(Math.random() * 10),
        balance: 100
      });
    }

    const room = startMatchedRoom(matchedList, bet, selectedCapacity, selectedMode);
    
    // Notify receiver directly that they are matched!
    sendEventToUser(receiverId, 'matchmaker_success', { roomId: room.id, room });
    broadcastToAll('matchmaker_seeking_cancelled', { senderId: receiverId });
    
    return res.json({ success: true, roomId: room.id, room });
  }
  */

  const roomId = `INV_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const hostPlayer: LudoPlayer = {
    userId: sender.id,
    username: sender.username,
    avatar: sender.avatar,
    color: 'red',
    isHost: true,
    isReady: true,
    status: 'online',
    winCount: sender.winCount,
    lossCount: sender.lossCount,
    balance: sender.balance
  };

  const newRoom: GameRoom = {
    id: roomId,
    status: 'waiting',
    betAmount: bet,
    players: [hostPlayer],
    capacity: selectedCapacity,
    gameMode: selectedMode,
    pendingPlayers: [],
    gameState: {
      turn: 0,
      diceRoll: null,
      hasRolled: false,
      turnTimer: 30,
      tokens: [],
      winnerId: null,
      escrowBalance: 0,
      logs: [{ id: '1', timestamp: Date.now(), text: `Challenge lobby created by ${sender.username}. Bet: $${bet}` }],
      chat: [],
      lastActivity: Date.now()
    },
    createdAt: Date.now()
  };

  store.rooms[roomId] = newRoom;

  // Remove both players from any matchmaking queues they might be in.
  for (const qKey of Object.keys(store.matchmakingQueues)) {
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter(id => id !== senderId && id !== receiverId);
  }
  if (db) {
    db.collection('matchmaking').doc(senderId).delete().catch(err => console.error('Failed to delete sender from matchmaking on challenge:', err));
    db.collection('matchmaking').doc(receiverId).delete().catch(err => console.error('Failed to delete receiver from matchmaking on challenge:', err));
  }
  broadcastToAll('matchmaker_seeking_cancelled', { senderId });
  broadcastToAll('matchmaker_seeking_cancelled', { senderId: receiverId });

  saveStore();

  // Notify real user over SSE
  sendEventToUser(receiverId, 'game_invite', {
    senderId: sender.id,
    senderName: sender.username,
    senderAvatar: sender.avatar,
    betAmount: bet,
    capacity: selectedCapacity,
    gameMode: selectedMode,
    roomId
  });

  res.json({ success: true, roomId });
});

// Accept a real game challenge
app.post('/api/rooms/challenge/accept', (req, res) => {
  const { userId, roomId } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Challenge lobby no longer exists.' });

  if (room.players.length >= (room.capacity || 2)) {
    return res.status(400).json({ error: 'Room is already full.' });
  }

  if (user.balance < room.betAmount) {
    return res.status(400).json({ error: `Insufficient wallet balance to accept this $${room.betAmount} match.` });
  }

  const colors: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
  const occupiedColors = room.players.map(p => p.color);
  const assignedColor = colors.find(c => !occupiedColors.includes(c)) || 'green';

  const newPlayer: LudoPlayer = {
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    color: assignedColor,
    isHost: false,
    isReady: true,
    status: 'online',
    winCount: user.winCount,
    lossCount: user.lossCount,
    balance: user.balance
  };

  room.players.push(newPlayer);
  addLog(room, `⚔️ ${user.username} accepted the challenge and joined the room.`);
  saveStore();

  const hostId = room.players.find(p => p.isHost)?.userId;
  if (hostId) {
    sendEventToUser(hostId, 'game_invite_accepted', { roomId });
  }

  res.json({ success: true, roomId });
});

// Decline a real game challenge
app.post('/api/rooms/challenge/decline', (req, res) => {
  const { userId, roomId } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const room = store.rooms[roomId];
  if (room) {
    const hostId = room.players.find(p => p.isHost)?.userId;
    if (hostId) {
      sendEventToUser(hostId, 'game_invite_declined', { receiverName: user.username });
    }
    delete store.rooms[roomId];
    saveStore();
  }

  res.json({ success: true });
});

// Dynamic Leaderboard (Global Earnings Board) from active store data
app.get('/api/users/leaderboard', (req, res) => {
  const allUsers = Object.values(store.users).filter(u => !u.id.startsWith('user_sim_') && !u.id.startsWith('bot_'));

  allUsers.forEach(u => {
    const userTransactions = store.transactions.filter(t => t.userId === u.id);
    const totalWins = userTransactions.filter(t => t.type === 'win_payout').reduce((sum, t) => sum + t.amount, 0);
    const totalCommission = userTransactions.filter(t => t.type === 'app_commission').reduce((sum, t) => sum + t.amount, 0);
    u.earnings = totalWins - totalCommission;
  });

  // Sort users by winCount descending
  const sorted = [...allUsers]
    .sort((a, b) => {
      const aEarnings = a.earnings || 0;
      const bEarnings = b.earnings || 0;
      return bEarnings - aEarnings;
    })
    .slice(0, 5);

  let rank = 1;
  const result = sorted.map(u => {
    return {
      rank: rank++,
      name: u.username,
      avatar: u.avatar || '🎮',
      wins: u.winCount || 0,
      earnings: u.earnings || 0
    };
  });

  res.json(result);
});

// Ready Up / Toggle Ready
app.post('/api/rooms/ready', (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const p = room.players.find(p => p.userId === userId);
  if (!p) return res.status(404).json({ error: 'Player not in room' });

  p.isReady = !p.isReady;
  addLog(room, `${p.username} is ${p.isReady ? 'READY' : 'NOT READY'}.`);
  saveStore();

  broadcastToRoom(room.id, 'game_update', room);
  res.json(room);
});

// Add Bot to Private Room (To start match immediately)
app.post('/api/rooms/add-bot', (req, res) => {
  const { roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.players.length >= 4) {
    return res.status(400).json({ error: 'Room is already full.' });
  }

  const botNames = ['DeepBlue', 'AlphaGo', 'ChessMaster', 'LudoAI', 'LudoKing', 'Siri', 'Alexa'];
  const name = botNames[Math.floor(Math.random() * botNames.length)] + `_${Math.floor(Math.random() * 100)}`;
  const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  const colors: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
  const occupiedColors = room.players.map(p => p.color);
  const color = colors.find(c => !occupiedColors.includes(c)) || 'green';

  const botPlayer: LudoPlayer = {
    userId: botId,
    username: `🤖 ${name}`,
    avatar: '🤖',
    color,
    isHost: false,
    isReady: true,
    status: 'online'
  };

  room.players.push(botPlayer);
  addLog(room, `Bot ${botPlayer.username} joined the match.`);
  saveStore();

  broadcastToRoom(room.id, 'game_update', room);
  res.json(room);
});

// Start Match (Host only)
app.post('/api/rooms/start', (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const p = room.players.find(p => p.userId === userId);
  if (!p || !p.isHost) {
    return res.status(403).json({ error: 'Only the host can start the match.' });
  }

  if (room.players.length < 2) {
    return res.status(400).json({ error: 'Ugu yaraan 2 ciyaartoy ayaa loo baahan yahay si ciyaartu u bilaabato.' });
  }

  // Adjust capacity to joined players if host starts with present players
  room.capacity = room.players.length;

  // Ensure all players are ready and assigned distinct colors
  let colorsToAssign: PlayerColor[];
  if (room.players.length === 2 && room.gameMode === 'solo') {
    // Assuming the intent for 2 players is host=red, guest=yellow (diagonal)
    colorsToAssign = ['red', 'yellow']; 

    const host = room.players.find(p => p.isHost);
    const guest = room.players.find(p => !p.isHost);

    if (host) host.color = 'red';
    if (guest) guest.color = 'yellow';

  } else {
    // If there are more than 2 players, use the full color set
    colorsToAssign = ['red', 'green', 'yellow', 'blue'];
    room.players.forEach((pl, idx) => {
      pl.color = colorsToAssign[idx] || 'red'; // Assign initial colors for >2 players
    });
  }

  room.players.forEach((pl, idx) => {
    pl.isReady = true;
    // Ensure pl.color is only assigned once based on the determined colorsToAssign,
    // or if already assigned (for 2-player case), just keep it.
    // This assumes the `pl.color` set in the if block (for host/guest) should take precedence.
    if (!pl.color) { // Only assign if not already assigned
      pl.color = colorsToAssign[idx] || 'red';
    }
  });

  // Deduct stakes and lock escrow
  const bet = room.betAmount;
  let success = true;

  room.players.forEach(pl => {
    if (!isBotPlayer(pl.userId)) {
      const user = store.users[pl.userId];
      if (!user || user.balance < bet) {
        success = false;
      }
    }
  });

  if (!success) {
    return res.status(400).json({ error: 'Nus ama mid ka mid ah ciyaartoyda kuma filna baaqiga wallet-kiisa bet-kan.' });
  }

  // Execute deductions
  let totalEscrow = 0;
  room.players.forEach(pl => {
    if (!isBotPlayer(pl.userId)) {
      const user = store.users[pl.userId]!;
      user.balance -= bet;
      addTransaction(pl.userId, 'bet_escrow_locked', bet, room.id, `Escrow lock for Match ${room.id}`);
      broadcastUserUpdate(pl.userId);
    }
    totalEscrow += bet;
  });

  // Setup tokens
  const tokens: LudoToken[] = [];
  room.players.forEach(pl => {
    tokens.push(...createInitialTokens(pl.userId, pl.color));
  });

  room.status = 'playing';
  room.gameState.tokens = tokens;
  room.gameState.escrowBalance = totalEscrow;
  room.gameState.turn = 0;
  room.gameState.turnTimer = 30;
  addLog(room, `⚔️ Ciyaartu waa ay bilaabatay! Ciyaartoyda: ${room.players.length}. Bet: $${bet}. Escrow Locked: $${totalEscrow}`);

  saveStore();
  broadcastToRoom(room.id, 'game_update', room);

  res.json(room);
});

// Dice Roll Action
app.post('/api/rooms/roll-dice', (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status !== 'playing') return res.status(400).json({ error: 'Game is not in playing state.' });

  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];

  // Reset inactivity timer since player made a move
  if (activePlayer) activePlayer.inactivityTimer = 300;

  gs.turnTimer = 30; // Reset the short turn timer

  if (!activePlayer || activePlayer.userId !== userId) {
    return res.status(403).json({ error: "It is not your turn to roll!" });
  }

  if (gs.hasRolled) {
    return res.status(400).json({ error: "You have already rolled the dice!" });
  }

  // Generate Roll
  const d = Math.floor(Math.random() * 6) + 1;
  gs.diceRoll = d;
  gs.lastDiceRoll = d;
  gs.hasRolled = true;

  addLog(room, `🎲 ${activePlayer.username} rolled a ${d}!`);

  // Triple 6s Check
  if (d === 6) {
    gs.consecutiveSixes = (gs.consecutiveSixes || 0) + 1;
  } else {
    gs.consecutiveSixes = 0;
  }

  if (gs.consecutiveSixes === 3) {
    addLog(room, `⚠️ Triple 6 Penalty! ${activePlayer.username} rolled three 6s in a row. Turn forfeited!`);
    gs.consecutiveSixes = 0;
    // The turn is forfeited, so we advance to the next player.
    // We also nullify the roll to prevent the UI from thinking a move is pending.
    gs.diceRoll = null;
    gs.hasRolled = false;
    
    // Advance turn synchronously
    advanceTurn(room);
    saveStore();
    broadcastToRoom(room.id, 'game_update', room);
    executeBotTurnIfActive(room);

    return res.json(room);
  }

  // Analyze if there are valid moves
  const playerTokens = gs.tokens.filter(t => t.color === activePlayer.color);
  const validTokens = playerTokens.filter(t => isMoveValid(t, d));

  if (validTokens.length === 0) {
    // No moves possible, turn ends automatically.
    // FIRST, broadcast the result of the roll so all clients can see the animation.
    addLog(room, `${activePlayer.username} has no valid moves with roll ${d}. Turn passes.`);
    saveStore();
    broadcastToRoom(room.id, 'game_update', room);
    res.json(room); // Respond to the roller immediately.

    // SECOND, after a delay to allow for the animation, advance the turn and broadcast again.
    setTimeout(() => {
      // Re-fetch the room to ensure we're acting on the latest state
      const currentRoom = store.rooms[roomId];
      if (currentRoom && currentRoom.status === 'playing') {
        advanceTurn(currentRoom);
        saveStore();
        broadcastToRoom(currentRoom.id, 'game_update', currentRoom);
        executeBotTurnIfActive(currentRoom);
      }
    }, 1500); // 1.5-second delay for clients to see the roll animation

  } else {
    // There are valid moves, so we just update the state and wait for the player's move.
    saveStore();
    broadcastToRoom(room.id, 'game_update', room);
    res.json(room);
  }
});
// Token Move Action
app.post('/api/rooms/move-token', (req, res) => {
  const { userId, roomId, tokenId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status !== 'playing') return res.status(400).json({ error: 'Game is not playing.' });

  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];

  // Reset inactivity timer since player made a move
  if (activePlayer) activePlayer.inactivityTimer = 300;

  gs.turnTimer = 30; // Reset the short turn timer

  if (!activePlayer || activePlayer.userId !== userId) {
    return res.status(403).json({ error: "It is not your turn!" });
  }

  if (!gs.hasRolled || gs.diceRoll === null) {
    return res.status(400).json({ error: "You must roll the dice first!" });
  }

  const token = gs.tokens.find(t => t.id === tokenId);
  if (!token || token.color !== activePlayer.color) {
    return res.status(400).json({ error: "Invalid token selected." });
  }

  if (!isMoveValid(token, gs.diceRoll)) {
    return res.status(400).json({ error: "This token cannot make a valid move with the current roll." });
  }

  // Execute Move
  moveTokenLogic(room, tokenId, gs.diceRoll);
  broadcastToRoom(room.id, 'game_update', room);
  
  // Trigger bot turn if needed
  executeBotTurnIfActive(room);

  res.json(room);
});

// Send Chat Message
app.post('/api/rooms/chat', (req, res) => {
  const { userId, roomId, text } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const player = room.players.find(pl => pl.userId === userId);
  const spectator = activeClients.find(c => c.userId === userId && c.spectatingRoomId === roomId);

  if (!player && !spectator) {
    return res.status(403).json({ error: 'You are not in this room as a player or spectator.' });
  }

  const cleanText = (text || '').trim().substring(0, 100);
  if (cleanText.length > 0) {
    const senderName = player ? player.username : (store.users[userId]?.username || 'Spectator');
    
    const chatMsg: ChatMessage = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      senderId: userId,
      senderName: senderName,
      text: cleanText,
      timestamp: Date.now(),
      isSpectator: !player, // Mark as spectator message if not a player
    };
    room.gameState.chat.push(chatMsg);
    if (room.gameState.chat.length > 30) {
      room.gameState.chat.shift();
    }
    saveStore();
    broadcastToRoom(room.id, 'game_update', room);
  }

  res.json(room);
});

// Accept Pending Player (Host only)
app.post('/api/rooms/accept-player', (req, res) => {
  const { userId, roomId, challengerId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  
  // Verify user is host
  const host = room.players.find(p => p.userId === userId);
  if (!host || !host.isHost) {
    return res.status(403).json({ error: 'Only the host can accept players.' });
  }

  if (!room.pendingPlayers) room.pendingPlayers = [];
  const idx = room.pendingPlayers.findIndex(p => p.userId === challengerId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Challenger not found in pending list.' });
  }

  const challenger = room.pendingPlayers.splice(idx, 1)[0];
  
  // Assign color
  const colors: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
  const occupiedColors = room.players.map(p => p.color);
  const color = colors.find(c => !occupiedColors.includes(c)) || 'green';
  let assignedColor: PlayerColor;
  if (room.capacity === 2 && room.gameMode === 'solo') {
    // For 2-player solo games, if host is 'red', the joiner (challenger) should be 'yellow'.
    assignedColor = 'yellow'; // Align with red/yellow diagonal for 2-player solo
  } else {
    // For other modes/capacities, assign the first available color.
    const colors: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
    const occupiedColors = room.players.map(p => p.color);
    // Find the first color not yet occupied, default to 'red' if somehow no color is found
    assignedColor = colors.find(c => !occupiedColors.includes(c)) || 'red';
  }
  challenger.color = assignedColor;
  challenger.isReady = false; // They must toggle ready

  room.players.push(challenger);
  addLog(room, `✅ Host accepted ${challenger.username} into the room.`);
  
  saveStore();
  broadcastToRoom(room.id, 'game_update', room);
  // Send direct update to challenger too
  sendEventToUser(challengerId, 'game_update', room);

  res.json(room);
});

// Decline Pending Player (Host only)
app.post('/api/rooms/decline-player', (req, res) => {
  const { userId, roomId, challengerId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  
  // Verify user is host
  const host = room.players.find(p => p.userId === userId);
  if (!host || !host.isHost) {
    return res.status(403).json({ error: 'Only the host can decline players.' });
  }

  if (!room.pendingPlayers) room.pendingPlayers = [];
  const idx = room.pendingPlayers.findIndex(p => p.userId === challengerId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Challenger not found in pending list.' });
  }

  const challenger = room.pendingPlayers.splice(idx, 1)[0];
  addLog(room, `❌ Host declined ${challenger.username}'s request.`);
  
  // Create a special room object for the rejected player
  const rejectionRoomState = {
    ...room,
    rejectionReason: 'Your request to join the room was declined by the host.',
    // Ensure the pending list sent to the rejected user is also empty of them
    pendingPlayers: room.pendingPlayers.filter(p => p.userId !== challengerId) 
  };
  // Notify the declined player with a game_update containing the reason
  sendEventToUser(challengerId, 'game_update', rejectionRoomState);

  saveStore();
  // Notify the rest of the room
  broadcastToRoom(room.id, 'game_update', room);

  res.json(room);
});

// Nudge Slow Player
app.post('/api/rooms/nudge', (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const p = room.players.find(pl => pl.userId === userId);
  if (!p) return res.status(403).json({ error: 'You are not in this room.' });

  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];
  if (!activePlayer) return res.status(400).json({ error: 'No active player to nudge.' });

  addLog(room, `⏰ ${p.username} nudged ${activePlayer.username} to make a move!`);
  
  // Send nudge event to the active player's screen
  sendEventToUser(activePlayer.userId, 'player_nudged', { nudgedBy: p.username });
  
  // Broadcast game update with updated logs
  broadcastToRoom(room.id, 'game_update', room);

  res.json(room);
});

// Interactive Emoji Broadcast
app.post('/api/rooms/emoji', (req, res) => {
  const { userId, roomId, emoji } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const p = room.players.find(pl => pl.userId === userId);
  if (!p) return res.status(403).json({ error: 'You are not in this room.' });

  // Broadcast emoji event to all players in the room
  room.players.forEach(pl => {
    sendEventToUser(pl.userId, 'player_emoji', {
      senderId: userId,
      senderName: p.username,
      senderColor: p.color,
      emoji
    });
  });

  res.json({ success: true });
});

// Leave / Forfeit Game Room
app.post('/api/rooms/leave', (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const p = room.players.find(pl => pl.userId === userId);
  if (!p) return res.status(404).json({ error: 'Player not in room' });

  addLog(room, `${p.username} has left the game.`);

  if (room.status === 'waiting') {
    room.players = room.players.filter(pl => pl.userId !== userId);
    if (room.players.length === 0) {
      delete store.rooms[roomId];
    } else {
      // Re-assign host if host left
      if (p.isHost) {
        room.players[0].isHost = true;
        room.players[0].isReady = true;
        addLog(room, `${room.players[0].username} is now the host.`);
      }
      broadcastToRoom(room.id, 'game_update', room);
    }
  } else if (room.status === 'playing') {
    // Mark the player as 'left'
    p.status = 'left';

    // Find the opponent
    const opponent = room.players.find(pl => pl.userId !== userId && pl.status !== 'left');

    if (opponent) {
      // End the game immediately. The opponent wins by forfeit.
      room.status = 'completed';
      room.gameState.winnerId = opponent.userId;
      const leavingPlayerProfile = store.users[userId];
      if (leavingPlayerProfile) {
        leavingPlayerProfile.lossCount = (leavingPlayerProfile.lossCount || 0) + 1;
        addLog(room, `😭 ${p.username} waa lagu helay ciyaarta!`); // Explicit log for the losing player
        broadcastUserUpdate(userId);
      }

      const totalPayout = room.gameState.escrowBalance;
      addLog(room, `🏆 ${p.username} has left the game. ${opponent.username} wins by forfeit and takes the pot of $${totalPayout.toFixed(2)}!`);

      // Pay the total escrow pool to the winner
      if (room.betAmount > 0 && totalPayout > 0) {
        const winnerProfile = store.users[opponent.userId];
        if (winnerProfile && !isBotPlayer(winnerProfile.id)) {
          winnerProfile.balance += totalPayout;
          winnerProfile.winCount = (winnerProfile.winCount || 0) + 1;
          addTransaction(opponent.userId, 'win_payout', totalPayout, room.id, `Win by opponent forfeit.`);
          broadcastUserUpdate(opponent.userId);
        }
      }
      room.gameState.escrowBalance = 0;

      // Broadcast the final game state to everyone in the room
      broadcastToRoom(room.id, 'game_update', room);
      res.json({ success: true, room }); // Respond with the final room state

    } else {
      // This case handles if somehow the last player leaves, or a player leaves a game with only bots.
      // We can just mark the game as completed.
      room.status = 'completed';
      // No winner is declared if no one is left.
      broadcastToRoom(room.id, 'game_update', room);
      res.json({ success: true, room }); // Also respond with room state here
    }
  }

  saveStore();
});

// Spectate a game room
app.post('/api/rooms/:roomId/spectate', (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  const room = store.rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.status !== 'playing') {
    return res.status(400).json({ error: 'This game is not available for spectating.' });
  }

  const client = activeClients.find(c => c.userId === userId);
  if (client) {
    client.spectatingRoomId = roomId;
    // Immediately send the current game state to the new spectator
    sendEventToUser(userId, 'game_update', room);
    res.json({ success: true, message: `You are now spectating room ${roomId}` });
  } else {
    res.status(404).json({ error: 'Could not find an active connection for your user.' });
  }
});

// Stop spectating a game room
app.post('/api/rooms/:roomId/stop-spectating', (req, res) => {
  const { userId } = req.body;
  const client = activeClients.find(c => c.userId === userId);
  if (client) {
    client.spectatingRoomId = undefined;
    res.json({ success: true, message: 'Stopped spectating.' });
  } else {
    res.status(404).json({ error: 'Could not find an active connection for your user.' });
  }
});

// Check if a game is active and the user can rejoin
app.get('/api/rooms/check-status/:roomId', (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const room = store.rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (room.status !== 'playing') {
    // Return a 409 Conflict status to indicate the game is not in a rejoinable state.
    return res.status(409).json({ error: 'Game is not in a rejoinable state (e.g., waiting or completed).', room });
  }

  const playerInRoom = room.players.find(p => p.userId === userId && p.status !== 'left');
  if (!playerInRoom) {
    return res.status(403).json({ error: 'You are not a player in this game' });
  }

  // Player is in the room and game is active. Return room data.
  res.json(room);
});


// ==========================================
// 6. ADMIN API ENDPOINTS
// ==========================================

// Define the new AdminUser structure
interface AdminUser {
    id: string;
    username: string;
    password: string; // In a real app, this MUST be hashed.
    permissions: string[]; // e.g., ['manage_users', 'view_stats', 'all']
}

// New Login endpoint for admin
app.post('/api/admin/login', async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password } = req.body;

    try {
        const adminUsersRef = db.collection('adminUsers');
        
        // Check if the admin collection is empty to bootstrap the first admin
        const allAdminsSnapshot = await adminUsersRef.limit(1).get();
        if (allAdminsSnapshot.empty) {
            console.log('No admin users found. Creating first admin user from login credentials.');
            const newAdminId = `admin_${Date.now()}`;
            const newAdmin: AdminUser = {
                id: newAdminId,
                username,
                password, // Password should be hashed in a real application
                permissions: ['all'],
            };
            await adminUsersRef.doc(newAdminId).set(newAdmin);
            console.log(`Created new admin: ${username}`);
            
            // Log the user in immediately after creation
            const { password: _, ...userToReturn } = newAdmin;
            return res.json({ success: true, user: userToReturn });
        }

        const snapshot = await adminUsersRef.where('username', '==', username).get();

        if (snapshot.empty) {
            return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
        }

        const adminUserDoc = snapshot.docs[0];
        const adminUser = adminUserDoc.data() as AdminUser;

        // IMPORTANT: Passwords should be hashed. This is a plain text comparison for now.
        if (adminUser.password === password) {
            // Return the user object without the password
            const { password: _, ...userToReturn } = adminUser;
            res.json({ success: true, user: userToReturn });
        } else {
            res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
        }
    } catch (error) {
        console.error('Admin login failed:', error);
        res.status(500).json({ error: 'An error occurred during admin login.' });
    }
});

// New middleware factory to check for specific permissions
const hasPermission = (requiredPermission: string) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (!db) return res.status(500).json({ error: 'Database not initialized' });

        const adminId = req.query.userId as string;
        if (!adminId) {
            return res.status(403).json({ error: 'Access denied. Admin user ID is required.' });
        }

        try {
            const adminUserRef = db.collection('adminUsers').doc(adminId);
            const adminUserDoc = await adminUserRef.get();

            if (!adminUserDoc.exists) {
                return res.status(403).json({ error: 'Access denied. Invalid admin user.' });
            }

            const adminUser = adminUserDoc.data() as AdminUser;
            // The 'all' permission grants access to everything
            if (adminUser.permissions.includes('all') || adminUser.permissions.includes(requiredPermission)) {
                next(); // User has permission, proceed
            } else {
                res.status(403).json({ error: 'Access denied. You do not have permission for this action.' });
            }
        } catch (error) {
            console.error('Permission check failed:', error);
            res.status(500).json({ error: 'An error occurred during permission check.' });
        }
    };
};

// Endpoint to create a new admin user. Only accessible by a root admin with 'all' permission.
app.post('/api/admin/admins/create', hasPermission('all'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password, permissions } = req.body;

    if (!username || !password || !Array.isArray(permissions)) {
        return res.status(400).json({ error: 'Username, password, and a list of permissions are required.' });
    }

    try {
        const adminUsersRef = db.collection('adminUsers');
        const existingAdmin = await adminUsersRef.where('username', '==', username).get();
        if (!existingAdmin.empty) {
            return res.status(409).json({ error: 'An admin with this username already exists.' });
        }
        
        const newAdminId = `admin_${Date.now()}`;
        const newAdmin: AdminUser = {
            id: newAdminId,
            username,
            password, // Again, should be hashed!
            permissions,
        };

        await adminUsersRef.doc(newAdminId).set(newAdmin);
        
        const { password: _, ...userToReturn } = newAdmin;
        res.status(201).json({ success: true, user: userToReturn });

    } catch (error) {
        console.error('Failed to create admin user:', error);
        res.status(500).json({ error: 'Failed to create admin user.' });
    }
});


// A temporary replacement for the old isAdmin to bridge the transition.
// It verifies that the request comes from a valid admin user in the new system,
// but doesn't check for specific granular permissions.
// This will be replaced with hasPermission('permission_name') calls on each endpoint.
const isAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });

    const adminId = req.query.userId as string;
    if (!adminId) {
        return res.status(403).json({ error: 'Access denied. Admin user ID is required.' });
    }

    try {
        const doc = await db.collection('adminUsers').doc(adminId).get();
        if (doc.exists) {
            next(); // It's a valid admin, let them pass for now.
        } else {
            res.status(403).json({ error: 'Access denied. Invalid admin user.' });
        }
    } catch (error) {
        console.error('Admin validation failed:', error);
        res.status(500).json({ error: 'An error occurred during admin validation.' });
    }
};

app.get('/api/admin/settings', isAdmin, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    
    try {
        const adminUsersSnapshot = await db.collection('adminUsers').get();
        const roles = adminUsersSnapshot.docs.map(doc => {
            const { password, ...roleData } = doc.data();
            return roleData;
        });

        res.json({
            username: store.adminSettings?.username || process.env.ADMIN_USERNAME || 'admin',
            passwordConfigured: Boolean(store.adminSettings?.password),
            roles: roles,
        });
    } catch (error) {
        console.error('Failed to retrieve admin roles:', error);
        res.status(500).json({ error: 'Failed to retrieve admin roles.' });
    }
});

app.post('/api/admin/settings', isAdmin, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });

    const { currentPassword, newPassword, confirmPassword } = req.body;
    const adminId = req.query.userId as string;

    if (!adminId) {
        return res.status(400).json({ error: 'Admin ID is required.' });
    }

    // Only allow changing password for now, not username
    if (typeof newPassword !== 'string' || !newPassword.trim()) {
        return res.status(400).json({ error: 'New password is required.' });
    }
    
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'New password and confirmation must match.' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    
    try {
        const adminRef = db.collection('adminUsers').doc(adminId);
        const adminDoc = await adminRef.get();

        if (!adminDoc.exists) {
            return res.status(404).json({ error: 'Admin user not found.' });
        }

        const adminUser = adminDoc.data() as AdminUser;

        // IMPORTANT: Passwords are in plain text as per existing system.
        if (adminUser.password !== currentPassword) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
        }

        // Update the password in Firestore
        await adminRef.update({
            password: newPassword
        });

        res.json({ success: true, message: 'Password updated successfully.' });

    } catch (error) {
        console.error(`Failed to update password for admin ${adminId}:`, error);
        res.status(500).json({ error: 'An error occurred while updating the password.' });
    }
});

app.post('/api/admin/roles/create', hasPermission('all'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password, permissions, name } = req.body;

    if (!username || !password || !Array.isArray(permissions) || !name) {
        return res.status(400).json({ error: 'Role Name, username, password, and a list of permissions are required.' });
    }

    try {
        const adminUsersRef = db.collection('adminUsers');
        const existingAdmin = await adminUsersRef.where('username', '==', username).get();
        if (!existingAdmin.empty) {
            return res.status(409).json({ error: 'An admin with this username already exists.' });
        }
        
        const newAdminId = `admin_${Date.now()}`;
        const newAdmin: AdminUser = {
            id: newAdminId,
            username,
            password, // In a real app, this MUST be hashed.
            permissions,
            name, // Adding the role name field
        };

        await adminUsersRef.doc(newAdminId).set(newAdmin);
        
        const { password: _, ...userToReturn } = newAdmin;
        res.status(201).json({ success: true, user: userToReturn });

    } catch (error) {
        console.error('Failed to create admin user:', error);
        res.status(500).json({ error: 'Failed to create admin user.' });
    }
});

// Update an admin user/role
app.post('/api/admin/roles/:roleId/update', hasPermission('all'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { roleId } = req.params;
    const updatedData = req.body;

    if (!roleId) {
        return res.status(400).json({ error: 'Role ID is required.' });
    }

    try {
        const adminRef = db.collection('adminUsers').doc(roleId);
        const doc = await adminRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Admin role not found.' });
        }

        // Do not allow updating the password to an empty string.
        if (updatedData.password === '') {
            delete updatedData.password;
        }

        await adminRef.update(updatedData);

        const updatedDoc = await adminRef.get();
        const { password, ...returnData } = updatedDoc.data() as AdminUser;

        res.json({ success: true, role: returnData });

    } catch (error) {
        console.error('Failed to update admin role:', error);
        res.status(500).json({ error: 'Failed to update admin role.' });
    }
});

interface AdminRole extends AdminUser {
    name: string;
    status: 'active' | 'suspended';
}

// Delete an admin user/role
app.delete('/api/admin/roles/:roleId/delete', hasPermission('all'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { roleId } = req.params;
    if (!roleId) {
        return res.status(400).json({ error: 'Admin user ID is required.' });
    }

    try {
        const adminRef = db.collection('adminUsers').doc(roleId);
        const doc = await adminRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({ error: 'Admin user not found.' });
        }
        
        const adminData = doc.data() as AdminUser;
        if (adminData.permissions.includes('all')) {
            const allAdminsSnapshot = await db.collection('adminUsers').where('permissions', 'array-contains', 'all').get();
            if (allAdminsSnapshot.size <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last super administrator.' });
            }
        }
        
        await adminRef.delete();
        res.json({ success: true, message: 'Admin user deleted successfully.' });

    } catch (error) {
        console.error('Failed to delete admin user:', error);
        res.status(500).json({ error: 'Failed to delete admin user.' });
    }
});

// Get all runtime stats
app.get('/api/admin/stats', isAdmin, (req, res) => {
    res.json({
        totalUsers: Object.keys(store.users).length,
        totalRooms: Object.keys(store.rooms).length,
        activeRooms: Object.values(store.rooms).filter(r => r.status === 'playing').length,
        waitingRooms: Object.values(store.rooms).filter(r => r.status === 'waiting').length,
        houseRevenue: store.houseRevenue || 0,
        onlineClients: activeClients.length,
    });
});

// Get all users
app.get('/api/admin/users', isAdmin, (req, res) => {
    res.json(Object.values(store.users));
});

// Get all rooms
app.get('/api/admin/rooms', isAdmin, (req, res) => {
    res.json(Object.values(store.rooms));
});

// Get all transactions
app.get('/api/admin/transactions', isAdmin, (req, res) => {
    res.json(store.transactions);
});

// Get all pending manual transactions
app.get('/api/admin/manual-transactions', isAdmin, (req, res) => {
    res.json(store.pendingManualTransactions || []);
});

app.get('/api/admin/payment-settings', isAdmin, (req, res) => {
    res.json(store.paymentProviders);
});

app.post('/api/admin/payment-settings', isAdmin, async (req, res) => {
    const { paymentProviders, agentFloatInstructions } = req.body;

    if (paymentProviders && typeof paymentProviders === 'object') {
        store.paymentProviders = {
            ...DEFAULT_PAYMENT_PROVIDERS,
            ...paymentProviders
        };
    }

    if (typeof agentFloatInstructions === 'string') {
        store.agentFloatInstructions = agentFloatInstructions;
    }

    await saveStoreAndWait();
    res.json({ 
        success: true, 
        paymentProviders: store.paymentProviders,
        agentFloatInstructions: store.agentFloatInstructions
    });
});

// Approve a manual transaction
app.post('/api/admin/manual-transactions/:transactionId/approve', isAdmin, async (req, res) => {
    const { transactionId } = req.params;
    const tx = store.pendingManualTransactions.find(t => t.id === transactionId);

    if (!tx || tx.status !== 'pending') {
        return res.status(404).json({ error: 'Pending transaction not found or already processed.' });
    }

    const user = store.users[tx.userId];
    if (!user) {
        return res.status(404).json({ error: 'User associated with transaction not found.' });
    }

    if (tx.transactionType === 'deposit') {
        user.balance += tx.amount;
        addTransaction(user.id, 'deposit', tx.amount, undefined, `Manual deposit approved by admin. Request ID: ${tx.id}`);
    } else { // withdrawal
        if (user.balance < tx.amount) {
            // Not enough balance, reject it instead
            tx.status = 'rejected';
            await saveStoreAndWait();
            // No balance change needed since funds were never held
            return res.status(400).json({ error: 'Insufficient balance to approve this withdrawal request. Transaction has been rejected.' });
        }
        user.balance -= tx.amount;
        addTransaction(user.id, 'withdrawal', tx.amount, undefined, `Manual withdrawal approved by admin. Request ID: ${tx.id}`);
    }

    tx.status = 'approved';
    await saveStoreAndWait();

    broadcastUserUpdate(user.id);
    res.json({ success: true, transaction: tx });
});

// Reject a manual transaction
app.post('/api/admin/manual-transactions/:transactionId/reject', isAdmin, async (req, res) => {
    const { transactionId } = req.params;
    const tx = store.pendingManualTransactions.find(t => t.id === transactionId);

    if (!tx || tx.status !== 'pending') {
        return res.status(404).json({ error: 'Pending transaction not found or already processed.' });
    }

    const user = store.users[tx.userId];
    if (!user) {
        // Even if user not found, we can still mark transaction as rejected
        tx.status = 'rejected';
        await saveStoreAndWait();
        return res.status(404).json({ error: 'User associated with transaction not found. Transaction rejected.' });
    }
    
    // On rejection, no balance change should occur. Funds are only moved on approval.
    // The previous logic incorrectly "refunded" money that was never taken.
    tx.status = 'rejected';
    await saveStoreAndWait();
    
    // Notify the user their request was rejected, but their balance is unchanged.
    sendEventToUser(user.id, 'user_notification', {
        type: 'info',
        message: `Your ${tx.transactionType} request for $${tx.amount} was rejected.`
    });
    
    res.json({ success: true, transaction: tx });
});


// Impersonate a user
app.post('/api/admin/impersonate', isAdmin, (req, res) => {
    const { userId } = req.body;
    const user = store.users[userId];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    // For this simple app, we'll just return the user object.
    // In a real app with JWT, you would generate a new token for the user.
    res.json({ success: true, user });
});

// Update a user's details (e.g., balance, role)
app.post('/api/admin/users/:userId/update', isAdmin, async (req, res) => {
    const { userId } = req.params;
    const userToUpdate = store.users[userId];

    if (!userToUpdate) {
        return res.status(404).json({ error: 'User not found.' });
    }
    
    const { username, avatar, balance, winCount, lossCount, role, password } = req.body;

    if (typeof username === 'string' && username.trim()) {
        userToUpdate.username = username.trim();
    }
    if (typeof avatar === 'string' && avatar.trim()) {
        userToUpdate.avatar = avatar.trim();
    }
    if (typeof balance === 'number') {
        userToUpdate.balance = balance;
    }
    if (typeof winCount === 'number') {
        userToUpdate.winCount = winCount;
    }
    if (typeof lossCount === 'number') {
        userToUpdate.lossCount = lossCount;
    }
    if (typeof role === 'string' && role.trim()) {
        userToUpdate.role = role.trim();
    }
    // Only update password if a non-empty string is provided
    if (typeof password === 'string' && password.trim()) {
        // In a real app, hash this password before saving!
        userToUpdate.password = password;
    }

    await saveStoreAndWait();
    
    broadcastUserUpdate(userId);
    res.json(userToUpdate);
});

// ==================================
// AGENT-RELATED ADMIN ENDPOINTS
// ==================================

// Get all agents
app.get('/api/admin/agents', isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const agentsSnapshot = await db.collection('agents').get();
    const agents = agentsSnapshot.docs.map(doc => doc.data());
    res.json(agents);
  } catch (error) {
    console.error('Failed to get agents:', error);
    res.status(500).json({ error: 'Failed to retrieve agents from database.' });
  }
});

// Create a new agent
app.post('/api/admin/agents/create', isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { username, password, commissionRate, location, phone, promoCode } = req.body;

  if (!username || !password || !commissionRate || !phone) {
    return res.status(400).json({ error: 'Username, password, commission rate, and phone are required.' });
  }

  // More validation
  if (typeof username !== 'string' || username.length < 3) {
    return res.status(400).json({ error: 'Username must be a string of at least 3 characters.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be a string of at least 6 characters.' });
  }
  const rate = parseFloat(commissionRate);
  if (isNaN(rate) || rate < 0 || rate > 1) {
    return res.status(400).json({ error: 'Commission rate must be a number between 0 and 1.' });
  }

  try {
    const agentsRef = db.collection('agents');
    
    // Check if username already exists in Firestore
    const existingAgentSnapshot = await agentsRef.where('username', '==', username).get();
    if (!existingAgentSnapshot.empty) {
      return res.status(409).json({ error: 'Agent with this username already exists.' });
    }

    // Check for promo code uniqueness
    if (promoCode && typeof promoCode === 'string' && promoCode.trim() !== '') {
        const promoCodeQuery = await agentsRef.where('promoCode', '==', promoCode.trim()).get();
        if (!promoCodeQuery.empty) {
            return res.status(400).json({ error: 'Promo code is already in use.' });
        }
    }

    const agentId = `agent_${Date.now()}`;
    const newAgent: Agent = {
      id: agentId,
      username,
      password, // In a real app, this should be hashed and salted
      phone,
      location: location || '',
      commissionRate: rate,
      promoCode: (promoCode && typeof promoCode === 'string') ? promoCode.trim() : '',
      balance: 0,
      floatBalance: 0,
      status: 'Active',
      createdAt: Date.now(),
    };

    await agentsRef.doc(agentId).set(newAgent);

    res.status(201).json(newAgent);
  } catch (error) {
    console.error('Failed to create agent:', error);
    res.status(500).json({ error: 'Failed to create agent in database.' });
  }
});

// Update an agent's details
app.post('/api/admin/agents/:agentId/update', isAdmin, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { agentId } = req.params;
    const { username, password, commissionRate, status, location, phone, promoCode } = req.body;

    try {
        const agentRef = db.collection('agents').doc(agentId);
        const agentDoc = await agentRef.get();

        if (!agentDoc.exists) {
            return res.status(404).json({ error: 'Agent not found.' });
        }

        const agentData = agentDoc.data() as Agent;

        // Check for promo code uniqueness if it's being changed
        if (promoCode && typeof promoCode === 'string' && promoCode.trim() !== '' && promoCode.trim() !== agentData.promoCode) {
            const agentsRef = db.collection('agents');
            const promoCodeQuery = await agentsRef.where('promoCode', '==', promoCode.trim()).get();
            if (!promoCodeQuery.empty) {
                // Ensure the found agent is not the same one we are editing
                const isSameAgent = promoCodeQuery.docs.some(doc => doc.id === agentId);
                if (!isSameAgent) {
                   return res.status(400).json({ error: 'Promo code is already in use by another agent.' });
                }
            }
        }

        const updateData: Partial<Agent> = {};

        if (username && typeof username === 'string' && username.length >= 3) {
            updateData.username = username;
        }
        if (password && typeof password === 'string' && password.length >= 6) {
            updateData.password = password; // Should be hashed
        }
        if (phone && typeof phone === 'string') {
            updateData.phone = phone;
        }

        const newCommissionRate = parseFloat(commissionRate);
        if (commissionRate !== undefined && !isNaN(newCommissionRate) && newCommissionRate >= 0 && newCommissionRate <= 1) {
            updateData.commissionRate = newCommissionRate;
        }

        if (status && ['Active', 'Suspended'].includes(status)) {
            updateData.status = status;
        }

        if (location !== undefined) {
            updateData.location = location;
        }

        if (promoCode !== undefined) {
            updateData.promoCode = promoCode.trim();
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update.' });
        }

        await agentRef.update(updateData);

        const updatedAgentDoc = await agentRef.get();
        res.json({ success: true, agent: updatedAgentDoc.data() });
    } catch (error) {
        console.error(`Failed to update agent ${agentId}:`, error);
        res.status(500).json({ error: 'Failed to update agent in database.' });
    }
});

// Credit an agent's float balance
app.post('/api/admin/agents/:agentId/credit', isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { agentId } = req.params;
  const { amount, discount } = req.body;
  const creditAmount = parseFloat(amount);
  const discountAmount = parseFloat(discount) || 0;

  if (!agentId || !creditAmount || creditAmount <= 0) {
    return res.status(400).json({ error: 'Valid agentId and a positive amount are required.' });
  }

  try {
    const agentRef = db.collection('agents').doc(agentId);
    const transactionRef = db.collection('agentTransactions').doc(); // Auto-generate ID

    const transactionData: AgentTransaction = {
      id: transactionRef.id,
      agentId: agentId,
      type: 'FloatPurchase',
      amount: creditAmount,
      discountAmount: discountAmount,
      timestamp: Date.now(),
      description: `Admin credited ${creditAmount} to float with a ${discountAmount} discount.`
    };

    await db.runTransaction(async (t) => {
      const agentDoc = await t.get(agentRef);
      if (!agentDoc.exists) {
        throw new Error('Agent not found.'); // This will be caught and sent as 500, can be refined
      }
      const currentFloat = agentDoc.data()?.floatBalance || 0;
      const newFloatBalance = currentFloat + creditAmount;

      t.update(agentRef, { floatBalance: newFloatBalance });
      t.set(transactionRef, transactionData);
    });
    
    const updatedAgent = await agentRef.get();

    res.json({ success: true, agent: updatedAgent.data(), transaction: transactionData });
  } catch (error) {
    console.error(`Failed to credit agent ${agentId}:`, error);
    // Basic error handling, could check for specific error types
    if ((error as Error).message === 'Agent not found.') {
        return res.status(404).json({ error: 'Agent not found.' });
    }
    res.status(500).json({ error: 'Failed to credit agent float in database.' });
  }
});


// Get all agent requests for admin view
app.get('/api/admin/agent-requests', isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  try {
    const requestsSnapshot = await db.collection('agentRequests').orderBy('createdAt', 'desc').get();
    const requests = requestsSnapshot.docs.map(doc => doc.data());
    res.json(requests);
  } catch (error) {
    console.error('Failed to get agent requests:', error);
    res.status(500).json({ error: 'Failed to retrieve agent requests.' });
  }
});

// Approve an agent float request
app.post('/api/admin/agent-requests/:requestId/approve', isAdmin, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { requestId } = req.params;
    const adminId = req.query.userId as string;

    try {
        const requestRef = db.collection('agentRequests').doc(requestId);
        
        await db.runTransaction(async (t) => {
            const requestDoc = await t.get(requestRef);
            if (!requestDoc.exists) {
                throw new Error('Request not found.');
            }
            const request = requestDoc.data() as AgentRequest;
            if (request.status !== 'pending') {
                throw new Error('This request has already been processed.');
            }

            const agentRef = db.collection('agents').doc(request.agentId);
            const agentDoc = await t.get(agentRef);
            if (!agentDoc.exists) {
                throw new Error('Agent associated with the request not found.');
            }
            const currentFloat = agentDoc.data()?.floatBalance || 0;
            const newFloatBalance = currentFloat + request.amount;

            const adminUserDoc = await db.collection('adminUsers').doc(adminId).get();
            const resolverUsername = adminUserDoc.exists ? adminUserDoc.data()?.username : 'Unknown Admin';

            // Update agent's balance
            t.update(agentRef, { floatBalance: newFloatBalance });

            // Update the request status
            t.update(requestRef, { 
                status: 'approved',
                resolvedAt: Date.now(),
                resolvedBy: adminId,
                resolverUsername: resolverUsername,
            });

            // Create a float purchase transaction for the agent
            const transactionRef = db.collection('agentTransactions').doc();
            const transactionData: AgentTransaction = {
                id: transactionRef.id,
                agentId: request.agentId,
                type: 'FloatPurchase',
                amount: request.amount,
                timestamp: Date.now(),
                description: `Float request for ${request.amount} approved by admin. Request ID: ${request.id}`
            };
            t.set(transactionRef, transactionData);
        });

        res.json({ success: true, message: 'Agent float request approved.' });

    } catch (error) {
        console.error(`Failed to approve agent request ${requestId}:`, error);
        const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred.';
        res.status(500).json({ error: errorMessage });
    }
});

// Reject an agent float request
app.post('/api/admin/agent-requests/:requestId/reject', isAdmin, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { requestId } = req.params;
    const adminId = req.query.userId as string;

    try {
        const requestRef = db.collection('agentRequests').doc(requestId);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists) {
            return res.status(404).json({ error: 'Request not found.' });
        }
        const request = requestDoc.data() as AgentRequest;
        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'This request has already been processed.' });
        }

        const adminUserDoc = await db.collection('adminUsers').doc(adminId).get();
        const resolverUsername = adminUserDoc.exists ? adminUserDoc.data()?.username : 'Unknown Admin';

        await requestRef.update({
            status: 'rejected',
            resolvedAt: Date.now(),
            resolvedBy: adminId,
            resolverUsername: resolverUsername,
        });
        
        res.json({ success: true, message: 'Agent float request rejected.' });

    } catch (error) {
        console.error(`Failed to reject agent request ${requestId}:`, error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});




// Delete a user
app.delete('/api/admin/users/:userId/delete', isAdmin, (req, res) => {
    const { userId } = req.params;
    if (store.users[userId]) {
        delete store.users[userId];
        saveStoreAndWait();
        res.json({ success: true, message: `User ${userId} has been deleted.` });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// Create a new agent
app.post('/api/admin/agents', isAdmin, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password, commissionRate, location } = req.body;

    if (!username || !password || !commissionRate) {
        return res.status(400).json({ error: 'Username, password, and commission rate are required.' });
    }

    try {
        const agentRef = db.collection('agents').doc();
        const newAgent: Agent = {
            id: agentRef.id,
            username,
            password, // In a real app, this should be securely hashed.
            commissionRate: parseFloat(commissionRate),
            location: location || '',
            balance: 0,
            floatBalance: 0,
            status: 'Active',
            createdAt: Date.now(),
        };
        await agentRef.set(newAgent);
        res.status(201).json({ success: true, agent: newAgent });
    } catch (error) {
        console.error('Failed to create agent:', error);
        res.status(500).json({ error: 'Failed to create agent.' });
    }
});

// Update an existing agent
app.put('/api/admin/agents/:agentId', isAdmin, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { agentId } = req.params;
    const { commissionRate, status, location } = req.body;

    try {
        const agentRef = db.collection('agents').doc(agentId);
        const agentDoc = await agentRef.get();
        if (!agentDoc.exists) {
            return res.status(404).json({ error: 'Agent not found.' });
        }

        const updates: Partial<Agent> = {};
        if (commissionRate) updates.commissionRate = parseFloat(commissionRate);
        if (status) updates.status = status;
        if (location !== undefined) updates.location = location;

        await agentRef.update(updates);
        res.json({ success: true, message: 'Agent updated.' });
    } catch (error) {
        console.error(`Failed to update agent ${agentId}:`, error);
        res.status(500).json({ error: 'Failed to update agent.' });
    }
});

// Create a new agent
app.post('/api/admin/agents', isAdmin, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password, commissionRate, location } = req.body;

    if (!username || !password || !commissionRate) {
        return res.status(400).json({ error: 'Username, password, and commission rate are required.' });
    }

    try {
        const agentRef = db.collection('agents').doc();
        const newAgent: Agent = {
            id: agentRef.id,
            username,
            password, // In a real app, this should be securely hashed.
            commissionRate: parseFloat(commissionRate),
            location: location || '',
            balance: 0,
            floatBalance: 0,
            status: 'Active',
            createdAt: Date.now(),
        };
        await agentRef.set(newAgent);
        res.status(201).json({ success: true, agent: newAgent });
    } catch (error) {
        console.error('Failed to create agent:', error);
        res.status(500).json({ error: 'Failed to create agent.' });
    }
});

// Update an existing agent
app.put('/api/admin/agents/:agentId', isAdmin, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { agentId } = req.params;
    const { commissionRate, status, location } = req.body;

    try {
        const agentRef = db.collection('agents').doc(agentId);
        const agentDoc = await agentRef.get();
        if (!agentDoc.exists) {
            return res.status(404).json({ error: 'Agent not found.' });
        }

        const updates: Partial<Agent> = {};
        if (commissionRate) updates.commissionRate = parseFloat(commissionRate);
        if (status) updates.status = status;
        if (location !== undefined) updates.location = location;

        await agentRef.update(updates);
        res.json({ success: true, message: 'Agent updated.' });
    } catch (error) {
        console.error(`Failed to update agent ${agentId}:`, error);
        res.status(500).json({ error: 'Failed to update agent.' });
    }
});


// Cancel a game
app.post('/api/admin/rooms/:roomId/cancel', isAdmin, (req, res) => {
    const { roomId } = req.params;
    const room = store.rooms[roomId];
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    // Refund players
    if (room.betAmount > 0) {
        room.players.forEach(p => {
            if (!isBotPlayer(p.userId)) {
                const user = store.users[p.userId];
                if (user) {
                    user.balance += room.betAmount;
                    addTransaction(p.userId, 'refund', room.betAmount, room.id, `Refund for canceled match ${room.id}.`);
                    broadcastUserUpdate(p.userId);
                }
            }
        });
    }

    addLog(room, `Game canceled by admin. Bets refunded.`);
    broadcastToRoom(room.id, 'game_canceled', { roomId });
    
    delete store.rooms[roomId];
    saveStore();
    res.json({ success: true, message: `Room ${roomId} has been canceled and bets refunded.` });
});

// Toggle admin rights for a user
app.post('/api/admin/users/:userId/toggle-admin', isAdmin, (req, res) => {
    const { userId } = req.params;
    const user = store.users[userId];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
        user.role = 'player';
    } else {
        user.role = 'admin';
    }

    saveStore();
    broadcastUserUpdate(user.id);
    res.json({ success: true, user });
});

// Get user's game history
app.get('/api/admin/users/:userId/games', isAdmin, (req, res) => {
    const { userId } = req.params;
    const userGames = Object.values(store.rooms).filter(room => 
        room.players.some(p => p.userId === userId)
    );
    res.json(userGames);
});

// Broadcast a message to all clients
app.post('/api/admin/broadcast', isAdmin, (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }

    broadcastToAll('global_message', { message });

    res.json({ success: true, message: 'Broadcast sent.' });
});


// ==========================================
// 6a. AGENT API ENDPOINTS
// ==========================================

// Agent Login
app.post('/api/agent/login', async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        const agentsRef = db.collection('agents');
        const snapshot = await agentsRef.where('username', '==', username).limit(1).get();

        if (snapshot.empty) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const agentDoc = snapshot.docs[0];
        const agent = agentDoc.data() as Agent;

        // WARNING: Plaintext password comparison. Not secure.
        if (agent.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        if (agent.status !== 'Active') {
            return res.status(403).json({ error: 'This agent account is not active.' });
        }

        res.json({ success: true, agent });

    } catch (error) {
        console.error('Agent login failed:', error);
        res.status(500).json({ error: 'An internal server error occurred during login.' });
    }
});


// Middleware to check for agent access
async function isAgent(req: any, res: express.Response, next: express.NextFunction) {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const agentId = req.query.agentId as string;
    if (!agentId) {
        return res.status(401).json({ error: 'Agent ID is required for this operation.' });
    }
    
    try {
        const agentRef = db.collection('agents').doc(agentId);
        const agentDoc = await agentRef.get();

        if (!agentDoc.exists) {
            return res.status(403).json({ error: 'Access denied. Invalid agent ID.' });
        }
        
        const agent = agentDoc.data() as Agent;

        if (agent.status !== 'Active') {
            return res.status(403).json({ error: 'Access denied. Inactive agent ID.' });
        }

        req.agent = agent; // Attach agent object to the request
        next();
    } catch (error) {
        console.error('Agent verification failed:', error);
        res.status(500).json({ error: 'Failed to verify agent status.' });
    }
}

// Get agent's own profile data
app.get('/api/agent/profile', isAgent, (req, res) => {
    // The isAgent middleware now attaches the full agent object from Firestore.
    const agent = (req as any).agent;
    res.json(agent);
});

// Search for a player by username
app.get('/api/agent/player-lookup', isAgent, (req, res) => {
    const { query } = req.query;
    if (!query || typeof query !== 'string' || query.length < 2) {
        return res.status(400).json({ error: 'A search query of at least 2 characters is required.' });
    }

    const lowerCaseQuery = query.toLowerCase();
    const results = Object.values(store.users)
        .filter(u => u.username.toLowerCase().includes(lowerCaseQuery) && !u.id.startsWith('bot_'))
        .map(u => ({ id: u.id, username: u.username, avatar: u.avatar })) // Return minimal info
        .slice(0, 10); // Limit results

    res.json(results);
});

// Get agent's own transaction history
app.get('/api/agent/transactions', isAgent, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const agent = (req as any).agent;
    try {
        // Query without ordering to prevent missing-index errors.
        const snapshot = await db.collection('agentTransactions')
            .where('agentId', '==', agent.id)
            .get();
        
        // Sort the results in memory.
        const transactions = snapshot.docs.map(doc => doc.data());
        transactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        res.json(transactions);
    } catch (error) {
        console.error(`Failed to get transactions for agent ${agent.id}:`, error);
        res.status(500).json({ error: 'Failed to retrieve agent transactions.' });
    }
});

// Deposit funds from an agent's float to a player's wallet
app.post('/api/agent/deposit', isAgent, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const agent: Agent = (req as any).agent;
    const { playerId, amount } = req.body;
    const depositAmount = parseFloat(amount);

    if (!playerId || !depositAmount || depositAmount <= 0) {
        return res.status(400).json({ error: 'Valid playerId and a positive amount are required.' });
    }
    
    // NOTE: The 'users' collection is still managed by the in-memory 'store'.
    // This is a temporary state during refactoring. A proper solution
    // would fetch the player from a 'users' collection in Firestore.
    const player = store.users[playerId];
    if (!player) {
        return res.status(404).json({ error: 'Player not found.' });
    }
    
    try {
        const agentRef = db.collection('agents').doc(agent.id);
        const agentTxRef = db.collection('agentTransactions').doc();

        await db.runTransaction(async (t) => {
            const agentDoc = await t.get(agentRef);
            if (!agentDoc.exists) throw new Error('Agent not found.');

            const agentData = agentDoc.data() as Agent;
            if (agentData.floatBalance < depositAmount) {
                throw new Error('Insufficient float balance.');
            }

            const newFloatBalance = agentData.floatBalance - depositAmount;
            t.update(agentRef, { floatBalance: newFloatBalance });

            const agentTx: AgentTransaction = {
                id: agentTxRef.id,
                agentId: agent.id,
                type: 'PlayerDeposit',
                amount: depositAmount,
                playerId: playerId,
                timestamp: Date.now(),
                description: `Deposited ${depositAmount} into ${player.username}'s account.`
            };
            t.set(agentTxRef, agentTx);
        });

        // This part remains, but is also part of the old system.
        // It should be refactored to be part of the transaction.
        player.balance += depositAmount;
        addTransaction(
            playerId,
            'deposit',
            depositAmount,
            undefined,
            `Deposit received from agent ${agent.id}.`
        );
        await saveStoreAndWait(); // This saves the player's new balance.

        broadcastUserUpdate(player.id);
        
        const updatedAgentDoc = await agentRef.get();
        const updatedAgent = updatedAgentDoc.data();

        res.json({ success: true, newAgentBalance: updatedAgent?.floatBalance, newPlayerBalance: player.balance });

    } catch (error) {
        console.error(`Agent ${agent.id} failed to deposit to player ${playerId}:`, error);
        const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred.';
        if (errorMessage.includes('Insufficient')) {
            return res.status(400).json({ error: errorMessage });
        }
        res.status(500).json({ error: `Failed to process deposit: ${errorMessage}` });
    }
});


// Agent requests for more float
app.post('/api/agent/request-float', isAgent, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const agent: Agent = (req as any).agent;
    const { amount } = req.body;
    const requestAmount = parseFloat(amount);

    if (!requestAmount || requestAmount <= 0) {
        return res.status(400).json({ error: 'A positive amount is required.' });
    }

    try {
        const requestRef = db.collection('agentRequests').doc();
        const newRequest: AgentRequest = {
            id: requestRef.id,
            agentId: agent.id,
            agentUsername: agent.username,
            amount: requestAmount,
            status: 'pending',
            createdAt: Date.now(),
        };

        await requestRef.set(newRequest);

        res.status(201).json({ success: true, message: 'Your float request has been submitted for review.', request: newRequest });

    } catch (error) {
        console.error(`Agent ${agent.id} failed to request float:`, error);
        res.status(500).json({ error: 'An internal server error occurred while submitting your request.' });
    }
});

// Agent gets their own list of float requests
app.get('/api/agent/requests', isAgent, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const agent: Agent = (req as any).agent;
    try {
        const requestsSnapshot = await db.collection('agentRequests')
            .where('agentId', '==', agent.id)
            .get();
        const requests = requestsSnapshot.docs.map(doc => doc.data());
        requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        res.json(requests);
    } catch (error) {
        console.error(`Failed to get float requests for agent ${agent.id}:`, error);
        res.status(500).json({ error: 'Failed to retrieve float requests.' });
    }
});

// Agent gets list of manual player requests for transactions
app.get('/api/agent/player-requests', isAgent, (req, res) => {
    const agent: Agent = (req as any).agent;

    const agentSpecificTxs = store.pendingManualTransactions.filter(tx => tx.status === 'pending' && tx.agentId === agent.id);

    const responsePayload: PlayerAgentRequest[] = agentSpecificTxs.map(tx => {
        const user = store.users[tx.userId];
        return {
            id: tx.id,
            playerId: tx.userId,
            playerUsername: user ? user.username : 'Unknown Player',
            playerAvatar: user ? user.avatar : '❓',
            agentId: agent.id, // Agent ID is from the authenticated agent
            playerPhone: tx.phone, // For withdrawals
            senderPhone: tx.senderPhone, // For deposits
            provider: tx.provider,
            type: tx.transactionType,
            amount: tx.amount,
            status: tx.status,
            createdAt: tx.createdAt,
        };
    });
    
    responsePayload.sort((a, b) => b.createdAt - a.createdAt);

    res.json(responsePayload);
});

// Agent approves a manual player request for a transaction
app.post('/api/agent/player-requests/:requestId/approve', isAgent, async (req, res) => {
    const { requestId } = req.params;
    const agent: Agent = (req as any).agent;
    const tx = store.pendingManualTransactions.find(t => t.id === requestId);

    if (!tx || tx.status !== 'pending') {
        return res.status(404).json({ error: 'Pending transaction not found or already processed.' });
    }

    const user = store.users[tx.userId];
    if (!user) {
        return res.status(404).json({ error: 'User associated with transaction not found.' });
    }

    let newAgentFloat: number;

    try {
        if (!db) {
            throw new Error("Database not initialized");
        }

        await db.runTransaction(async (t) => {
            const agentRef = db.collection('agents').doc(agent.id);
            const agentDoc = await t.get(agentRef);

            if (!agentDoc.exists) {
                throw new Error("Agent not found in database");
            }
            const agentData = agentDoc.data() as Agent;
            const currentFloat = agentData.floatBalance || 0;
            let newAgentFloat: number;

            if (tx.transactionType === 'deposit') {
                // Agent gives money to player, agent float decreases.
                if (currentFloat < tx.amount) {
                    throw new Error("Insufficient float balance to approve this deposit.");
                }
                newAgentFloat = currentFloat - tx.amount;
                user.balance += tx.amount;
                addTransaction(user.id, 'deposit', tx.amount, undefined, `Manual deposit approved by agent ${agent.username}. Request ID: ${tx.id}`);
            } else { // withdrawal
                // Agent receives money from player, agent float increases.
                if (user.balance < tx.amount) {
                    // This transaction should just fail, not be rejected. Rejection is an explicit agent action.
                    throw new Error('Player has insufficient balance for this withdrawal.');
                }
                newAgentFloat = currentFloat + tx.amount;
                user.balance -= tx.amount;
                addTransaction(user.id, 'withdrawal', tx.amount, undefined, `Manual withdrawal approved by agent ${agent.username}. Request ID: ${tx.id}`);
            }

            // Create the agent transaction record
            const agentTxRef = db.collection('agentTransactions').doc();
            const agentTx: AgentTransaction = {
                id: agentTxRef.id,
                agentId: agent.id,
                type: tx.transactionType === 'deposit' ? 'PlayerDeposit' : 'PlayerWithdrawal',
                amount: tx.amount,
                playerId: user.id,
                playerName: user.username,
                timestamp: Date.now(),
                description: `Approved ${tx.transactionType} of $${tx.amount} for player ${user.username}.`
            };
            t.set(agentTxRef, agentTx);

            // Update the agent's float balance
            t.update(agentRef, { floatBalance: newAgentFloat });
        });

        // If transaction is successful, update in-memory store
        tx.status = 'approved';
        (tx as any).resolvedBy = agent.id;
        (tx as any).resolverUsername = agent.username;
        await saveStoreAndWait();

        broadcastUserUpdate(user.id);
        res.json({ success: true, transaction: tx });

    } catch (error) {
        console.error("Error processing agent transaction approval:", error);
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        if (message.includes('Insufficient')) {
            return res.status(400).json({ error: message });
        }
        return res.status(500).json({ error: `Failed to process approval: ${message}` });
    }
});


// Agent rejects a manual player request for a transaction
app.post('/api/agent/player-requests/:requestId/reject', isAgent, async (req, res) => {
    const { requestId } = req.params;
    const agent: Agent = (req as any).agent;
    const tx = store.pendingManualTransactions.find(t => t.id === requestId);

    if (!tx || tx.status !== 'pending') {
        return res.status(404).json({ error: 'Pending transaction not found or already processed.' });
    }

    const user = store.users[tx.userId];
    if (!user) {
        tx.status = 'rejected';
        await saveStoreAndWait();
        return res.status(404).json({ error: 'User associated with transaction not found. Transaction rejected.' });
    }
    
    tx.status = 'rejected';
    (tx as any).resolvedBy = agent.id;
    (tx as any).resolverUsername = agent.username;
    await saveStoreAndWait();
    
    sendEventToUser(user.id, 'user_notification', {
        type: 'info',
        message: `Your ${tx.transactionType} request for $${tx.amount} was rejected by agent ${agent.username}.`
    });
    
    res.json({ success: true, transaction: tx });
});

// Get agent float payment instructions
app.get('/api/agent/payment-instructions', isAgent, (req, res) => {
    // The instructions are stored globally in the in-memory store.
    const instructions = store.agentFloatInstructions || '';
    res.json({ instructions: instructions });
});

// Agent gets a list of their linked players
app.get('/api/agent/my-players', isAgent, (req, res) => {
    const agent: Agent = (req as any).agent;

    const linkedPlayers = Object.values(store.users).filter(user => user.linkedAgentId === agent.id);

    // Return a sanitized version of the user profiles
    const sanitizedPlayers = linkedPlayers.map(p => {
        const { password, ...playerData } = p;
        return playerData;
    });

    res.json(sanitizedPlayers);
});


// ==========================================
// 7. VITE MIDDLEWARE SETUP
// ==========================================
async function startServer() {
  // Load authoritative state from Firebase Firestore on startup
  await loadStoreFromFirestore();
  purgeSimulatedUsers(); // Ensure simulated users are purged from the memory state

  let vite: ViteDevServer | undefined;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    app.use(express.static(distPath));
    
    // Specific route for the Agent Dashboard
    app.get('/agent', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'agent.html'));
    });

    // For all other non-API routes, serve the main app's index.html file.
    app.get(/^(?!\/api).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Betting Ludo Game Full-Stack App listening at http://localhost:${PORT}`);
  });

  // Handle Vite HMR WebSocket upgrade requests
  server.on('upgrade', (req, socket, head) => {
    if (vite && req.url?.includes('__vite_hmr')) {
      vite.ws.handleUpgrade(req, socket, head);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
      console.log('Server shut down.');
      process.exit(0);
    });
  });
}

startServer();
