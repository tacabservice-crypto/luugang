import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);

// server.ts
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { initializeApp, cert, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), ".env.production") });
var appDir = typeof __dirname !== "undefined" ? __dirname : import.meta && import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : process.cwd();
function getDistDirectory() {
  const cwdDist = path.join(process.cwd(), "dist");
  if (fs.existsSync(path.join(cwdDist, "index.html"))) {
    return cwdDist;
  }
  const currentDir = typeof __dirname !== "undefined" ? __dirname : import.meta && import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : process.cwd();
  if (fs.existsSync(path.join(currentDir, "index.html"))) {
    return currentDir;
  }
  const currentDist = path.join(currentDir, "dist");
  if (fs.existsSync(path.join(currentDist, "index.html"))) {
    return currentDist;
  }
  return cwdDist;
}
var VIP_TIERS = {
  gold: {
    name: "Gold VIP",
    price: 10,
    durationMonths: 1,
    rakeDiscount: 0.02,
    // 2% discount on rake
    features: ["Ad-free experience", "Exclusive avatar borders", "2% Rake Discount", "Priority Customer Support"]
  },
  platinum: {
    name: "Platinum VIP",
    price: 25,
    durationMonths: 3,
    rakeDiscount: 0.05,
    // 5% discount on rake
    features: ["All Gold features", "Unique animated avatars", "5% Rake Discount", "Early access to new game modes"]
  }
};
var RAKE_PERCENTAGE = 0.1;
var app = express();
var configuredAllowedOrigins = [
  process.env.VITE_APP_URL,
  process.env.PUBLIC_URL,
  process.env.RENDER_EXTERNAL_URL,
  process.env.ALLOWED_ORIGINS
].flatMap((value) => {
  if (!value) return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
});
var allowedOrigins = Array.from(/* @__PURE__ */ new Set([
  "https://ludosom.com",
  "https://www.ludosom.com",
  "https://ludo31.onrender.com",
  "https://dhili-dhili-ludo.onrender.com",
  "https://dhilidhili.onrender.com",
  "http://localhost:3000",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3002",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...configuredAllowedOrigins
]));
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.includes("ludosom.com")) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
var rawPort = process.env.PORT || 3002;
var PORT = typeof rawPort === "string" && !isNaN(Number(rawPort)) ? Number(rawPort) : rawPort;
var DB_FILE = path.join(process.cwd(), "db_store.json");
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.static(getDistDirectory()));
var db = null;
var auth = null;
function normalizePrivateKey(key) {
  if (!key) return "";
  let str = key.trim();
  if (!str.includes("PRIVATE KEY") && !str.includes("\\n") && !str.includes("\n")) {
    try {
      const decoded = Buffer.from(str, "base64").toString("utf8");
      if (decoded.includes("PRIVATE KEY")) {
        str = decoded.trim();
      }
    } catch (e) {
    }
  }
  str = str.replace(/^["'\\]+|["'\\]+$/g, "").trim();
  str = str.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "");
  const headerMatch = str.match(/-----BEGIN [A-Z ]+-----/);
  const footerMatch = str.match(/-----END [A-Z ]+-----/);
  const header = headerMatch ? headerMatch[0] : "-----BEGIN PRIVATE KEY-----";
  const footer = footerMatch ? footerMatch[0] : "-----END PRIVATE KEY-----";
  let body = str;
  if (headerMatch) {
    body = body.substring(body.indexOf(header) + header.length);
  }
  if (footerMatch) {
    body = body.substring(0, body.indexOf(footer));
  }
  const cleanBody = body.replace(/[\s\r\n\\]+/g, "");
  const wrappedBody = cleanBody.match(/.{1,64}/g)?.join("\n") || cleanBody;
  return `${header}
${wrappedBody}
${footer}
`;
}
function getFirebaseServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  if (projectId && clientEmail && rawPrivateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: normalizePrivateKey(rawPrivateKey)
    };
  }
  const envValue = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (envValue) {
    try {
      let rawEnv = envValue.trim();
      if (rawEnv.startsWith("'") && rawEnv.endsWith("'") || rawEnv.startsWith('"') && rawEnv.endsWith('"')) {
        rawEnv = rawEnv.slice(1, -1).trim();
      }
      if (rawEnv.startsWith("\\{") || rawEnv.includes('\\"')) {
        rawEnv = rawEnv.replace(/\\([{}":,\[\]\\])/g, "$1");
      }
      let parsed = null;
      try {
        parsed = JSON.parse(rawEnv);
      } catch (e1) {
        try {
          const decoded = Buffer.from(rawEnv, "base64").toString("utf8");
          if (decoded.includes("{")) {
            parsed = JSON.parse(decoded);
          }
        } catch (e2) {
          const unescaped = rawEnv.replace(/\\/g, "");
          parsed = JSON.parse(unescaped);
        }
      }
      if (parsed && typeof parsed === "object") {
        if (parsed.private_key && typeof parsed.private_key === "string") {
          parsed.private_key = normalizePrivateKey(parsed.private_key);
        }
        if (parsed.project_id && parsed.private_key) {
          return parsed;
        }
      }
      console.warn(
        "Firebase credentials did not contain project_id/private_key."
      );
    } catch (error) {
      console.error("Failed to parse Firebase credentials JSON:", error);
    }
  }
  const possiblePaths = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ? [process.env.FIREBASE_SERVICE_ACCOUNT_PATH] : [
    path.join(process.cwd(), "firebase-admin-key.json"),
    path.join(appDir, "firebase-admin-key.json"),
    path.join(process.cwd(), "dist", "firebase-admin-key.json"),
    path.join(process.cwd(), "service-account.json"),
    path.join(process.cwd(), "firebase-key.json")
  ];
  const serviceAccountPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!serviceAccountPath) {
    return null;
  }
  try {
    const serviceAccountFile = fs.readFileSync(serviceAccountPath, "utf8");
    return JSON.parse(serviceAccountFile);
  } catch (error) {
    console.error("Failed to read Firebase service account file:", error);
    return null;
  }
}
var serviceAccount = getFirebaseServiceAccount();
if (serviceAccount) {
  try {
    serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key || "");
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
    console.log("Firebase Firestore and Auth initialized successfully with Admin SDK.");
  } catch (err) {
    console.error("Failed to initialize Firebase Admin SDK:", err);
  }
} else {
  console.log("No Firebase Admin credentials configured. Set FIREBASE_SERVICE_ACCOUNT or firebase-admin-key.json for login/auth to work.");
}
var DEFAULT_PAYMENT_PROVIDERS = {
  evc: { enabled: false },
  edahab: { enabled: false },
  sahal: { enabled: false },
  premier: { enabled: false }
};
var DEFAULT_ADMIN_ROLES = [
  { id: "admin", name: "Administrator", permissions: ["all"] },
  { id: "editor", name: "Editor", permissions: ["manage_users", "manage_content"] }
];
var DEFAULT_ADMIN_SETTINGS = {
  username: process.env.ADMIN_USERNAME || "admin",
  password: process.env.ADMIN_PASSWORD || "password",
  roles: DEFAULT_ADMIN_ROLES
};
var store = {
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
  agentFloatInstructions: "",
  adminSettings: { ...DEFAULT_ADMIN_SETTINGS },
  agents: {},
  agentTransactions: [],
  tournaments: {}
};
function seedDefaultTournaments() {
  const now = Date.now();
  const oneHour = 60 * 60 * 1e3;
  const oneDay = 24 * 60 * 60 * 1e3;
  const openOrActive = Object.values(store.tournaments).filter(
    (t) => t.status === "registration_open" || t.status === "in_progress"
  );
  if (openOrActive.length < 3) {
    const t1 = {
      id: `tourney_weekly_${now}_1`,
      name: "Ludo$om Weekly Champion Cup \u{1F3C6}",
      entryFee: 5,
      prizePool: 100,
      status: "registration_open",
      players: [],
      maxPlayers: 16,
      startDate: now + oneDay * 2,
      endDate: 0,
      winnerId: null,
      currentRound: 1,
      matches: [],
      createdAt: now
    };
    const t2 = {
      id: `tourney_weekend_${now}_2`,
      name: "Weekend High Stakes Knockout \u26A1",
      entryFee: 10,
      prizePool: 200,
      status: "registration_open",
      players: [],
      maxPlayers: 8,
      startDate: now + oneDay * 4,
      endDate: 0,
      winnerId: null,
      currentRound: 1,
      matches: [],
      createdAt: now
    };
    const t3 = {
      id: `tourney_daily_${now}_3`,
      name: "Daily Quick Sprint Tournament \u{1F680}",
      entryFee: 2,
      prizePool: 30,
      status: "registration_open",
      players: [],
      maxPlayers: 4,
      startDate: now + oneHour * 6,
      endDate: 0,
      winnerId: null,
      currentRound: 1,
      matches: [],
      createdAt: now
    };
    if (!store.tournaments[t1.id]) store.tournaments[t1.id] = t1;
    if (!store.tournaments[t2.id]) store.tournaments[t2.id] = t2;
    if (!store.tournaments[t3.id]) store.tournaments[t3.id] = t3;
  }
}
function loadStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(raw);
      store.users = parsed.users || {};
      store.transactions = parsed.transactions || [];
      store.rooms = parsed.rooms || {};
      store.matchmakingQueues = parsed.matchmakingQueues || {
        0: [],
        1: [],
        5: [],
        10: [],
        25: [],
        50: []
      };
      store.houseRevenue = parsed.houseRevenue || 0;
      store.pendingManualTransactions = parsed.pendingManualTransactions || [];
      store.paymentProviders = {
        ...DEFAULT_PAYMENT_PROVIDERS,
        ...parsed.paymentProviders || {}
      };
      store.agentFloatInstructions = parsed.agentFloatInstructions || "";
      store.tournaments = parsed.tournaments || {};
      seedDefaultTournaments();
      const persistedRoles = Array.isArray(parsed.adminSettings?.roles) ? parsed.adminSettings.roles : [];
      store.adminSettings = {
        username: parsed.adminSettings?.username || process.env.ADMIN_USERNAME || "admin",
        password: parsed.adminSettings?.password || process.env.ADMIN_PASSWORD || "password",
        roles: persistedRoles.length ? persistedRoles : DEFAULT_ADMIN_ROLES
      };
      store.agents = parsed.agents || {};
      store.agentTransactions = parsed.agentTransactions || [];
      console.log("Database loaded successfully from disk.");
    } else {
      saveStoreAndWait();
    }
  } catch (error) {
    console.error("Failed to load database. Starting fresh.", error);
  }
}
async function loadStoreFromFirestore() {
  if (!db) {
    loadStore();
    return;
  }
  try {
    console.log("Fetching latest state from Firebase Firestore...");
    const storeRef = db.collection("ludo_store").doc("main");
    const docSnap = await storeRef.get();
    if (docSnap.exists) {
      const payload = docSnap.data();
      if (payload && payload.data) {
        const parsed = JSON.parse(payload.data);
        store.users = parsed.users || {};
        store.transactions = parsed.transactions || [];
        store.rooms = parsed.rooms || {};
        store.matchmakingQueues = parsed.matchmakingQueues || {
          0: [],
          1: [],
          5: [],
          10: [],
          25: [],
          50: []
        };
        store.houseRevenue = parsed.houseRevenue || 0;
        store.pendingManualTransactions = parsed.pendingManualTransactions || [];
        store.paymentProviders = {
          ...DEFAULT_PAYMENT_PROVIDERS,
          ...parsed.paymentProviders || {}
        };
        store.agentFloatInstructions = parsed.agentFloatInstructions || "";
        const persistedRoles = Array.isArray(parsed.adminSettings?.roles) ? parsed.adminSettings.roles : [];
        store.adminSettings = {
          username: parsed.adminSettings?.username || process.env.ADMIN_USERNAME || "admin",
          password: parsed.adminSettings?.password || process.env.ADMIN_PASSWORD || "password",
          roles: persistedRoles.length ? persistedRoles : DEFAULT_ADMIN_ROLES
        };
        store.agents = parsed.agents || {};
        store.agentTransactions = parsed.agentTransactions || [];
        store.tournaments = parsed.tournaments || {};
        console.log("Database loaded successfully from Firebase Firestore.");
        fs.writeFileSync(DB_FILE, payload.data, "utf8");
        return;
      }
    }
    console.log("No existing state in Firestore. Loading from local store fallback...");
    loadStore();
  } catch (err) {
    console.error("Failed to load store from Firestore:", err);
    loadStore();
  }
}
async function syncToFirestore() {
  if (!db) return;
  try {
    const storeRef = db.collection("ludo_store").doc("main");
    const serialized = JSON.stringify(store);
    await storeRef.set({ data: serialized, updatedAt: Date.now() });
    console.log("Successfully synchronized store to Firebase Firestore.");
  } catch (err) {
    console.error("Failed to sync store to Firestore:", err);
  }
}
function saveStore() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write database to disk.", error);
  }
}
async function saveStoreAndWait() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), "utf8");
    await syncToFirestore();
  } catch (error) {
    console.error("Failed to write database to disk.", error);
  }
}
loadStoreFromFirestore();
function purgeSimulatedUsers() {
  let changed = false;
  Object.keys(store.users).forEach((id) => {
    if (id.startsWith("user_sim_")) {
      delete store.users[id];
      changed = true;
    }
  });
  if (changed) {
    saveStore();
  }
}
purgeSimulatedUsers();
var activeClients = [];
function sendEventToUser(userId, eventName, data) {
  const clients = activeClients.filter((c) => c.userId === userId);
  clients.forEach((client) => {
    try {
      client.res.write(`event: ${eventName}
data: ${JSON.stringify(data)}

`);
      if (typeof client.res.flush === "function") {
        client.res.flush();
      }
    } catch (e) {
      console.error(`Error sending SSE event to user ${userId}. Closing connection.`, e);
      client.res.end();
    }
  });
}
function broadcastToAll(eventName, data) {
  const payload = `event: ${eventName}
data: ${JSON.stringify(data)}

`;
  activeClients.forEach((client) => {
    try {
      client.res.write(payload);
      if (typeof client.res.flush === "function") {
        client.res.flush();
      }
    } catch (e) {
      console.error(`Error broadcasting SSE event. Closing connection for client ${client.userId}.`, e);
      client.res.end();
    }
  });
}
function broadcastToRoom(roomId, eventName, data) {
  const room = store.rooms[roomId];
  if (!room) return;
  let payload = { ...data };
  if (eventName === "game_update" || eventName === "timer_tick") {
    const spectatorClients = activeClients.filter((c) => c.spectatingRoomId === roomId);
    const spectatorsInfo = spectatorClients.map((c) => {
      const user = store.users[c.userId];
      if (user) {
        return {
          id: user.id,
          username: user.username,
          avatar: user.avatar
        };
      }
      return null;
    }).filter(Boolean);
    payload.spectators = spectatorsInfo;
  }
  room.players.forEach((p) => {
    sendEventToUser(p.userId, eventName, payload);
  });
  const spectatorConnections = activeClients.filter((c) => c.spectatingRoomId === roomId);
  spectatorConnections.forEach((s) => {
    const isPlayer = room.players.some((p) => p.userId === s.userId);
    if (!isPlayer) {
      sendEventToUser(s.userId, eventName, payload);
    }
  });
}
function broadcastUserUpdate(userId) {
  const user = store.users[userId];
  if (user) {
    sendEventToUser(userId, "user_update", user);
  }
}
function removeSSEClient(res) {
  const client = activeClients.find((c) => c.res === res);
  activeClients = activeClients.filter((c) => c.res !== res);
  if (client) {
    const stillConnected = activeClients.some((c) => c.userId === client.userId);
    if (!stillConnected) {
      const activeRoom = Object.values(store.rooms).find(
        (r) => r.status === "playing" && r.players.some((p) => p.userId === client.userId && p.status === "online")
      );
      if (activeRoom) {
        const player = activeRoom.players.find((p) => p.userId === client.userId);
        if (player) {
          player.status = "offline";
          addLog(activeRoom, `\u{1F50C} ${player.username} has disconnected. They have time to reconnect before being forfeited.`);
          broadcastToRoom(activeRoom.id, "game_update", activeRoom);
          saveStore();
        }
      }
      let changed = false;
      for (const qKey of Object.keys(store.matchmakingQueues)) {
        const lenBefore = store.matchmakingQueues[qKey].length;
        store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter((id) => id !== client.userId);
        if (store.matchmakingQueues[qKey].length !== lenBefore) changed = true;
      }
      if (changed) {
        saveStoreAndWait();
      }
      if (db) {
        db.collection("matchmaking").doc(client.userId).delete().catch((err) => {
          console.error("Failed to delete matchmaking record from Firestore on disconnect:", err);
        });
      }
    }
    broadcastToAll("online_players_updated", {});
  }
}
function cleanupMatchmakingQueues() {
  let changed = false;
  for (const qKey of Object.keys(store.matchmakingQueues)) {
    const beforeLen = store.matchmakingQueues[qKey].length;
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter((userId) => {
      if (!store.users[userId]) return false;
      const inGame = Object.values(store.rooms).some(
        (r) => r.status === "playing" && r.players.some((p) => p.userId === userId && p.status !== "left")
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
var START_OFFSETS = {
  green: 0,
  yellow: 13,
  blue: 26,
  red: 39
};
var SAFE_GLOBAL_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];
function getGlobalPosition(color, relativePos) {
  if (relativePos < 0 || relativePos > 50) return null;
  const offset = START_OFFSETS[color];
  return (offset + relativePos) % 52;
}
function createInitialTokens(userId, color) {
  return [0, 1, 2, 3].map((i) => ({
    id: `token_${color}_${i}`,
    ownerId: userId,
    color,
    position: -1
    // Home Base
  }));
}
function isMoveValid(token, roll) {
  if (token.position === 56) return false;
  if (token.position === -1) {
    return roll === 6;
  }
  return token.position + roll <= 56;
}
function advanceTurn(room) {
  const gs = room.gameState;
  const oldTurn = gs.turn;
  const numPlayers = room.players.length;
  const newPlayer = room.players[gs.turn];
  if (newPlayer) newPlayer.inactivityTimer = 300;
  gs.diceRoll = null;
  gs.hasRolled = false;
  gs.turnTimer = 30;
  let found = false;
  let nextTurn = oldTurn;
  for (let i = 1; i <= numPlayers; i++) {
    const checkIdx = (oldTurn + i) % numPlayers;
    const p = room.players[checkIdx];
    if (p && p.status !== "left") {
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
function addTransaction(userId, type, amount, matchId, description = "") {
  const tx = {
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
function addLog(room, text) {
  const log = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: Date.now(),
    text
  };
  room.gameState.logs.push(log);
  if (room.gameState.logs.length > 50) {
    room.gameState.logs.shift();
  }
}
function isBotPlayer(userId) {
  return userId.startsWith("bot_") || userId.startsWith("user_sim_");
}
function executeBotTurnIfActive(room) {
  const activePlayer = room.players[room.gameState.turn];
  if (!activePlayer || !isBotPlayer(activePlayer.userId)) return;
  setTimeout(() => {
    if (!room.gameState.hasRolled) {
      const d = Math.floor(Math.random() * 6) + 1;
      room.gameState.diceRoll = d;
      room.gameState.hasRolled = true;
      addLog(room, `\u{1F916} Bot ${activePlayer.username} rolled a ${d}!`);
      const playerTokens = room.gameState.tokens.filter((t) => t.color === activePlayer.color);
      const validTokens = playerTokens.filter((t) => isMoveValid(t, d));
      if (validTokens.length === 0) {
        addLog(room, `\u{1F916} Bot ${activePlayer.username} has no valid moves.`);
        setTimeout(() => {
          advanceTurn(room);
          broadcastToRoom(room.id, "game_update", room);
          executeBotTurnIfActive(room);
        }, 500);
      } else {
        let selectedToken = validTokens[0];
        for (const token of validTokens) {
          const nextRelative = token.position === -1 ? 0 : token.position + d;
          const globalPos = getGlobalPosition(token.color, nextRelative);
          if (globalPos !== null && !SAFE_GLOBAL_SQUARES.includes(globalPos)) {
            const hasOpponent = room.gameState.tokens.some((t) => {
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
        if (selectedToken === validTokens[0] && d === 6) {
          const baseToken = validTokens.find((t) => t.position === -1);
          if (baseToken) selectedToken = baseToken;
        }
        setTimeout(() => {
          moveTokenLogic(room, selectedToken.id, d);
          broadcastToRoom(room.id, "game_update", room);
          executeBotTurnIfActive(room);
        }, 500);
      }
    }
  }, 400);
}
function moveTokenLogic(room, tokenId, diceValue) {
  const gs = room.gameState;
  const token = gs.tokens.find((t) => t.id === tokenId);
  if (!token) return;
  const activePlayer = room.players[gs.turn];
  const oldPos = token.position;
  let newPos = oldPos;
  const RELATIVE_HOME_ENTRY_SQUARE = 51;
  const MAIN_TRACK_LENGTH = 52;
  if (oldPos === -1 && diceValue === 6) {
    newPos = 0;
    addLog(room, `${activePlayer.username} moved token out of base!`);
  } else if (oldPos >= 0) {
    if (oldPos < RELATIVE_HOME_ENTRY_SQUARE) {
      const theoreticalNewPos = oldPos + diceValue;
      if (oldPos >= RELATIVE_HOME_ENTRY_SQUARE - 6 && oldPos < RELATIVE_HOME_ENTRY_SQUARE && theoreticalNewPos >= RELATIVE_HOME_ENTRY_SQUARE) {
        newPos = theoreticalNewPos;
      } else {
        newPos = theoreticalNewPos;
        if (newPos >= MAIN_TRACK_LENGTH) {
          newPos = newPos % MAIN_TRACK_LENGTH;
        }
      }
    } else {
      newPos = oldPos + diceValue;
    }
  }
  if (newPos > 56) {
    newPos = oldPos;
    addLog(room, `${activePlayer.username}'s token overshot the final home square and could not move.`);
  }
  token.position = newPos;
  if (oldPos !== newPos) {
    addLog(room, `${activePlayer.username} moved token by ${diceValue} spaces (from ${oldPos === -1 ? "base" : oldPos} to ${newPos}).`);
  }
  let bonusTurn = diceValue === 6;
  const finalGlobal = getGlobalPosition(token.color, token.position);
  if (finalGlobal !== null && !SAFE_GLOBAL_SQUARES.includes(finalGlobal)) {
    const opponentsAtSquare = gs.tokens.filter((t) => {
      if (t.color === token.color) return false;
      if (room.gameMode === "team") {
        const isAlly = token.color === "red" && t.color === "yellow" || token.color === "yellow" && t.color === "red" || token.color === "green" && t.color === "blue" || token.color === "blue" && t.color === "green";
        if (isAlly) return false;
      }
      if (t.position < 0 || t.position >= RELATIVE_HOME_ENTRY_SQUARE) return false;
      const otherGlobal = getGlobalPosition(t.color, t.position);
      return otherGlobal === finalGlobal;
    });
    if (opponentsAtSquare.length > 0) {
      opponentsAtSquare.forEach((opToken) => {
        opToken.position = -1;
        const opUser = store.users[opToken.ownerId] || { username: "Opponent" };
        addLog(room, `\u{1F4A5} CUT! ${activePlayer.username} cut ${opUser.username}'s token back to base!`);
      });
      bonusTurn = true;
    }
  }
  if (token.position === 56) {
    addLog(room, `\u{1F389} Token finished! ${activePlayer.username} has safely brought a token home!`);
    bonusTurn = true;
  }
  const playerTokens = gs.tokens.filter((t) => t.color === token.color);
  const allFinished = playerTokens.every((t) => t.position === 56);
  if (allFinished) {
    room.status = "completed";
    gs.winnerId = activePlayer.userId;
    if (room.tournamentDetails) {
      addLog(room, `\u{1F3C6} ${activePlayer.username} has won the tournament match!`);
      handleTournamentMatchWin(room.tournamentDetails.tournamentId, room.tournamentDetails.matchId, activePlayer.userId);
      gs.escrowBalance = 0;
      return;
    }
    if (room.gameMode === "team") {
      const isRedYellow = token.color === "red" || token.color === "yellow";
      const winningColors = isRedYellow ? ["red", "yellow"] : ["green", "blue"];
      const winningTeammates = room.players.filter((p) => winningColors.includes(p.color));
      const winningNames = winningTeammates.map((p) => p.username).join(" & ");
      addLog(room, `\u{1F3C6} CHAMPIONS! Team ${winningNames} has finished all tokens and WON the game!`);
      if (room.betAmount > 0) {
        const share = gs.escrowBalance / 2;
        winningTeammates.forEach((p) => {
          if (!isBotPlayer(p.userId)) {
            const user = store.users[p.userId];
            if (user) {
              user.balance += share;
              user.winCount += 1;
              addTransaction(p.userId, "win_payout", share, room.id, `Team Win payout for match ${room.id}.`);
              broadcastUserUpdate(p.userId);
            }
          }
        });
        room.players.forEach((p) => {
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
      addLog(room, `\u{1F3C6} CHAMPION! ${activePlayer.username} has finished all 4 tokens and WON the game!`);
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
            "win_payout",
            payoutAmount,
            room.id,
            `Payout for winning match ${room.id} with $${room.betAmount} bet (Rake: $${rakeAmount.toFixed(2)}).`
          );
          broadcastUserUpdate(activePlayer.userId);
          store.houseRevenue += rakeAmount;
          addTransaction(
            "house",
            // A special ID for house transactions
            "app_commission",
            rakeAmount,
            room.id,
            `Rake from match ${room.id} (${(effectiveRakePercentage * 100).toFixed(0)}%).`
          );
        }
        room.players.forEach((p) => {
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
    gs.diceRoll = null;
    gs.hasRolled = false;
    if (bonusTurn) {
      addLog(room, `\u{1F3B2} Bonus roll! ${activePlayer.username} gets to roll again.`);
      gs.turnTimer = 30;
    } else {
      advanceTurn(room);
    }
  }
  saveStore();
}
function handleInactivityForfeit(room, inactivePlayer) {
  if (room.status !== "playing") return;
  addLog(room, `\u23F1\uFE0F ${inactivePlayer.username} has been forfeited due to inactivity.`);
  inactivePlayer.status = "left";
  const activePlayers = room.players.filter((pl) => pl.status !== "left");
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    room.status = "completed";
    room.gameState.winnerId = winner.userId;
    if (room.tournamentDetails) {
      addLog(room, `\u{1F3C6} ${winner.username} has won the tournament match by forfeit!`);
      handleTournamentMatchWin(room.tournamentDetails.tournamentId, room.tournamentDetails.matchId, winner.userId);
      room.gameState.escrowBalance = 0;
    } else {
      const totalPayout = room.gameState.escrowBalance;
      addLog(room, `\u{1F3C6} Game Over! ${winner.username} wins by forfeit and takes the pot of $${totalPayout.toFixed(2)}!`);
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
          addTransaction(winner.userId, "win_payout", payoutAmount, room.id, `Win by opponent inactivity forfeit (Rake: $${rakeAmount.toFixed(2)}).`);
          broadcastUserUpdate(winner.userId);
          store.houseRevenue += rakeAmount;
          addTransaction(
            "house",
            // A special ID for house transactions
            "app_commission",
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
  broadcastToRoom(room.id, "game_update", room);
}
setInterval(() => {
  let changed = false;
  Object.keys(store.rooms).forEach((roomId) => {
    const room = store.rooms[roomId];
    if (room.status === "playing") {
      const gs = room.gameState;
      const activePlayer = room.players[gs.turn];
      if (activePlayer && activePlayer.inactivityTimer && !isBotPlayer(activePlayer.userId)) {
        activePlayer.inactivityTimer -= 1;
        changed = true;
        if (activePlayer.inactivityTimer > 0 && activePlayer.inactivityTimer % 60 === 0) {
          const minutesLeft = activePlayer.inactivityTimer / 60;
          const warningMsg = `Waqtigaagu wuu sii dhamaanayaa! Waxaa kuu harsan ${minutesLeft} daqiiqo. (Your time is running out! ${minutesLeft} minutes left.)`;
          sendEventToUser(activePlayer.userId, "inactivity_warning", { message: warningMsg });
          addLog(room, `\u23F1\uFE0F Digniin: ${activePlayer.username} waxaa u harsan ${minutesLeft} daqiiqo. (Warning: ${activePlayer.username} has ${minutesLeft} minutes left.)`);
        }
        if (activePlayer.inactivityTimer <= 0) {
          handleInactivityForfeit(room, activePlayer);
          return;
        }
      }
      if (gs.turnTimer > 0) {
        gs.turnTimer -= 1;
        changed = true;
        if (gs.turnTimer === 0) {
          addLog(room, `\u23F1\uFE0F Waqtiga 30-ka ilbiriqsi wuu dhamaaday ${activePlayer.username}. Ganaaxa daahitaanka ayaa bilaabanaya.`);
          broadcastToRoom(room.id, "game_update", room);
        }
      }
    }
  });
  if (changed) {
    Object.keys(store.rooms).forEach((roomId) => {
      const room = store.rooms[roomId];
      if (room.status === "playing") {
        broadcastToRoom(roomId, "timer_tick", {
          turn: room.gameState.turn,
          turnTimer: room.gameState.turnTimer,
          inactivityTimer: room.players[room.gameState.turn]?.inactivityTimer
        });
      }
    });
  }
}, 1e3);
setInterval(() => {
  activeClients.forEach((client) => {
    try {
      client.res.write(`: heartbeat

`);
      if (typeof client.res.flush === "function") {
        client.res.flush();
      }
    } catch (e) {
      console.error(`Error sending heartbeat. Closing connection for client ${client.userId}.`, e);
      client.res.end();
    }
  });
}, 1e4);
setInterval(() => {
  cleanupMatchmakingQueues();
  Object.keys(store.matchmakingQueues).forEach((queueKey) => {
    const queueUserIds = store.matchmakingQueues[queueKey];
    if (!queueUserIds || queueUserIds.length === 0) return;
    const parts = queueKey.split("_");
    const bet = parseFloat(parts[0]) || 0;
    const cap = parseInt(parts[1]) || 2;
    const mode = parts[2] === "team" ? "team" : "solo";
    const firstUserId = queueUserIds[0];
    const firstUser = store.users[firstUserId];
    if (!firstUser) return;
    const joinedAt = firstUser.seekingJoinedAt || Date.now();
    const waitTimeMs = Date.now() - joinedAt;
    if (waitTimeMs >= 42e4) {
      console.log(`Matchmaking timeout for queue ${queueKey}. Auto-filling remaining seats with bots...`);
      const realPlayers = queueUserIds.map((id) => store.users[id]).filter(Boolean);
      store.matchmakingQueues[queueKey] = [];
      if (db) {
        realPlayers.forEach((p) => {
          db.collection("matchmaking").doc(p.id).delete().catch((err) => {
            console.error("Failed to delete matchmaking record from Firestore on auto-fill:", err);
          });
        });
      }
      const matchedList = [...realPlayers];
      const botAvatars = ["\u{1F916}", "\u{1F98A}", "\u26A1", "\u{1F451}"];
      const botNames = ["Dhili Master AI", "SomaliLudoBot", "LudoPro AI", "DesertFox AI", "NomadLudo AI"];
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
      const room = startMatchedRoom(matchedList, bet, cap, mode);
      realPlayers.forEach((p) => {
        sendEventToUser(p.id, "matchmaker_success", { roomId: room.id, room });
        broadcastToAll("matchmaker_seeking_cancelled", { senderId: p.id });
      });
      broadcastToAll("online_players_updated", {});
      saveStoreAndWait();
    }
  });
}, 2e3);
var authMiddleware = async (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID is required." });
  }
  const user = store.users[userId];
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: User not found." });
  }
  req.user = user;
  next();
};
var verifyFirebaseToken = async (req, res, next) => {
  if (!auth) {
    return res.status(500).json({ error: "Firebase Admin not configured on server." });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).json({ error: "Unauthorized: No token provided." });
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Error verifying Firebase ID token:", error);
    res.status(403).json({ error: "Unauthorized: Invalid token." });
  }
};
var checkVipStatus = (req, res, next) => {
  req.isVip = false;
  req.vipRakeDiscount = 0;
  if (req.user && req.user.uid) {
    const user = Object.values(store.users).find((u) => u.firebaseUid === req.user.uid);
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
app.get("/api/debug/firebase", async (req, res) => {
  if (!db) {
    return res.json({
      initialized: false,
      error: "Firebase Firestore db object is null. Check if firebase-admin-key.json exists."
    });
  }
  try {
    const testRef = db.collection("ludo_store").doc("debug_test");
    await testRef.set({ test: true, timestamp: Date.now() });
    const snap = await testRef.get();
    const data = snap.exists ? snap.data() : null;
    return res.json({
      initialized: true,
      writeAndReadSuccess: data?.test === true,
      data,
      projectId: getApp().options.projectId
    });
  } catch (err) {
    return res.json({
      initialized: true,
      error: err.message || err.toString(),
      stack: err.stack
    });
  }
});
app.get("/api/updates", (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId parameter" });
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  res.write(`:ok

`);
  res.write(`retry: 3000

`);
  const client = { userId, res };
  activeClients.push(client);
  const activeRoom = Object.values(store.rooms).find(
    (r) => r.status === "playing" && r.players.some((p) => p.userId === userId && p.status === "offline")
  );
  if (activeRoom) {
    const player = activeRoom.players.find((p) => p.userId === userId);
    if (player) {
      player.status = "online";
      player.inactivityTimer = 300;
      addLog(activeRoom, `\u{1F7E2} ${player.username} has reconnected! Welcome back.`);
      broadcastToRoom(activeRoom.id, "game_update", activeRoom);
      saveStore();
    }
  }
  res.write(`event: init
data: ${JSON.stringify({ status: "connected" })}

`);
  if (typeof res.flush === "function") {
    res.flush();
  }
  setTimeout(() => {
    for (const [qKey, queueUserIds] of Object.entries(store.matchmakingQueues)) {
      for (const seekingUserId of queueUserIds) {
        if (seekingUserId !== userId && store.users[seekingUserId]) {
          const seekingUser = store.users[seekingUserId];
          const parts = qKey.split("_");
          const seekingData = {
            senderId: seekingUser.id,
            username: seekingUser.username,
            avatar: seekingUser.avatar,
            betAmount: parseFloat(parts[0]) || 0,
            capacity: parseInt(parts[1]) || 2,
            gameMode: parts[2] || "solo",
            queueKey: qKey
          };
          res.write(`event: matchmaker_seeking
data: ${JSON.stringify(seekingData)}

`);
          if (typeof res.flush === "function") {
            res.flush();
          }
        }
      }
    }
  }, 500);
  req.on("close", () => {
    removeSSEClient(res);
  });
});
app.post("/api/auth/login", verifyFirebaseToken, checkVipStatus, async (req, res) => {
  const { username, email, avatar, promoCode } = req.body;
  const firebaseUid = req.user.uid;
  let foundUser = Object.values(store.users).find((u) => u.firebaseUid === firebaseUid);
  if (foundUser) {
    return res.json(foundUser);
  }
  if (email) {
    const userByEmail = Object.values(store.users).find((u) => u.email === email && !u.firebaseUid);
    if (userByEmail) {
      userByEmail.firebaseUid = firebaseUid;
      await saveStoreAndWait();
      return res.json(userByEmail);
    }
  }
  if (!username) {
    return res.status(400).json({ error: "Username is required for new registration" });
  }
  const cleanUsername = username.trim().substring(0, 20);
  let linkedAgentId = void 0;
  if (promoCode && typeof promoCode === "string" && promoCode.trim() !== "") {
    if (!db) {
      return res.status(503).json({ error: "Promo code validation is temporarily unavailable." });
    }
    const agentsRef = db.collection("agents");
    const agentSnapshot = await agentsRef.where("promoCode", "==", promoCode.trim()).limit(1).get();
    if (agentSnapshot.empty) {
      return res.status(400).json({ error: "Invalid or expired promo code." });
    }
    const agent = agentSnapshot.docs[0].data();
    linkedAgentId = agent.id;
  }
  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const newUser = {
    id: userId,
    firebaseUid,
    username: cleanUsername,
    email: email || void 0,
    avatar: avatar || "\u{1F338}",
    balance: 10,
    winCount: 0,
    lossCount: 0,
    linkedAgentId
    // Add the linked agent ID
  };
  store.users[userId] = newUser;
  addTransaction(userId, "deposit", 10, void 0, "Welcome signup bonus.");
  await saveStoreAndWait();
  res.json(newUser);
});
app.get("/api/users/leaderboard", (req, res) => {
  const allUsers = Object.values(store.users).filter((u) => !u.id.startsWith("user_sim_") && !u.id.startsWith("bot_"));
  allUsers.forEach((u) => {
    const userTransactions = store.transactions.filter((t) => t.userId === u.id);
    const totalWins = userTransactions.filter((t) => t.type === "win_payout").reduce((sum, t) => sum + t.amount, 0);
    const totalCommission = userTransactions.filter((t) => t.type === "app_commission").reduce((sum, t) => sum + t.amount, 0);
    u.earnings = totalWins - totalCommission;
  });
  const sorted = [...allUsers].sort((a, b) => {
    const aEarnings = a.earnings || 0;
    const bEarnings = b.earnings || 0;
    return bEarnings - aEarnings;
  }).slice(0, 5);
  let rank = 1;
  const result = sorted.map((u) => {
    return {
      rank: rank++,
      name: u.username,
      avatar: u.avatar || "\u{1F3AE}",
      wins: u.winCount || 0,
      earnings: u.earnings || 0
    };
  });
  res.json(result);
});
app.get("/api/users/online", async (req, res) => {
  const currentUserId = req.query.userId;
  if (!currentUserId) {
    return res.status(400).json({ error: "Missing userId parameter" });
  }
  cleanupMatchmakingQueues();
  if (db) {
    try {
      const qs = await db.collection("matchmaking").get();
      qs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.status === "WAITING_FOR_MATCH") {
          const qKey = `${data.betAmount}_${data.capacity}_${data.gameMode}`;
          if (!store.matchmakingQueues[qKey]) {
            store.matchmakingQueues[qKey] = [];
          }
          if (!store.matchmakingQueues[qKey].includes(data.userId)) {
            store.matchmakingQueues[qKey].push(data.userId);
            if (!store.users[data.userId]) {
              store.users[data.userId] = {
                id: data.userId,
                username: data.username,
                avatar: data.avatar,
                balance: 100,
                // Fallback
                winCount: 0,
                lossCount: 0,
                isOfflinePreference: false
              };
            }
            store.users[data.userId].seekingJoinedAt = data.timestamp || Date.now();
          }
        }
      });
    } catch (e) {
      console.error("Failed to sync matchmaking from Firestore:", e);
    }
  }
  const activeIds = new Set(activeClients.map((c) => c.userId));
  const onlineList = [];
  Object.values(store.users).forEach((u) => {
    if (u.id.startsWith("user_sim_")) return;
    const isConnected = activeIds.has(u.id);
    const inGame = Object.values(store.rooms).some(
      (r) => r.status === "playing" && r.players.some((p) => p.userId === u.id && p.status !== "left")
    );
    let status = "offline";
    let seekingDetails = null;
    for (const [qKey, queueUserIds] of Object.entries(store.matchmakingQueues)) {
      if (queueUserIds.includes(u.id)) {
        const parts = qKey.split("_");
        seekingDetails = {
          betAmount: parseFloat(parts[0]) || 0,
          capacity: parseInt(parts[1]) || 2,
          gameMode: parts[2] || "solo"
        };
        status = "seeking";
        break;
      }
    }
    if (status === "seeking") {
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
        seekingJoinedAt: u.seekingJoinedAt || Date.now()
      });
    }
  });
  onlineList.sort((a, b) => {
    if (a.status === "seeking" && b.status === "seeking") {
      return (b.seekingJoinedAt || 0) - (a.seekingJoinedAt || 0);
    }
    if (a.status === "seeking") return -1;
    if (b.status === "seeking") return 1;
    return 0;
  });
  res.json(onlineList);
});
app.get("/api/users/:userId", (req, res) => {
  const user = store.users[req.params.userId];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});
app.post("/api/users/:userId/update", async (req, res) => {
  const user = store.users[req.params.userId];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const { username, avatar, isOfflinePreference } = req.body;
  if (username) user.username = username.trim().substring(0, 20);
  if (avatar) user.avatar = avatar;
  if (typeof isOfflinePreference === "boolean") user.isOfflinePreference = isOfflinePreference;
  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  res.json(user);
});
app.post("/api/users/:userId/status", (req, res) => {
  const user = store.users[req.params.userId];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const { isOffline } = req.body;
  user.isOfflinePreference = !!isOffline;
  saveStore();
  broadcastUserUpdate(user.id);
  res.json({ success: true, isOfflinePreference: user.isOfflinePreference, user });
});
app.post("/api/wallet/deposit", (req, res) => {
  const { userId, amount } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  const depAmt = parseFloat(amount);
  if (isNaN(depAmt) || depAmt <= 0) {
    return res.status(400).json({ error: "Invalid deposit amount" });
  }
  user.balance += depAmt;
  addTransaction(userId, "deposit", depAmt, void 0, `Deposited funds via Simulated Net Banking.`);
  broadcastUserUpdate(userId);
  res.json({ success: true, balance: user.balance });
});
app.post("/api/wallet/withdraw", (req, res) => {
  const { userId, amount } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  const withAmt = parseFloat(amount);
  if (isNaN(withAmt) || withAmt <= 0) {
    return res.status(400).json({ error: "Invalid withdrawal amount" });
  }
  if (withAmt < 20) {
    return res.status(400).json({ error: "Minimum withdrawal amount is $20" });
  }
  if (user.balance < withAmt) {
    return res.status(400).json({ error: "Insufficient funds" });
  }
  user.balance -= withAmt;
  addTransaction(userId, "withdrawal", withAmt, void 0, `Withdrawn funds to bank account.`);
  broadcastUserUpdate(userId);
  res.json({ success: true, balance: user.balance });
});
app.post("/api/wallet/request-manual-confirmation", async (req, res) => {
  const { userId, agentId, amount, phone, senderPhone, provider, transactionType } = req.body;
  if (!userId || !agentId || !amount || !provider || !transactionType) {
    return res.status(400).json({ error: "Missing required fields. `userId`, `agentId`, `amount`, `provider`, and `transactionType` are all required." });
  }
  const user = store.users[userId];
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  if (user.linkedAgentId && user.linkedAgentId !== agentId) {
    return res.status(400).json({ error: "This account is locked to a specific agent. You can only transact with your assigned agent." });
  }
  if (transactionType === "withdraw" && !phone) {
    return res.status(400).json({ error: "Phone number is required for withdrawal requests." });
  }
  if (transactionType === "deposit" && !senderPhone) {
    return res.status(400).json({ error: "Sender phone number is required for deposit requests." });
  }
  if (db) {
    try {
      const agentDoc = await db.collection("agents").doc(agentId).get();
      if (!agentDoc.exists) {
        return res.status(404).json({ error: "The selected agent does not exist." });
      }
    } catch (err) {
      console.error("Failed to verify agent for manual transaction request:", err);
      return res.status(500).json({ error: "Could not verify the selected agent." });
    }
  }
  const newRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId,
    username: user.username,
    agentId,
    amount: parseFloat(amount),
    phone,
    // This will be the destination for withdrawals
    senderPhone,
    // This is the source number for deposits
    provider,
    transactionType,
    status: "pending",
    createdAt: Date.now()
  };
  store.pendingManualTransactions.unshift(newRequest);
  await saveStoreAndWait();
  res.json({ success: true, message: "Your request has been submitted for review." });
});
app.get("/api/wallet/transactions/:userId", (req, res) => {
  const txs = store.transactions.filter((t) => t.userId === req.params.userId);
  res.json(txs);
});
app.get("/api/payment/settings", (req, res) => {
  res.json(store.paymentProviders);
});
app.post("/api/wallet/process-api-payment", async (req, res) => {
  const { userId, amount, phone, senderPhone, provider, transactionType } = req.body;
  if (!userId || !amount || !provider || !transactionType) {
    return res.status(400).json({ error: "Missing required api payment fields." });
  }
  const providerKey = provider;
  const config = store.paymentProviders[providerKey];
  if (!config || !config.enabled || !config.apiKey) {
    return res.status(400).json({ error: "API is not configured for this provider." });
  }
  const user = store.users[userId];
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Invalid amount." });
  }
  if (transactionType === "withdraw") {
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required for withdrawal requests." });
    }
    if (user.balance < parsedAmount) {
      return res.status(400).json({ error: "Insufficient funds." });
    }
    user.balance -= parsedAmount;
    addTransaction(userId, "withdrawal", parsedAmount, void 0, `API withdrawal via ${providerKey}.`);
    broadcastUserUpdate(userId);
    await saveStoreAndWait();
    return res.json({ success: true, balance: user.balance, message: "Withdrawal processed via API." });
  }
  if (transactionType === "deposit") {
    if (!senderPhone) {
      return res.status(400).json({ error: "Sender phone number is required for deposit requests." });
    }
    user.balance += parsedAmount;
    addTransaction(userId, "deposit", parsedAmount, void 0, `API deposit via ${providerKey}.`);
    broadcastUserUpdate(userId);
    await saveStoreAndWait();
    return res.json({ success: true, balance: user.balance, message: "Deposit processed via API." });
  }
  return res.status(400).json({ error: "Unsupported transaction type." });
});
app.post("/api/vip/subscribe", verifyFirebaseToken, async (req, res) => {
  const { tier } = req.body;
  const firebaseUid = req.user.uid;
  const user = Object.values(store.users).find((u) => u.firebaseUid === firebaseUid);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  const vipTier = VIP_TIERS[tier];
  if (!vipTier) {
    return res.status(400).json({ error: "Invalid VIP tier specified." });
  }
  if (user.balance < vipTier.price) {
    return res.status(400).json({ error: "Insufficient funds to purchase this VIP subscription." });
  }
  user.balance -= vipTier.price;
  const startDate = Date.now();
  const endDate = startDate + vipTier.durationMonths * 30 * 24 * 60 * 60 * 1e3;
  user.vip = {
    tier,
    expires: endDate
  };
  addTransaction(user.id, "app_commission", vipTier.price, void 0, `VIP Subscription (${vipTier.name}) purchase.`);
  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  res.json({ success: true, user, message: `Successfully subscribed to ${vipTier.name} VIP!` });
});
app.get("/api/tournaments", (req, res) => {
  seedDefaultTournaments();
  const { status } = req.query;
  const allTournaments = Object.values(store.tournaments);
  if (status && typeof status === "string" && status !== "all") {
    return res.json(allTournaments.filter((t) => t.status === status));
  }
  allTournaments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(allTournaments);
});
app.get("/api/tournaments/:id", (req, res) => {
  const { id } = req.params;
  const tournament = store.tournaments[id];
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  res.json(tournament);
});
app.post("/api/tournaments/:id/register", verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const firebaseUid = req.user.uid;
  const user = Object.values(store.users).find((u) => u.firebaseUid === firebaseUid);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  const tournament = store.tournaments[id];
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  if (tournament.status !== "registration_open") {
    return res.status(400).json({ error: "Tournament is not open for registration." });
  }
  if (user.balance < tournament.entryFee) {
    return res.status(400).json({ error: "Insufficient funds to register for this tournament." });
  }
  if (tournament.players.length >= tournament.maxPlayers) {
    return res.status(400).json({ error: "Tournament is already full." });
  }
  if (tournament.players.some((p) => p.userId === user.id)) {
    return res.status(400).json({ error: "You are already registered for this tournament." });
  }
  user.balance -= tournament.entryFee;
  addTransaction(user.id, "bet_escrow_locked", tournament.entryFee, id, `Tournament entry fee for "${tournament.name}".`);
  tournament.players.push({
    userId: user.id,
    username: user.username,
    avatar: user.avatar
  });
  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  broadcastToAll("tournament_update", tournament);
  res.json({ success: true, tournament, message: `Successfully registered for ${tournament.name}!` });
});
app.post("/api/tournaments/:id/unregister", verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const firebaseUid = req.user.uid;
  const user = Object.values(store.users).find((u) => u.firebaseUid === firebaseUid);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  const tournament = store.tournaments[id];
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  if (tournament.status !== "registration_open") {
    return res.status(400).json({ error: "Cannot unregister after tournament has started or finished." });
  }
  const playerIndex = tournament.players.findIndex((p) => p.userId === user.id);
  if (playerIndex === -1) {
    return res.status(400).json({ error: "You are not registered for this tournament." });
  }
  tournament.players.splice(playerIndex, 1);
  if (tournament.entryFee > 0) {
    user.balance += tournament.entryFee;
    addTransaction(user.id, "deposit", tournament.entryFee, id, `Refund for unregistering from tournament "${tournament.name}".`);
  }
  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  broadcastToAll("tournament_update", tournament);
  res.json({ success: true, tournament, message: `Unregistered from ${tournament.name}. Entry fee refunded.` });
});
async function handleTournamentMatchWin(tournamentId, matchId, winnerId) {
  const tournament = store.tournaments[tournamentId];
  if (!tournament) return;
  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) return;
  match.winnerId = winnerId;
  match.status = "completed";
  const allMatchesInRoundComplete = tournament.matches.filter((m) => m.round === tournament.currentRound).every((m) => m.status === "completed");
  if (allMatchesInRoundComplete) {
    const winners = tournament.matches.filter((m) => m.round === tournament.currentRound).map((m) => m.winnerId).filter((id) => id !== null).map((id) => tournament.players.find((p) => p.userId === id)).filter((p) => p !== void 0);
    if (winners.length === 1) {
      tournament.winnerId = winners[0].userId;
      tournament.status = "completed";
      tournament.endDate = Date.now();
      const winnerUser = store.users[winners[0].userId];
      if (winnerUser) {
        winnerUser.balance += tournament.prizePool;
        addTransaction(winnerUser.id, "win_payout", tournament.prizePool, tournament.id, `Tournament "${tournament.name}" prize.`);
        broadcastUserUpdate(winnerUser.id);
      }
      broadcastToAll("tournament_ended", tournament);
    } else {
      tournament.currentRound++;
      const nextRoundMatches = [];
      for (let i = 0; i < winners.length; i += 2) {
        const nextMatch = {
          id: `tm_${tournament.id}_r${tournament.currentRound}_${i / 2}`,
          tournamentId: tournament.id,
          round: tournament.currentRound,
          player1: winners[i],
          player2: winners[i + 1] || null,
          winnerId: winners[i + 1] ? null : winners[i].userId,
          roomId: null,
          status: winners[i + 1] ? "pending" : "completed"
        };
        nextRoundMatches.push(nextMatch);
      }
      tournament.matches.push(...nextRoundMatches);
      for (const nextMatch of nextRoundMatches) {
        if (nextMatch.status === "pending" && nextMatch.player1 && nextMatch.player2) {
          const player1Profile = store.users[nextMatch.player1.userId];
          const player2Profile = store.users[nextMatch.player2.userId];
          if (!player1Profile || !player2Profile) {
            console.error(`Error: Could not find full user profile for tournament match players. Match ID: ${nextMatch.id}`);
            continue;
          }
          const room = startMatchedRoom(
            [
              { id: player1Profile.id, username: player1Profile.username, avatar: player1Profile.avatar, balance: player1Profile.balance, winCount: player1Profile.winCount, lossCount: player1Profile.lossCount },
              { id: player2Profile.id, username: player2Profile.username, avatar: player2Profile.avatar, balance: player2Profile.balance, winCount: player2Profile.winCount, lossCount: player2Profile.lossCount }
            ],
            0,
            2,
            "solo"
          );
          nextMatch.roomId = room.id;
          nextMatch.status = "in_progress";
          room.tournamentDetails = { tournamentId: tournament.id, matchId: nextMatch.id };
        }
      }
      broadcastToAll("tournament_update", tournament);
    }
  }
  await saveStoreAndWait();
}
function createTournamentBracket(tournament) {
  const players = [...tournament.players];
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  const matches = [];
  for (let i = 0; i < players.length; i += 2) {
    const match = {
      id: `tm_${tournament.id}_r1_${i / 2}`,
      tournamentId: tournament.id,
      round: 1,
      player1: players[i],
      player2: players[i + 1] || null,
      // Handle odd number of players (give a bye)
      winnerId: players[i + 1] ? null : players[i].userId,
      // If bye, player1 is winner
      roomId: null,
      status: players[i + 1] ? "pending" : "completed"
    };
    matches.push(match);
  }
  return matches;
}
function checkAndStartTournaments() {
  const now = Date.now();
  seedDefaultTournaments();
  Object.values(store.tournaments).forEach(async (t) => {
    if (t.status === "registration_open" && now >= t.startDate) {
      if (t.players.length >= 2) {
        t.status = "in_progress";
        t.matches = createTournamentBracket(t);
        t.currentRound = 1;
        for (const match of t.matches) {
          if (match.status === "pending" && match.player1 && match.player2) {
            const room = startMatchedRoom(
              [
                { id: match.player1.userId, username: match.player1.username, avatar: match.player1.avatar, balance: 0 },
                { id: match.player2.userId, username: match.player2.username, avatar: match.player2.avatar, balance: 0 }
              ],
              0,
              // No extra bet for tournament matches
              2,
              "solo"
            );
            match.roomId = room.id;
            match.status = "in_progress";
            room.tournamentDetails = { tournamentId: t.id, matchId: match.id };
          }
        }
        await saveStoreAndWait();
        broadcastToAll("tournament_started", t);
      } else {
        t.startDate = now + 12 * 60 * 60 * 1e3;
        await saveStoreAndWait();
        broadcastToAll("tournament_update", t);
      }
    }
  });
}
setInterval(checkAndStartTournaments, 1e4);
app.get("/api/rooms/active", (req, res) => {
  const activeGames = Object.values(store.rooms).filter((r) => r.status === "playing").map((r) => ({
    id: r.id,
    // Changed from roomId to id to match GameRoom type
    players: r.players.map((p) => ({
      userId: p.userId,
      // Added userId
      username: p.username,
      avatar: p.avatar
    })),
    betAmount: r.betAmount,
    gameMode: r.gameMode,
    capacity: r.capacity
  }));
  res.json(activeGames);
});
app.post("/api/rooms/:roomId/spectate", (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "User ID is required." });
  }
  const room = store.rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: "Room not found." });
  }
  const client = activeClients.find((c) => c.userId === userId);
  if (client) {
    client.spectatingRoomId = roomId;
    console.log(`User ${userId} is now spectating room ${roomId}`);
  }
  broadcastToRoom(roomId, "game_update", room);
  res.json({ success: true, message: "Spectating started." });
});
app.post("/api/rooms/:roomId/stop-spectating", (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "User ID is required." });
  }
  const room = store.rooms[roomId];
  if (!room) {
    const client2 = activeClients.find((c) => c.userId === userId && c.spectatingRoomId === roomId);
    if (client2) {
      client2.spectatingRoomId = void 0;
    }
    return res.json({ success: true, message: "Stopped spectating a room that no longer exists." });
  }
  const client = activeClients.find((c) => c.userId === userId && c.spectatingRoomId === roomId);
  if (client) {
    client.spectatingRoomId = void 0;
    console.log(`User ${userId} stopped spectating room ${roomId}`);
  }
  broadcastToRoom(roomId, "game_update", room);
  res.json({ success: true, message: "Stopped spectating." });
});
app.post("/api/rooms/create", (req, res) => {
  const { userId, betAmount, capacity, gameMode } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  const bet = parseFloat(betAmount);
  if (user.balance < bet) {
    return res.status(400).json({ error: "Insufficient wallet balance for this bet amount." });
  }
  const selectedMode = gameMode === "team" ? "team" : "solo";
  const selectedCapacity = selectedMode === "team" ? 4 : parseInt(capacity) || 2;
  const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
  const newPlayer = {
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    color: selectedCapacity === 2 && selectedMode === "solo" ? "green" : "red",
    // Host is Green for 2-player solo, Red for others
    isHost: true,
    isReady: true,
    status: "online",
    winCount: user.winCount,
    lossCount: user.lossCount,
    balance: user.balance
  };
  const newRoom = {
    id: roomId,
    status: "waiting",
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
      logs: [{ id: "1", timestamp: Date.now(), text: `Room created by ${user.username}. Code: ${roomId} (${selectedMode === "team" ? "Team 2v2" : "Solo " + selectedCapacity + "P"})` }],
      chat: [],
      lastActivity: Date.now()
    },
    createdAt: Date.now()
  };
  store.rooms[roomId] = newRoom;
  saveStore();
  res.json(newRoom);
});
app.post("/api/rooms/join", (req, res) => {
  const { userId, roomCode } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  const code = (roomCode || "").trim().toUpperCase();
  const room = store.rooms[code];
  if (!room) {
    return res.status(404).json({ error: "Room code not found." });
  }
  if (room.players.some((p) => p.userId === userId)) {
    return res.json(room);
  }
  if (room.pendingPlayers && room.pendingPlayers.some((p) => p.userId === userId)) {
    return res.json(room);
  }
  if (room.status !== "waiting") {
    return res.status(400).json({ error: "Match has already started or been completed." });
  }
  const maxPlayers = room.capacity || 2;
  if (room.players.length >= maxPlayers) {
    return res.status(400).json({ error: `Room is already full at ${maxPlayers} capacity.` });
  }
  if (user.balance < room.betAmount) {
    return res.status(400).json({ error: `You need at least $${room.betAmount} in your wallet to join this room.` });
  }
  const newPendingPlayer = {
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    color: "green",
    // Assign color on host approval
    isHost: false,
    isReady: false,
    status: "online",
    winCount: user.winCount || 0,
    lossCount: user.lossCount || 0,
    balance: user.balance || 0
  };
  if (!room.pendingPlayers) room.pendingPlayers = [];
  room.pendingPlayers.push(newPendingPlayer);
  addLog(room, `\u{1F514} Challenger ${user.username} is requesting to join the match. Waiting for host approval!`);
  saveStore();
  broadcastToRoom(room.id, "game_update", room);
  res.json(room);
});
app.get("/api/rooms/check-status/:roomId", (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }
  const room = store.rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  if (room.status !== "playing") {
    return res.status(409).json({ error: "Game is not in a rejoinable state (e.g., waiting or completed).", room });
  }
  const playerInRoom = room.players.find((p) => p.userId === userId && p.status !== "left");
  if (!playerInRoom) {
    return res.status(403).json({ error: "You are not a player in this game" });
  }
  res.json(room);
});
app.get("/api/rooms/:roomId", (req, res) => {
  const { roomId } = req.params;
  const room = store.rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: "Room not found." });
  }
  res.json(room);
});
app.get("/api/agents", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const playerLocation = req.query.location;
  try {
    const agentsSnapshot = await db.collection("agents").where("status", "==", "Active").get();
    const activeAgents = agentsSnapshot.docs.map((doc) => {
      const { password, ...agentData } = doc.data();
      return agentData;
    });
    if (playerLocation) {
      const localAgents = activeAgents.filter((agent) => agent.location && agent.location.toLowerCase() === playerLocation.toLowerCase());
      const otherAgents = activeAgents.filter((agent) => !agent.location || agent.location.toLowerCase() !== playerLocation.toLowerCase());
      res.json([...localAgents, ...otherAgents]);
    } else {
      res.json(activeAgents);
    }
  } catch (error) {
    console.error("Failed to get active agents:", error);
    res.status(500).json({ error: "Failed to retrieve active agents." });
  }
});
app.post("/api/request-to-agent", authMiddleware, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const player = req.user;
  const { agentId, amount, type, playerPhone, provider } = req.body;
  const requestAmount = parseFloat(amount);
  if (player.linkedAgentId && player.linkedAgentId !== agentId) {
    return res.status(400).json({ error: "This account is locked to a specific agent. You can only transact with your assigned agent." });
  }
  if (!agentId || !requestAmount || requestAmount <= 0 || !["deposit", "withdrawal"].includes(type) || !playerPhone || !provider) {
    return res.status(400).json({ error: "Missing or invalid parameters. Requires agentId, amount, type, playerPhone, and provider." });
  }
  if (type === "withdrawal" && player.balance < requestAmount) {
    return res.status(400).json({ error: "Insufficient balance for this withdrawal request." });
  }
  try {
    const agentDoc = await db.collection("agents").doc(agentId).get();
    if (!agentDoc.exists) {
      return res.status(404).json({ error: "The selected agent does not exist." });
    }
    const requestRef = db.collection("playerAgentRequests").doc();
    const newRequest = {
      id: requestRef.id,
      playerId: player.id,
      playerUsername: player.username,
      playerAvatar: player.avatar,
      agentId,
      playerPhone,
      provider,
      type,
      amount: requestAmount,
      status: "pending",
      createdAt: Date.now()
    };
    await requestRef.set(newRequest);
    res.status(201).json({ success: true, message: "Your request has been sent to the agent.", request: newRequest });
  } catch (error) {
    console.error(`Player ${player.id} failed to create request to agent ${agentId}:`, error);
    res.status(500).json({ error: "An internal server error occurred while submitting your request." });
  }
});
function startMatchedRoom(matchedUsers, bet, cap, mode) {
  const roomId = `MATCH_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  let colors;
  if (cap === 2 && mode === "solo") {
    colors = ["green", "blue"];
  } else {
    colors = ["red", "green", "yellow", "blue"];
  }
  const players = matchedUsers.map((u, index) => ({
    userId: u.id,
    username: u.username,
    avatar: u.avatar,
    color: colors[index] || "red",
    isHost: index === 0,
    isReady: true,
    status: "online",
    winCount: u.winCount || 0,
    lossCount: u.lossCount || 0,
    balance: u.balance || 0
  }));
  let totalEscrow = 0;
  players.forEach((p) => {
    if (!isBotPlayer(p.userId)) {
      const u = store.users[p.userId];
      if (u) {
        u.balance = Math.max(0, u.balance - bet);
        addTransaction(p.userId, "bet_escrow_locked", bet, roomId, `Escrow stake for Ludo Match ${roomId}.`);
        broadcastUserUpdate(p.userId);
      }
    }
    totalEscrow += bet;
  });
  const tokens = [];
  players.forEach((p) => {
    tokens.push(...createInitialTokens(p.userId, p.color));
  });
  const newRoom = {
    id: roomId,
    status: "playing",
    // Starts immediately
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
        { id: "1", timestamp: Date.now(), text: `Match found! Mode: ${mode === "team" ? "Partnership 2v2" : "Solo " + cap + "P"}` },
        { id: "2", timestamp: Date.now(), text: `Stake of $${bet} locked in secure escrow pool ($${totalEscrow.toFixed(2)})` }
      ],
      chat: [],
      lastActivity: Date.now()
    },
    createdAt: Date.now()
  };
  store.rooms[roomId] = newRoom;
  saveStore();
  players.forEach((p) => {
    if (!isBotPlayer(p.userId)) {
      sendEventToUser(p.userId, "matchmaker_success", { roomId: newRoom.id, room: newRoom });
      broadcastToAll("matchmaker_seeking_cancelled", { senderId: p.userId });
    }
  });
  broadcastToAll("online_players_updated", {});
  return newRoom;
}
app.post("/api/rooms/matchmaking/enter-queue", (req, res) => {
  try {
    const { userId, betAmount, capacity, gameMode } = req.body;
    const user = store.users[userId];
    if (!user) return res.status(404).json({ error: "User not found" });
    cleanupMatchmakingQueues();
    const bet = parseFloat(betAmount);
    if (user.balance < bet) {
      return res.status(400).json({ error: "Insufficient balance to match stake." });
    }
    const cap = parseInt(capacity) || 2;
    const mode = gameMode === "team" ? "team" : "solo";
    const queueKey = `${bet}_${cap}_${mode}`;
    if (!store.matchmakingQueues[queueKey]) {
      store.matchmakingQueues[queueKey] = [];
    }
    if (store.matchmakingQueues[queueKey].includes(userId)) {
      broadcastToAll("matchmaker_seeking", {
        senderId: user.id,
        username: user.username,
        avatar: user.avatar,
        betAmount: bet,
        capacity: cap,
        gameMode: mode,
        queueKey
      });
      return res.json({ status: "queued", message: "Already in queue" });
    }
    user.seekingJoinedAt = Date.now();
    store.matchmakingQueues[queueKey].push(userId);
    if (db) {
      db.collection("matchmaking").doc(userId).set({
        userId,
        username: user.username,
        avatar: user.avatar,
        betAmount: bet,
        capacity: cap,
        gameMode: mode,
        status: "WAITING_FOR_MATCH",
        timestamp: Date.now()
      }).catch((err) => {
        console.error("Failed to write matchmaking record to Firestore:", err);
      });
    }
    broadcastToAll("matchmaker_seeking", {
      senderId: user.id,
      username: user.username,
      avatar: user.avatar,
      betAmount: bet,
      capacity: cap,
      gameMode: mode,
      queueKey
    });
    broadcastToAll("online_players_updated", {});
    saveStore();
    res.json({ status: "queued", message: "Looking for real online opponent..." });
  } catch (error) {
    console.error("!!! UNHANDLED ERROR in /enter-queue:", error);
    res.status(500).json({ error: "An unexpected server error occurred.", details: error.message });
  }
});
app.post("/api/rooms/matchmaking/join", (req, res) => {
  const { userId, betAmount, capacity, gameMode, opponentId } = req.body;
  if (!opponentId) {
    return res.status(400).json({ error: "This endpoint is for direct challenges only. opponentId is required." });
  }
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  const oppUser = store.users[opponentId];
  if (!oppUser) return res.status(404).json({ error: "Opponent not found" });
  cleanupMatchmakingQueues();
  const bet = parseFloat(betAmount);
  if (user.balance < bet) {
    return res.status(400).json({ error: "Insufficient balance to match stake." });
  }
  const cap = parseInt(capacity) || 2;
  const mode = gameMode === "team" ? "team" : "solo";
  for (const qKey of Object.keys(store.matchmakingQueues)) {
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter((id) => id !== userId && id !== opponentId);
  }
  if (store.users[userId]) delete store.users[userId].seekingJoinedAt;
  if (store.users[opponentId]) delete store.users[opponentId].seekingJoinedAt;
  if (db) {
    db.collection("matchmaking").doc(userId).delete().catch((err) => console.error("Failed to delete matchmaking record from Firestore for user:", err));
    db.collection("matchmaking").doc(opponentId).delete().catch((err) => console.error("Failed to delete matchmaking record from Firestore for opponent:", err));
  }
  const matchedList = [user, oppUser];
  const finalCapacity = 2;
  const finalMode = "solo";
  const room = startMatchedRoom(matchedList, bet, finalCapacity, finalMode);
  matchedList.forEach((p) => {
    if (!isBotPlayer(p.id)) {
      sendEventToUser(p.id, "matchmaker_success", { roomId: room.id, room });
      broadcastToAll("matchmaker_seeking_cancelled", { senderId: p.id });
    }
  });
  broadcastToAll("online_players_updated", {});
  saveStore();
  return res.json({ matched: true, roomId: room.id, room });
});
app.post("/api/rooms/create-bot-room", (req, res) => {
  const { userId, betAmount, capacity, gameMode } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  const bet = parseFloat(betAmount) || 0;
  if (user.balance < bet) {
    return res.status(400).json({ error: "Insufficient wallet balance for this stake." });
  }
  const cap = parseInt(capacity) || 2;
  const mode = gameMode === "team" ? "team" : "solo";
  const matchedList = [user];
  const botAvatars = ["\u{1F916}", "\u{1F98A}", "\u26A1", "\u{1F451}"];
  const botNames = ["LudoMaster AI", "SpeedyBot", "ProLudo AI", "ZenBot"];
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
app.post("/api/rooms/matchmaking/leave", (req, res) => {
  const { userId } = req.body;
  if (userId) {
    if (store.users[userId]) {
      delete store.users[userId].seekingJoinedAt;
    }
    for (const qKey of Object.keys(store.matchmakingQueues)) {
      store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter((id) => id !== userId);
    }
    saveStore();
    broadcastToAll("matchmaker_seeking_cancelled", { senderId: userId });
    if (db) {
      db.collection("matchmaking").doc(userId).delete().catch((err) => {
        console.error("Failed to delete matchmaking record from Firestore on leave:", err);
      });
    }
  }
  res.json({ success: true });
});
app.post("/api/rooms/voice-signaling", (req, res) => {
  const { roomId, senderId, targetId, signal } = req.body;
  if (!roomId || !senderId || !targetId || !signal) {
    return res.status(400).json({ error: "Missing required signaling fields" });
  }
  sendEventToUser(targetId, "voice_signal", {
    roomId,
    senderId,
    signal
  });
  res.json({ success: true });
});
app.post("/api/rooms/challenge/invite", (req, res) => {
  const { senderId, receiverId, betAmount, capacity, gameMode } = req.body;
  const sender = store.users[senderId];
  if (!sender) return res.status(404).json({ error: "Sender user not found." });
  const bet = parseFloat(betAmount) || 0;
  if (sender.balance < bet) {
    return res.status(400).json({ error: `Insufficient wallet balance for $${bet} bet.` });
  }
  const selectedMode = gameMode === "team" ? "team" : "solo";
  const selectedCapacity = selectedMode === "team" ? 4 : parseInt(capacity) || 2;
  if (receiverId.startsWith("sim_") || receiverId.startsWith("bot_")) {
    const receiverUser2 = {
      id: receiverId,
      username: receiverId.includes("1") ? "Kaptan_Ludo \u{1F451}" : receiverId.includes("2") ? "SomaliGamer_252" : receiverId.includes("3") ? "Pro_Dice_Master" : "Speedy_Runner",
      avatar: receiverId.includes("1") ? "\u{1F981}" : receiverId.includes("2") ? "\u26A1" : receiverId.includes("3") ? "\u{1F98A}" : "\u{1F409}",
      winCount: 20,
      lossCount: 8,
      balance: 100
    };
    const matchedList = [sender, receiverUser2];
    const botAvatars = ["\u{1F916}", "\u{1F98A}", "\u26A1", "\u{1F451}"];
    const botNames = ["LudoMaster AI", "SpeedyBot", "ProLudo AI", "ZenBot"];
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
  const roomId = `INV_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const hostPlayer = {
    userId: sender.id,
    username: sender.username,
    avatar: sender.avatar,
    color: "red",
    isHost: true,
    isReady: true,
    status: "online",
    winCount: sender.winCount,
    lossCount: sender.lossCount,
    balance: sender.balance
  };
  const newRoom = {
    id: roomId,
    status: "waiting",
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
      logs: [{ id: "1", timestamp: Date.now(), text: `Challenge lobby created by ${sender.username}. Bet: $${bet}` }],
      chat: [],
      lastActivity: Date.now()
    },
    createdAt: Date.now()
  };
  store.rooms[roomId] = newRoom;
  for (const qKey of Object.keys(store.matchmakingQueues)) {
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter((id) => id !== senderId && id !== receiverId);
  }
  if (db) {
    db.collection("matchmaking").doc(senderId).delete().catch((err) => console.error("Failed to delete sender from matchmaking on challenge:", err));
    db.collection("matchmaking").doc(receiverId).delete().catch((err) => console.error("Failed to delete receiver from matchmaking on challenge:", err));
  }
  broadcastToAll("matchmaker_seeking_cancelled", { senderId });
  broadcastToAll("matchmaker_seeking_cancelled", { senderId: receiverId });
  saveStore();
  sendEventToUser(receiverId, "game_invite", {
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
app.post("/api/rooms/challenge/accept", (req, res) => {
  const { userId, roomId } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Challenge lobby no longer exists." });
  if (room.players.length >= (room.capacity || 2)) {
    return res.status(400).json({ error: "Room is already full." });
  }
  if (user.balance < room.betAmount) {
    return res.status(400).json({ error: `Insufficient wallet balance to accept this $${room.betAmount} match.` });
  }
  const colors = ["red", "green", "yellow", "blue"];
  const occupiedColors = room.players.map((p) => p.color);
  const assignedColor = colors.find((c) => !occupiedColors.includes(c)) || "green";
  const newPlayer = {
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    color: assignedColor,
    isHost: false,
    isReady: true,
    status: "online",
    winCount: user.winCount,
    lossCount: user.lossCount,
    balance: user.balance
  };
  room.players.push(newPlayer);
  addLog(room, `\u2694\uFE0F ${user.username} accepted the challenge and joined the room.`);
  saveStore();
  const hostId = room.players.find((p) => p.isHost)?.userId;
  if (hostId) {
    sendEventToUser(hostId, "game_invite_accepted", { roomId });
  }
  res.json({ success: true, roomId });
});
app.post("/api/rooms/challenge/decline", (req, res) => {
  const { userId, roomId } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  const room = store.rooms[roomId];
  if (room) {
    const hostId = room.players.find((p) => p.isHost)?.userId;
    if (hostId) {
      sendEventToUser(hostId, "game_invite_declined", { receiverName: user.username });
    }
    delete store.rooms[roomId];
    saveStore();
  }
  res.json({ success: true });
});
app.post("/api/rooms/ready", (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const p = room.players.find((p2) => p2.userId === userId);
  if (!p) return res.status(404).json({ error: "Player not in room" });
  p.isReady = !p.isReady;
  addLog(room, `${p.username} is ${p.isReady ? "READY" : "NOT READY"}.`);
  saveStore();
  broadcastToRoom(room.id, "game_update", room);
  res.json(room);
});
app.post("/api/rooms/add-bot", (req, res) => {
  const { roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.players.length >= 4) {
    return res.status(400).json({ error: "Room is already full." });
  }
  const botNames = ["DeepBlue", "AlphaGo", "ChessMaster", "LudoAI", "LudoKing", "Siri", "Alexa"];
  const name = botNames[Math.floor(Math.random() * botNames.length)] + `_${Math.floor(Math.random() * 100)}`;
  const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const colors = ["red", "green", "yellow", "blue"];
  const occupiedColors = room.players.map((p) => p.color);
  const color = colors.find((c) => !occupiedColors.includes(c)) || "green";
  const botPlayer = {
    userId: botId,
    username: `\u{1F916} ${name}`,
    avatar: "\u{1F916}",
    color,
    isHost: false,
    isReady: true,
    status: "online"
  };
  room.players.push(botPlayer);
  addLog(room, `Bot ${botPlayer.username} joined the match.`);
  saveStore();
  broadcastToRoom(room.id, "game_update", room);
  res.json(room);
});
app.post("/api/rooms/start", (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const p = room.players.find((p2) => p2.userId === userId);
  if (!p || !p.isHost) {
    return res.status(403).json({ error: "Only the host can start the match." });
  }
  if (room.players.length < 2) {
    return res.status(400).json({ error: "Ugu yaraan 2 ciyaartoy ayaa loo baahan yahay si ciyaartu u bilaabato." });
  }
  room.capacity = room.players.length;
  let colorsToAssign;
  if (room.players.length === 2 && room.gameMode === "solo") {
    colorsToAssign = ["red", "yellow"];
    const host = room.players.find((p2) => p2.isHost);
    const guest = room.players.find((p2) => !p2.isHost);
    if (host) host.color = "red";
    if (guest) guest.color = "yellow";
  } else {
    colorsToAssign = ["red", "green", "yellow", "blue"];
    room.players.forEach((pl, idx) => {
      pl.color = colorsToAssign[idx] || "red";
    });
  }
  room.players.forEach((pl, idx) => {
    pl.isReady = true;
    if (!pl.color) {
      pl.color = colorsToAssign[idx] || "red";
    }
  });
  const bet = room.betAmount;
  let success = true;
  room.players.forEach((pl) => {
    if (!isBotPlayer(pl.userId)) {
      const user = store.users[pl.userId];
      if (!user || user.balance < bet) {
        success = false;
      }
    }
  });
  if (!success) {
    return res.status(400).json({ error: "Nus ama mid ka mid ah ciyaartoyda kuma filna baaqiga wallet-kiisa bet-kan." });
  }
  let totalEscrow = 0;
  room.players.forEach((pl) => {
    if (!isBotPlayer(pl.userId)) {
      const user = store.users[pl.userId];
      user.balance -= bet;
      addTransaction(pl.userId, "bet_escrow_locked", bet, room.id, `Escrow lock for Match ${room.id}`);
      broadcastUserUpdate(pl.userId);
    }
    totalEscrow += bet;
  });
  const tokens = [];
  room.players.forEach((pl) => {
    tokens.push(...createInitialTokens(pl.userId, pl.color));
  });
  room.status = "playing";
  room.gameState.tokens = tokens;
  room.gameState.escrowBalance = totalEscrow;
  room.gameState.turn = 0;
  room.gameState.turnTimer = 30;
  addLog(room, `\u2694\uFE0F Ciyaartu waa ay bilaabatay! Ciyaartoyda: ${room.players.length}. Bet: $${bet}. Escrow Locked: $${totalEscrow}`);
  saveStore();
  broadcastToRoom(room.id, "game_update", room);
  res.json(room);
});
app.post("/api/rooms/roll-dice", (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.status !== "playing") return res.status(400).json({ error: "Game is not in playing state." });
  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];
  if (activePlayer) activePlayer.inactivityTimer = 300;
  gs.turnTimer = 30;
  if (!activePlayer || activePlayer.userId !== userId) {
    return res.status(403).json({ error: "It is not your turn to roll!" });
  }
  if (gs.hasRolled) {
    return res.status(400).json({ error: "You have already rolled the dice!" });
  }
  const d = Math.floor(Math.random() * 6) + 1;
  gs.diceRoll = d;
  gs.lastDiceRoll = d;
  gs.hasRolled = true;
  addLog(room, `\u{1F3B2} ${activePlayer.username} rolled a ${d}!`);
  if (d === 6) {
    gs.consecutiveSixes = (gs.consecutiveSixes || 0) + 1;
  } else {
    gs.consecutiveSixes = 0;
  }
  if (gs.consecutiveSixes === 3) {
    addLog(room, `\u26A0\uFE0F Triple 6 Penalty! ${activePlayer.username} rolled three 6s in a row. Turn forfeited!`);
    gs.consecutiveSixes = 0;
    gs.diceRoll = null;
    gs.hasRolled = false;
    advanceTurn(room);
    saveStore();
    broadcastToRoom(room.id, "game_update", room);
    executeBotTurnIfActive(room);
    return res.json(room);
  }
  const playerTokens = gs.tokens.filter((t) => t.color === activePlayer.color);
  const validTokens = playerTokens.filter((t) => isMoveValid(t, d));
  if (validTokens.length === 0) {
    addLog(room, `${activePlayer.username} has no valid moves with roll ${d}. Turn passes.`);
    saveStore();
    broadcastToRoom(room.id, "game_update", room);
    res.json(room);
    setTimeout(() => {
      const currentRoom = store.rooms[roomId];
      if (currentRoom && currentRoom.status === "playing") {
        advanceTurn(currentRoom);
        saveStore();
        broadcastToRoom(currentRoom.id, "game_update", currentRoom);
        executeBotTurnIfActive(currentRoom);
      }
    }, 1500);
  } else {
    saveStore();
    broadcastToRoom(room.id, "game_update", room);
    res.json(room);
  }
});
app.post("/api/rooms/move-token", (req, res) => {
  const { userId, roomId, tokenId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.status !== "playing") return res.status(400).json({ error: "Game is not playing." });
  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];
  if (activePlayer) activePlayer.inactivityTimer = 300;
  gs.turnTimer = 30;
  if (!activePlayer || activePlayer.userId !== userId) {
    return res.status(403).json({ error: "It is not your turn!" });
  }
  if (!gs.hasRolled || gs.diceRoll === null) {
    return res.status(400).json({ error: "You must roll the dice first!" });
  }
  const token = gs.tokens.find((t) => t.id === tokenId);
  if (!token || token.color !== activePlayer.color) {
    return res.status(400).json({ error: "Invalid token selected." });
  }
  if (!isMoveValid(token, gs.diceRoll)) {
    return res.status(400).json({ error: "This token cannot make a valid move with the current roll." });
  }
  moveTokenLogic(room, tokenId, gs.diceRoll);
  broadcastToRoom(room.id, "game_update", room);
  executeBotTurnIfActive(room);
  res.json(room);
});
app.post("/api/rooms/chat", (req, res) => {
  const { userId, roomId, text } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const player = room.players.find((pl) => pl.userId === userId);
  const spectator = activeClients.find((c) => c.userId === userId && c.spectatingRoomId === roomId);
  if (!player && !spectator) {
    return res.status(403).json({ error: "You are not in this room as a player or spectator." });
  }
  const cleanText = (text || "").trim().substring(0, 100);
  if (cleanText.length > 0) {
    const senderName = player ? player.username : store.users[userId]?.username || "Spectator";
    const chatMsg = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      senderId: userId,
      senderName,
      text: cleanText,
      timestamp: Date.now(),
      isSpectator: !player
      // Mark as spectator message if not a player
    };
    room.gameState.chat.push(chatMsg);
    if (room.gameState.chat.length > 30) {
      room.gameState.chat.shift();
    }
    saveStore();
    broadcastToRoom(room.id, "game_update", room);
  }
  res.json(room);
});
app.post("/api/rooms/accept-player", (req, res) => {
  const { userId, roomId, challengerId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const host = room.players.find((p) => p.userId === userId);
  if (!host || !host.isHost) {
    return res.status(403).json({ error: "Only the host can accept players." });
  }
  if (!room.pendingPlayers) room.pendingPlayers = [];
  const idx = room.pendingPlayers.findIndex((p) => p.userId === challengerId);
  if (idx === -1) {
    return res.status(404).json({ error: "Challenger not found in pending list." });
  }
  const challenger = room.pendingPlayers.splice(idx, 1)[0];
  const colors = ["red", "green", "yellow", "blue"];
  const occupiedColors = room.players.map((p) => p.color);
  const color = colors.find((c) => !occupiedColors.includes(c)) || "green";
  let assignedColor;
  if (room.capacity === 2 && room.gameMode === "solo") {
    assignedColor = "yellow";
  } else {
    const colors2 = ["red", "green", "yellow", "blue"];
    const occupiedColors2 = room.players.map((p) => p.color);
    assignedColor = colors2.find((c) => !occupiedColors2.includes(c)) || "red";
  }
  challenger.color = assignedColor;
  challenger.isReady = false;
  room.players.push(challenger);
  addLog(room, `\u2705 Host accepted ${challenger.username} into the room.`);
  saveStore();
  broadcastToRoom(room.id, "game_update", room);
  sendEventToUser(challengerId, "game_update", room);
  res.json(room);
});
app.post("/api/rooms/decline-player", (req, res) => {
  const { userId, roomId, challengerId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const host = room.players.find((p) => p.userId === userId);
  if (!host || !host.isHost) {
    return res.status(403).json({ error: "Only the host can decline players." });
  }
  if (!room.pendingPlayers) room.pendingPlayers = [];
  const idx = room.pendingPlayers.findIndex((p) => p.userId === challengerId);
  if (idx === -1) {
    return res.status(404).json({ error: "Challenger not found in pending list." });
  }
  const challenger = room.pendingPlayers.splice(idx, 1)[0];
  addLog(room, `\u274C Host declined ${challenger.username}'s request.`);
  const rejectionRoomState = {
    ...room,
    rejectionReason: "Your request to join the room was declined by the host.",
    // Ensure the pending list sent to the rejected user is also empty of them
    pendingPlayers: room.pendingPlayers.filter((p) => p.userId !== challengerId)
  };
  sendEventToUser(challengerId, "game_update", rejectionRoomState);
  saveStore();
  broadcastToRoom(room.id, "game_update", room);
  res.json(room);
});
app.post("/api/rooms/nudge", (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const p = room.players.find((pl) => pl.userId === userId);
  if (!p) return res.status(403).json({ error: "You are not in this room." });
  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];
  if (!activePlayer) return res.status(400).json({ error: "No active player to nudge." });
  addLog(room, `\u23F0 ${p.username} nudged ${activePlayer.username} to make a move!`);
  sendEventToUser(activePlayer.userId, "player_nudged", { nudgedBy: p.username });
  broadcastToRoom(room.id, "game_update", room);
  res.json(room);
});
app.post("/api/rooms/emoji", (req, res) => {
  const { userId, roomId, emoji } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const p = room.players.find((pl) => pl.userId === userId);
  if (!p) return res.status(403).json({ error: "You are not in this room." });
  room.players.forEach((pl) => {
    sendEventToUser(pl.userId, "player_emoji", {
      senderId: userId,
      senderName: p.username,
      senderColor: p.color,
      emoji
    });
  });
  res.json({ success: true });
});
app.post("/api/rooms/leave", (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const p = room.players.find((pl) => pl.userId === userId);
  if (!p) return res.status(404).json({ error: "Player not in room" });
  addLog(room, `${p.username} has left the game.`);
  if (room.status === "waiting") {
    room.players = room.players.filter((pl) => pl.userId !== userId);
    if (room.players.length === 0) {
      delete store.rooms[roomId];
    } else {
      if (p.isHost) {
        room.players[0].isHost = true;
        room.players[0].isReady = true;
        addLog(room, `${room.players[0].username} is now the host.`);
      }
      broadcastToRoom(room.id, "game_update", room);
    }
  } else if (room.status === "playing") {
    p.status = "left";
    const opponent = room.players.find((pl) => pl.userId !== userId && pl.status !== "left");
    if (opponent) {
      room.status = "completed";
      room.gameState.winnerId = opponent.userId;
      const leavingPlayerProfile = store.users[userId];
      if (leavingPlayerProfile) {
        leavingPlayerProfile.lossCount = (leavingPlayerProfile.lossCount || 0) + 1;
        addLog(room, `\u{1F62D} ${p.username} waa lagu helay ciyaarta!`);
        broadcastUserUpdate(userId);
      }
      const totalPayout = room.gameState.escrowBalance;
      addLog(room, `\u{1F3C6} ${p.username} has left the game. ${opponent.username} wins by forfeit and takes the pot of $${totalPayout.toFixed(2)}!`);
      if (room.betAmount > 0 && totalPayout > 0) {
        const winnerProfile = store.users[opponent.userId];
        if (winnerProfile && !isBotPlayer(winnerProfile.id)) {
          winnerProfile.balance += totalPayout;
          winnerProfile.winCount = (winnerProfile.winCount || 0) + 1;
          addTransaction(opponent.userId, "win_payout", totalPayout, room.id, `Win by opponent forfeit.`);
          broadcastUserUpdate(opponent.userId);
        }
      }
      room.gameState.escrowBalance = 0;
      broadcastToRoom(room.id, "game_update", room);
      res.json({ success: true, room });
    } else {
      room.status = "completed";
      broadcastToRoom(room.id, "game_update", room);
      res.json({ success: true, room });
    }
  }
  saveStore();
});
app.post("/api/admin/login", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { username, password } = req.body;
  try {
    const adminUsersRef = db.collection("adminUsers");
    const allAdminsSnapshot = await adminUsersRef.limit(1).get();
    if (allAdminsSnapshot.empty) {
      console.log("No admin users found. Creating first admin user from login credentials.");
      const newAdminId = `admin_${Date.now()}`;
      const newAdmin = {
        id: newAdminId,
        username,
        password,
        // Password should be hashed in a real application
        permissions: ["all"]
      };
      await adminUsersRef.doc(newAdminId).set(newAdmin);
      console.log(`Created new admin: ${username}`);
      const { password: _, ...userToReturn } = newAdmin;
      return res.json({ success: true, user: userToReturn });
    }
    const snapshot = await adminUsersRef.where("username", "==", username).get();
    if (snapshot.empty) {
      return res.status(401).json({ success: false, error: "Invalid admin credentials." });
    }
    const adminUserDoc = snapshot.docs[0];
    const adminUser = adminUserDoc.data();
    if (adminUser.password === password) {
      const { password: _, ...userToReturn } = adminUser;
      res.json({ success: true, user: userToReturn });
    } else {
      res.status(401).json({ success: false, error: "Invalid admin credentials." });
    }
  } catch (error) {
    console.error("Admin login failed:", error);
    res.status(500).json({ error: "An error occurred during admin login." });
  }
});
var hasPermission = (requiredPermission) => {
  return async (req, res, next) => {
    if (!db) return res.status(500).json({ error: "Database not initialized" });
    const adminId = req.query.userId;
    if (!adminId) {
      return res.status(403).json({ error: "Access denied. Admin user ID is required." });
    }
    try {
      const adminUserRef = db.collection("adminUsers").doc(adminId);
      const adminUserDoc = await adminUserRef.get();
      if (!adminUserDoc.exists) {
        return res.status(403).json({ error: "Access denied. Invalid admin user." });
      }
      const adminUser = adminUserDoc.data();
      if (adminUser.permissions.includes("all") || adminUser.permissions.includes(requiredPermission)) {
        next();
      } else {
        res.status(403).json({ error: "Access denied. You do not have permission for this action." });
      }
    } catch (error) {
      console.error("Permission check failed:", error);
      res.status(500).json({ error: "An error occurred during permission check." });
    }
  };
};
app.post("/api/admin/admins/create", hasPermission("all"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { username, password, permissions } = req.body;
  if (!username || !password || !Array.isArray(permissions)) {
    return res.status(400).json({ error: "Username, password, and a list of permissions are required." });
  }
  try {
    const adminUsersRef = db.collection("adminUsers");
    const existingAdmin = await adminUsersRef.where("username", "==", username).get();
    if (!existingAdmin.empty) {
      return res.status(409).json({ error: "An admin with this username already exists." });
    }
    const newAdminId = `admin_${Date.now()}`;
    const newAdmin = {
      id: newAdminId,
      username,
      password,
      // Again, should be hashed!
      permissions
    };
    await adminUsersRef.doc(newAdminId).set(newAdmin);
    const { password: _, ...userToReturn } = newAdmin;
    res.status(201).json({ success: true, user: userToReturn });
  } catch (error) {
    console.error("Failed to create admin user:", error);
    res.status(500).json({ error: "Failed to create admin user." });
  }
});
var isAdmin = async (req, res, next) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const adminId = req.query.userId;
  if (!adminId) {
    return res.status(403).json({ error: "Access denied. Admin user ID is required." });
  }
  try {
    const doc = await db.collection("adminUsers").doc(adminId).get();
    if (doc.exists) {
      next();
    } else {
      res.status(403).json({ error: "Access denied. Invalid admin user." });
    }
  } catch (error) {
    console.error("Admin validation failed:", error);
    res.status(500).json({ error: "An error occurred during admin validation." });
  }
};
app.get("/api/admin/tournaments", isAdmin, (req, res) => {
  seedDefaultTournaments();
  const tournamentsList = Object.values(store.tournaments);
  tournamentsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(tournamentsList);
});
app.post("/api/admin/tournaments/create", isAdmin, async (req, res) => {
  const { name, entryFee, prizePool, maxPlayers, startDate } = req.body;
  if (!name || entryFee === void 0 || !prizePool || !maxPlayers || !startDate) {
    return res.status(400).json({ error: "Missing required tournament fields." });
  }
  const id = `tourney_${Date.now()}`;
  const newTournament = {
    id,
    name: String(name).trim(),
    entryFee: parseFloat(entryFee),
    prizePool: parseFloat(prizePool),
    status: "registration_open",
    players: [],
    maxPlayers: parseInt(maxPlayers, 10),
    startDate: new Date(startDate).getTime(),
    endDate: 0,
    winnerId: null,
    currentRound: 1,
    matches: [],
    createdAt: Date.now()
  };
  store.tournaments[id] = newTournament;
  await saveStoreAndWait();
  broadcastToAll("tournament_update", newTournament);
  res.json({ success: true, tournament: newTournament, message: "Tournament created successfully!" });
});
app.post("/api/admin/tournaments/:id/cancel", isAdmin, async (req, res) => {
  const tournamentId = req.params.id;
  const tournament = store.tournaments[tournamentId];
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  if (tournament.status === "completed" || tournament.status === "cancelled") {
    return res.status(400).json({ error: "Tournament is already finished or cancelled." });
  }
  tournament.players.forEach((p) => {
    const user = store.users[p.userId];
    if (user && tournament.entryFee > 0) {
      user.balance += tournament.entryFee;
      addTransaction(user.id, "deposit", tournament.entryFee, tournamentId, `Refund for cancelled tournament "${tournament.name}".`);
      broadcastUserUpdate(user.id);
    }
  });
  tournament.status = "cancelled";
  await saveStoreAndWait();
  broadcastToAll("tournament_update", tournament);
  res.json({ success: true, message: "Tournament cancelled and entry fees refunded." });
});
app.delete("/api/admin/tournaments/:id", isAdmin, async (req, res) => {
  const tournamentId = req.params.id;
  if (!store.tournaments[tournamentId]) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  delete store.tournaments[tournamentId];
  await saveStoreAndWait();
  res.json({ success: true, message: "Tournament deleted successfully." });
});
app.post("/api/admin/tournaments/:id/start", isAdmin, async (req, res) => {
  const tournamentId = req.params.id;
  const tournament = store.tournaments[tournamentId];
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  if (tournament.status !== "registration_open") {
    return res.status(400).json({ error: "Tournament is not in registration phase." });
  }
  if (tournament.players.length < 2) {
    return res.status(400).json({ error: "At least 2 players are required to start a tournament." });
  }
  tournament.status = "in_progress";
  tournament.matches = createTournamentBracket(tournament);
  tournament.currentRound = 1;
  for (const match of tournament.matches) {
    if (match.status === "pending" && match.player1 && match.player2) {
      const room = startMatchedRoom(
        [
          { id: match.player1.userId, username: match.player1.username, avatar: match.player1.avatar, balance: 0 },
          { id: match.player2.userId, username: match.player2.username, avatar: match.player2.avatar, balance: 0 }
        ],
        0,
        2,
        "solo"
      );
      match.roomId = room.id;
      match.status = "in_progress";
      room.tournamentDetails = { tournamentId: tournament.id, matchId: match.id };
    }
  }
  await saveStoreAndWait();
  broadcastToAll("tournament_started", tournament);
  res.json({ success: true, tournament, message: `Tournament "${tournament.name}" started successfully!` });
});
app.post("/api/admin/tournaments/:id/remove-player", isAdmin, async (req, res) => {
  const tournamentId = req.params.id;
  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: "Missing targetUserId." });
  }
  const tournament = store.tournaments[tournamentId];
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  const playerIndex = tournament.players.findIndex((p) => p.userId === targetUserId);
  if (playerIndex === -1) {
    return res.status(404).json({ error: "Player is not registered in this tournament." });
  }
  const removedPlayer = tournament.players[playerIndex];
  tournament.players.splice(playerIndex, 1);
  const targetUser = store.users[targetUserId];
  if (targetUser && tournament.entryFee > 0) {
    targetUser.balance += tournament.entryFee;
    addTransaction(
      targetUser.id,
      "deposit",
      tournament.entryFee,
      tournamentId,
      `Refund for removal from tournament "${tournament.name}" by admin.`
    );
    broadcastUserUpdate(targetUser.id);
  }
  await saveStoreAndWait();
  broadcastToAll("tournament_update", tournament);
  res.json({
    success: true,
    message: `Player "${removedPlayer.username}" removed from tournament and $${tournament.entryFee} refunded.`,
    tournament
  });
});
app.post("/api/admin/tournaments/:id/edit", isAdmin, async (req, res) => {
  const tournamentId = req.params.id;
  const { name, entryFee, prizePool, maxPlayers, startDate } = req.body;
  const tournament = store.tournaments[tournamentId];
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  if (name) tournament.name = String(name).trim();
  if (entryFee !== void 0 && !isNaN(parseFloat(entryFee))) tournament.entryFee = parseFloat(entryFee);
  if (prizePool !== void 0 && !isNaN(parseFloat(prizePool))) tournament.prizePool = parseFloat(prizePool);
  if (maxPlayers !== void 0 && !isNaN(parseInt(maxPlayers, 10))) tournament.maxPlayers = parseInt(maxPlayers, 10);
  if (startDate) tournament.startDate = new Date(startDate).getTime();
  await saveStoreAndWait();
  broadcastToAll("tournament_update", tournament);
  res.json({ success: true, tournament, message: `Tournament "${tournament.name}" updated successfully!` });
});
app.get("/api/admin/settings", isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  try {
    const adminUsersSnapshot = await db.collection("adminUsers").get();
    const roles = adminUsersSnapshot.docs.map((doc) => {
      const { password, ...roleData } = doc.data();
      return roleData;
    });
    res.json({
      username: store.adminSettings?.username || process.env.ADMIN_USERNAME || "admin",
      passwordConfigured: Boolean(store.adminSettings?.password),
      roles
    });
  } catch (error) {
    console.error("Failed to retrieve admin roles:", error);
    res.status(500).json({ error: "Failed to retrieve admin roles." });
  }
});
app.post("/api/admin/settings", isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const adminId = req.query.userId;
  if (!adminId) {
    return res.status(400).json({ error: "Admin ID is required." });
  }
  if (typeof newPassword !== "string" || !newPassword.trim()) {
    return res.status(400).json({ error: "New password is required." });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New password and confirmation must match." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long." });
  }
  try {
    const adminRef = db.collection("adminUsers").doc(adminId);
    const adminDoc = await adminRef.get();
    if (!adminDoc.exists) {
      return res.status(404).json({ error: "Admin user not found." });
    }
    const adminUser = adminDoc.data();
    if (adminUser.password !== currentPassword) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    await adminRef.update({
      password: newPassword
    });
    res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    console.error(`Failed to update password for admin ${adminId}:`, error);
    res.status(500).json({ error: "An error occurred while updating the password." });
  }
});
app.post("/api/admin/roles/create", hasPermission("all"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { username, password, permissions, name } = req.body;
  if (!username || !password || !Array.isArray(permissions) || !name) {
    return res.status(400).json({ error: "Role Name, username, password, and a list of permissions are required." });
  }
  try {
    const adminUsersRef = db.collection("adminUsers");
    const existingAdmin = await adminUsersRef.where("username", "==", username).get();
    if (!existingAdmin.empty) {
      return res.status(409).json({ error: "An admin with this username already exists." });
    }
    const newAdminId = `admin_${Date.now()}`;
    const newAdmin = {
      id: newAdminId,
      username,
      password,
      // In a real app, this MUST be hashed.
      permissions,
      name
      // Adding the role name field
    };
    await adminUsersRef.doc(newAdminId).set(newAdmin);
    const { password: _, ...userToReturn } = newAdmin;
    res.status(201).json({ success: true, user: userToReturn });
  } catch (error) {
    console.error("Failed to create admin user:", error);
    res.status(500).json({ error: "Failed to create admin user." });
  }
});
app.post("/api/admin/roles/:roleId/update", hasPermission("all"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { roleId } = req.params;
  const updatedData = req.body;
  if (!roleId) {
    return res.status(400).json({ error: "Role ID is required." });
  }
  try {
    const adminRef = db.collection("adminUsers").doc(roleId);
    const doc = await adminRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Admin role not found." });
    }
    if (updatedData.password === "") {
      delete updatedData.password;
    }
    await adminRef.update(updatedData);
    const updatedDoc = await adminRef.get();
    const { password, ...returnData } = updatedDoc.data();
    res.json({ success: true, role: returnData });
  } catch (error) {
    console.error("Failed to update admin role:", error);
    res.status(500).json({ error: "Failed to update admin role." });
  }
});
app.delete("/api/admin/roles/:roleId/delete", hasPermission("all"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { roleId } = req.params;
  if (!roleId) {
    return res.status(400).json({ error: "Admin user ID is required." });
  }
  try {
    const adminRef = db.collection("adminUsers").doc(roleId);
    const doc = await adminRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Admin user not found." });
    }
    const adminData = doc.data();
    if (adminData.permissions.includes("all")) {
      const allAdminsSnapshot = await db.collection("adminUsers").where("permissions", "array-contains", "all").get();
      if (allAdminsSnapshot.size <= 1) {
        return res.status(400).json({ error: "Cannot delete the last super administrator." });
      }
    }
    await adminRef.delete();
    res.json({ success: true, message: "Admin user deleted successfully." });
  } catch (error) {
    console.error("Failed to delete admin user:", error);
    res.status(500).json({ error: "Failed to delete admin user." });
  }
});
app.get("/api/admin/stats", isAdmin, (req, res) => {
  res.json({
    totalUsers: Object.keys(store.users).length,
    totalRooms: Object.keys(store.rooms).length,
    activeRooms: Object.values(store.rooms).filter((r) => r.status === "playing").length,
    waitingRooms: Object.values(store.rooms).filter((r) => r.status === "waiting").length,
    houseRevenue: store.houseRevenue || 0,
    onlineClients: activeClients.length
  });
});
app.get("/api/admin/users", isAdmin, (req, res) => {
  res.json(Object.values(store.users));
});
app.get("/api/admin/rooms", isAdmin, (req, res) => {
  res.json(Object.values(store.rooms));
});
app.get("/api/admin/transactions", isAdmin, (req, res) => {
  res.json(store.transactions);
});
app.get("/api/admin/manual-transactions", isAdmin, (req, res) => {
  res.json(store.pendingManualTransactions || []);
});
app.get("/api/admin/payment-settings", isAdmin, (req, res) => {
  res.json(store.paymentProviders);
});
app.post("/api/admin/payment-settings", isAdmin, async (req, res) => {
  const { paymentProviders, agentFloatInstructions } = req.body;
  if (paymentProviders && typeof paymentProviders === "object") {
    store.paymentProviders = {
      ...DEFAULT_PAYMENT_PROVIDERS,
      ...paymentProviders
    };
  }
  if (typeof agentFloatInstructions === "string") {
    store.agentFloatInstructions = agentFloatInstructions;
  }
  await saveStoreAndWait();
  res.json({
    success: true,
    paymentProviders: store.paymentProviders,
    agentFloatInstructions: store.agentFloatInstructions
  });
});
app.post("/api/admin/manual-transactions/:transactionId/approve", isAdmin, async (req, res) => {
  const { transactionId } = req.params;
  const tx = store.pendingManualTransactions.find((t) => t.id === transactionId);
  if (!tx || tx.status !== "pending") {
    return res.status(404).json({ error: "Pending transaction not found or already processed." });
  }
  const user = store.users[tx.userId];
  if (!user) {
    return res.status(404).json({ error: "User associated with transaction not found." });
  }
  if (tx.transactionType === "deposit") {
    user.balance += tx.amount;
    addTransaction(user.id, "deposit", tx.amount, void 0, `Manual deposit approved by admin. Request ID: ${tx.id}`);
  } else {
    if (user.balance < tx.amount) {
      tx.status = "rejected";
      await saveStoreAndWait();
      return res.status(400).json({ error: "Insufficient balance to approve this withdrawal request. Transaction has been rejected." });
    }
    user.balance -= tx.amount;
    addTransaction(user.id, "withdrawal", tx.amount, void 0, `Manual withdrawal approved by admin. Request ID: ${tx.id}`);
  }
  tx.status = "approved";
  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  res.json({ success: true, transaction: tx });
});
app.post("/api/admin/manual-transactions/:transactionId/reject", isAdmin, async (req, res) => {
  const { transactionId } = req.params;
  const tx = store.pendingManualTransactions.find((t) => t.id === transactionId);
  if (!tx || tx.status !== "pending") {
    return res.status(404).json({ error: "Pending transaction not found or already processed." });
  }
  const user = store.users[tx.userId];
  if (!user) {
    tx.status = "rejected";
    await saveStoreAndWait();
    return res.status(404).json({ error: "User associated with transaction not found. Transaction rejected." });
  }
  tx.status = "rejected";
  await saveStoreAndWait();
  sendEventToUser(user.id, "user_notification", {
    type: "info",
    message: `Your ${tx.transactionType} request for $${tx.amount} was rejected.`
  });
  res.json({ success: true, transaction: tx });
});
app.post("/api/admin/impersonate", isAdmin, (req, res) => {
  const { userId } = req.body;
  const user = store.users[userId];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ success: true, user });
});
app.post("/api/admin/users/:userId/update", isAdmin, async (req, res) => {
  const { userId } = req.params;
  const userToUpdate = store.users[userId];
  if (!userToUpdate) {
    return res.status(404).json({ error: "User not found." });
  }
  const { username, avatar, balance, winCount, lossCount, role, password } = req.body;
  if (typeof username === "string" && username.trim()) {
    userToUpdate.username = username.trim();
  }
  if (typeof avatar === "string" && avatar.trim()) {
    userToUpdate.avatar = avatar.trim();
  }
  if (typeof balance === "number") {
    userToUpdate.balance = balance;
  }
  if (typeof winCount === "number") {
    userToUpdate.winCount = winCount;
  }
  if (typeof lossCount === "number") {
    userToUpdate.lossCount = lossCount;
  }
  if (typeof role === "string" && role.trim()) {
    userToUpdate.role = role.trim();
  }
  if (typeof password === "string" && password.trim()) {
    userToUpdate.password = password;
  }
  await saveStoreAndWait();
  broadcastUserUpdate(userId);
  res.json(userToUpdate);
});
app.get("/api/admin/agents", isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  try {
    const agentsSnapshot = await db.collection("agents").get();
    const agents = agentsSnapshot.docs.map((doc) => doc.data());
    res.json(agents);
  } catch (error) {
    console.error("Failed to get agents:", error);
    res.status(500).json({ error: "Failed to retrieve agents from database." });
  }
});
app.post("/api/admin/agents/create", isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { username, password, commissionRate, location, phone, promoCode } = req.body;
  if (!username || !password || !commissionRate || !phone) {
    return res.status(400).json({ error: "Username, password, commission rate, and phone are required." });
  }
  if (typeof username !== "string" || username.length < 3) {
    return res.status(400).json({ error: "Username must be a string of at least 3 characters." });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be a string of at least 6 characters." });
  }
  const rate = parseFloat(commissionRate);
  if (isNaN(rate) || rate < 0 || rate > 1) {
    return res.status(400).json({ error: "Commission rate must be a number between 0 and 1." });
  }
  try {
    const agentsRef = db.collection("agents");
    const existingAgentSnapshot = await agentsRef.where("username", "==", username).get();
    if (!existingAgentSnapshot.empty) {
      return res.status(409).json({ error: "Agent with this username already exists." });
    }
    if (promoCode && typeof promoCode === "string" && promoCode.trim() !== "") {
      const promoCodeQuery = await agentsRef.where("promoCode", "==", promoCode.trim()).get();
      if (!promoCodeQuery.empty) {
        return res.status(400).json({ error: "Promo code is already in use." });
      }
    }
    const agentId = `agent_${Date.now()}`;
    const newAgent = {
      id: agentId,
      username,
      password,
      // In a real app, this should be hashed and salted
      phone,
      location: location || "",
      commissionRate: rate,
      promoCode: promoCode && typeof promoCode === "string" ? promoCode.trim() : "",
      balance: 0,
      floatBalance: 0,
      status: "Active",
      createdAt: Date.now()
    };
    await agentsRef.doc(agentId).set(newAgent);
    res.status(201).json(newAgent);
  } catch (error) {
    console.error("Failed to create agent:", error);
    res.status(500).json({ error: "Failed to create agent in database." });
  }
});
app.post("/api/admin/agents/:agentId/update", isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { agentId } = req.params;
  const { username, password, commissionRate, status, location, phone, promoCode } = req.body;
  try {
    const agentRef = db.collection("agents").doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) {
      return res.status(404).json({ error: "Agent not found." });
    }
    const agentData = agentDoc.data();
    if (promoCode && typeof promoCode === "string" && promoCode.trim() !== "" && promoCode.trim() !== agentData.promoCode) {
      const agentsRef = db.collection("agents");
      const promoCodeQuery = await agentsRef.where("promoCode", "==", promoCode.trim()).get();
      if (!promoCodeQuery.empty) {
        const isSameAgent = promoCodeQuery.docs.some((doc) => doc.id === agentId);
        if (!isSameAgent) {
          return res.status(400).json({ error: "Promo code is already in use by another agent." });
        }
      }
    }
    const updateData = {};
    if (username && typeof username === "string" && username.length >= 3) {
      updateData.username = username;
    }
    if (password && typeof password === "string" && password.length >= 6) {
      updateData.password = password;
    }
    if (phone && typeof phone === "string") {
      updateData.phone = phone;
    }
    const newCommissionRate = parseFloat(commissionRate);
    if (commissionRate !== void 0 && !isNaN(newCommissionRate) && newCommissionRate >= 0 && newCommissionRate <= 1) {
      updateData.commissionRate = newCommissionRate;
    }
    if (status && ["Active", "Suspended"].includes(status)) {
      updateData.status = status;
    }
    if (location !== void 0) {
      updateData.location = location;
    }
    if (promoCode !== void 0) {
      updateData.promoCode = promoCode.trim();
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }
    await agentRef.update(updateData);
    const updatedAgentDoc = await agentRef.get();
    res.json({ success: true, agent: updatedAgentDoc.data() });
  } catch (error) {
    console.error(`Failed to update agent ${agentId}:`, error);
    res.status(500).json({ error: "Failed to update agent in database." });
  }
});
app.post("/api/admin/agents/:agentId/credit", isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { agentId } = req.params;
  const { amount, discount } = req.body;
  const creditAmount = parseFloat(amount);
  const discountAmount = parseFloat(discount) || 0;
  if (!agentId || !creditAmount || creditAmount <= 0) {
    return res.status(400).json({ error: "Valid agentId and a positive amount are required." });
  }
  try {
    const agentRef = db.collection("agents").doc(agentId);
    const transactionRef = db.collection("agentTransactions").doc();
    const transactionData = {
      id: transactionRef.id,
      agentId,
      type: "FloatPurchase",
      amount: creditAmount,
      discountAmount,
      timestamp: Date.now(),
      description: `Admin credited ${creditAmount} to float with a ${discountAmount} discount.`
    };
    await db.runTransaction(async (t) => {
      const agentDoc = await t.get(agentRef);
      if (!agentDoc.exists) {
        throw new Error("Agent not found.");
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
    if (error.message === "Agent not found.") {
      return res.status(404).json({ error: "Agent not found." });
    }
    res.status(500).json({ error: "Failed to credit agent float in database." });
  }
});
app.get("/api/admin/agent-requests", isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  try {
    const requestsSnapshot = await db.collection("agentRequests").orderBy("createdAt", "desc").get();
    const requests = requestsSnapshot.docs.map((doc) => doc.data());
    res.json(requests);
  } catch (error) {
    console.error("Failed to get agent requests:", error);
    res.status(500).json({ error: "Failed to retrieve agent requests." });
  }
});
app.post("/api/admin/agent-requests/:requestId/approve", isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { requestId } = req.params;
  const adminId = req.query.userId;
  try {
    const requestRef = db.collection("agentRequests").doc(requestId);
    await db.runTransaction(async (t) => {
      const requestDoc = await t.get(requestRef);
      if (!requestDoc.exists) {
        throw new Error("Request not found.");
      }
      const request = requestDoc.data();
      if (request.status !== "pending") {
        throw new Error("This request has already been processed.");
      }
      const agentRef = db.collection("agents").doc(request.agentId);
      const agentDoc = await t.get(agentRef);
      if (!agentDoc.exists) {
        throw new Error("Agent associated with the request not found.");
      }
      const currentFloat = agentDoc.data()?.floatBalance || 0;
      const newFloatBalance = currentFloat + request.amount;
      const adminUserDoc = await db.collection("adminUsers").doc(adminId).get();
      const resolverUsername = adminUserDoc.exists ? adminUserDoc.data()?.username : "Unknown Admin";
      t.update(agentRef, { floatBalance: newFloatBalance });
      t.update(requestRef, {
        status: "approved",
        resolvedAt: Date.now(),
        resolvedBy: adminId,
        resolverUsername
      });
      const transactionRef = db.collection("agentTransactions").doc();
      const transactionData = {
        id: transactionRef.id,
        agentId: request.agentId,
        type: "FloatPurchase",
        amount: request.amount,
        timestamp: Date.now(),
        description: `Float request for ${request.amount} approved by admin. Request ID: ${request.id}`
      };
      t.set(transactionRef, transactionData);
    });
    res.json({ success: true, message: "Agent float request approved." });
  } catch (error) {
    console.error(`Failed to approve agent request ${requestId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    res.status(500).json({ error: errorMessage });
  }
});
app.post("/api/admin/agent-requests/:requestId/reject", isAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { requestId } = req.params;
  const adminId = req.query.userId;
  try {
    const requestRef = db.collection("agentRequests").doc(requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) {
      return res.status(404).json({ error: "Request not found." });
    }
    const request = requestDoc.data();
    if (request.status !== "pending") {
      return res.status(400).json({ error: "This request has already been processed." });
    }
    const adminUserDoc = await db.collection("adminUsers").doc(adminId).get();
    const resolverUsername = adminUserDoc.exists ? adminUserDoc.data()?.username : "Unknown Admin";
    await requestRef.update({
      status: "rejected",
      resolvedAt: Date.now(),
      resolvedBy: adminId,
      resolverUsername
    });
    res.json({ success: true, message: "Agent float request rejected." });
  } catch (error) {
    console.error(`Failed to reject agent request ${requestId}:`, error);
    res.status(500).json({ error: "An internal server error occurred." });
  }
});
app.delete("/api/admin/users/:userId/delete", isAdmin, (req, res) => {
  const { userId } = req.params;
  if (store.users[userId]) {
    delete store.users[userId];
    saveStoreAndWait();
    res.json({ success: true, message: `User ${userId} has been deleted.` });
  } else {
    res.status(404).json({ error: "User not found" });
  }
});
app.post("/api/admin/rooms/:roomId/cancel", isAdmin, (req, res) => {
  const { roomId } = req.params;
  const room = store.rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  if (room.betAmount > 0) {
    room.players.forEach((p) => {
      if (!isBotPlayer(p.userId)) {
        const user = store.users[p.userId];
        if (user) {
          user.balance += room.betAmount;
          addTransaction(p.userId, "refund", room.betAmount, room.id, `Refund for canceled match ${room.id}.`);
          broadcastUserUpdate(p.userId);
        }
      }
    });
  }
  addLog(room, `Game canceled by admin. Bets refunded.`);
  broadcastToRoom(room.id, "game_canceled", { roomId });
  delete store.rooms[roomId];
  saveStore();
  res.json({ success: true, message: `Room ${roomId} has been canceled and bets refunded.` });
});
app.post("/api/admin/users/:userId/toggle-admin", isAdmin, (req, res) => {
  const { userId } = req.params;
  const user = store.users[userId];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  if (user.role === "admin") {
    user.role = "player";
  } else {
    user.role = "admin";
  }
  saveStore();
  broadcastUserUpdate(user.id);
  res.json({ success: true, user });
});
app.get("/api/admin/users/:userId/games", isAdmin, (req, res) => {
  const { userId } = req.params;
  const userGames = Object.values(store.rooms).filter(
    (room) => room.players.some((p) => p.userId === userId)
  );
  res.json(userGames);
});
app.post("/api/admin/broadcast", isAdmin, (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message cannot be empty" });
  }
  broadcastToAll("global_message", { message });
  res.json({ success: true, message: "Broadcast sent." });
});
app.post("/api/agent/login", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }
  try {
    const agentsRef = db.collection("agents");
    const snapshot = await agentsRef.where("username", "==", username).limit(1).get();
    if (snapshot.empty) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    const agentDoc = snapshot.docs[0];
    const agent = agentDoc.data();
    if (agent.password !== password) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    if (agent.status !== "Active") {
      return res.status(403).json({ error: "This agent account is not active." });
    }
    res.json({ success: true, agent });
  } catch (error) {
    console.error("Agent login failed:", error);
    res.status(500).json({ error: "An internal server error occurred during login." });
  }
});
async function isAgent(req, res, next) {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agentId = req.query.agentId;
  if (!agentId) {
    return res.status(401).json({ error: "Agent ID is required for this operation." });
  }
  try {
    const agentRef = db.collection("agents").doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) {
      return res.status(403).json({ error: "Access denied. Invalid agent ID." });
    }
    const agent = agentDoc.data();
    if (agent.status !== "Active") {
      return res.status(403).json({ error: "Access denied. Inactive agent ID." });
    }
    req.agent = agent;
    next();
  } catch (error) {
    console.error("Agent verification failed:", error);
    res.status(500).json({ error: "Failed to verify agent status." });
  }
}
app.get("/api/agent/profile", isAgent, (req, res) => {
  const agent = req.agent;
  res.json(agent);
});
app.get("/api/agent/player-lookup", isAgent, (req, res) => {
  const agent = req.agent;
  const { query } = req.query;
  if (!query || typeof query !== "string" || query.length < 2) {
    return res.status(400).json({ error: "A search query of at least 2 characters is required." });
  }
  const lowerCaseQuery = query.toLowerCase();
  const results = Object.values(store.users).filter((u) => u.username.toLowerCase().includes(lowerCaseQuery) && !u.id.startsWith("bot_")).filter((u) => !u.linkedAgentId || u.linkedAgentId === agent.id).map((u) => ({ id: u.id, username: u.username, avatar: u.avatar })).slice(0, 10);
  res.json(results);
});
app.get("/api/agent/transactions", isAgent, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agent = req.agent;
  try {
    const snapshot = await db.collection("agentTransactions").where("agentId", "==", agent.id).get();
    const transactions = snapshot.docs.map((doc) => doc.data());
    transactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json(transactions);
  } catch (error) {
    console.error(`Failed to get transactions for agent ${agent.id}:`, error);
    res.status(500).json({ error: "Failed to retrieve agent transactions." });
  }
});
app.post("/api/agent/deposit", isAgent, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agent = req.agent;
  const { playerId, amount } = req.body;
  const depositAmount = parseFloat(amount);
  if (!playerId || !depositAmount || depositAmount <= 0) {
    return res.status(400).json({ error: "Valid playerId and a positive amount are required." });
  }
  const player = store.users[playerId];
  if (!player) {
    return res.status(404).json({ error: "Player not found." });
  }
  if (player.linkedAgentId && player.linkedAgentId !== agent.id) {
    return res.status(400).json({ error: "This player is linked to a different agent via promo code." });
  }
  try {
    const agentRef = db.collection("agents").doc(agent.id);
    const agentTxRef = db.collection("agentTransactions").doc();
    await db.runTransaction(async (t) => {
      const agentDoc = await t.get(agentRef);
      if (!agentDoc.exists) throw new Error("Agent not found.");
      const agentData = agentDoc.data();
      if (agentData.floatBalance < depositAmount) {
        throw new Error("Insufficient float balance.");
      }
      const newFloatBalance = agentData.floatBalance - depositAmount;
      t.update(agentRef, { floatBalance: newFloatBalance });
      const agentTx = {
        id: agentTxRef.id,
        agentId: agent.id,
        type: "PlayerDeposit",
        amount: depositAmount,
        playerId,
        timestamp: Date.now(),
        description: `Deposited ${depositAmount} into ${player.username}'s account.`
      };
      t.set(agentTxRef, agentTx);
    });
    player.balance += depositAmount;
    addTransaction(
      playerId,
      "deposit",
      depositAmount,
      void 0,
      `Deposit received from agent ${agent.id}.`
    );
    await saveStoreAndWait();
    broadcastUserUpdate(player.id);
    const updatedAgentDoc = await agentRef.get();
    const updatedAgent = updatedAgentDoc.data();
    res.json({ success: true, newAgentBalance: updatedAgent?.floatBalance, newPlayerBalance: player.balance });
  } catch (error) {
    console.error(`Agent ${agent.id} failed to deposit to player ${playerId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    if (errorMessage.includes("Insufficient")) {
      return res.status(400).json({ error: errorMessage });
    }
    res.status(500).json({ error: `Failed to process deposit: ${errorMessage}` });
  }
});
app.post("/api/agent/request-float", isAgent, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agent = req.agent;
  const { amount } = req.body;
  const requestAmount = parseFloat(amount);
  if (!requestAmount || requestAmount <= 0) {
    return res.status(400).json({ error: "A positive amount is required." });
  }
  try {
    const requestRef = db.collection("agentRequests").doc();
    const newRequest = {
      id: requestRef.id,
      agentId: agent.id,
      agentUsername: agent.username,
      amount: requestAmount,
      status: "pending",
      createdAt: Date.now()
    };
    await requestRef.set(newRequest);
    res.status(201).json({ success: true, message: "Your float request has been submitted for review.", request: newRequest });
  } catch (error) {
    console.error(`Agent ${agent.id} failed to request float:`, error);
    res.status(500).json({ error: "An internal server error occurred while submitting your request." });
  }
});
app.get("/api/agent/requests", isAgent, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agent = req.agent;
  try {
    const requestsSnapshot = await db.collection("agentRequests").where("agentId", "==", agent.id).get();
    const requests = requestsSnapshot.docs.map((doc) => doc.data());
    requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json(requests);
  } catch (error) {
    console.error(`Failed to get float requests for agent ${agent.id}:`, error);
    res.status(500).json({ error: "Failed to retrieve float requests." });
  }
});
app.get("/api/agent/player-requests", isAgent, (req, res) => {
  const agent = req.agent;
  const agentSpecificTxs = store.pendingManualTransactions.filter((tx) => tx.status === "pending" && tx.agentId === agent.id);
  const responsePayload = agentSpecificTxs.map((tx) => {
    const user = store.users[tx.userId];
    return {
      id: tx.id,
      playerId: tx.userId,
      playerUsername: user ? user.username : "Unknown Player",
      playerAvatar: user ? user.avatar : "\u2753",
      agentId: agent.id,
      // Agent ID is from the authenticated agent
      playerPhone: tx.phone,
      // For withdrawals
      senderPhone: tx.senderPhone,
      // For deposits
      provider: tx.provider,
      type: tx.transactionType,
      amount: tx.amount,
      status: tx.status,
      createdAt: tx.createdAt
    };
  });
  responsePayload.sort((a, b) => b.createdAt - a.createdAt);
  res.json(responsePayload);
});
app.post("/api/agent/player-requests/:requestId/approve", isAgent, async (req, res) => {
  const { requestId } = req.params;
  const agent = req.agent;
  const tx = store.pendingManualTransactions.find((t) => t.id === requestId);
  if (!tx || tx.status !== "pending") {
    return res.status(404).json({ error: "Pending transaction not found or already processed." });
  }
  const user = store.users[tx.userId];
  if (!user) {
    return res.status(404).json({ error: "User associated with transaction not found." });
  }
  if (user.linkedAgentId && user.linkedAgentId !== agent.id) {
    return res.status(400).json({ error: "This player is locked to a different agent via promo code." });
  }
  let newAgentFloat;
  try {
    if (!db) {
      throw new Error("Database not initialized");
    }
    await db.runTransaction(async (t) => {
      const agentRef = db.collection("agents").doc(agent.id);
      const agentDoc = await t.get(agentRef);
      if (!agentDoc.exists) {
        throw new Error("Agent not found in database");
      }
      const agentData = agentDoc.data();
      const currentFloat = agentData.floatBalance || 0;
      let newAgentFloat2;
      if (tx.transactionType === "deposit") {
        if (currentFloat < tx.amount) {
          throw new Error("Insufficient float balance to approve this deposit.");
        }
        newAgentFloat2 = currentFloat - tx.amount;
        user.balance += tx.amount;
        addTransaction(user.id, "deposit", tx.amount, void 0, `Manual deposit approved by agent ${agent.username}. Request ID: ${tx.id}`);
      } else {
        if (user.balance < tx.amount) {
          throw new Error("Player has insufficient balance for this withdrawal.");
        }
        newAgentFloat2 = currentFloat + tx.amount;
        user.balance -= tx.amount;
        addTransaction(user.id, "withdrawal", tx.amount, void 0, `Manual withdrawal approved by agent ${agent.username}. Request ID: ${tx.id}`);
      }
      const agentTxRef = db.collection("agentTransactions").doc();
      const agentTx = {
        id: agentTxRef.id,
        agentId: agent.id,
        type: tx.transactionType === "deposit" ? "PlayerDeposit" : "PlayerWithdrawal",
        amount: tx.amount,
        playerId: user.id,
        playerName: user.username,
        timestamp: Date.now(),
        description: `Approved ${tx.transactionType} of $${tx.amount} for player ${user.username}.`
      };
      t.set(agentTxRef, agentTx);
      t.update(agentRef, { floatBalance: newAgentFloat2 });
    });
    tx.status = "approved";
    tx.resolvedBy = agent.id;
    tx.resolverUsername = agent.username;
    await saveStoreAndWait();
    broadcastUserUpdate(user.id);
    res.json({ success: true, transaction: tx });
  } catch (error) {
    console.error("Error processing agent transaction approval:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    if (message.includes("Insufficient")) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: `Failed to process approval: ${message}` });
  }
});
app.post("/api/agent/player-requests/:requestId/reject", isAgent, async (req, res) => {
  const { requestId } = req.params;
  const agent = req.agent;
  const tx = store.pendingManualTransactions.find((t) => t.id === requestId);
  if (!tx || tx.status !== "pending") {
    return res.status(404).json({ error: "Pending transaction not found or already processed." });
  }
  const user = store.users[tx.userId];
  if (!user) {
    tx.status = "rejected";
    await saveStoreAndWait();
    return res.status(404).json({ error: "User associated with transaction not found. Transaction rejected." });
  }
  tx.status = "rejected";
  tx.resolvedBy = agent.id;
  tx.resolverUsername = agent.username;
  await saveStoreAndWait();
  sendEventToUser(user.id, "user_notification", {
    type: "info",
    message: `Your ${tx.transactionType} request for $${tx.amount} was rejected by agent ${agent.username}.`
  });
  res.json({ success: true, transaction: tx });
});
app.get("/api/agent/payment-instructions", isAgent, (req, res) => {
  const instructions = store.agentFloatInstructions || "";
  res.json({ instructions });
});
app.get("/api/agent/my-players", isAgent, (req, res) => {
  const agent = req.agent;
  const linkedPlayers = Object.values(store.users).filter((user) => user.linkedAgentId === agent.id);
  const sanitizedPlayers = linkedPlayers.map((p) => {
    const { password, ...playerData } = p;
    return playerData;
  });
  res.json(sanitizedPlayers);
});
app.get("/agent", (req, res) => {
  const distPath = getDistDirectory();
  const agentFile = fs.existsSync(path.join(distPath, "agent.html")) ? path.join(distPath, "agent.html") : path.join(process.cwd(), "agent.html");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(agentFile);
});
app.get(/^(?!\/api).*/, (req, res) => {
  if (req.path.startsWith("/assets/") || /\.(js|css|png|jpg|jpeg|gif|svg|ico|json|mp3|wav|woff|woff2|ttf|map|webmanifest)$/i.test(req.path)) {
    return res.status(404).send("Asset not found");
  }
  const distPath = getDistDirectory();
  const indexFile = fs.existsSync(path.join(distPath, "index.html")) ? path.join(distPath, "index.html") : path.join(process.cwd(), "index.html");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(indexFile);
});
async function startServer() {
  await loadStoreFromFirestore();
  purgeSimulatedUsers();
  let vite;
  if (process.env.NODE_ENV === "development") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  const server = typeof PORT === "number" ? app.listen(PORT, "0.0.0.0", () => {
    console.log(`Betting Ludo Game Full-Stack App listening at http://localhost:${PORT}`);
  }) : app.listen(PORT, () => {
    console.log(`Betting Ludo Game Full-Stack App listening on socket ${PORT}`);
  });
  server.on("upgrade", (req, socket, head) => {
    if (vite && req.url?.includes("__vite_hmr")) {
      vite.ws.handleUpgrade(req, socket, head);
    }
  });
  process.on("SIGINT", () => {
    console.log("\nShutting down server...");
    server.close(() => {
      console.log("Server shut down.");
      process.exit(0);
    });
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=server.js.map
