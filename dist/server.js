import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);

// server.ts
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
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
  silver: {
    name: "Silver VIP",
    price: 4,
    durationMonths: 1,
    rakeDiscount: 0.01,
    features: ["VIP profile badge", "1% rake discount", "Save $1 on every $100 prize pool"]
  },
  gold: {
    name: "Gold VIP",
    price: 10,
    durationMonths: 1,
    rakeDiscount: 0.02,
    features: ["Gold profile badge", "2% rake discount", "Save $2 on every $100 prize pool"]
  },
  platinum: {
    name: "Platinum VIP",
    price: 25,
    durationMonths: 3,
    rakeDiscount: 0.04,
    features: ["Platinum profile badge", "4% rake discount", "Save $4 on every $100 prize pool", "3 months of access"]
  },
  diamond: {
    name: "Diamond VIP",
    price: 45,
    durationMonths: 6,
    rakeDiscount: 0.05,
    features: ["Diamond profile badge", "5% rake discount", "Save $5 on every $100 prize pool", "6 months of access"]
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
var WELCOME_BONUS = 1;
var OTP_TTL_MS = 10 * 60 * 1e3;
var OTP_RESEND_MS = 60 * 1e3;
var MINIMUM_WITHDRAWAL = 2;
var BONUS_UNLOCK_DEPOSIT_TOTAL = 5;
var NORMAL_WITHDRAWAL_FEE_RATE = 0;
var NO_PLAY_WITHDRAWAL_FEE_RATE = 0.1;
var MINIMUM_WITHDRAWAL_FEE = 0.1;
var TOURNAMENT_UNREGISTER_FEE_RATE = 0.1;
var TOURNAMENT_MAX_POSTPONEMENTS = 2;
var TOURNAMENT_CHECK_IN_MS = 5 * 60 * 1e3;
function hashEmailOtp(uid, otp) {
  return crypto.createHash("sha256").update(`${uid}:${otp}:${process.env.OTP_HASH_SECRET || process.env.FIREBASE_PROJECT_ID || "ludosom"}`).digest("hex");
}
async function sendOtpEmail(email, otp) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OTP_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("OTP email service is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "LudoSom - Email Verification Code",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#17112b"><h2>LudoSom (Faaiido Qar$oon)</h2><p>Ku soo dhowow LudoSom. Geli code-kan gudaha app-ka si aad u xaqiijiso email-kaaga:</p><div style="font-size:34px;font-weight:800;letter-spacing:10px;background:#f3efff;border-radius:12px;padding:18px;text-align:center;color:#5b21b6">${otp}</div><p>Code-ku wuxuu dhacayaa 10 daqiiqo kadib. Haddii aadan adigu codsan, fariintan iska dhaaf.</p><p>Mahadsanid,<br><strong>LudoSom Team</strong></p></div>`
    })
  });
  if (!response.ok) {
    const details = await response.text();
    console.error("OTP email provider rejected the request:", response.status, details);
    throw new Error("Verification email could not be sent.");
  }
}
function normalizePromoCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}
function normalizeAppAvatar(value) {
  const avatar = typeof value === "string" ? value.trim() : "";
  return /^https?:\/\//i.test(avatar) || !avatar ? "\u{1F3AE}" : avatar;
}
async function findAgentDocsByPromoCode(agentsRef, promoCode) {
  const exactSnapshot = await agentsRef.where("promoCode", "==", promoCode).get();
  if (!exactSnapshot.empty) return exactSnapshot.docs;
  const allAgentsSnapshot = await agentsRef.get();
  return allAgentsSnapshot.docs.filter(
    (agentDoc) => normalizePromoCode(agentDoc.data().promoCode) === promoCode
  );
}
async function resolveActiveAgentByPromoCode(promoCode) {
  const normalizedPromoCode = normalizePromoCode(promoCode);
  if (!normalizedPromoCode || !db) return null;
  const matchingAgentDocs = await findAgentDocsByPromoCode(db.collection("agents"), normalizedPromoCode);
  if (!matchingAgentDocs.length) return null;
  const agentDoc = matchingAgentDocs[0];
  const agent = { ...agentDoc.data(), id: agentDoc.data().id || agentDoc.id };
  if (agent.status !== "Active") return null;
  if (agent.promoCode !== normalizedPromoCode || agentDoc.data().id !== agent.id) {
    await agentDoc.ref.set({ promoCode: normalizedPromoCode, id: agent.id }, { merge: true });
  }
  return agent;
}
app.use(express.json());
function formatGeocodedLocation(address) {
  const city = address?.city || address?.town || address?.village || address?.municipality || address?.county || address?.state;
  const country = address?.country;
  return [city, country].filter(Boolean).join(", ");
}
app.get("/api/locations/search", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length < 2) return res.json([]);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&q=${encodeURIComponent(query)}`, { headers: { "User-Agent": "LudoSom-Agent-Location/1.0" } });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const results = await response.json();
    res.json([...new Set(results.map((item) => formatGeocodedLocation(item.address)).filter(Boolean))].slice(0, 8));
  } catch (error) {
    console.error("Location search failed:", error);
    res.status(502).json({ error: "Location search is temporarily unavailable." });
  }
});
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
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!! FAILED TO INITIALIZE FIREBASE ADMIN SDK !!");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("Error Code:", err.code);
    console.error("Error Message:", err.message);
    console.error("Stack Trace:", err.stack);
    console.error("Full Error Object:", JSON.stringify(err, null, 2));
    console.error("---------------------------------------------------------------");
    console.error("This means the server will NOT be able to connect to Firestore or verify user tokens.");
    console.error("Potential causes:");
    console.error("  1. The FIREBASE_SERVICE_ACCOUNT environment variable is not set or is incorrect.");
    console.error("  2. The service account key file (e.g., firebase-admin-key.json) is missing or corrupted.");
    console.error("  3. The service account does not have the correct permissions in Google Cloud IAM.");
    console.error('See the "getFirebaseServiceAccount" function in server.ts for credential loading logic.');
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  }
} else {
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.error("!! NO FIREBASE ADMIN CREDENTIALS FOUND !!");
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.error('The "getFirebaseServiceAccount" function did not find any valid credentials.');
  console.error("Server will run without Firestore persistence or Firebase Auth verification.");
  console.error("Set the FIREBASE_SERVICE_ACCOUNT environment variable or place a valid service account key file in the project root.");
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
}
var DEFAULT_PAYMENT_PROVIDERS = {
  evc: { enabled: false },
  edahab: { enabled: false },
  sahal: { enabled: false },
  zaad: { enabled: false },
  premier: { enabled: false }
};
var DEFAULT_AD_SETTINGS = { enabled: false, format: "banner", placement: "all", companyName: "", title: "", message: "", imageUrl: "", linkUrl: "", durationSeconds: 3, intervalSeconds: 60, adsenseClient: "", adsenseSlot: "" };
var DEFAULT_ADMIN_ROLES = [
  { id: "admin", name: "Administrator", permissions: ["all"] },
  { id: "editor", name: "Editor", permissions: ["stats", "users", "rooms"] }
];
var ADMIN_PERMISSION_KEYS = ["stats", "users", "rooms", "transactions", "cashier", "agents", "tournaments", "settings"];
function normalizeAdminPermissions(value) {
  if (!Array.isArray(value)) return [];
  if (value.includes("all")) return ["all"];
  const legacyMap = {
    manage_users: ["users"],
    manage_content: ["rooms", "tournaments"],
    view_stats: ["stats"]
  };
  const normalized = value.flatMap((permission) => legacyMap[String(permission)] || [String(permission)]);
  return [...new Set(normalized.filter((permission) => ADMIN_PERMISSION_KEYS.includes(permission)))];
}
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
  vipTiers: { ...VIP_TIERS },
  agents: {},
  agentTransactions: [],
  tournaments: {},
  adSettings: { ...DEFAULT_AD_SETTINGS }
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
      prizePool: 72,
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
      prizePool: 72,
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
      prizePool: 7.2,
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
      store.matchmakingQueues = {
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
      store.vipTiers = { ...VIP_TIERS, ...parsed.vipTiers || {} };
      store.tournaments = parsed.tournaments || {};
      store.adSettings = { ...DEFAULT_AD_SETTINGS, ...parsed.adSettings || {} };
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
        store.matchmakingQueues = {
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
        store.vipTiers = { ...VIP_TIERS, ...parsed.vipTiers || {} };
        const persistedRoles = Array.isArray(parsed.adminSettings?.roles) ? parsed.adminSettings.roles : [];
        store.adminSettings = {
          username: parsed.adminSettings?.username || process.env.ADMIN_USERNAME || "admin",
          password: parsed.adminSettings?.password || process.env.ADMIN_PASSWORD || "password",
          roles: persistedRoles.length ? persistedRoles : DEFAULT_ADMIN_ROLES
        };
        store.agents = parsed.agents || {};
        store.agentTransactions = parsed.agentTransactions || [];
        store.tournaments = parsed.tournaments || {};
        store.adSettings = { ...DEFAULT_AD_SETTINGS, ...parsed.adSettings || {} };
        console.log("Database loaded successfully from Firebase Firestore.");
        fs.writeFileSync(DB_FILE, payload.data, "utf8");
        await loadUserProfilesFromFirestore();
        await loadManualRequestsFromFirestore();
        await syncUserProfilesToFirestore();
        return;
      }
    }
    console.log("No existing state in Firestore. Loading from local store fallback...");
    loadStore();
    await loadUserProfilesFromFirestore();
    await loadManualRequestsFromFirestore();
    await syncUserProfilesToFirestore();
  } catch (err) {
    console.error("Failed to load store from Firestore:", err);
    loadStore();
  }
}
var persistedUserProfiles = /* @__PURE__ */ new Map();
var userProfileSyncQueue = Promise.resolve();
function serializeUserProfile(user) {
  return JSON.stringify(user);
}
async function loadUserProfilesFromFirestore() {
  if (!db) return;
  const snapshot = await db.collection("users").get();
  snapshot.forEach((userDoc) => {
    const profile = userDoc.data();
    if (profile?.id) {
      store.users[profile.id] = profile;
      persistedUserProfiles.set(userDoc.id, serializeUserProfile(profile));
    }
  });
}
async function syncUserProfilesToFirestore() {
  if (!db) return;
  const users = Object.values(store.users).filter((user) => {
    if (user.id.startsWith("user_sim_") || user.id.startsWith("bot_")) return false;
    const documentId = user.firebaseUid || user.id;
    return persistedUserProfiles.get(documentId) !== serializeUserProfile(user);
  });
  for (let offset = 0; offset < users.length; offset += 500) {
    const batch = db.batch();
    for (const user of users.slice(offset, offset + 500)) {
      const documentId = user.firebaseUid || user.id;
      const cleanProfile = JSON.parse(JSON.stringify(user));
      batch.set(db.collection("users").doc(documentId), cleanProfile, { merge: true });
    }
    await batch.commit();
    for (const user of users.slice(offset, offset + 500)) {
      persistedUserProfiles.set(user.firebaseUid || user.id, serializeUserProfile(user));
    }
  }
}
function queueUserProfileSync() {
  userProfileSyncQueue = userProfileSyncQueue.then(() => syncUserProfilesToFirestore()).catch((error) => console.error("Failed to synchronize user profiles to Firestore:", error));
  return userProfileSyncQueue;
}
async function saveUserProfileToFirestore(user) {
  if (!db) return;
  const documentId = user.firebaseUid || user.id;
  const cleanProfile = JSON.parse(JSON.stringify(user));
  await db.collection("users").doc(documentId).set(cleanProfile, { merge: true });
  persistedUserProfiles.set(documentId, serializeUserProfile(user));
}
async function saveManualRequestToFirestore(request) {
  if (!db) throw new Error("Database not initialized");
  await db.collection("manualTransactionRequests").doc(request.id).set(JSON.parse(JSON.stringify(request)), { merge: true });
}
async function loadManualRequestsFromFirestore() {
  if (!db) return;
  const snapshot = await db.collection("manualTransactionRequests").get();
  const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const merged = new Map(store.pendingManualTransactions.map((request) => [request.id, request]));
  requests.forEach((request) => merged.set(request.id, request));
  store.pendingManualTransactions = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}
async function findManualRequest(requestId) {
  const localRequest = store.pendingManualTransactions.find((request2) => request2.id === requestId);
  if (localRequest || !db) return localRequest;
  const document = await db.collection("manualTransactionRequests").doc(requestId).get();
  if (!document.exists) return void 0;
  const request = { id: document.id, ...document.data() };
  store.pendingManualTransactions.unshift(request);
  return request;
}
var CASHIER_ONLINE_WINDOW_MS = 75 * 1e3;
var CASHIER_ASSIGNMENT_MS = 5 * 60 * 1e3;
function normalizedCity(location) {
  const city = String(location || "").split(",")[0].trim().toLocaleLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u0600-\u06ff]+/g, " ").replace(/\s+/g, " ");
  const aliases = {
    muqdisho: "mogadishu",
    xamar: "mogadishu",
    mogadishu: "mogadishu",
    hargeysa: "hargeisa",
    hargeisa: "hargeisa",
    boosaaso: "bosaso",
    bosaso: "bosaso",
    kismaayo: "kismayo",
    kismayo: "kismayo",
    baydhabo: "baidoa",
    baidoa: "baidoa"
  };
  return aliases[city] || city;
}
function cashierCities(admin) {
  return [...new Set([...Array.isArray(admin.cashierLocations) ? admin.cashierLocations : [], admin.location].map(normalizedCity).filter(Boolean))].slice(0, 2);
}
async function assignCashierToRequest(request, now = Date.now()) {
  if (!db || request.managedBy === "agent" || request.status !== "pending") return false;
  const user = store.users[request.userId];
  const city = normalizedCity(request.cashierCity || user?.location);
  request.cashierCity = city;
  if (!city) return false;
  if (request.assignedCashierId && Number(request.assignmentExpiresAt || 0) <= now) {
    request.cashierTimedOutIds = [...request.cashierTimedOutIds || [], request.assignedCashierId];
  }
  const snapshot = await db.collection("adminUsers").get();
  const eligible = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((admin) => admin.status !== "suspended" && normalizeAdminPermissions(admin.permissions).includes("cashier") && cashierCities(admin).includes(city) && Number(admin.cashierOnlineAt || 0) >= now - CASHIER_ONLINE_WINDOW_MS);
  if (eligible.length === 0) {
    request.assignedCashierId = void 0;
    request.assignedCashierName = void 0;
    request.assignedCashierAt = void 0;
    request.assignmentExpiresAt = void 0;
    await saveManualRequestToFirestore(request);
    return false;
  }
  const history = Array.isArray(request.cashierAssignmentHistory) ? request.cashierAssignmentHistory : [];
  let candidates = eligible.filter((cashier) => cashier.id !== request.assignedCashierId && !history.includes(cashier.id));
  let nextHistory = history;
  if (candidates.length === 0) {
    candidates = eligible.filter((cashier) => cashier.id !== request.assignedCashierId);
    if (candidates.length === 0) candidates = eligible;
    nextHistory = [];
  }
  const selected = candidates[crypto.randomInt(candidates.length)];
  request.assignedCashierId = selected.id;
  request.assignedCashierName = selected.name || selected.username;
  request.assignedCashierAt = now;
  request.assignmentExpiresAt = now + CASHIER_ASSIGNMENT_MS;
  request.cashierAssignmentHistory = [.../* @__PURE__ */ new Set([...nextHistory, selected.id])];
  await saveManualRequestToFirestore(request);
  return true;
}
async function reassignExpiredCashierRequests(now = Date.now()) {
  const requests = store.pendingManualTransactions.filter((request) => request.status === "pending" && request.managedBy !== "agent" && (!request.assignedCashierId || Number(request.assignmentExpiresAt || 0) <= now));
  for (const request of requests) {
    try {
      await assignCashierToRequest(request, now);
    } catch (error) {
      console.error(`Cashier assignment failed for ${request.id}:`, error);
    }
  }
}
var cashierAssignmentTimer = setInterval(() => {
  void reassignExpiredCashierRequests();
}, 15 * 1e3);
cashierAssignmentTimer.unref?.();
async function findUserProfileInFirestore(firebaseUid, email) {
  if (!db) return null;
  const uidDoc = await db.collection("users").doc(firebaseUid).get();
  if (uidDoc.exists) {
    return uidDoc.data();
  }
  const uidSnapshot = await db.collection("users").where("firebaseUid", "==", firebaseUid).limit(1).get();
  if (!uidSnapshot.empty) {
    return uidSnapshot.docs[0].data();
  }
  if (email) {
    const emailSnapshot = await db.collection("users").where("email", "==", email.trim().toLowerCase()).limit(1).get();
    if (!emailSnapshot.empty) {
      return emailSnapshot.docs[0].data();
    }
  }
  return null;
}
async function refreshUserProfileById(userId) {
  if (!db) return store.users[userId] || null;
  const knownUser = store.users[userId];
  if (knownUser?.firebaseUid) {
    const uidDoc = await db.collection("users").doc(knownUser.firebaseUid).get();
    if (uidDoc.exists) {
      const profile = uidDoc.data();
      store.users[profile.id] = profile;
      return profile;
    }
  }
  const snapshot = await db.collection("users").where("id", "==", userId).limit(1).get();
  if (!snapshot.empty) {
    const profile = snapshot.docs[0].data();
    store.users[profile.id] = profile;
    return profile;
  }
  return knownUser || null;
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
    void queueUserProfileSync();
  } catch (error) {
    console.error("Failed to write database to disk.", error);
  }
}
async function saveStoreAndWait() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), "utf8");
    await syncToFirestore();
    await queueUserProfileSync();
  } catch (error) {
    console.error("Failed to write database to disk.", error);
  }
}
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
    }
    broadcastToAll("online_players_updated", {});
  }
}
function cleanupMatchmakingQueues() {
  let changed = false;
  const now = Date.now();
  for (const qKey of Object.keys(store.matchmakingQueues)) {
    const beforeLen = store.matchmakingQueues[qKey].length;
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter((userId) => {
      if (!store.users[userId]) return false;
      const inGame = Object.values(store.rooms).some(
        (r) => r.status === "playing" && r.players.some((p) => p.userId === userId && p.status !== "left")
      );
      if (inGame) return false;
      const u = store.users[userId];
      const seekingJoinedAt = u?.seekingJoinedAt;
      if (seekingJoinedAt && now - seekingJoinedAt > 18e4) {
        delete u.seekingJoinedAt;
        if (db) {
          db.collection("matchmaking").doc(userId).delete().catch(() => {
          });
        }
        return false;
      }
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
function syncMatchmakingRecordWithRetry(userId, record, attempt = 1) {
  if (!db) return;
  db.collection("matchmaking").doc(userId).set(record).catch((error) => {
    console.error(`Failed to sync matchmaking record (attempt ${attempt}):`, error);
    if (attempt < 3) {
      setTimeout(() => syncMatchmakingRecordWithRetry(userId, record, attempt + 1), attempt * 1e3);
    }
  });
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
function recordHouseRevenue(category, amount, referenceId, description = "") {
  const normalizedAmount = Number(Number(amount || 0).toFixed(2));
  if (!normalizedAmount) return;
  store.houseRevenue = Number(((store.houseRevenue || 0) + normalizedAmount).toFixed(2));
  const tx = addTransaction("house", "app_commission", normalizedAmount, referenceId, description);
  tx.revenueCategory = category;
  saveStore();
}
function effectiveRakeForUsers(userIds) {
  const realUsers = userIds.map((id) => store.users[id]).filter(Boolean);
  if (!realUsers.length) return RAKE_PERCENTAGE;
  const totalDiscount = realUsers.reduce((sum, user) => {
    if (!user.vip || user.vip.expires <= Date.now()) return sum;
    return sum + Number(store.vipTiers[user.vip.tier]?.rakeDiscount || 0);
  }, 0);
  return Math.max(0, RAKE_PERCENTAGE - totalDiscount / realUsers.length);
}
function getWithdrawableBalance(userId, excludeRequestId) {
  const approvedDeposits = store.transactions.filter((tx) => tx.userId === userId && tx.type === "deposit" && /deposit/i.test(tx.description || "") && !/welcome bonus/i.test(tx.description || "")).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const earnedFromWins = store.transactions.filter((tx) => tx.userId === userId && tx.type === "win_payout").reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const unlockedBonus = approvedDeposits >= BONUS_UNLOCK_DEPOSIT_TOTAL ? WELCOME_BONUS : 0;
  const completedWithdrawals = store.transactions.filter((tx) => tx.userId === userId && tx.type === "withdrawal").reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const pendingWithdrawals = store.pendingManualTransactions.filter((tx) => tx.id !== excludeRequestId && tx.userId === userId && tx.transactionType === "withdraw" && tx.status === "pending").reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  return Math.max(0, approvedDeposits + earnedFromWins + unlockedBonus - completedWithdrawals - pendingWithdrawals);
}
function hasCompletedPaidGame(userId) {
  return store.transactions.some((tx) => tx.userId === userId && tx.type === "bet_escrow_locked" && Number(tx.amount || 0) > 0) && Object.values(store.rooms).some((room) => room.status === "completed" && room.betAmount > 0 && room.players.some((player) => player.userId === userId));
}
function getWithdrawalQuote(userId, amount) {
  const playedPaidGame = hasCompletedPaidGame(userId);
  const feeRate = playedPaidGame ? NORMAL_WITHDRAWAL_FEE_RATE : NO_PLAY_WITHDRAWAL_FEE_RATE;
  const fee = playedPaidGame ? 0 : Math.min(amount, Math.max(MINIMUM_WITHDRAWAL_FEE, Number((amount * feeRate).toFixed(2))));
  return { feeRate, fee, netAmount: Number((amount - fee).toFixed(2)), playedPaidGame };
}
function withdrawalEligibilityError(user, amount, excludeRequestId) {
  if (amount < MINIMUM_WITHDRAWAL) return `Minimum withdrawal amount is $${MINIMUM_WITHDRAWAL}.`;
  if (user.balance < amount) return "Insufficient balance for this withdrawal.";
  const withdrawable = getWithdrawableBalance(user.id, excludeRequestId);
  if (withdrawable < amount) {
    return withdrawable > 0 ? `Only $${withdrawable.toFixed(2)} is currently available to withdraw.` : `Deposit funds first. The $${WELCOME_BONUS.toFixed(0)} welcome bonus unlocks after $${BONUS_UNLOCK_DEPOSIT_TOTAL} in approved deposits.`;
  }
  return null;
}
function recordWithdrawalFee(userId, amount, requestId) {
  if (amount <= 0) return;
  recordHouseRevenue("withdrawal_fee", amount, requestId, `Withdrawal fee from user ${userId}${requestId ? ` for request ${requestId}` : ""}.`);
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
      broadcastToRoom(room.id, "game_update", room);
      addLog(room, `\u{1F916} Bot ${activePlayer.username} rolled a ${d}!`);
      const playerTokens = room.gameState.tokens.filter((t) => t.color === activePlayer.color);
      const validTokens = playerTokens.filter((t) => isMoveValid(t, d));
      if (validTokens.length === 0) {
        addLog(room, `\u{1F916} Bot ${activePlayer.username} has no valid moves.`);
        setTimeout(() => {
          advanceTurn(room);
          broadcastToRoom(room.id, "game_update", room);
          executeBotTurnIfActive(room);
        }, 900);
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
        }, 900);
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
        const realWinners = winningTeammates.filter((p) => !isBotPlayer(p.userId) && store.users[p.userId]);
        if (realWinners.length) {
          const effectiveRakePercentage = effectiveRakeForUsers(realWinners.map((p) => p.userId));
          const rakeAmount = Number((gs.escrowBalance * effectiveRakePercentage).toFixed(2));
          const payoutPool = Number((gs.escrowBalance - rakeAmount).toFixed(2));
          const baseShare = Math.floor(payoutPool * 100 / realWinners.length) / 100;
          let distributed = 0;
          realWinners.forEach((p, index) => {
            const user = store.users[p.userId];
            const share = index === realWinners.length - 1 ? Number((payoutPool - distributed).toFixed(2)) : baseShare;
            distributed += share;
            user.balance += share;
            user.winCount += 1;
            addTransaction(p.userId, "win_payout", share, room.id, `Team win payout for match ${room.id} (Rake: $${rakeAmount.toFixed(2)}).`);
            broadcastUserUpdate(p.userId);
          });
          recordHouseRevenue("team_game_rake", rakeAmount, room.id, `Team-game rake from match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (gs.escrowBalance > 0) {
          recordHouseRevenue("bot_result", gs.escrowBalance, room.id, `Real-player stakes retained after the bot team won match ${room.id}.`);
        }
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
          const effectiveRakePercentage = effectiveRakeForUsers([winnerProfile.id]);
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
          recordHouseRevenue("game_rake", rakeAmount, room.id, `Rake from match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (gs.escrowBalance > 0) {
          recordHouseRevenue("bot_result", gs.escrowBalance, room.id, `Real-player stakes retained after a bot won match ${room.id}.`);
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
          const effectiveRakePercentage = effectiveRakeForUsers([winnerProfile.id]);
          const rakeAmount = totalPayout * effectiveRakePercentage;
          const payoutAmount = totalPayout - rakeAmount;
          winnerProfile.balance += payoutAmount;
          winnerProfile.winCount += 1;
          addTransaction(winner.userId, "win_payout", payoutAmount, room.id, `Win by opponent inactivity forfeit (Rake: $${rakeAmount.toFixed(2)}).`);
          broadcastUserUpdate(winner.userId);
          recordHouseRevenue("forfeit_rake", rakeAmount, room.id, `Rake from forfeit match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (totalPayout > 0) {
          recordHouseRevenue("bot_result", totalPayout, room.id, `Real-player stakes retained after a bot won forfeit match ${room.id}.`);
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
  const activeConnectedUserIds = new Set(activeClients.map((c) => c.userId));
  Object.keys(store.matchmakingQueues).forEach((queueKey) => {
    const queueUserIds = store.matchmakingQueues[queueKey];
    if (!queueUserIds || queueUserIds.length === 0) return;
    const connectedQueueUserIds = queueUserIds.filter((id) => activeConnectedUserIds.has(id));
    if (connectedQueueUserIds.length === 0) {
      store.matchmakingQueues[queueKey] = [];
      return;
    }
    const parts = queueKey.split("_");
    const bet = parseFloat(parts[0]) || 0;
    const cap = parseInt(parts[1]) || 2;
    const mode = parts[2] === "team" ? "team" : "solo";
    const firstUserId = connectedQueueUserIds[0];
    const firstUser = store.users[firstUserId];
    if (!firstUser) return;
    const joinedAt = firstUser.seekingJoinedAt || Date.now();
    const waitTimeMs = Date.now() - joinedAt;
    if (waitTimeMs >= 18e4) {
      console.log(`Matchmaking timeout for queue ${queueKey}. Auto-filling remaining seats with bots...`);
      const realPlayers = connectedQueueUserIds.map((id) => store.users[id]).filter(Boolean);
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
      const vipTier = store.vipTiers[user.vip.tier];
      if (vipTier) {
        req.vipRakeDiscount = vipTier.rakeDiscount;
      }
    }
  }
  next();
};
app.post("/api/auth/otp/request", verifyFirebaseToken, async (req, res) => {
  if (!db || !auth) return res.status(500).json({ error: "Firebase is not configured." });
  const uid = req.user.uid;
  const email = String(req.user.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "This account has no email address." });
  const provider = req.user.firebase?.sign_in_provider;
  if (provider !== "password" && provider !== "google.com") return res.status(400).json({ error: "This sign-in provider does not support email OTP." });
  const ref = db.collection("emailOtps").doc(uid);
  const existing = await ref.get();
  const sentAt = Number(existing.data()?.sentAt || 0);
  if (Date.now() - sentAt < OTP_RESEND_MS) {
    return res.status(429).json({ error: `Please wait ${Math.ceil((OTP_RESEND_MS - (Date.now() - sentAt)) / 1e3)} seconds before requesting another code.` });
  }
  const otp = crypto.randomInt(1e5, 1e6).toString();
  await sendOtpEmail(email, otp);
  await ref.set({ email, provider, otpHash: hashEmailOtp(uid, otp), expiresAt: Date.now() + OTP_TTL_MS, sentAt: Date.now(), attempts: 0, verifiedAt: null });
  res.json({ success: true, message: "A 6-digit verification code was sent to your email.", expiresIn: OTP_TTL_MS / 1e3 });
});
app.post("/api/auth/otp/verify", verifyFirebaseToken, async (req, res) => {
  if (!db || !auth) return res.status(500).json({ error: "Firebase is not configured." });
  const otp = String(req.body?.otp || "").trim();
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: "Enter a valid 6-digit code." });
  const ref = db.collection("emailOtps").doc(req.user.uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(400).json({ error: "No active verification code. Request a new code." });
  const record = snapshot.data();
  if (Number(record.expiresAt) < Date.now()) {
    await ref.delete();
    return res.status(400).json({ error: "This code has expired. Request a new code." });
  }
  if (Number(record.attempts || 0) >= 5) {
    await ref.delete();
    return res.status(429).json({ error: "Too many incorrect attempts. Request a new code." });
  }
  const suppliedHash = Buffer.from(hashEmailOtp(req.user.uid, otp), "hex");
  const storedHash = Buffer.from(String(record.otpHash), "hex");
  if (suppliedHash.length !== storedHash.length || !crypto.timingSafeEqual(suppliedHash, storedHash)) {
    await ref.update({ attempts: Number(record.attempts || 0) + 1 });
    return res.status(400).json({ error: "Incorrect verification code." });
  }
  if (req.user.firebase?.sign_in_provider === "password") await auth.updateUser(req.user.uid, { emailVerified: true });
  await ref.set({ otpHash: null, expiresAt: null, attempts: 0, verifiedAt: Date.now() }, { merge: true });
  res.json({ success: true, message: "Email verified successfully." });
});
app.get("/api/auth/profile-status", verifyFirebaseToken, async (req, res) => {
  const profile = await findUserProfileInFirestore(req.user.uid, req.user.email);
  res.json({ exists: Boolean(profile?.id), otpVerified: Boolean(profile?.emailOtpVerifiedAt), linkedToAgent: Boolean(profile?.linkedAgentId) });
});
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});
app.get("/api/admin/migrate-users", async (req, res) => {
  if (!auth) {
    return res.status(503).json({ error: "Firebase Admin not configured. Cannot perform migration." });
  }
  try {
    const listUsersResult = await auth.listUsers(1e3);
    const allAuthUsers = listUsersResult.users;
    const existingFirestoreUids = new Set(Object.values(store.users).map((u) => u.firebaseUid));
    let createdCount = 0;
    let failedCount = 0;
    for (const userRecord of allAuthUsers) {
      if (userRecord.uid && !existingFirestoreUids.has(userRecord.uid)) {
        try {
          const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newUser = {
            id: userId,
            firebaseUid: userRecord.uid,
            username: userRecord.displayName || userRecord.email?.split("@")[0] || `user${Date.now()}`,
            email: userRecord.email,
            avatar: "\u{1F3B2}",
            balance: 1,
            // New user bonus
            winCount: 0,
            lossCount: 0
          };
          store.users[userId] = newUser;
          addTransaction(userId, "deposit", 1, void 0, "Welcome bonus (migrated user)");
          createdCount++;
        } catch (e) {
          failedCount++;
          console.error(`Failed to create profile for user UID: ${userRecord.uid}`, e);
        }
      }
    }
    if (createdCount > 0) {
      await saveStoreAndWait();
    }
    res.json({
      message: "User migration complete.",
      created_profiles: createdCount,
      failed_profiles: failedCount,
      total_auth_users: allAuthUsers.length
    });
  } catch (error) {
    console.error("Error during user migration:", error);
    res.status(500).json({ error: "Failed to migrate users.", details: error.message });
  }
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
  const { username, email, avatar, promoCode, onboardingComplete } = req.body;
  const firebaseUid = req.user.uid;
  const signInProvider = req.user.firebase?.sign_in_provider;
  if (!req.user.email_verified && signInProvider === "password") {
    return res.status(403).json({ error: "Please verify your email address before signing in." });
  }
  let foundUser = Object.values(store.users).find((u) => u.firebaseUid === firebaseUid);
  if (foundUser) {
    if (!foundUser.emailOtpVerifiedAt) {
      const otpVerification = db ? await db.collection("emailOtps").doc(firebaseUid).get() : null;
      const verifiedAt = Number(otpVerification?.data()?.verifiedAt || 0);
      if (onboardingComplete !== true || !verifiedAt) return res.status(428).json({ error: "Email OTP verification is required." });
      foundUser.emailOtpVerifiedAt = verifiedAt;
    }
    foundUser.avatar = normalizeAppAvatar(foundUser.avatar);
    if (!foundUser.linkedAgentId && normalizePromoCode(promoCode)) {
      const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
      if (!linkedAgent) return res.status(400).json({ error: "Invalid, expired, or inactive promo code." });
      foundUser.linkedAgentId = linkedAgent.id;
    }
    await saveUserProfileToFirestore(foundUser);
    return res.json(foundUser);
  }
  const persistedUser = await findUserProfileInFirestore(firebaseUid, email);
  if (persistedUser?.id) {
    if (!persistedUser.emailOtpVerifiedAt) {
      const otpVerification = db ? await db.collection("emailOtps").doc(firebaseUid).get() : null;
      const verifiedAt = Number(otpVerification?.data()?.verifiedAt || 0);
      if (onboardingComplete !== true || !verifiedAt) return res.status(428).json({ error: "Email OTP verification is required." });
      persistedUser.emailOtpVerifiedAt = verifiedAt;
    }
    persistedUser.firebaseUid = firebaseUid;
    persistedUser.email = persistedUser.email || email || void 0;
    persistedUser.avatar = normalizeAppAvatar(persistedUser.avatar);
    if (!persistedUser.linkedAgentId && normalizePromoCode(promoCode)) {
      const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
      if (!linkedAgent) return res.status(400).json({ error: "Invalid, expired, or inactive promo code." });
      persistedUser.linkedAgentId = linkedAgent.id;
    }
    store.users[persistedUser.id] = persistedUser;
    await saveUserProfileToFirestore(persistedUser);
    saveStore();
    return res.json(persistedUser);
  }
  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const userByEmail = Object.values(store.users).find(
      (u) => u.email?.trim().toLowerCase() === normalizedEmail && !u.firebaseUid
    );
    if (userByEmail) {
      const otpVerification = db ? await db.collection("emailOtps").doc(firebaseUid).get() : null;
      const verifiedAt = Number(otpVerification?.data()?.verifiedAt || 0);
      if (onboardingComplete !== true || !verifiedAt) return res.status(428).json({ error: "Email OTP verification is required." });
      userByEmail.firebaseUid = firebaseUid;
      userByEmail.email = normalizedEmail;
      userByEmail.emailOtpVerifiedAt = verifiedAt;
      if (!userByEmail.linkedAgentId && normalizePromoCode(promoCode)) {
        const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
        if (!linkedAgent) return res.status(400).json({ error: "Invalid, expired, or inactive promo code." });
        userByEmail.linkedAgentId = linkedAgent.id;
      }
      await saveUserProfileToFirestore(userByEmail);
      await saveStoreAndWait();
      return res.json(userByEmail);
    }
  }
  if (signInProvider === "google.com") {
    if (onboardingComplete !== true || !db) {
      return res.status(428).json({ error: "Complete email OTP verification and the promo-code step before continuing." });
    }
    const otpVerification = await db.collection("emailOtps").doc(firebaseUid).get();
    const verifiedAt = Number(otpVerification.data()?.verifiedAt || 0);
    if (!verifiedAt || Date.now() - verifiedAt > 30 * 60 * 1e3) {
      return res.status(403).json({ error: "Google onboarding OTP verification is required." });
    }
    await otpVerification.ref.delete();
  }
  const recoveredUsername = req.user.name || email?.split("@")[0] || `user${Date.now()}`;
  const cleanUsername = (username || recoveredUsername).trim().substring(0, 20);
  let linkedAgentId = void 0;
  const normalizedPromoCode = normalizePromoCode(promoCode);
  if (normalizedPromoCode) {
    if (!db) {
      return res.status(503).json({ error: "Promo code validation is temporarily unavailable." });
    }
    const agent = await resolveActiveAgentByPromoCode(normalizedPromoCode);
    if (!agent) {
      return res.status(400).json({ error: "Invalid or expired promo code." });
    }
    linkedAgentId = agent.id;
  }
  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const newUser = {
    id: userId,
    firebaseUid,
    username: cleanUsername,
    email: email?.trim().toLowerCase() || void 0,
    avatar: normalizeAppAvatar(avatar),
    balance: WELCOME_BONUS,
    winCount: 0,
    lossCount: 0,
    linkedAgentId,
    // Add the linked agent ID
    emailOtpVerifiedAt: Date.now()
  };
  store.users[userId] = newUser;
  addTransaction(userId, "deposit", WELCOME_BONUS, void 0, "Welcome signup bonus.");
  await saveUserProfileToFirestore(newUser);
  await saveStoreAndWait();
  res.json(newUser);
});
app.get("/api/users/leaderboard", async (req, res) => {
  const allUsers = Object.values(store.users).filter((u) => !u.id.startsWith("user_sim_") && !u.id.startsWith("bot_"));
  const rankedUsers = allUsers.map((u) => {
    const userTransactions = store.transactions.filter((t) => t.userId === u.id);
    const payoutsAndRefunds = userTransactions.filter((t) => t.type === "win_payout" || t.type === "refund").reduce((sum, t) => sum + t.amount, 0);
    const gameStakes = userTransactions.filter((t) => t.type === "bet_escrow_locked").reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { user: u, earnings: payoutsAndRefunds - gameStakes };
  });
  const sorted = rankedUsers.sort((a, b) => {
    if (b.earnings !== a.earnings) return b.earnings - a.earnings;
    return (b.user.winCount || 0) - (a.user.winCount || 0);
  }).slice(0, 5);
  const result = sorted.map(({ user: u, earnings }, index) => {
    return {
      id: u.id,
      rank: index + 1,
      name: u.username,
      avatar: u.avatar || "\u{1F3AE}",
      wins: u.winCount || 0,
      earnings
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
  const now = Date.now();
  if (db) {
    try {
      const qs = await db.collection("matchmaking").get();
      qs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.status === "WAITING_FOR_MATCH") {
          const isStale = now - (data.timestamp || 0) > 18e4;
          if (isStale) {
            db.collection("matchmaking").doc(data.userId).delete().catch(() => {
            });
            for (const qKey of Object.keys(store.matchmakingQueues)) {
              store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter((id) => id !== data.userId);
            }
          } else {
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
        }
      });
    } catch (e) {
      console.error("Failed to sync matchmaking from Firestore:", e);
    }
  }
  const onlineList = [];
  Object.values(store.users).forEach((u) => {
    if (u.id.startsWith("user_sim_")) return;
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
app.get("/api/users/:userId", async (req, res) => {
  const user = await refreshUserProfileById(req.params.userId);
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
  const eligibilityError = withdrawalEligibilityError(user, withAmt);
  if (eligibilityError) return res.status(400).json({ error: eligibilityError });
  user.balance -= withAmt;
  addTransaction(userId, "withdrawal", withAmt, void 0, `Withdrawn funds to bank account.`);
  recordWithdrawalFee(userId, getWithdrawalQuote(userId, withAmt).fee);
  broadcastUserUpdate(userId);
  res.json({ success: true, balance: user.balance });
});
app.post("/api/wallet/request-manual-confirmation", async (req, res) => {
  const { userId, agentId, amount, phone, senderPhone, provider, transactionType } = req.body;
  const requestAmount = Number(amount);
  if (!userId || !Number.isFinite(requestAmount) || requestAmount <= 0 || !provider || !transactionType) {
    return res.status(400).json({ error: "Missing required fields. `userId`, `amount`, `provider`, and `transactionType` are all required." });
  }
  if (transactionType !== "deposit" && transactionType !== "withdraw") {
    return res.status(400).json({ error: "Invalid transaction type." });
  }
  const user = await refreshUserProfileById(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  const assignedAgentId = user.linkedAgentId || void 0;
  if (assignedAgentId && agentId && assignedAgentId !== agentId) {
    return res.status(400).json({ error: "This account is locked to a specific agent. You can only transact with your assigned agent." });
  }
  if (transactionType === "withdraw" && !phone) {
    return res.status(400).json({ error: "Phone number is required for withdrawal requests." });
  }
  if (transactionType === "withdraw") {
    const eligibilityError = withdrawalEligibilityError(user, requestAmount);
    if (eligibilityError) return res.status(400).json({ error: eligibilityError });
  }
  if (transactionType === "deposit" && !senderPhone) {
    return res.status(400).json({ error: "Sender phone number is required for deposit requests." });
  }
  let assignedAgentUsername;
  if (assignedAgentId) {
    if (!db) {
      return res.status(503).json({ error: "The payment service is temporarily unavailable." });
    }
    try {
      const agentDoc = await db.collection("agents").doc(assignedAgentId).get();
      if (!agentDoc.exists) {
        return res.status(404).json({ error: "The selected agent does not exist." });
      }
      const selectedAgent = agentDoc.data();
      if (selectedAgent.status !== "Active") {
        return res.status(400).json({ error: "The selected agent is not active." });
      }
      assignedAgentUsername = selectedAgent.username;
    } catch (err) {
      console.error("Failed to verify agent for manual transaction request:", err);
      return res.status(500).json({ error: "Could not verify the selected agent." });
    }
  }
  const newRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId,
    username: user.username,
    agentId: assignedAgentId,
    agentUsername: assignedAgentUsername,
    managedBy: assignedAgentId ? "agent" : "admin",
    amount: requestAmount,
    ...transactionType === "withdraw" ? getWithdrawalQuote(user.id, requestAmount) : {},
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
  try {
    await saveManualRequestToFirestore(newRequest);
  } catch (error) {
    store.pendingManualTransactions = store.pendingManualTransactions.filter((request) => request.id !== newRequest.id);
    console.error("Failed to persist manual transaction request:", error);
    return res.status(503).json({ error: "Your request could not be saved. Please try again." });
  }
  if (!assignedAgentId) {
    try {
      await assignCashierToRequest(newRequest);
    } catch (error) {
      console.error(`Initial cashier assignment failed for ${newRequest.id}:`, error);
    }
  }
  await saveStoreAndWait();
  res.json({ success: true, message: "Your request has been submitted for review." });
});
app.get("/api/wallet/withdrawal-quote/:userId", async (req, res) => {
  const user = await refreshUserProfileById(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  const amount = Number(req.query.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Enter a valid withdrawal amount." });
  const eligibilityError = withdrawalEligibilityError(user, amount);
  if (eligibilityError) return res.status(400).json({ error: eligibilityError, withdrawableBalance: getWithdrawableBalance(user.id) });
  res.json({ amount, withdrawableBalance: getWithdrawableBalance(user.id), ...getWithdrawalQuote(user.id, amount) });
});
app.get("/api/wallet/transactions/:userId", (req, res) => {
  const txs = store.transactions.filter((t) => t.userId === req.params.userId);
  res.json(txs);
});
app.get("/api/payment/settings", (req, res) => {
  res.json(Object.fromEntries(Object.entries(store.paymentProviders).map(([key, config]) => [key, {
    enabled: config.enabled,
    accountNumber: config.accountNumber || ""
  }])));
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
    const eligibilityError = withdrawalEligibilityError(user, parsedAmount);
    if (eligibilityError) return res.status(400).json({ error: eligibilityError });
    user.balance -= parsedAmount;
    addTransaction(userId, "withdrawal", parsedAmount, void 0, `API withdrawal via ${providerKey}.`);
    recordWithdrawalFee(userId, getWithdrawalQuote(userId, parsedAmount).fee);
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
app.get("/api/vip/tiers", (_req, res) => {
  res.json(store.vipTiers);
});
var saveVipTiersFromAdmin = async (req, res) => {
  const submitted = req.body?.vipTiers;
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    return res.status(400).json({ error: "VIP plans are required." });
  }
  const normalized = {};
  for (const [key, value] of Object.entries(submitted)) {
    const id = key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const price = Number(value.price);
    const durationMonths = Number(value.durationMonths);
    const rakeDiscount = Number(value.rakeDiscount);
    const features = Array.isArray(value.features) ? value.features.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8) : [];
    if (!id || !String(value.name || "").trim() || !Number.isFinite(price) || price <= 0 || !Number.isInteger(durationMonths) || durationMonths < 1 || !Number.isFinite(rakeDiscount) || rakeDiscount < 0 || rakeDiscount > RAKE_PERCENTAGE) {
      return res.status(400).json({ error: `Invalid settings for VIP plan "${key}".` });
    }
    normalized[id] = { name: String(value.name).trim(), price, durationMonths, rakeDiscount, features };
  }
  if (!Object.keys(normalized).length) return res.status(400).json({ error: "At least one VIP plan is required." });
  store.vipTiers = normalized;
  await saveStoreAndWait();
  res.json({ success: true, vipTiers: store.vipTiers });
};
app.post("/api/vip/subscribe", verifyFirebaseToken, async (req, res) => {
  const { tier } = req.body;
  const firebaseUid = req.user.uid;
  const user = Object.values(store.users).find((u) => u.firebaseUid === firebaseUid);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  const vipTier = store.vipTiers[tier];
  if (!vipTier) {
    return res.status(400).json({ error: "Invalid VIP tier specified." });
  }
  if (user.balance < vipTier.price) {
    return res.status(400).json({ error: "Insufficient funds to purchase this VIP subscription." });
  }
  user.balance -= vipTier.price;
  const currentVipIsSameTier = user.vip?.tier === tier && user.vip.expires > Date.now();
  const startDate = currentVipIsSameTier ? user.vip.expires : Date.now();
  const endDate = startDate + vipTier.durationMonths * 30 * 24 * 60 * 60 * 1e3;
  user.vip = {
    tier,
    expires: endDate
  };
  addTransaction(user.id, "app_commission", vipTier.price, void 0, `VIP plan debit: ${vipTier.name}.`);
  recordHouseRevenue("vip_subscription", vipTier.price, user.id, `VIP subscription (${vipTier.name}) purchased by ${user.username}.`);
  await saveUserProfileToFirestore(user);
  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  res.json({
    success: true,
    user,
    message: currentVipIsSameTier ? `${vipTier.name} renewed successfully.` : `Successfully subscribed to ${vipTier.name}!`
  });
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
    const cancellationFee = Number((tournament.entryFee * TOURNAMENT_UNREGISTER_FEE_RATE).toFixed(2));
    const refundAmount = Number((tournament.entryFee - cancellationFee).toFixed(2));
    user.balance += refundAmount;
    addTransaction(user.id, "refund", refundAmount, id, `Refund after voluntarily unregistering from tournament "${tournament.name}" (fee: $${cancellationFee.toFixed(2)}).`);
    recordHouseRevenue("tournament_cancellation_fee", cancellationFee, id, `Tournament cancellation fee from ${user.username} for "${tournament.name}".`);
  }
  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  broadcastToAll("tournament_update", tournament);
  res.json({ success: true, tournament, message: `Unregistered from ${tournament.name}. A 10% cancellation fee was deducted.` });
});
app.post("/api/tournaments/:id/check-in", verifyFirebaseToken, async (req, res) => {
  const tournament = store.tournaments[req.params.id];
  if (!tournament || tournament.status !== "check_in" || !tournament.checkInDeadline || Date.now() > tournament.checkInDeadline) return res.status(400).json({ error: "Tournament check-in is not open." });
  const user = Object.values(store.users).find((u) => u.firebaseUid === req.user.uid);
  const player = user && tournament.players.find((p) => p.userId === user.id);
  if (!player) return res.status(403).json({ error: "You are not registered for this tournament." });
  player.checkedInAt = Date.now();
  await saveStoreAndWait();
  broadcastToAll("tournament_update", tournament);
  res.json({ success: true, tournament, message: "Tournament check-in confirmed." });
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
      const prizeAlreadyPaid = store.transactions.some((tx) => tx.matchId === tournament.id && tx.type === "win_payout" && /tournament/i.test(tx.description || ""));
      if (winnerUser && !prizeAlreadyPaid) {
        winnerUser.balance += tournament.prizePool;
        addTransaction(winnerUser.id, "win_payout", tournament.prizePool, tournament.id, `Tournament "${tournament.name}" prize.`);
        broadcastUserUpdate(winnerUser.id);
      }
      const collectedEntryFees = store.transactions.filter((tx) => tx.matchId === tournament.id && tx.type === "bet_escrow_locked" && /tournament entry fee/i.test(tx.description || "")).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const refundedEntryFees = store.transactions.filter((tx) => tx.matchId === tournament.id && (tx.type === "deposit" || tx.type === "refund") && /refund/i.test(tx.description || "")).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const netCollected = Math.max(0, collectedEntryFees - refundedEntryFees);
      const tournamentMargin = Number((netCollected - tournament.prizePool).toFixed(2));
      const marginAlreadyRecorded = store.transactions.some((tx) => tx.matchId === tournament.id && tx.revenueCategory === "tournament_margin");
      if (!marginAlreadyRecorded) {
        recordHouseRevenue(
          "tournament_margin",
          tournamentMargin,
          tournament.id,
          `Tournament margin for "${tournament.name}": $${netCollected.toFixed(2)} entries minus $${tournament.prizePool.toFixed(2)} prize.`
        );
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
    if (t.status === "check_in" && t.checkInDeadline && now >= t.checkInDeadline) {
      const checkedPlayers = t.players.filter((player) => player.checkedInAt);
      if (checkedPlayers.length === 0) {
        t.players.forEach((player) => {
          const user = store.users[player.userId];
          if (user && t.entryFee > 0) {
            user.balance += t.entryFee;
            addTransaction(user.id, "refund", t.entryFee, t.id, `Full refund because tournament "${t.name}" lacked checked-in players.`);
            broadcastUserUpdate(user.id);
          }
        });
        t.status = "cancelled";
        await saveStoreAndWait();
        broadcastToAll("tournament_update", t);
        return;
      }
      if (checkedPlayers.length === 1) {
        const winner = store.users[checkedPlayers[0].userId];
        t.players = checkedPlayers;
        t.winnerId = checkedPlayers[0].userId;
        t.status = "completed";
        t.endDate = Date.now();
        if (winner && !store.transactions.some((tx) => tx.matchId === t.id && tx.type === "win_payout" && /tournament/i.test(tx.description || ""))) {
          winner.balance += t.prizePool;
          addTransaction(winner.id, "win_payout", t.prizePool, t.id, `Tournament "${t.name}" walkover prize.`);
          broadcastUserUpdate(winner.id);
        }
        const collected = store.transactions.filter((tx) => tx.matchId === t.id && tx.type === "bet_escrow_locked" && /tournament entry fee/i.test(tx.description || "")).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
        if (!store.transactions.some((tx) => tx.matchId === t.id && tx.revenueCategory === "tournament_margin")) recordHouseRevenue("tournament_margin", Number((collected - t.prizePool).toFixed(2)), t.id, `Tournament margin for walkover tournament "${t.name}".`);
        await saveStoreAndWait();
        broadcastToAll("tournament_ended", t);
        return;
      }
      t.players = checkedPlayers;
      t.status = "in_progress";
      t.matches = createTournamentBracket(t);
      t.currentRound = 1;
      for (const match of t.matches) {
        if (match.status === "pending" && match.player1 && match.player2) {
          const room = startMatchedRoom([
            { id: match.player1.userId, username: match.player1.username, avatar: match.player1.avatar, balance: 0 },
            { id: match.player2.userId, username: match.player2.username, avatar: match.player2.avatar, balance: 0 }
          ], 0, 2, "solo");
          match.roomId = room.id;
          match.status = "in_progress";
          room.tournamentDetails = { tournamentId: t.id, matchId: match.id };
        }
      }
      await saveStoreAndWait();
      broadcastToAll("tournament_started", t);
      return;
    }
    if (t.status === "registration_open" && now >= t.startDate) {
      const maximumSustainablePrize = Number((t.entryFee * t.maxPlayers * 0.9).toFixed(2));
      if (/^tourney_(weekly|weekend|daily)_/.test(t.id) && t.prizePool > maximumSustainablePrize) {
        t.prizePool = maximumSustainablePrize;
      }
      const collectedEntryFees = Number((t.entryFee * t.players.length).toFixed(2));
      if (t.players.length >= 2 && collectedEntryFees >= t.prizePool) {
        t.status = "check_in";
        t.checkInDeadline = now + TOURNAMENT_CHECK_IN_MS;
        await saveStoreAndWait();
        broadcastToAll("tournament_check_in", t);
      } else {
        t.postponementCount = Number(t.postponementCount || 0) + 1;
        if (t.postponementCount >= TOURNAMENT_MAX_POSTPONEMENTS) {
          t.players.forEach((player) => {
            const user = store.users[player.userId];
            if (user) {
              user.balance += t.entryFee;
              addTransaction(user.id, "refund", t.entryFee, t.id, `Full refund for cancelled underfunded tournament "${t.name}".`);
              broadcastUserUpdate(user.id);
            }
          });
          t.status = "cancelled";
        } else {
          t.startDate = now + 12 * 60 * 60 * 1e3;
        }
        await saveStoreAndWait();
        broadcastToAll("tournament_update", t);
      }
    }
  });
}
setInterval(checkAndStartTournaments, 1e4);
setInterval(() => {
  const now = Date.now();
  Object.keys(store.rooms).forEach((roomId) => {
    const room = store.rooms[roomId];
    if (room.status === "playing") {
      const activeHumanPlayers = room.players.filter((p) => !isBotPlayer(p.userId) && p.status !== "left");
      const lastAct = room.gameState?.lastActivity || room.createdAt || now;
      if (activeHumanPlayers.length === 0 || now - lastAct > 15 * 60 * 1e3) {
        room.status = "completed";
        addLog(room, "Room closed due to inactivity or abandonment.");
        saveStore();
      }
    }
  });
}, 3e4);
app.get("/api/rooms/active", (req, res) => {
  const now = Date.now();
  const activeGames = Object.values(store.rooms).filter((r) => {
    if (r.status !== "playing") return false;
    if (r.gameState?.winnerId) return false;
    const activeHumanPlayers = r.players.filter((p) => !isBotPlayer(p.userId) && p.status !== "left");
    if (activeHumanPlayers.length === 0) return false;
    const lastAct = r.gameState?.lastActivity || r.createdAt || now;
    if (now - lastAct > 15 * 60 * 1e3) return false;
    return true;
  }).map((r) => ({
    id: r.id,
    players: r.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      status: p.status
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
      return { ...agentData, id: agentData.id || doc.id };
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
  if (type === "withdrawal") {
    const eligibilityError = withdrawalEligibilityError(player, requestAmount);
    if (eligibilityError) return res.status(400).json({ error: eligibilityError });
  }
  try {
    const agentDoc = await db.collection("agents").doc(agentId).get();
    if (!agentDoc.exists) {
      return res.status(404).json({ error: "The selected agent does not exist." });
    }
    const selectedAgent = agentDoc.data();
    if (selectedAgent.status !== "Active") {
      return res.status(400).json({ error: "The selected agent is not active." });
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
    balance: u.balance || 0,
    inactivityTimer: isBotPlayer(u.id) ? void 0 : 300
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
    if (!isBotPlayer(p.userId)) totalEscrow += bet;
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
app.post("/api/rooms/matchmaking/enter-queue", async (req, res) => {
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
      syncMatchmakingRecordWithRetry(userId, {
        userId,
        username: user.username,
        avatar: user.avatar,
        betAmount: bet,
        capacity: cap,
        gameMode: mode,
        status: "WAITING_FOR_MATCH",
        timestamp: Date.now()
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
    if (!isBotPlayer(pl.userId)) totalEscrow += bet;
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
    if (adminUser.status === "suspended") {
      return res.status(403).json({ error: "Access denied. This admin account is suspended." });
    }
    adminUser.permissions = normalizeAdminPermissions(adminUser.permissions);
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
var hasAnyPermission = (...required) => async (req, res, next) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const adminId = req.query.userId;
  if (!adminId) return res.status(403).json({ error: "Admin user ID is required." });
  const doc = await db.collection("adminUsers").doc(adminId).get();
  if (!doc.exists) return res.status(403).json({ error: "Invalid admin user." });
  const permissions = normalizeAdminPermissions(doc.data()?.permissions);
  if (permissions.includes("all") || required.some((permission) => permissions.includes(permission))) {
    req.adminPermissions = permissions;
    req.adminUser = { id: doc.id, ...doc.data() };
    return next();
  }
  return res.status(403).json({ error: "You do not have permission for this action." });
};
app.post("/api/admin/cashier/heartbeat", hasPermission("cashier"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const adminId = String(req.query.userId || "");
  const ref = db.collection("adminUsers").doc(adminId);
  const snapshot = await ref.get();
  const admin = snapshot.data();
  if (cashierCities(admin || {}).length === 0) return res.status(400).json({ error: "Cashier city is not configured." });
  const cashierOnlineAt = Date.now();
  await ref.update({ cashierOnlineAt });
  await reassignExpiredCashierRequests(cashierOnlineAt);
  res.json({ success: true, cashierOnlineAt, locations: cashierCities(admin) });
});
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
      const admin = doc.data();
      if (admin.status === "suspended") {
        return res.status(403).json({ error: "Access denied. This admin account is suspended." });
      }
      next();
    } else {
      res.status(403).json({ error: "Access denied. Invalid admin user." });
    }
  } catch (error) {
    console.error("Admin validation failed:", error);
    res.status(500).json({ error: "An error occurred during admin validation." });
  }
};
app.get("/api/admin/tournaments", hasPermission("tournaments"), (req, res) => {
  seedDefaultTournaments();
  const tournamentsList = Object.values(store.tournaments);
  tournamentsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(tournamentsList);
});
app.post("/api/admin/tournaments/create", hasPermission("tournaments"), async (req, res) => {
  const { name, entryFee, prizePool, maxPlayers, startDate } = req.body;
  if (!name || entryFee === void 0 || !prizePool || !maxPlayers || !startDate) {
    return res.status(400).json({ error: "Missing required tournament fields." });
  }
  const parsedEntryFee = parseFloat(entryFee);
  const parsedPrizePool = parseFloat(prizePool);
  const parsedMaxPlayers = parseInt(maxPlayers, 10);
  if (!Number.isFinite(parsedEntryFee) || parsedEntryFee <= 0 || !Number.isFinite(parsedPrizePool) || parsedPrizePool <= 0 || !Number.isInteger(parsedMaxPlayers) || parsedMaxPlayers < 2) {
    return res.status(400).json({ error: "Entry fee, prize pool and player capacity must be valid positive values." });
  }
  const sustainablePrizeLimit = Number((parsedEntryFee * parsedMaxPlayers * 0.9).toFixed(2));
  if (parsedPrizePool > sustainablePrizeLimit) {
    return res.status(400).json({ error: `Prize pool cannot exceed $${sustainablePrizeLimit.toFixed(2)} (90% of maximum entry fees).` });
  }
  const id = `tourney_${Date.now()}`;
  const newTournament = {
    id,
    name: String(name).trim(),
    entryFee: parsedEntryFee,
    prizePool: parsedPrizePool,
    status: "registration_open",
    players: [],
    maxPlayers: parsedMaxPlayers,
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
app.post("/api/admin/tournaments/:id/cancel", hasPermission("tournaments"), async (req, res) => {
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
app.delete("/api/admin/tournaments/:id", hasPermission("tournaments"), async (req, res) => {
  const tournamentId = req.params.id;
  const tournament = store.tournaments[tournamentId];
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  if (tournament.players.length > 0 && tournament.status !== "cancelled") return res.status(409).json({ error: "Cancel this tournament and refund its players before deleting it." });
  delete store.tournaments[tournamentId];
  await saveStoreAndWait();
  res.json({ success: true, message: "Tournament deleted successfully." });
});
app.post("/api/admin/tournaments/:id/start", hasPermission("tournaments"), async (req, res) => {
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
  const collectedEntryFees = tournament.entryFee * tournament.players.length;
  if (collectedEntryFees < tournament.prizePool) return res.status(400).json({ error: "Tournament prize is not fully funded by registered entry fees." });
  tournament.status = "check_in";
  tournament.checkInDeadline = Date.now() + TOURNAMENT_CHECK_IN_MS;
  await saveStoreAndWait();
  broadcastToAll("tournament_check_in", tournament);
  res.json({ success: true, tournament, message: `Check-in opened for tournament "${tournament.name}".` });
});
app.post("/api/admin/tournaments/:id/remove-player", hasPermission("tournaments"), async (req, res) => {
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
app.post("/api/admin/tournaments/:id/edit", hasPermission("tournaments"), async (req, res) => {
  const tournamentId = req.params.id;
  const { name, entryFee, prizePool, maxPlayers, startDate } = req.body;
  const tournament = store.tournaments[tournamentId];
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  const nextEntryFee = entryFee !== void 0 ? parseFloat(entryFee) : tournament.entryFee;
  const nextPrizePool = prizePool !== void 0 ? parseFloat(prizePool) : tournament.prizePool;
  const nextMaxPlayers = maxPlayers !== void 0 ? parseInt(maxPlayers, 10) : tournament.maxPlayers;
  if (!Number.isFinite(nextEntryFee) || nextEntryFee <= 0 || !Number.isFinite(nextPrizePool) || nextPrizePool <= 0 || !Number.isInteger(nextMaxPlayers) || nextMaxPlayers < Math.max(2, tournament.players.length)) {
    return res.status(400).json({ error: "Tournament financial settings or player capacity are invalid." });
  }
  const sustainablePrizeLimit = Number((nextEntryFee * nextMaxPlayers * 0.9).toFixed(2));
  if (nextPrizePool > sustainablePrizeLimit) {
    return res.status(400).json({ error: `Prize pool cannot exceed $${sustainablePrizeLimit.toFixed(2)} (90% of maximum entry fees).` });
  }
  if (name) tournament.name = String(name).trim();
  tournament.entryFee = nextEntryFee;
  tournament.prizePool = nextPrizePool;
  tournament.maxPlayers = nextMaxPlayers;
  if (startDate) tournament.startDate = new Date(startDate).getTime();
  await saveStoreAndWait();
  broadcastToAll("tournament_update", tournament);
  res.json({ success: true, tournament, message: `Tournament "${tournament.name}" updated successfully!` });
});
app.get("/api/admin/vip-tiers", hasPermission("settings"), (_req, res) => res.json(store.vipTiers));
app.post("/api/admin/vip-tiers", hasPermission("settings"), saveVipTiersFromAdmin);
app.get("/api/admin/settings", hasPermission("settings"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  try {
    const adminUsersSnapshot = await db.collection("adminUsers").get();
    const roles = await Promise.all(adminUsersSnapshot.docs.map(async (doc) => {
      const data = doc.data();
      const normalizedPermissions = normalizeAdminPermissions(data.permissions);
      const status = data.status === "suspended" ? "suspended" : "active";
      if (JSON.stringify(data.permissions || []) !== JSON.stringify(normalizedPermissions) || data.status !== status) {
        await doc.ref.update({ permissions: normalizedPermissions, status });
      }
      const { password, ...roleData } = data;
      return { ...roleData, id: data.id || doc.id, permissions: normalizedPermissions, status };
    }));
    res.json({
      username: store.adminSettings?.username || process.env.ADMIN_USERNAME || "admin",
      passwordConfigured: Boolean(store.adminSettings?.password),
      roles,
      vipTiers: store.vipTiers,
      adSettings: store.adSettings
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
  const { username, password, permissions, name, location, cashierLocations, cashierMonthlySalary, cashierMonthlyTarget, cashierTargetBonus } = req.body;
  const normalizedPermissions = normalizeAdminPermissions(permissions);
  if (!username || !password || !Array.isArray(permissions) || !name) {
    return res.status(400).json({ error: "Role Name, username, password, and a list of permissions are required." });
  }
  if (String(username).trim().length < 3 || String(password).length < 6 || String(name).trim().length < 2) {
    return res.status(400).json({ error: "Role name and username are required; password must be at least 6 characters." });
  }
  if (normalizedPermissions.length === 0) {
    return res.status(400).json({ error: "Select at least one valid permission." });
  }
  const submittedCashierLocations = [...new Set([...Array.isArray(cashierLocations) ? cashierLocations : [], location].map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 2);
  if (normalizedPermissions.includes("cashier") && submittedCashierLocations.length === 0) {
    return res.status(400).json({ error: "Cashier location/city is required." });
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
      username: String(username).trim(),
      password,
      // In a real app, this MUST be hashed.
      permissions: normalizedPermissions,
      name: String(name).trim(),
      status: "active",
      location: normalizedPermissions.includes("cashier") ? submittedCashierLocations[0] : "",
      cashierLocations: normalizedPermissions.includes("cashier") ? submittedCashierLocations : [],
      cashierMonthlySalary: normalizedPermissions.includes("cashier") ? Math.max(0, Number(cashierMonthlySalary || 0)) : 0,
      cashierMonthlyTarget: normalizedPermissions.includes("cashier") ? Math.max(0, Math.floor(Number(cashierMonthlyTarget || 0))) : 0,
      cashierTargetBonus: normalizedPermissions.includes("cashier") ? Math.max(0, Number(cashierTargetBonus || 0)) : 0,
      cashierNextSalaryDate: normalizedPermissions.includes("cashier") ? Date.now() + 30 * 24 * 60 * 60 * 1e3 : void 0
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
  const roleId = req.params.roleId;
  const updatedData = { ...req.body };
  if (!roleId) {
    return res.status(400).json({ error: "Role ID is required." });
  }
  try {
    const adminRef = db.collection("adminUsers").doc(roleId);
    const doc = await adminRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Admin role not found." });
    }
    const adminData = doc.data();
    const targetUsername = String(adminData.username || "").toLowerCase();
    const targetName = String(adminData.name || "").toLowerCase();
    const isFullAdminTarget = adminData.permissions?.includes("all") || targetUsername === "admin" || targetName.includes("super admin") || targetName.includes("full admin");
    if (isFullAdminTarget) {
      return res.status(400).json({ error: "Full Admin accounts are protected and cannot be edited, suspended, or deleted." });
    }
    if (updatedData.password === "") {
      delete updatedData.password;
    }
    if (updatedData.permissions !== void 0) {
      const normalizedPermissions = normalizeAdminPermissions(updatedData.permissions);
      if (normalizedPermissions.length === 0) {
        return res.status(400).json({ error: "Select at least one valid permission." });
      }
      updatedData.permissions = normalizedPermissions;
    }
    const effectivePermissions = updatedData.permissions || normalizeAdminPermissions(adminData.permissions);
    const effectiveCashierLocations = [...new Set([...Array.isArray(updatedData.cashierLocations) ? updatedData.cashierLocations : adminData.cashierLocations || [], updatedData.location ?? adminData.location].map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 2);
    if (effectivePermissions.includes("cashier") && effectiveCashierLocations.length === 0) {
      return res.status(400).json({ error: "Cashier location/city is required." });
    }
    updatedData.location = effectivePermissions.includes("cashier") ? effectiveCashierLocations[0] : "";
    updatedData.cashierLocations = effectivePermissions.includes("cashier") ? effectiveCashierLocations : [];
    for (const field of ["cashierMonthlySalary", "cashierTargetBonus"]) {
      if (updatedData[field] !== void 0) updatedData[field] = Math.max(0, Number(updatedData[field]) || 0);
    }
    if (updatedData.cashierMonthlyTarget !== void 0) updatedData.cashierMonthlyTarget = Math.max(0, Math.floor(Number(updatedData.cashierMonthlyTarget) || 0));
    if (!effectivePermissions.includes("cashier")) {
      updatedData.cashierMonthlySalary = 0;
      updatedData.cashierMonthlyTarget = 0;
      updatedData.cashierTargetBonus = 0;
    }
    delete updatedData.cashierOnlineAt;
    if (updatedData.status !== void 0 && !["active", "suspended"].includes(updatedData.status)) {
      return res.status(400).json({ error: "Invalid role status." });
    }
    if (updatedData.name !== void 0) updatedData.name = String(updatedData.name).trim();
    if (updatedData.username !== void 0) updatedData.username = String(updatedData.username).trim();
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
  const roleId = req.params.roleId;
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
    const targetUsername = String(adminData.username || "").toLowerCase();
    const targetName = String(adminData.name || "").toLowerCase();
    const isFullAdminTarget = adminData.permissions?.includes("all") || targetUsername === "admin" || targetName.includes("super admin") || targetName.includes("full admin");
    if (isFullAdminTarget) {
      return res.status(400).json({ error: "Full Admin accounts are protected and cannot be deleted." });
    }
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
app.get("/api/admin/stats", hasPermission("stats"), async (req, res) => {
  const users = Object.values(store.users).filter((user) => !user.id.startsWith("bot_") && !user.id.startsWith("user_sim_"));
  const rooms = Object.values(store.rooms);
  const tournaments = Object.values(store.tournaments);
  const manualTransactions = store.pendingManualTransactions || [];
  const monthBuckets = /* @__PURE__ */ new Map();
  const now = /* @__PURE__ */ new Date();
  const revenueBreakdown = {
    game_rake: 0,
    team_game_rake: 0,
    forfeit_rake: 0,
    bot_result: 0,
    withdrawal_fee: 0,
    vip_subscription: 0,
    tournament_margin: 0,
    tournament_cancellation_fee: 0
  };
  const inferRevenueCategory = (tx) => {
    if (tx.revenueCategory) return tx.revenueCategory;
    const description = String(tx.description || "");
    if (/vip subscription/i.test(description)) return "vip_subscription";
    if (/withdrawal fee/i.test(description)) return "withdrawal_fee";
    if (/forfeit.*rake|rake from forfeit/i.test(description)) return "forfeit_rake";
    if (/team-game rake|team game rake/i.test(description)) return "team_game_rake";
    if (/bot.*won|bot result/i.test(description)) return "bot_result";
    if (/tournament margin/i.test(description)) return "tournament_margin";
    if (/tournament cancellation fee/i.test(description)) return "tournament_cancellation_fee";
    if (/rake from match/i.test(description)) return "game_rake";
    return null;
  };
  store.transactions.forEach((tx) => {
    if (tx.type !== "app_commission") return;
    const category = inferRevenueCategory(tx);
    if (category) revenueBreakdown[category] += Number(tx.amount || 0);
  });
  Object.keys(revenueBreakdown).forEach((key) => {
    revenueBreakdown[key] = Number(revenueBreakdown[key].toFixed(2));
  });
  const recordedHouseRevenue = Number(Object.values(revenueBreakdown).reduce((sum, value) => sum + value, 0).toFixed(2));
  const welcomeBonusCost = Number(store.transactions.filter((tx) => /welcome signup bonus/i.test(tx.description || "")).reduce((sum, tx) => sum + Number(tx.amount || 0), 0).toFixed(2));
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthBuckets.set(key, { month: date.toLocaleString("en", { month: "short" }), deposits: 0, withdrawals: 0, transactions: 0 });
  }
  store.transactions.forEach((tx) => {
    const date = new Date(tx.timestamp);
    const bucket = monthBuckets.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (!bucket) return;
    bucket.transactions += 1;
    if (tx.type === "deposit" || tx.type === "win_payout" || tx.type === "refund") bucket.deposits += Number(tx.amount || 0);
    if (tx.type === "withdrawal") bucket.withdrawals += Number(tx.amount || 0);
  });
  let totalAgents = 0;
  let activeAgents = 0;
  let pendingAgentRequests = 0;
  let agentFloatIssued = 0;
  let agentFloatCash = 0;
  let agentCommissionDiscounts = 0;
  let monthlyAgents = 0;
  let monthlySalaryLiability = 0;
  let cashierPayrollPaid = 0;
  if (db) {
    try {
      const [agentsSnapshot, agentRequestsSnapshot, agentTransactionsSnapshot, cashierPaymentsSnapshot] = await Promise.all([
        db.collection("agents").get(),
        db.collection("agentRequests").where("status", "==", "pending").get(),
        db.collection("agentTransactions").get(),
        db.collection("cashierPayments").get()
      ]);
      totalAgents = agentsSnapshot.size;
      activeAgents = agentsSnapshot.docs.filter((doc) => doc.data().status === "Active").length;
      monthlyAgents = agentsSnapshot.docs.filter((doc) => doc.data().businessModel === "monthly").length;
      monthlySalaryLiability = agentsSnapshot.docs.filter((doc) => doc.data().businessModel === "monthly" && doc.data().status === "Active").reduce((sum, doc) => sum + Number(doc.data().monthlySalary || 0), 0);
      pendingAgentRequests = agentRequestsSnapshot.size;
      agentTransactionsSnapshot.docs.forEach((doc) => {
        const tx = doc.data();
        if (tx.type !== "FloatPurchase" || Number(tx.amount || 0) <= 0) return;
        const amount = Number(tx.amount || 0);
        const discount = Math.max(0, Number(tx.discountAmount || 0));
        agentFloatIssued += amount;
        agentCommissionDiscounts += discount;
        agentFloatCash += Math.max(0, amount - discount);
      });
      cashierPayrollPaid = cashierPaymentsSnapshot.docs.reduce((sum, doc) => sum + Number(doc.data().total || 0), 0);
    } catch (error) {
      console.error("Failed to include Firestore agent metrics in admin stats:", error);
    }
  }
  const recentActivity = [
    ...store.transactions.slice(-8).map((tx) => ({ id: tx.id, kind: "transaction", title: tx.description, amount: tx.amount, status: tx.status || "completed", timestamp: tx.timestamp })),
    ...manualTransactions.slice(0, 8).map((tx) => ({ id: tx.id, kind: "manual", title: `${tx.username} requested a ${tx.transactionType}`, amount: tx.amount, status: tx.status, timestamp: tx.createdAt }))
  ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  res.json({
    totalUsers: users.length,
    totalRooms: rooms.length,
    activeRooms: rooms.filter((r) => r.status === "playing").length,
    waitingRooms: rooms.filter((r) => r.status === "waiting").length,
    completedRooms: rooms.filter((r) => r.status === "completed").length,
    houseRevenue: recordedHouseRevenue,
    netPlatformEarnings: Number((recordedHouseRevenue - agentCommissionDiscounts - welcomeBonusCost - cashierPayrollPaid).toFixed(2)),
    revenueBreakdown,
    welcomeBonusCost,
    agentFloatIssued: Number(agentFloatIssued.toFixed(2)),
    agentFloatCash: Number(agentFloatCash.toFixed(2)),
    agentCommissionDiscounts: Number(agentCommissionDiscounts.toFixed(2)),
    monthlyAgents,
    monthlySalaryLiability: Number(monthlySalaryLiability.toFixed(2)),
    cashierPayrollPaid: Number(cashierPayrollPaid.toFixed(2)),
    onlineClients: activeClients.length,
    totalTransactions: store.transactions.length,
    pendingAdminTransactions: manualTransactions.filter((tx) => tx.status === "pending" && tx.managedBy !== "agent").length,
    pendingAgentTransactions: manualTransactions.filter((tx) => tx.status === "pending" && tx.managedBy === "agent").length,
    totalAgents,
    activeAgents,
    pendingAgentRequests,
    openTournaments: tournaments.filter((t) => t.status === "registration_open").length,
    activeTournaments: tournaments.filter((t) => t.status === "in_progress").length,
    totalTournamentPlayers: tournaments.reduce((sum, tournament) => sum + tournament.players.length, 0),
    monthlyActivity: [...monthBuckets.values()],
    recentActivity
  });
});
app.get("/api/admin/users", hasPermission("users"), (req, res) => {
  res.json(Object.values(store.users));
});
app.get("/api/admin/rooms", hasPermission("rooms"), (req, res) => {
  res.json(Object.values(store.rooms));
});
app.get("/api/admin/transactions", hasPermission("transactions"), (req, res) => {
  res.json(store.transactions);
});
app.get("/api/admin/manual-transactions", hasAnyPermission("transactions", "cashier"), async (req, res) => {
  await reassignExpiredCashierRequests();
  const agentNames = /* @__PURE__ */ new Map();
  if (db) {
    const linkedAgentIds = [...new Set(
      Object.values(store.users).map((user) => user.linkedAgentId).filter((id) => Boolean(id))
    )];
    await Promise.all(linkedAgentIds.map(async (agentId) => {
      try {
        const agentDoc = await db.collection("agents").doc(agentId).get();
        if (agentDoc.exists) {
          agentNames.set(agentId, agentDoc.data().username);
        }
      } catch (error) {
        console.error(`Failed to load agent ${agentId} for admin transaction monitoring:`, error);
      }
    }));
  }
  const transactions = (store.pendingManualTransactions || []).map((tx) => {
    const user = store.users[tx.userId];
    const linkedAgentId = user?.linkedAgentId;
    return {
      ...tx,
      agentId: linkedAgentId || tx.agentId,
      agentUsername: tx.agentUsername || (linkedAgentId ? agentNames.get(linkedAgentId) : void 0),
      managedBy: tx.managedBy || (linkedAgentId ? "agent" : "admin")
    };
  });
  const permissions = req.adminPermissions || [];
  const cashierOnly = permissions.includes("cashier") && !permissions.includes("transactions") && !permissions.includes("all");
  const adminId = String(req.query.userId || "");
  res.json(cashierOnly ? transactions.filter((tx) => tx.managedBy !== "agent" && tx.assignedCashierId === adminId) : transactions);
});
function cashierPeriod(now = /* @__PURE__ */ new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { key, start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1) };
}
app.get("/api/admin/cashiers", hasPermission("settings"), async (_req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const now = Date.now();
  const period = cashierPeriod();
  const [adminsSnapshot, paymentsSnapshot] = await Promise.all([
    db.collection("adminUsers").get(),
    db.collection("cashierPayments").get()
  ]);
  const paidByCashier = new Map(paymentsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((payment) => payment.period === period.key).map((payment) => [payment.cashierId, payment]));
  const periodRequests = store.pendingManualTransactions.filter((request) => request.createdAt >= period.start && request.createdAt < period.end && request.managedBy !== "agent");
  const cashiers = adminsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((admin) => normalizeAdminPermissions(admin.permissions).includes("cashier")).map((cashier) => {
    const resolved = periodRequests.filter((request) => request.resolvedBy === cashier.id);
    const approved = resolved.filter((request) => request.status === "approved");
    const rejected = resolved.filter((request) => request.status === "rejected");
    const responseSamples = resolved.filter((request) => request.resolvedAt && request.assignedCashierAt).map((request) => Math.max(0, Number(request.resolvedAt) - Number(request.assignedCashierAt)));
    const timedOut = periodRequests.reduce((count, request) => count + (request.cashierTimedOutIds || []).filter((id) => id === cashier.id).length, 0);
    const monthlyTarget = Math.max(0, Number(cashier.cashierMonthlyTarget || 0));
    const targetReached = monthlyTarget > 0 && approved.length >= monthlyTarget;
    const salary = Math.max(0, Number(cashier.cashierMonthlySalary || 0));
    const bonus = targetReached ? Math.max(0, Number(cashier.cashierTargetBonus || 0)) : 0;
    const payment = paidByCashier.get(cashier.id);
    return {
      id: cashier.id,
      username: cashier.username,
      name: cashier.name,
      location: cashier.location,
      locations: cashierCities(cashier),
      status: cashier.status || "active",
      online: cashier.status !== "suspended" && Number(cashier.cashierOnlineAt || 0) >= now - CASHIER_ONLINE_WINDOW_MS,
      lastSeenAt: Number(cashier.cashierOnlineAt || 0),
      monthlySalary: salary,
      monthlyTarget,
      targetBonus: Math.max(0, Number(cashier.cashierTargetBonus || 0)),
      targetReached,
      approved: approved.length,
      rejected: rejected.length,
      completed: resolved.length,
      deposits: approved.filter((request) => request.transactionType === "deposit").length,
      withdrawals: approved.filter((request) => request.transactionType === "withdraw").length,
      handledAmount: Number(approved.reduce((sum, request) => sum + Number(request.amount || 0), 0).toFixed(2)),
      averageResponseSeconds: responseSamples.length ? Math.round(responseSamples.reduce((sum, value) => sum + value, 0) / responseSamples.length / 1e3) : 0,
      timedOut,
      period: period.key,
      salaryStatus: payment ? "paid" : Number(cashier.cashierNextSalaryDate || 0) <= now ? "due" : "pending",
      payableAmount: Number((salary + bonus).toFixed(2)),
      paidAt: payment?.paidAt
    };
  });
  const history = paymentsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => Number(b.paidAt || 0) - Number(a.paidAt || 0));
  res.json({ period: period.key, cashiers, history });
});
app.post("/api/admin/cashiers/:cashierId/pay", hasPermission("settings"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const cashierId = String(req.params.cashierId || "");
  const adminId = String(req.query.userId || "");
  const period = cashierPeriod();
  const cashierRef = db.collection("adminUsers").doc(cashierId);
  const paymentRef = db.collection("cashierPayments").doc(`${cashierId}_${period.key}`);
  try {
    const result = await db.runTransaction(async (transaction) => {
      const [cashierDoc, paymentDoc] = await Promise.all([transaction.get(cashierRef), transaction.get(paymentRef)]);
      if (!cashierDoc.exists) throw new Error("Cashier not found.");
      if (paymentDoc.exists) throw new Error("This cashier has already been paid for the current period.");
      const cashier = cashierDoc.data();
      if (!normalizeAdminPermissions(cashier.permissions).includes("cashier")) throw new Error("Selected account is not a cashier.");
      const approved = store.pendingManualTransactions.filter((request) => request.managedBy !== "agent" && request.resolvedBy === cashierId && request.status === "approved" && request.createdAt >= period.start && request.createdAt < period.end).length;
      const target = Math.max(0, Number(cashier.cashierMonthlyTarget || 0));
      const salary = Math.max(0, Number(cashier.cashierMonthlySalary || 0));
      const bonus = target > 0 && approved >= target ? Math.max(0, Number(cashier.cashierTargetBonus || 0)) : 0;
      const payment = { cashierId, cashierName: cashier.name || cashier.username, period: period.key, salary, bonus, total: Number((salary + bonus).toFixed(2)), approvedCount: approved, paidAt: Date.now(), paidBy: adminId };
      transaction.set(paymentRef, payment);
      transaction.update(cashierRef, { cashierNextSalaryDate: period.end });
      return payment;
    });
    res.json({ success: true, payment: result });
  } catch (error) {
    const message = error?.message || "Cashier payment could not be recorded.";
    res.status(message.includes("already been paid") ? 409 : 400).json({ error: message });
  }
});
app.get("/api/admin/payment-settings", hasPermission("settings"), (req, res) => {
  res.json(store.paymentProviders);
});
app.post("/api/admin/payment-settings", hasPermission("settings"), async (req, res) => {
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
app.get("/api/ads/active", (_req, res) => res.json(store.adSettings || DEFAULT_AD_SETTINGS));
app.get("/api/admin/ad-settings", hasPermission("settings"), (_req, res) => res.json(store.adSettings || DEFAULT_AD_SETTINGS));
app.post("/api/admin/ad-settings", hasPermission("settings"), async (req, res) => {
  const value = req.body || {};
  const formats = ["banner", "ticker", "popup", "adsense"];
  const placements = ["all", "dashboard", "game"];
  const durationSeconds = Math.max(1, Math.min(180, Math.round(Number(value.durationSeconds) || 3)));
  const intervalSeconds = Math.max(10, durationSeconds, Math.min(3600, Math.round(Number(value.intervalSeconds) || 60)));
  if (!formats.includes(value.format) || !placements.includes(value.placement)) return res.status(400).json({ error: "Invalid ad format or placement." });
  if (value.enabled && value.format !== "adsense" && !String(value.title || value.message || value.imageUrl || "").trim()) return res.status(400).json({ error: "Add ad text or an image before enabling the campaign." });
  store.adSettings = { ...DEFAULT_AD_SETTINGS, ...value, durationSeconds, intervalSeconds, updatedAt: Date.now() };
  await saveStoreAndWait();
  broadcastToAll("ad_settings_updated", store.adSettings);
  res.json({ success: true, adSettings: store.adSettings });
});
app.post("/api/admin/manual-transactions/:transactionId/approve", hasAnyPermission("transactions", "cashier"), async (req, res) => {
  const { transactionId } = req.params;
  const tx = store.pendingManualTransactions.find((t) => t.id === transactionId);
  if (!tx || tx.status !== "pending") {
    return res.status(404).json({ error: "Pending transaction not found or already processed." });
  }
  const permissions = req.adminPermissions || [];
  const cashierOnly = permissions.includes("cashier") && !permissions.includes("transactions") && !permissions.includes("all");
  if (cashierOnly && (tx.managedBy === "agent" || Boolean(tx.agentId))) {
    return res.status(403).json({ error: "Agent-managed requests are viewable only by transaction administrators." });
  }
  if (cashierOnly && (tx.assignedCashierId !== String(req.query.userId || "") || Number(tx.assignmentExpiresAt || 0) <= Date.now())) {
    await assignCashierToRequest(tx);
    return res.status(409).json({ error: "This request is no longer assigned to you." });
  }
  const user = store.users[tx.userId];
  if (!user) {
    return res.status(404).json({ error: "User associated with transaction not found." });
  }
  if (tx.managedBy === "agent" || user.linkedAgentId) {
    return res.status(403).json({ error: "This transaction is assigned to an agent and is read-only for administrators." });
  }
  if (tx.transactionType === "deposit") {
    user.balance += tx.amount;
    addTransaction(user.id, "deposit", tx.amount, void 0, `Manual deposit approved by admin. Request ID: ${tx.id}`);
  } else {
    const eligibilityError = withdrawalEligibilityError(user, tx.amount, tx.id);
    if (eligibilityError) {
      tx.status = "rejected";
      await saveManualRequestToFirestore(tx);
      await saveStoreAndWait();
      return res.status(400).json({ error: eligibilityError });
    }
    if (user.balance < tx.amount) {
      tx.status = "rejected";
      await saveStoreAndWait();
      return res.status(400).json({ error: "Insufficient balance to approve this withdrawal request. Transaction has been rejected." });
    }
    user.balance -= tx.amount;
    addTransaction(user.id, "withdrawal", tx.amount, void 0, `Manual withdrawal approved by admin. Request ID: ${tx.id}`);
    recordWithdrawalFee(user.id, Number(tx.fee || 0), tx.id);
  }
  tx.status = "approved";
  tx.managedBy = "admin";
  tx.resolvedBy = String(req.query.userId || "admin");
  tx.resolverUsername = String(req.adminUser?.name || req.adminUser?.username || "Admin");
  tx.resolvedAt = Date.now();
  await saveManualRequestToFirestore(tx);
  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  res.json({ success: true, transaction: tx });
});
app.post("/api/admin/manual-transactions/:transactionId/reject", hasAnyPermission("transactions", "cashier"), async (req, res) => {
  const { transactionId } = req.params;
  const tx = store.pendingManualTransactions.find((t) => t.id === transactionId);
  if (!tx || tx.status !== "pending") {
    return res.status(404).json({ error: "Pending transaction not found or already processed." });
  }
  const permissions = req.adminPermissions || [];
  const cashierOnly = permissions.includes("cashier") && !permissions.includes("transactions") && !permissions.includes("all");
  if (cashierOnly && (tx.managedBy === "agent" || Boolean(tx.agentId))) {
    return res.status(403).json({ error: "Agent-managed requests are viewable only by transaction administrators." });
  }
  if (cashierOnly && (tx.assignedCashierId !== String(req.query.userId || "") || Number(tx.assignmentExpiresAt || 0) <= Date.now())) {
    await assignCashierToRequest(tx);
    return res.status(409).json({ error: "This request is no longer assigned to you." });
  }
  const user = store.users[tx.userId];
  if (tx.managedBy === "agent" || user?.linkedAgentId) {
    return res.status(403).json({ error: "This transaction is assigned to an agent and is read-only for administrators." });
  }
  if (!user) {
    tx.status = "rejected";
    await saveStoreAndWait();
    return res.status(404).json({ error: "User associated with transaction not found. Transaction rejected." });
  }
  tx.status = "rejected";
  tx.managedBy = "admin";
  tx.resolvedBy = String(req.query.userId || "admin");
  tx.resolverUsername = String(req.adminUser?.name || req.adminUser?.username || "Admin");
  tx.resolvedAt = Date.now();
  await saveManualRequestToFirestore(tx);
  await saveStoreAndWait();
  sendEventToUser(user.id, "user_notification", {
    type: "info",
    message: `Your ${tx.transactionType} request for $${tx.amount} was rejected.`
  });
  res.json({ success: true, transaction: tx });
});
app.post("/api/admin/impersonate", hasPermission("users"), (req, res) => {
  const { userId, targetUserId } = req.body;
  const targetId = targetUserId || userId;
  const user = store.users[targetId];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const uName = String(user.username || "").toLowerCase();
  const uRole = String(user.role || "").toLowerCase();
  if (uName === "admin" || uName === "superadmin" || uRole.includes("admin") || uRole.includes("super")) {
    return res.status(400).json({ error: "Full Admin accounts are protected and cannot be impersonated." });
  }
  res.json({ success: true, user });
});
app.post("/api/admin/users/:userId/update", hasPermission("users"), async (req, res) => {
  const userId = req.params.userId;
  const userToUpdate = store.users[userId];
  if (!userToUpdate) {
    return res.status(404).json({ error: "User not found." });
  }
  const uName = String(userToUpdate.username || "").toLowerCase();
  const uRole = String(userToUpdate.role || "").toLowerCase();
  if (uName === "admin" || uRole.includes("admin") || uRole.includes("super")) {
    return res.status(400).json({ error: "Full Admin users are protected and cannot be edited." });
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
app.get("/api/admin/agents", hasPermission("agents"), async (req, res) => {
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
app.post("/api/admin/agents/create", hasPermission("agents"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { username, password, commissionRate, location, phone, promoCode, businessModel, monthlySalary, monthlyTarget, dailyTransactionLimit } = req.body;
  const normalizedPromoCode = normalizePromoCode(promoCode);
  if (!username || !password || !commissionRate || !phone || !normalizedPromoCode || !location) {
    return res.status(400).json({ error: "Username, password, commission rate, phone, promo code, and location are required." });
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
    const matchingPromoDocs = await findAgentDocsByPromoCode(agentsRef, normalizedPromoCode);
    if (matchingPromoDocs.length > 0) {
      return res.status(400).json({ error: "Promo code is already in use." });
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
      promoCode: normalizedPromoCode,
      balance: 0,
      floatBalance: 0,
      status: "Active",
      createdAt: Date.now(),
      businessModel: businessModel === "monthly" ? "monthly" : "independent",
      monthlySalary: businessModel === "monthly" ? Math.max(0, Number(monthlySalary || 0)) : 0,
      monthlyTarget: businessModel === "monthly" ? Math.max(0, Number(monthlyTarget || 0)) : 0,
      dailyTransactionLimit: businessModel === "monthly" ? Math.max(0, Number(dailyTransactionLimit || 0)) : 0,
      salaryStatus: businessModel === "monthly" ? "current" : void 0,
      nextSalaryDate: businessModel === "monthly" ? Date.now() + 30 * 24 * 60 * 60 * 1e3 : void 0
    };
    await agentsRef.doc(agentId).set(newAgent);
    res.status(201).json(newAgent);
  } catch (error) {
    console.error("Failed to create agent:", error);
    res.status(500).json({ error: "Failed to create agent in database." });
  }
});
app.post("/api/admin/agents/:agentId/update", hasPermission("agents"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agentId = req.params.agentId;
  const { username, password, commissionRate, status, location, phone, promoCode, businessModel, monthlySalary, monthlyTarget, dailyTransactionLimit, salaryStatus, nextSalaryDate } = req.body;
  try {
    const agentRef = db.collection("agents").doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) {
      return res.status(404).json({ error: "Agent not found." });
    }
    const agentData = agentDoc.data();
    const targetUsername = String(agentData.username || "").toLowerCase();
    const targetRole = String(agentData.role || "").toLowerCase();
    const isFullAdminAgent = targetUsername === "admin" || targetUsername === "superadmin" || targetRole.includes("admin") || targetRole.includes("super");
    if (isFullAdminAgent) {
      return res.status(400).json({ error: "Full Admin agents are protected and cannot be edited, suspended, or deleted." });
    }
    const normalizedPromoCode = promoCode === void 0 ? void 0 : normalizePromoCode(promoCode);
    if (normalizedPromoCode !== void 0 && !normalizedPromoCode) {
      return res.status(400).json({ error: "Promo code cannot be empty." });
    }
    if (normalizedPromoCode && normalizedPromoCode !== normalizePromoCode(agentData.promoCode)) {
      const agentsRef = db.collection("agents");
      const matchingPromoDocs = await findAgentDocsByPromoCode(agentsRef, normalizedPromoCode);
      if (matchingPromoDocs.some((doc) => doc.id !== agentId)) {
        return res.status(400).json({ error: "Promo code is already in use by another agent." });
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
    if (normalizedPromoCode !== void 0) {
      updateData.promoCode = normalizedPromoCode;
    }
    if (businessModel === "independent" || businessModel === "monthly") {
      updateData.businessModel = businessModel;
      if (businessModel === "independent") {
        updateData.monthlySalary = 0;
        updateData.monthlyTarget = 0;
        updateData.dailyTransactionLimit = 0;
        updateData.salaryStatus = void 0;
        updateData.nextSalaryDate = void 0;
      }
    }
    if (businessModel === "monthly" || agentData.businessModel === "monthly") {
      if (monthlySalary !== void 0 && Number.isFinite(Number(monthlySalary))) updateData.monthlySalary = Math.max(0, Number(monthlySalary));
      if (monthlyTarget !== void 0 && Number.isFinite(Number(monthlyTarget))) updateData.monthlyTarget = Math.max(0, Number(monthlyTarget));
      if (dailyTransactionLimit !== void 0 && Number.isFinite(Number(dailyTransactionLimit))) updateData.dailyTransactionLimit = Math.max(0, Number(dailyTransactionLimit));
      if (salaryStatus && ["current", "due", "paid"].includes(salaryStatus)) updateData.salaryStatus = salaryStatus;
      if (nextSalaryDate !== void 0 && Number.isFinite(Number(nextSalaryDate))) updateData.nextSalaryDate = Number(nextSalaryDate);
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
app.delete("/api/admin/agents/:agentId/delete", hasPermission("agents"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agentId = req.params.agentId;
  try {
    const agentRef = db.collection("agents").doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) {
      return res.status(404).json({ error: "Agent not found." });
    }
    const agentData = agentDoc.data();
    const targetUsername = String(agentData.username || "").toLowerCase();
    const targetRole = String(agentData.role || "").toLowerCase();
    const isFullAdminAgent = targetUsername === "admin" || targetUsername === "superadmin" || targetRole.includes("admin") || targetRole.includes("super");
    if (isFullAdminAgent) {
      return res.status(400).json({ error: "Full Admin agents are protected and cannot be deleted." });
    }
    const linkedPlayers = Object.values(store.users).filter((user) => user.linkedAgentId === agentId);
    if (linkedPlayers.length > 0) {
      return res.status(409).json({
        error: `This agent has ${linkedPlayers.length} linked player(s). Reassign or unlink them before deleting the agent.`
      });
    }
    await agentRef.delete();
    res.json({ success: true, message: "Agent deleted successfully." });
  } catch (error) {
    console.error(`Failed to delete agent ${agentId}:`, error);
    res.status(500).json({ error: "Failed to delete agent." });
  }
});
app.post("/api/admin/agents/:agentId/credit", hasPermission("agents"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agentId = req.params.agentId;
  const { amount, discount } = req.body;
  const creditAmount = parseFloat(amount);
  const discountAmount = parseFloat(discount) || 0;
  if (!agentId || !Number.isFinite(creditAmount) || creditAmount === 0) {
    return res.status(400).json({ error: "Valid agentId and a non-zero adjustment amount are required." });
  }
  const safeDiscountAmount = creditAmount > 0 ? Math.max(0, discountAmount) : 0;
  try {
    const agentRef = db.collection("agents").doc(agentId);
    const transactionRef = db.collection("agentTransactions").doc();
    const transactionData = {
      id: transactionRef.id,
      agentId,
      type: "FloatPurchase",
      amount: creditAmount,
      discountAmount: safeDiscountAmount,
      timestamp: Date.now(),
      description: creditAmount > 0 ? `Admin added $${creditAmount.toFixed(2)} to agent float with a $${safeDiscountAmount.toFixed(2)} commission discount.` : `Admin deducted $${Math.abs(creditAmount).toFixed(2)} from agent float as a balance correction.`
    };
    await db.runTransaction(async (t) => {
      const agentDoc = await t.get(agentRef);
      if (!agentDoc.exists) {
        throw new Error("Agent not found.");
      }
      const currentFloat = agentDoc.data()?.floatBalance || 0;
      const newFloatBalance = currentFloat + creditAmount;
      if (newFloatBalance < 0) {
        throw new Error(`Adjustment exceeds current float balance of $${currentFloat.toFixed(2)}.`);
      }
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
    if (error.message.includes("exceeds current float balance")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to credit agent float in database." });
  }
});
app.get("/api/admin/agent-requests", hasPermission("agents"), async (req, res) => {
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
app.post("/api/admin/agent-requests/:requestId/approve", hasPermission("agents"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const requestId = req.params.requestId;
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
      const commissionRate = Math.max(0, Math.min(1, Number(agentDoc.data()?.commissionRate || 0)));
      const discountAmount = Number((request.amount * commissionRate).toFixed(2));
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
        discountAmount,
        timestamp: Date.now(),
        description: `Float request for $${request.amount.toFixed(2)} approved; admin cash $${(request.amount - discountAmount).toFixed(2)}, agent commission $${discountAmount.toFixed(2)}. Request ID: ${request.id}`
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
app.post("/api/admin/agent-requests/:requestId/reject", hasPermission("agents"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { requestId } = req.params;
  const adminId = req.query.userId;
  try {
    const reqId = Array.isArray(requestId) ? requestId[0] : requestId;
    const requestRef = db.collection("agentRequests").doc(reqId);
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
app.delete("/api/admin/users/:userId/delete", hasPermission("users"), (req, res) => {
  const userId = req.params.userId;
  const userToDelete = store.users[userId];
  if (userToDelete) {
    const uName = String(userToDelete.username || "").toLowerCase();
    const uRole = String(userToDelete.role || "").toLowerCase();
    if (uName === "admin" || uRole.includes("admin") || uRole.includes("super")) {
      return res.status(400).json({ error: "Full Admin users are protected and cannot be deleted." });
    }
    delete store.users[userId];
    saveStoreAndWait();
    res.json({ success: true, message: `User ${userId} has been deleted.` });
  } else {
    res.status(404).json({ error: "User not found" });
  }
});
app.post("/api/admin/rooms/:roomId/cancel", hasPermission("rooms"), (req, res) => {
  const roomId = req.params.roomId;
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
app.post("/api/admin/users/:userId/toggle-admin", hasPermission("users"), (req, res) => {
  const userId = req.params.userId;
  const user = store.users[userId];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const uName = String(user.username || "").toLowerCase();
  const uRole = String(user.role || "").toLowerCase();
  if (uName === "admin" || uName === "superadmin" || uRole.includes("admin") || uRole.includes("super")) {
    return res.status(400).json({ error: "Full Admin users are protected and cannot be modified." });
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
app.get("/api/admin/users/:userId/games", hasPermission("users"), (req, res) => {
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
    const { password: _, ...safeAgent } = agent;
    res.json({ success: true, agent: safeAgent });
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
  const { password: _, ...safeAgent } = agent;
  res.json(safeAgent);
});
app.put("/api/agent/location", isAgent, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agent = req.agent;
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "Invalid location coordinates." });
  }
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`, { headers: { "User-Agent": "LudoSom-Agent-Location/1.0" } });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const result = await response.json();
    const location = formatGeocodedLocation(result.address);
    if (!location) return res.status(422).json({ error: "Could not identify a city for this location." });
    await db.collection("agents").doc(agent.id).update({ location });
    const { password: _, ...safeAgent } = { ...agent, location };
    res.json({ success: true, agent: safeAgent });
  } catch (error) {
    console.error(`Failed to detect agent location ${agent.id}:`, error);
    res.status(502).json({ error: "Location service is temporarily unavailable. Please try again." });
  }
});
app.put("/api/agent/profile", isAgent, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agent = req.agent;
  const agentId = req.query.agentId;
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
  const location = typeof req.body.location === "string" ? req.body.location.trim() : "";
  const currentPassword = req.body.currentPassword;
  const newPassword = req.body.newPassword;
  const confirmPassword = req.body.confirmPassword;
  if (!username || username.length < 3 || !phone || !location) {
    return res.status(400).json({ error: "Username must be at least 3 characters; phone and detected location are required." });
  }
  if (typeof currentPassword !== "string" || agent.password !== currentPassword) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  if (newPassword) {
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New password and confirmation do not match." });
    }
  }
  try {
    if (username.toLowerCase() !== String(agent.username).toLowerCase()) {
      const usernameSnapshot = await db.collection("agents").where("username", "==", username).get();
      if (usernameSnapshot.docs.some((doc) => doc.id !== agentId)) {
        return res.status(409).json({ error: "That agent username is already in use." });
      }
    }
    const updateData = { username, phone, location };
    if (newPassword) updateData.password = newPassword;
    await db.collection("agents").doc(agentId).update(updateData);
    const updatedDoc = await db.collection("agents").doc(agentId).get();
    const { password: _, ...safeAgent } = updatedDoc.data();
    res.json({ success: true, agent: safeAgent, message: "Profile updated successfully." });
  } catch (error) {
    console.error(`Failed to update agent profile ${agentId}:`, error);
    res.status(500).json({ error: "Failed to update agent profile." });
  }
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
app.get("/api/agent/player-requests", isAgent, async (req, res) => {
  const agent = req.agent;
  if (db) {
    try {
      const snapshot = await db.collection("manualTransactionRequests").where("agentId", "==", agent.id).get();
      snapshot.docs.forEach((doc) => {
        const request = { id: doc.id, ...doc.data() };
        const index = store.pendingManualTransactions.findIndex((item) => item.id === request.id);
        if (index >= 0) store.pendingManualTransactions[index] = request;
        else store.pendingManualTransactions.push(request);
      });
    } catch (error) {
      console.error(`Failed to load player requests for agent ${agent.id}:`, error);
      return res.status(500).json({ error: "Failed to retrieve player requests." });
    }
  }
  const agentSpecificTxs = store.pendingManualTransactions.filter((tx) => {
    const user = store.users[tx.userId];
    return tx.agentId === agent.id && (tx.managedBy === "agent" || user?.linkedAgentId === agent.id);
  });
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
  const tx = await findManualRequest(requestId);
  if (!tx || tx.status !== "pending") {
    return res.status(404).json({ error: "Pending transaction not found or already processed." });
  }
  if (tx.agentId !== agent.id) {
    return res.status(403).json({ error: "This transaction request belongs to a different agent." });
  }
  const user = store.users[tx.userId];
  if (!user) {
    return res.status(404).json({ error: "User associated with transaction not found." });
  }
  if (user.linkedAgentId && user.linkedAgentId !== agent.id) {
    return res.status(400).json({ error: "This player is locked to a different agent via promo code." });
  }
  try {
    if (!db) {
      throw new Error("Database not initialized");
    }
    let approvedUserBalance = user.balance;
    await db.runTransaction(async (t) => {
      const agentRef = db.collection("agents").doc(agent.id);
      const userRef = db.collection("users").doc(user.firebaseUid || user.id);
      const agentDoc = await t.get(agentRef);
      const userDoc = await t.get(userRef);
      if (!agentDoc.exists) {
        throw new Error("Agent not found in database");
      }
      const agentData = agentDoc.data();
      const currentFloat = agentData.floatBalance || 0;
      const persistedBalance = Number(userDoc.data()?.balance ?? user.balance);
      if (agentData.businessModel === "monthly" && Number(agentData.dailyTransactionLimit || 0) > 0) {
        const startOfDay = /* @__PURE__ */ new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const dailyQuery = db.collection("agentTransactions").where("agentId", "==", agent.id).where("timestamp", ">=", startOfDay.getTime());
        const dailySnapshot = await t.get(dailyQuery);
        const processedToday = dailySnapshot.docs.reduce((total, doc) => {
          const item = doc.data();
          return ["PlayerDeposit", "PlayerWithdrawal"].includes(item.type) ? total + Number(item.amount || 0) : total;
        }, 0);
        if (processedToday + Number(tx.amount || 0) > Number(agentData.dailyTransactionLimit)) {
          throw new Error(`Daily transaction limit exceeded. Remaining today: $${Math.max(0, Number(agentData.dailyTransactionLimit) - processedToday).toFixed(2)}.`);
        }
      }
      let newAgentFloat;
      let newUserBalance;
      if (tx.transactionType === "deposit") {
        if (currentFloat < tx.amount) {
          throw new Error("Insufficient float balance to approve this deposit.");
        }
        newAgentFloat = currentFloat - tx.amount;
        newUserBalance = persistedBalance + tx.amount;
      } else {
        const eligibilityError = withdrawalEligibilityError(user, tx.amount, tx.id);
        if (eligibilityError) throw new Error(eligibilityError);
        if (persistedBalance < tx.amount) {
          throw new Error("Player has insufficient balance for this withdrawal.");
        }
        const withdrawalNet = Number(tx.netAmount ?? tx.amount - Number(tx.fee || 0));
        newAgentFloat = currentFloat + Math.max(0, withdrawalNet);
        newUserBalance = persistedBalance - tx.amount;
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
      t.update(agentRef, { floatBalance: newAgentFloat });
      t.set(userRef, { balance: newUserBalance, id: user.id, firebaseUid: user.firebaseUid || null }, { merge: true });
      approvedUserBalance = newUserBalance;
    });
    user.balance = approvedUserBalance;
    addTransaction(
      user.id,
      tx.transactionType === "deposit" ? "deposit" : "withdrawal",
      tx.amount,
      void 0,
      `Manual ${tx.transactionType} approved by agent ${agent.username}. Request ID: ${tx.id}`
    );
    if (tx.transactionType === "withdraw") {
      recordWithdrawalFee(user.id, Number(tx.fee || 0), tx.id);
    }
    tx.status = "approved";
    tx.resolvedBy = agent.id;
    tx.resolverUsername = agent.username;
    await saveManualRequestToFirestore(tx);
    await saveUserProfileToFirestore(user);
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
  const tx = await findManualRequest(requestId);
  if (!tx || tx.status !== "pending") {
    return res.status(404).json({ error: "Pending transaction not found or already processed." });
  }
  if (tx.agentId !== agent.id) {
    return res.status(403).json({ error: "This transaction request belongs to a different agent." });
  }
  const user = store.users[tx.userId];
  if (!user) {
    tx.status = "rejected";
    await saveManualRequestToFirestore(tx);
    await saveStoreAndWait();
    return res.status(404).json({ error: "User associated with transaction not found. Transaction rejected." });
  }
  tx.status = "rejected";
  tx.resolvedBy = agent.id;
  tx.resolverUsername = agent.username;
  await saveManualRequestToFirestore(tx);
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
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});
app.use((error, req, res, next) => {
  if (!req.path.startsWith("/api")) return next(error);
  console.error(`Unhandled API error for ${req.method} ${req.path}:`, error);
  const quotaExceeded = error?.code === 8 || String(error?.message || "").includes("RESOURCE_EXHAUSTED");
  res.status(quotaExceeded ? 503 : 500).json({
    error: quotaExceeded ? "Database quota is temporarily exhausted. Please try again after the quota resets." : "The server could not complete this request."
  });
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
  try {
    await loadStoreFromFirestore();
    purgeSimulatedUsers();
    console.log("Application state initialization completed.");
  } catch (error) {
    console.error("Application state initialization failed; continuing with local fallback:", error);
  }
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
