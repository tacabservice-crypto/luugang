/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer, ViteDevServer } from 'vite'; // Keep this if Vite is used later

// Load environment variables from .env files
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '.env.production') });
const firebaseMySqlMigrationMode = String(process.env.RUN_FIREBASE_MYSQL_MIGRATION_ON_START || '').trim().toLowerCase() === 'true';

const appDir = typeof __dirname !== 'undefined'
  ? __dirname
  : (import.meta && import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : process.cwd());

function getDistDirectory(): string {
  const cwdDist = path.join(process.cwd(), 'dist');
  if (fs.existsSync(path.join(cwdDist, 'index.html'))) {
    return cwdDist;
  }
  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : (import.meta && import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : process.cwd());

  if (fs.existsSync(path.join(currentDir, 'index.html'))) {
    return currentDir;
  }
  const currentDist = path.join(currentDir, 'dist');
  if (fs.existsSync(path.join(currentDist, 'index.html'))) {
    return currentDist;
  }
  return cwdDist;
}
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { migrateFirestoreToMySql } from './scripts/migrate-firestore-to-mysql.ts';
import { getMySqlPool, isMySqlConfigured, testMySqlConnection } from './src/server/mysql.ts';
import { cleanupMySqlRealtimeEvents, deleteMySqlGameRoom, ensureMySqlGameTimerLeadership, latestMySqlRealtimeEventId, listMySqlActiveGameRooms, listMySqlRealtimeEvents, loadMySqlGameRoom, loadMySqlRuntimeUser, loadRuntimeStoreFromMySql, mysqlRuntimeStoreMode, publishMySqlRealtimeEvent, saveMySqlGameRoom, saveRuntimeStoreToMySql } from './src/server/mysql-runtime-store.ts';
import { deleteMySqlMatchmaking, listActiveMySqlMatchmaking, listMySqlCashierHeartbeats, listMySqlOnlineUsers, touchMySqlUserPresence, updateMySqlCashierHeartbeat, upsertMySqlMatchmaking } from './src/server/mysql-realtime.ts';
import { deleteMySqlEmailOtp, getMySqlEmailOtp, saveMySqlEmailOtp, StoredEmailOtp } from './src/server/mysql-otp.ts';
import { adjustMySqlAgentFloat, approveMySqlAgentPlayerRequest, deleteMySqlAdmin, deleteMySqlAgent, listMySqlManualRequests, listMySqlUsersByAgent, loadMySqlPrimaryCaches, resolveMySqlAgentRequest, resolveMySqlManualRequest, saveMySqlAdmin, saveMySqlAgent, saveMySqlAgentRequest, saveMySqlCashierPayment, saveMySqlManualRequest, saveMySqlUserProfile } from './src/server/mysql-primary-data.ts';
// Removed the import and declaration below to fix "Cannot redeclare block-scoped variable 'db'"
// import { initializeFirebase, validateAndGetDb } from './src/firebase-utils';
// const { db, auth } = initializeFirebase();

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
  PlatformAdSettings,
} from './src/types/game.ts';

interface ManualTransactionRequest {
  id: string;
  userId: string;
  username: string;
  agentId?: string;
  agentUsername?: string;
  managedBy?: 'admin' | 'agent';
  cashierCity?: string;
  assignedCashierId?: string;
  assignedCashierName?: string;
  assignedCashierAt?: number;
  assignmentExpiresAt?: number;
  cashierAssignmentHistory?: string[];
  cashierTimedOutIds?: string[];
  resolvedBy?: string;
  resolverUsername?: string;
  resolvedAt?: number;
  amount: number;
  fee?: number;
  netAmount?: number;
  feeRate?: number;
  phone?: string; // For withdrawals
  senderPhone?: string; // For deposits
  provider: string;
  transactionType: 'deposit' | 'withdraw';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}
interface VipTier {
  name: string;
  price: number; // Monthly price
  durationMonths: number; // Duration of subscription in months
  rakeDiscount: number; // Percentage discount on rake, e.g., 0.02 for 2%
  features: string[];
}

const VIP_TIERS: Record<string, VipTier> = {
  silver: {
    name: 'Silver VIP',
    price: 4,
    durationMonths: 1,
    rakeDiscount: 0.01,
    features: ['VIP profile badge', '1% rake discount', 'Save $1 on every $100 prize pool'],
  },
  gold: {
    name: 'Gold VIP',
    price: 10,
    durationMonths: 1,
    rakeDiscount: 0.02,
    features: ['Gold profile badge', '2% rake discount', 'Save $2 on every $100 prize pool'],
  },
  platinum: {
    name: 'Platinum VIP',
    price: 25,
    durationMonths: 3,
    rakeDiscount: 0.04,
    features: ['Platinum profile badge', '4% rake discount', 'Save $4 on every $100 prize pool', '3 months of access'],
  },
  diamond: {
    name: 'Diamond VIP',
    price: 45,
    durationMonths: 6,
    rakeDiscount: 0.05,
    features: ['Diamond profile badge', '5% rake discount', 'Save $5 on every $100 prize pool', '6 months of access'],
  },
};

const RAKE_PERCENTAGE = 0.10; // 10% rake

const app = express();
app.set('trust proxy', 1);
const DEPLOY_VERSION = String(
  process.env.DEPLOY_VERSION
  || process.env.RENDER_GIT_COMMIT
  || process.env.GIT_COMMIT_SHA
  || (() => {
    try { return Math.floor(fs.statSync(path.join(appDir, 'server.js')).mtimeMs).toString(36); }
    catch { return 'development'; }
  })()
).trim();

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
  'https://www.ludosom.com',
  'https://darkgray-jellyfish-374710.hostingersite.com',
  'https://ludo31.onrender.com',
  'https://dhili-dhili-ludo.onrender.com',
  'https://dhilidhili.onrender.com',
  'http://localhost:3000',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3002',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  ...configuredAllowedOrigins,
]));

function isAllowedCorsOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol === 'https:' && (hostname === 'ludosom.com' || hostname.endsWith('.ludosom.com'))) {
      return true;
    }
    if (hostname === 'localhost') {
      return parsed.protocol === 'http:'
        || parsed.protocol === 'https:'
        || parsed.protocol === 'capacitor:'
        || parsed.protocol === 'ionic:';
    }
  } catch {
    return false;
  }
  return false;
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || isAllowedCorsOrigin(origin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS origin: ${origin}`);
      callback(new Error('Origin is not allowed by LudoSom CORS policy.'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-LudoSom-Platform'],
  credentials: true
}));

// During the one-time copy, prevent public API traffic from spending the
// restored Firestore quota before the migration can capture a verified snapshot.
app.use('/api', (_req, res, next) => {
  if (!firebaseMySqlMigrationMode) return next();
  res.setHeader('Retry-After', '900');
  return res.status(503).json({ error: 'Maintenance in progress. Please try again shortly.' });
});

const rawPort = process.env.PORT || 3002;
const PORT = typeof rawPort === 'string' && !isNaN(Number(rawPort)) ? Number(rawPort) : rawPort;
const DB_FILE = path.join(process.cwd(), 'db_store.json');
const WELCOME_BONUS = 1.0;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const isOtpEnabled = () => store.adminSettings?.otpEnabled !== false;
const isPhoneAuthEnabled = () => store.adminSettings?.phoneAuthEnabled !== false;
const MINIMUM_WITHDRAWAL = 2;
const BONUS_UNLOCK_DEPOSIT_TOTAL = 5;
const NORMAL_WITHDRAWAL_FEE_RATE = 0;
const NO_PLAY_WITHDRAWAL_FEE_RATE = 0.10;
const MINIMUM_WITHDRAWAL_FEE = 0.10;
const TOURNAMENT_UNREGISTER_FEE_RATE = 0.10;
const TOURNAMENT_MAX_POSTPONEMENTS = 2;
const TOURNAMENT_CHECK_IN_MS = 5 * 60 * 1000;

function hashEmailOtp(uid: string, otp: string): string {
  return crypto.createHash('sha256').update(`${uid}:${otp}:${process.env.OTP_HASH_SECRET || process.env.FIREBASE_PROJECT_ID || 'ludosom'}`).digest('hex');
}

async function readEmailOtp(uid: string): Promise<StoredEmailOtp | null> {
  if (isMySqlRuntimePrimary()) return getMySqlEmailOtp(uid);
  if (!db) return null;
  const snapshot = await db.collection('emailOtps').doc(uid).get();
  return snapshot.exists ? snapshot.data() as StoredEmailOtp : null;
}

async function writeEmailOtp(uid: string, record: StoredEmailOtp): Promise<void> {
  if (isMySqlRuntimePrimary()) return saveMySqlEmailOtp(uid, record);
  if (!db) throw new Error('Database not initialized');
  await db.collection('emailOtps').doc(uid).set(record);
}

async function removeEmailOtp(uid: string): Promise<void> {
  if (isMySqlRuntimePrimary()) return deleteMySqlEmailOtp(uid);
  if (db) await db.collection('emailOtps').doc(uid).delete();
}

function normalizeAuthPhone(value: unknown): string {
  const compact = String(value || '').replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : '';
}

function createPhoneTurnstileTicket(phone: string, action: 'login' | 'signup'): string {
  const payload = Buffer.from(JSON.stringify({ phone, action, expiresAt: Date.now() + 5 * 60 * 1000 })).toString('base64url');
  const secret = process.env.TURNSTILE_SECRET_KEY || '';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyPhoneTurnstileTicket(ticket: unknown, phone: string, action: unknown): boolean {
  try {
    const [payload, signature] = String(ticket || '').split('.');
    if (!payload || !signature || !process.env.TURNSTILE_SECRET_KEY) return false;
    const expected = crypto.createHmac('sha256', process.env.TURNSTILE_SECRET_KEY).update(payload).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.phone === phone && decoded.action === action && Number(decoded.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

const nativeSecurityAttempts = new Map<string, { count: number; resetAt: number }>();

function isTrustedCapacitorAndroidRequest(req: express.Request): boolean {
  const origin = String(req.headers.origin || '').toLowerCase();
  const platform = String(req.headers['x-ludosom-platform'] || '').toLowerCase();
  const userAgent = String(req.headers['user-agent'] || '');
  return isAllowedCorsOrigin(origin)
    && platform === 'android'
    && /android/i.test(userAgent)
    && /;\s*wv\)|version\/\d+\.\d+.*chrome/i.test(userAgent);
}

function consumeNativeSecurityAttempt(key: string): boolean {
  const now = Date.now();
  const current = nativeSecurityAttempts.get(key);
  if (!current || current.resetAt <= now) {
    nativeSecurityAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

async function sendOtpEmail(email: string, otp: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OTP_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('OTP email service is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'LudoSom - Email Verification Code',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#17112b"><h2>LudoSom (Faaiido Qar$oon)</h2><p>Ku soo dhowow LudoSom. Geli code-kan gudaha app-ka si aad u xaqiijiso email-kaaga:</p><div style="font-size:34px;font-weight:800;letter-spacing:10px;background:#f3efff;border-radius:12px;padding:18px;text-align:center;color:#5b21b6">${otp}</div><p>Code-ku wuxuu dhacayaa 10 daqiiqo kadib. Haddii aadan adigu codsan, fariintan iska dhaaf.</p><p>Mahadsanid,<br><strong>LudoSom Team</strong></p></div>`,
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error('OTP email provider rejected the request:', response.status, details);
    throw new Error('Verification email could not be sent.');
  }
}

function normalizePromoCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeAppAvatar(value: unknown): string {
  const avatar = typeof value === 'string' ? value.trim() : '';
  return /^https?:\/\//i.test(avatar) || !avatar ? '🎮' : avatar;
}

async function findAgentDocsByPromoCode(agentsRef: FirebaseFirestore.CollectionReference, promoCode: string) {
  const exactSnapshot = await agentsRef.where('promoCode', '==', promoCode).get();
  if (!exactSnapshot.empty) return exactSnapshot.docs;

  // Compatibility for agent records created before promo codes were normalized.
  const allAgentsSnapshot = await agentsRef.get();
  return allAgentsSnapshot.docs.filter(
    (agentDoc) => normalizePromoCode(agentDoc.data().promoCode) === promoCode
  );
}

async function resolveActiveAgentByPromoCode(promoCode: unknown): Promise<Agent | null> {
  const normalizedPromoCode = normalizePromoCode(promoCode);
  if (!normalizedPromoCode) return null;
  if (isMySqlRuntimePrimary()) {
    return Object.values(store.agents).find(agent =>
      normalizePromoCode(agent.promoCode) === normalizedPromoCode && agent.status === 'Active') || null;
  }
  if (!db) return null;
  const matchingAgentDocs = await findAgentDocsByPromoCode(db.collection('agents'), normalizedPromoCode);
  if (!matchingAgentDocs.length) return null;
  const agentDoc = matchingAgentDocs[0];
  const agent = { ...agentDoc.data(), id: agentDoc.data().id || agentDoc.id } as Agent;
  if (agent.status !== 'Active') return null;
  if (agent.promoCode !== normalizedPromoCode || agentDoc.data().id !== agent.id) {
    await agentDoc.ref.set({ promoCode: normalizedPromoCode, id: agent.id }, { merge: true });
  }
  return agent;
}

app.use(express.json());

function formatGeocodedLocation(address: any): string {
  const city = address?.city || address?.town || address?.village || address?.municipality || address?.county || address?.state;
  const country = address?.country;
  return [city, country].filter(Boolean).join(', ');
}

app.get('/api/locations/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2) return res.json([]);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'LudoSom-Agent-Location/1.0' } });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const results: any[] = await response.json();
    res.json([...new Set(results.map(item => formatGeocodedLocation(item.address)).filter(Boolean))].slice(0, 8));
  } catch (error) {
    console.error('Location search failed:', error);
    res.status(502).json({ error: 'Location search is temporarily unavailable.' });
  }
});

app.post('/api/locations/detect', async (req, res) => {
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Invalid location coordinates.' });
  }
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`, { headers: { 'User-Agent': 'LudoSom-Player-Location/1.0' } });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const result: any = await response.json();
    const location = formatGeocodedLocation(result.address);
    if (!location) return res.status(422).json({ error: 'Could not identify a city for this location.' });
    return res.json({ success: true, location, city: normalizedCity(location) });
  } catch (error) {
    console.error('Player location detection failed:', error);
    return res.status(502).json({ error: 'Location service is temporarily unavailable.' });
  }
});

// Serve static files from 'public' and 'dist' directories
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(getDistDirectory()));


// ==========================================
// FIREBASE FIRESTORE PERSISTENCE SETUP
// ==========================================
let db: Firestore | null = null;
let auth: Auth | null = null;
import { getAuth, Auth } from 'firebase-admin/auth';

function normalizePrivateKey(key: string): string {
  if (!key) return '';
  let str = key.trim();

  // 1. If base64 encoded (doesn't start with -----BEGIN), try decoding
  if (!str.includes('PRIVATE KEY') && !str.includes('\\n') && !str.includes('\n')) {
    try {
      const decoded = Buffer.from(str, 'base64').toString('utf8');
      if (decoded.includes('PRIVATE KEY')) {
        str = decoded.trim();
      }
    } catch (e) {}
  }

  // 2. Strip surrounding quotes (double, single, or backslash-escaped)
  str = str.replace(/^["'\\]+|["'\\]+$/g, '').trim();

  // 3. Unescape double backslashes and literal \n / \r
  str = str.replace(/\\\\n/g, '\n')
           .replace(/\\n/g, '\n')
           .replace(/\\r/g, '');

  // 4. Extract header, body, footer if present
  const headerMatch = str.match(/-----BEGIN [A-Z ]+-----/);
  const footerMatch = str.match(/-----END [A-Z ]+-----/);

  const header = headerMatch ? headerMatch[0] : '-----BEGIN PRIVATE KEY-----';
  const footer = footerMatch ? footerMatch[0] : '-----END PRIVATE KEY-----';

  let body = str;
  if (headerMatch) {
    body = body.substring(body.indexOf(header) + header.length);
  }
  if (footerMatch) {
    body = body.substring(0, body.indexOf(footer));
  }

  // Strip all whitespace/newlines/backslashes from body, then reformat into standard PEM 64-char lines
  const cleanBody = body.replace(/[\s\r\n\\]+/g, '');

  // Re-wrap body into standard 64-char lines
  const wrappedBody = cleanBody.match(/.{1,64}/g)?.join('\n') || cleanBody;

  return `${header}\n${wrappedBody}\n${footer}\n`;
}

function getFirebaseServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY || "";

  if (projectId && clientEmail && rawPrivateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: normalizePrivateKey(rawPrivateKey),
    };
  }

  const envValue =
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_ADMIN_CREDENTIALS;

  if (envValue) {
    try {
      let rawEnv = envValue.trim();

      // Remove outer single or double quotes if present
      if (
        (rawEnv.startsWith("'") && rawEnv.endsWith("'")) ||
        (rawEnv.startsWith('"') && rawEnv.endsWith('"'))
      ) {
        rawEnv = rawEnv.slice(1, -1).trim();
      }

      // Handle escaped characters e.g. \{ "type": ... or \"
      if (rawEnv.startsWith('\\{') || rawEnv.includes('\\"')) {
        rawEnv = rawEnv.replace(/\\([{}":,\[\]\\])/g, '$1');
      }

      let parsed: any = null;

      try {
        parsed = JSON.parse(rawEnv);
      } catch (e1) {
        try {
          // Try decoding base64 if user base64-encoded JSON env var
          const decoded = Buffer.from(rawEnv, 'base64').toString('utf8');
          if (decoded.includes('{')) {
            parsed = JSON.parse(decoded);
          }
        } catch (e2) {
          // Fallback: strip remaining escaping backslashes
          const unescaped = rawEnv.replace(/\\/g, '');
          parsed = JSON.parse(unescaped);
        }
      }

      if (parsed && typeof parsed === 'object') {
        if (parsed.private_key && typeof parsed.private_key === 'string') {
          parsed.private_key = normalizePrivateKey(parsed.private_key);
        }
        if (parsed.project_id && parsed.private_key) {
          return parsed;
        }
      }

      console.warn(
        'Firebase credentials did not contain project_id/private_key.'
      );
    } catch (error) {
      console.error('Failed to parse Firebase credentials JSON:', error);
    }
  }

  const possiblePaths = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? [process.env.FIREBASE_SERVICE_ACCOUNT_PATH]
    : [
        path.join(process.cwd(), 'firebase-admin-key.json'),
        path.join(appDir, 'firebase-admin-key.json'),
        path.join(process.cwd(), 'dist', 'firebase-admin-key.json'),
        path.join(process.cwd(), 'service-account.json'),
        path.join(process.cwd(), 'firebase-key.json'),
      ];

  const serviceAccountPath = possiblePaths.find(p => fs.existsSync(p));

  if (!serviceAccountPath) {
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
    serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key || '');

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
  } catch (err: any) {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('!! FAILED TO INITIALIZE FIREBASE ADMIN SDK !!');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    console.error('Stack Trace:', err.stack);
    console.error('Full Error Object:', JSON.stringify(err, null, 2));
    console.error('---------------------------------------------------------------');
    console.error('This means the server will NOT be able to connect to Firestore or verify user tokens.');
    console.error('Potential causes:');
    console.error('  1. The FIREBASE_SERVICE_ACCOUNT environment variable is not set or is incorrect.');
    console.error('  2. The service account key file (e.g., firebase-admin-key.json) is missing or corrupted.');
    console.error('  3. The service account does not have the correct permissions in Google Cloud IAM.');
    console.error('See the "getFirebaseServiceAccount" function in server.ts for credential loading logic.');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  }
} else {
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!! NO FIREBASE ADMIN CREDENTIALS FOUND !!');
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('The "getFirebaseServiceAccount" function did not find any valid credentials.');
  console.error('Server will run without Firestore persistence or Firebase Auth verification.');
  console.error('Set the FIREBASE_SERVICE_ACCOUNT environment variable or place a valid service account key file in the project root.');
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
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

type PaymentProviderKey = 'evc' | 'edahab' | 'sahal' | 'zaad' | 'premier';

const DEFAULT_PAYMENT_PROVIDERS: Record<PaymentProviderKey, PaymentProviderConfig> = {
  evc: { enabled: false },
  edahab: { enabled: false },
  sahal: { enabled: false },
  zaad: { enabled: false },
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
  otpEnabled: boolean;
  phoneAuthEnabled: boolean;
}

interface SpectatorBet {
  id: string;
  roomId: string;
  userId: string;
  targetPlayerId: string;
  targetUsername: string;
  prediction: 'W' | 'L';
  stake: number;
  odds: number;
  potentialPayout: number;
  status: 'open' | 'won' | 'lost' | 'refunded';
  createdAt: number;
  settledAt?: number;
  payout?: number;
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
  vipTiers: Record<string, VipTier>;
  agents: Record<string, Agent>;
  agentTransactions: AgentTransaction[];
  tournaments: Record<string, Tournament>;
  adSettings: PlatformAdSettings;
  adCampaigns: PlatformAdSettings[];
  spectatorBets: SpectatorBet[];
}

const DEFAULT_AD_SETTINGS: PlatformAdSettings = { enabled: false, format: 'banner', placement: 'all', companyName: '', title: '', message: '', imageUrl: '', linkUrl: '', durationSeconds: 3, intervalSeconds: 60, adsenseClient: '', adsenseSlot: '' };
const normalizeStoredAdCampaigns = (value: any): PlatformAdSettings[] => {
  if (Array.isArray(value?.adCampaigns)) return value.adCampaigns.map((campaign: any) => ({ ...DEFAULT_AD_SETTINGS, ...campaign, id: String(campaign.id || crypto.randomUUID()) }));
  if (value?.adSettings && (value.adSettings.enabled || value.adSettings.title || value.adSettings.message || value.adSettings.imageUrl)) {
    return [{ ...DEFAULT_AD_SETTINGS, ...value.adSettings, id: String(value.adSettings.id || crypto.randomUUID()) }];
  }
  return [];
};

const DEFAULT_ADMIN_ROLES: AdminRoleTemplate[] = [
  { id: 'admin', name: 'Administrator', permissions: ['all'] },
  { id: 'editor', name: 'Editor', permissions: ['stats', 'users', 'rooms'] },
];

const ADMIN_PERMISSION_KEYS = ['stats', 'users', 'rooms', 'transactions', 'cashier', 'agents', 'tournaments', 'settings'] as const;

function normalizeAdminPermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  if (value.includes('all')) return ['all'];
  const legacyMap: Record<string, string[]> = {
    manage_users: ['users'],
    manage_content: ['rooms', 'tournaments'],
    view_stats: ['stats'],
  };
  const normalized = value.flatMap(permission => legacyMap[String(permission)] || [String(permission)]);
  return [...new Set(normalized.filter(permission => (ADMIN_PERMISSION_KEYS as readonly string[]).includes(permission)))];
}

const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'password',
  roles: DEFAULT_ADMIN_ROLES,
  otpEnabled: true,
  phoneAuthEnabled: true,
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
  vipTiers: { ...VIP_TIERS },
  agents: {},
  agentTransactions: [],
  tournaments: {},
  adSettings: { ...DEFAULT_AD_SETTINGS },
  adCampaigns: [],
  spectatorBets: [],
};

// One live listener per collection replaces thousands of identical reads from
// browser polling while Firestore remains the authoritative persistent store.
const adminUsersCache = new Map<string, AdminUser>();
const agentCache = new Map<string, Agent>();
const agentRequestsCache = new Map<string, AgentRequest>();
const agentTransactionsCache = new Map<string, AgentTransaction>();
const cashierPaymentsCache = new Map<string, any>();
const firestoreLiveUnsubscribes: Array<() => void> = [];

function removeUserFromMatchmakingQueues(userId: string) {
  for (const key of Object.keys(store.matchmakingQueues)) {
    store.matchmakingQueues[key] = store.matchmakingQueues[key].filter(id => id !== userId);
  }
  if (store.users[userId]) delete (store.users[userId] as any).seekingJoinedAt;
}

async function startFirestoreLiveCaches() {
  if (isMySqlRuntimePrimary()) return;
  if (!db || firestoreLiveUnsubscribes.length) return;
  const watch = <T>(collectionName: string, cache: Map<string, T>, onChange?: (id: string, value: T | null) => void) => new Promise<void>((resolve) => {
    let initialized = false;
    const unsubscribe = db!.collection(collectionName).onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          cache.delete(change.doc.id);
          onChange?.(change.doc.id, null);
        } else {
          const value = { id: change.doc.id, ...change.doc.data() } as T;
          cache.set(change.doc.id, value);
          onChange?.(change.doc.id, value);
        }
      });
      if (!initialized) { initialized = true; resolve(); }
    }, error => {
      console.error(`Live cache listener failed for ${collectionName}:`, error);
      if (!initialized) { initialized = true; resolve(); }
    });
    firestoreLiveUnsubscribes.push(unsubscribe);
  });

  const watchers: Array<Promise<void>> = [
    watch<AdminUser>('adminUsers', adminUsersCache),
    watch<Agent>('agents', agentCache, (id, value) => {
      if (value) store.agents[id] = value;
      else delete store.agents[id];
    }),
    watch<AgentRequest>('agentRequests', agentRequestsCache),
    watch<AgentTransaction>('agentTransactions', agentTransactionsCache),
    watch<any>('cashierPayments', cashierPaymentsCache),
  ];
  if (!isMySqlRuntimePrimary()) {
    watchers.push(watch<any>('matchmaking', new Map<string, any>(), (id, value) => {
      removeUserFromMatchmakingQueues(id);
      if (!value || value.status !== 'WAITING_FOR_MATCH' || Date.now() - Number(value.timestamp || 0) > 180000) return;
      const userId = value.userId || id;
      const queueKey = `${value.betAmount}_${value.capacity}_${value.gameMode}`;
      if (!store.matchmakingQueues[queueKey]) store.matchmakingQueues[queueKey] = [];
      store.matchmakingQueues[queueKey].push(userId);
      if (!store.users[userId]) {
        store.users[userId] = { id: userId, username: value.username || 'Player', avatar: value.avatar || '🎮', balance: 0, winCount: 0, lossCount: 0, isOfflinePreference: false };
      }
      (store.users[userId] as any).seekingJoinedAt = Number(value.timestamp || Date.now());
      broadcastToAll('online_players_updated', {});
    }));
  }
  await Promise.all(watchers);
  console.log(`Firestore live caches initialized for admins and agents${isMySqlRuntimePrimary() ? '; matchmaking uses MySQL' : ' and matchmaking'}.`);
}

let mySqlPrimaryCacheTimer: NodeJS.Timeout | null = null;
async function refreshMySqlPrimaryCaches() {
  if (!isMySqlRuntimePrimary()) return;
  const data = await loadMySqlPrimaryCaches();
  adminUsersCache.clear();
  data.admins.forEach(admin => adminUsersCache.set(admin.id, admin));
  agentCache.clear();
  data.agents.forEach(agent => { agentCache.set(agent.id, agent); store.agents[agent.id] = agent; });
  agentRequestsCache.clear();
  data.requests.forEach(request => agentRequestsCache.set(request.id, request));
  agentTransactionsCache.clear();
  data.transactions.forEach(transaction => agentTransactionsCache.set(transaction.id, transaction));
  cashierPaymentsCache.clear();
  data.payments.forEach(payment => cashierPaymentsCache.set(payment.id, payment));
}

async function startMySqlPrimaryCaches() {
  if (!isMySqlRuntimePrimary() || mySqlPrimaryCacheTimer) return;
  await refreshMySqlPrimaryCaches();
  mySqlPrimaryCacheTimer = setInterval(() => {
    void refreshMySqlPrimaryCaches().catch(error => console.error('MySQL primary cache refresh failed:', error));
  }, 15_000);
  mySqlPrimaryCacheTimer.unref?.();
  console.log('MySQL primary caches initialized; Firestore live listeners are disabled.');
}

async function cachedAdminUser(adminId: string) {
  const cached = adminUsersCache.get(adminId);
  if (cached || !db || isMySqlRuntimePrimary()) return cached;
  const snapshot = await db.collection('adminUsers').doc(adminId).get();
  if (!snapshot.exists) return undefined;
  const admin = { id: snapshot.id, ...snapshot.data() } as AdminUser;
  adminUsersCache.set(adminId, admin);
  return admin;
}

async function cachedAgent(agentId: string) {
  const cached = agentCache.get(agentId) || store.agents[agentId];
  if (cached || !db || isMySqlRuntimePrimary()) return cached;
  const snapshot = await db.collection('agents').doc(agentId).get();
  if (!snapshot.exists) return undefined;
  const agent = { id: snapshot.id, ...snapshot.data() } as Agent;
  agentCache.set(agentId, agent);
  store.agents[agentId] = agent;
  return agent;
}

function seedDefaultTournaments() {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;

  // Check how many open or in-progress tournaments exist
  const openOrActive = Object.values(store.tournaments).filter(
    t => t.status === 'registration_open' || t.status === 'in_progress'
  );

  if (openOrActive.length < 3) {
    const t1: Tournament = {
      id: `tourney_weekly_${now}_1`,
      name: 'Ludo$om Weekly Champion Cup 🏆',
      entryFee: 5.0,
      prizePool: 72.0,
      status: 'registration_open',
      players: [],
      maxPlayers: 16,
      startDate: now + oneDay * 2,
      endDate: 0,
      winnerId: null,
      currentRound: 1,
      matches: [],
      createdAt: now,
    };

    const t2: Tournament = {
      id: `tourney_weekend_${now}_2`,
      name: 'Weekend High Stakes Knockout ⚡',
      entryFee: 10.0,
      prizePool: 72.0,
      status: 'registration_open',
      players: [],
      maxPlayers: 8,
      startDate: now + oneDay * 4,
      endDate: 0,
      winnerId: null,
      currentRound: 1,
      matches: [],
      createdAt: now,
    };

    const t3: Tournament = {
      id: `tourney_daily_${now}_3`,
      name: 'Daily Quick Sprint Tournament 🚀',
      entryFee: 2.0,
      prizePool: 7.2,
      status: 'registration_open',
      players: [],
      maxPlayers: 4,
      startDate: now + oneHour * 6,
      endDate: 0,
      winnerId: null,
      currentRound: 1,
      matches: [],
      createdAt: now,
    };

    if (!store.tournaments[t1.id]) store.tournaments[t1.id] = t1;
    if (!store.tournaments[t2.id]) store.tournaments[t2.id] = t2;
    if (!store.tournaments[t3.id]) store.tournaments[t3.id] = t3;
  }
}

// Load store from disk (local backup/fallback)
function loadStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      // Re-initialize lists to make sure they match expected shapes
      store.users = parsed.users || {};
      store.transactions = parsed.transactions || [];
      store.spectatorBets = parsed.spectatorBets || [];
      store.rooms = parsed.rooms || {};
      // Matchmaking queues are transient live state and must always start fresh
      store.matchmakingQueues = {
        0: [], 1: [], 5: [], 10: [], 25: [], 50: []
      };
      store.houseRevenue = parsed.houseRevenue || 0;
      store.pendingManualTransactions = parsed.pendingManualTransactions || [];
      store.paymentProviders = {
        ...DEFAULT_PAYMENT_PROVIDERS,
        ...(parsed.paymentProviders || {})
      };
      store.agentFloatInstructions = parsed.agentFloatInstructions || '';
      store.vipTiers = { ...VIP_TIERS, ...(parsed.vipTiers || {}) };
      store.tournaments = parsed.tournaments || {};
      store.adSettings = { ...DEFAULT_AD_SETTINGS, ...(parsed.adSettings || {}) };
      store.adCampaigns = normalizeStoredAdCampaigns(parsed);
      seedDefaultTournaments();
      const persistedRoles = Array.isArray(parsed.adminSettings?.roles) ? parsed.adminSettings.roles : [];
      store.adminSettings = {
        username: parsed.adminSettings?.username || process.env.ADMIN_USERNAME || 'admin',
        password: parsed.adminSettings?.password || process.env.ADMIN_PASSWORD || 'password',
        roles: persistedRoles.length ? persistedRoles : DEFAULT_ADMIN_ROLES,
        otpEnabled: parsed.adminSettings?.otpEnabled !== false,
        phoneAuthEnabled: parsed.adminSettings?.phoneAuthEnabled !== false,
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

async function loadStoreFromMySql(): Promise<boolean> {
  try {
    const snapshot = await loadRuntimeStoreFromMySql();
    if (!snapshot) return false;
    fs.writeFileSync(DB_FILE, JSON.stringify(snapshot), 'utf8');
    loadStore();
    console.log('Database loaded successfully from MySQL runtime store.');
    return true;
  } catch (error) {
    console.error('Failed to load MySQL runtime store; using Firebase fallback.', error);
    return false;
  }
}

// Load store from Firebase Firestore
async function loadStoreFromFirestore(): Promise<boolean> {
  if (!db) {
    loadStore();
    return false;
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
        store.spectatorBets = parsed.spectatorBets || [];
        store.rooms = parsed.rooms || {};
        // Matchmaking queues are transient live state and must always start fresh
        store.matchmakingQueues = {
          0: [], 1: [], 5: [], 10: [], 25: [], 50: []
        };
        store.houseRevenue = parsed.houseRevenue || 0;
        store.pendingManualTransactions = parsed.pendingManualTransactions || [];
        store.paymentProviders = {
          ...DEFAULT_PAYMENT_PROVIDERS,
          ...(parsed.paymentProviders || {})
        };
        store.agentFloatInstructions = parsed.agentFloatInstructions || '';
        store.vipTiers = { ...VIP_TIERS, ...(parsed.vipTiers || {}) };
        const persistedRoles = Array.isArray(parsed.adminSettings?.roles) ? parsed.adminSettings.roles : [];
        store.adminSettings = {
          username: parsed.adminSettings?.username || process.env.ADMIN_USERNAME || 'admin',
          password: parsed.adminSettings?.password || process.env.ADMIN_PASSWORD || 'password',
          roles: persistedRoles.length ? persistedRoles : DEFAULT_ADMIN_ROLES,
          otpEnabled: parsed.adminSettings?.otpEnabled !== false,
          phoneAuthEnabled: parsed.adminSettings?.phoneAuthEnabled !== false,
        };
        store.agents = parsed.agents || {};
        store.agentTransactions = parsed.agentTransactions || [];
        store.tournaments = parsed.tournaments || {};
        store.adSettings = { ...DEFAULT_AD_SETTINGS, ...(parsed.adSettings || {}) };
        store.adCampaigns = normalizeStoredAdCampaigns(parsed);
        console.log('Database loaded successfully from Firebase Firestore.');
        // Update local file backup
        fs.writeFileSync(DB_FILE, payload.data, 'utf8');
        await loadUserProfilesFromFirestore();
        await loadManualRequestsFromFirestore();
        await syncUserProfilesToFirestore();
        return true;
      }
    }
    console.log('No existing state in Firestore. Loading from local store fallback...');
    loadStore();
    await loadUserProfilesFromFirestore();
    await loadManualRequestsFromFirestore();
    await syncUserProfilesToFirestore();
    return false;
  } catch (err) {
    console.error('Failed to load store from Firestore:', err);
    loadStore();
    return false;
  }
}

// User profiles are stored separately because the complete store can exceed
// Firestore's single-document size limit. The existing in-memory store remains
// unchanged and continues to be the source used by the rest of the app.
const persistedUserProfiles = new Map<string, string>();
let userProfileSyncQueue: Promise<void> = Promise.resolve();
let userProfileSyncTimer: NodeJS.Timeout | null = null;
let resolveScheduledUserProfileSync: (() => void) | null = null;
let scheduledUserProfileSync: Promise<void> | null = null;

function serializeUserProfile(user: UserProfile) {
  return JSON.stringify(user);
}

const isMySqlRuntimePrimary = () => mysqlRuntimeStoreMode() === 'primary';

async function loadUserProfilesFromFirestore() {
  if (!db || isMySqlRuntimePrimary()) return;

  const snapshot = await db.collection('users').get();
  snapshot.forEach((userDoc) => {
    const profile = userDoc.data() as UserProfile;
    if (profile?.id) {
      store.users[profile.id] = profile;
      persistedUserProfiles.set(userDoc.id, serializeUserProfile(profile));
    }
  });
}

async function syncUserProfilesToFirestore() {
  if (isMySqlRuntimePrimary()) {
    const changedUsers = Object.values(store.users).filter(user =>
      !isBotPlayer(user.id)
      && persistedUserProfiles.get(user.firebaseUid || user.id) !== serializeUserProfile(user));
    for (const user of changedUsers) {
      await saveMySqlUserProfile(user);
      persistedUserProfiles.set(user.firebaseUid || user.id, serializeUserProfile(user));
    }
    return;
  }
  if (!db) return;

  const users = Object.values(store.users).filter((user) => {
    if (isBotPlayer(user.id)) return false;
    const documentId = user.firebaseUid || user.id;
    return persistedUserProfiles.get(documentId) !== serializeUserProfile(user);
  });

  for (let offset = 0; offset < users.length; offset += 500) {
    const batch = db.batch();
    for (const user of users.slice(offset, offset + 500)) {
      const documentId = user.firebaseUid || user.id;
      const cleanProfile = JSON.parse(JSON.stringify(user));
      batch.set(db.collection('users').doc(documentId), cleanProfile, { merge: true });
    }
    await batch.commit();
    for (const user of users.slice(offset, offset + 500)) {
      persistedUserProfiles.set(user.firebaseUid || user.id, serializeUserProfile(user));
    }
  }
}

function queueUserProfileSync() {
  if (!scheduledUserProfileSync) {
    scheduledUserProfileSync = new Promise<void>(resolve => {
      resolveScheduledUserProfileSync = resolve;
    });
    userProfileSyncTimer = setTimeout(() => {
      userProfileSyncTimer = null;
      const resolve = resolveScheduledUserProfileSync;
      resolveScheduledUserProfileSync = null;
      scheduledUserProfileSync = null;
      userProfileSyncQueue = userProfileSyncQueue
        .then(() => syncUserProfilesToFirestore())
        .catch((error) => console.error('Failed to synchronize user profiles:', error))
        .finally(() => resolve?.());
    }, 750);
    userProfileSyncTimer.unref?.();
  }
  return scheduledUserProfileSync;
}

async function saveUserProfileToFirestore(user: UserProfile) {
  if (isMySqlRuntimePrimary()) return saveMySqlUserProfile(user);
  if (!db) return;
  const documentId = user.firebaseUid || user.id;
  const cleanProfile = JSON.parse(JSON.stringify(user));
  await db.collection('users').doc(documentId).set(cleanProfile, { merge: true });
  persistedUserProfiles.set(documentId, serializeUserProfile(user));
}

async function saveManualRequestToFirestore(request: ManualTransactionRequest) {
  if (isMySqlRuntimePrimary()) {
    // manual_transaction_requests.user_id has a foreign key to app_users.
    // Older Firebase/local users may not have been mirrored to MySQL yet, so
    // always upsert the owner before inserting their payment request.
    const requestUser = store.users[request.userId];
    if (!requestUser) throw new Error(`Cannot persist manual request for missing user ${request.userId}`);
    await saveMySqlUserProfile(requestUser);
    return saveMySqlManualRequest(request, requestUser);
  }
  if (db) {
    try {
      await db.collection('manualTransactionRequests').doc(request.id).set(JSON.parse(JSON.stringify(request)), { merge: true });
      return;
    } catch (error) {
      if (!isMySqlConfigured()) throw error;
      console.error('Firestore manual request write failed; falling back to MySQL:', error);
    }
  }
  if (isMySqlConfigured()) {
    const requestUser = store.users[request.userId];
    if (requestUser) await saveMySqlUserProfile(requestUser);
    return saveMySqlManualRequest(request, requestUser);
  }
  throw new Error('Database not initialized');
}

async function loadManualRequestsFromFirestore() {
  if (!db || isMySqlRuntimePrimary()) return;
  const snapshot = await db.collection('manualTransactionRequests').get();
  const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ManualTransactionRequest));
  const merged = new Map(store.pendingManualTransactions.map(request => [request.id, request]));
  requests.forEach(request => merged.set(request.id, request));
  store.pendingManualTransactions = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}

async function findManualRequest(requestId: string) {
  const localRequest = store.pendingManualTransactions.find(request => request.id === requestId);
  if (localRequest || !db || isMySqlRuntimePrimary()) return localRequest;
  const document = await db.collection('manualTransactionRequests').doc(requestId).get();
  if (!document.exists) return undefined;
  const request = { id: document.id, ...document.data() } as ManualTransactionRequest;
  store.pendingManualTransactions.unshift(request);
  return request;
}

const CASHIER_ONLINE_WINDOW_MS = 75 * 1000;
const CASHIER_ASSIGNMENT_MS = 5 * 60 * 1000;

function normalizedCity(location: unknown): string {
  const city = String(location || '')
    .split(',')[0]
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ');
  const aliases: Record<string, string> = {
    muqdisho: 'mogadishu', xamar: 'mogadishu', mogadishu: 'mogadishu',
    hargeysa: 'hargeisa', hargeisa: 'hargeisa',
    boosaaso: 'bosaso', bosaso: 'bosaso',
    kismaayo: 'kismayo', kismayo: 'kismayo',
    baydhabo: 'baidoa', baidoa: 'baidoa',
    garowe: 'garowe', garoowe: 'garowe', gaarowe: 'garowe', nugaal: 'garowe',
  };
  return aliases[city] || city;
}

function cashierCities(admin: { location?: string; cashierLocations?: string[] }): string[] {
  return [...new Set([...(Array.isArray(admin.cashierLocations) ? admin.cashierLocations : []), admin.location]
    .map(normalizedCity)
    .filter(Boolean))].slice(0, 2);
}

function cashierCanServeRequest(admin: { location?: string; cashierLocations?: string[] }, request: ManualTransactionRequest): boolean {
  const user = store.users[request.userId];
  const requestCity = normalizedCity(request.cashierCity || user?.location);
  return Boolean(requestCity && cashierCities(admin).includes(requestCity));
}

async function assignCashierToRequest(request: ManualTransactionRequest, now = Date.now()): Promise<boolean> {
  if ((!db && !isMySqlConfigured()) || request.managedBy === 'agent' || request.status !== 'pending') return false;
  const user = store.users[request.userId];
  const city = normalizedCity(request.cashierCity || user?.location);
  request.cashierCity = city;
  if (!city) return false;
  if (request.assignedCashierId && Number(request.assignmentExpiresAt || 0) <= now) {
    request.cashierTimedOutIds = [...(request.cashierTimedOutIds || []), request.assignedCashierId];
  }

  const eligible = [...adminUsersCache.values()]
    .filter(admin => admin.status !== 'suspended'
      && normalizeAdminPermissions(admin.permissions).includes('cashier')
      && cashierCities(admin).includes(city)
      && Number(admin.cashierOnlineAt || 0) >= now - CASHIER_ONLINE_WINDOW_MS);

  if (eligible.length === 0) {
    const assignmentChanged = Boolean(request.assignedCashierId || request.assignedCashierName || request.assignedCashierAt || request.assignmentExpiresAt);
    request.assignedCashierId = undefined;
    request.assignedCashierName = undefined;
    request.assignedCashierAt = undefined;
    request.assignmentExpiresAt = undefined;
    if (assignmentChanged) await saveManualRequestToFirestore(request);
    return false;
  }

  const history = Array.isArray(request.cashierAssignmentHistory) ? request.cashierAssignmentHistory : [];
  let candidates = eligible.filter(cashier => cashier.id !== request.assignedCashierId && !history.includes(cashier.id));
  let nextHistory = history;
  if (candidates.length === 0) {
    candidates = eligible.filter(cashier => cashier.id !== request.assignedCashierId);
    if (candidates.length === 0) candidates = eligible;
    nextHistory = [];
  }
  const selected = candidates[crypto.randomInt(candidates.length)];
  request.assignedCashierId = selected.id;
  request.assignedCashierName = selected.name || selected.username;
  request.assignedCashierAt = now;
  request.assignmentExpiresAt = now + CASHIER_ASSIGNMENT_MS;
  request.cashierAssignmentHistory = [...new Set([...nextHistory, selected.id])];
  await saveManualRequestToFirestore(request);
  return true;
}

async function reassignExpiredCashierRequests(now = Date.now()): Promise<void> {
  const requests = store.pendingManualTransactions.filter(request =>
    request.status === 'pending'
    && request.managedBy !== 'agent'
    && (!request.assignedCashierId || Number(request.assignmentExpiresAt || 0) <= now));
  for (const request of requests) {
    try {
      await assignCashierToRequest(request, now);
    } catch (error) {
      console.error(`Cashier assignment failed for ${request.id}:`, error);
    }
  }
}

const cashierAssignmentTimer = setInterval(() => {
  void reassignExpiredCashierRequests();
}, 15 * 1000);
cashierAssignmentTimer.unref?.();

async function findUserProfileInFirestore(firebaseUid: string, email?: string) {
  if (isMySqlRuntimePrimary()) {
    return Object.values(store.users).find(user => user.firebaseUid === firebaseUid
      || Boolean(email && user.email?.trim().toLowerCase() === email.trim().toLowerCase())) || null;
  }
  if (!db) return null;

  const uidDoc = await db.collection('users').doc(firebaseUid).get();
  if (uidDoc.exists) {
    return uidDoc.data() as UserProfile;
  }

  const uidSnapshot = await db.collection('users')
    .where('firebaseUid', '==', firebaseUid)
    .limit(1)
    .get();
  if (!uidSnapshot.empty) {
    return uidSnapshot.docs[0].data() as UserProfile;
  }

  if (email) {
    const emailSnapshot = await db.collection('users')
      .where('email', '==', email.trim().toLowerCase())
      .limit(1)
      .get();
    if (!emailSnapshot.empty) {
      return emailSnapshot.docs[0].data() as UserProfile;
    }
  }

  return null;
}

async function refreshUserProfileById(userId: string): Promise<UserProfile | null> {
  if (isMySqlRuntimePrimary()) return store.users[userId] || null;
  if (!db) return store.users[userId] || null;
  const knownUser = store.users[userId];
  if (knownUser?.firebaseUid) {
    const uidDoc = await db.collection('users').doc(knownUser.firebaseUid).get();
    if (uidDoc.exists) {
      const profile = uidDoc.data() as UserProfile;
      store.users[profile.id] = profile;
      return profile;
    }
  }
  const snapshot = await db.collection('users').where('id', '==', userId).limit(1).get();
  if (!snapshot.empty) {
    const profile = snapshot.docs[0].data() as UserProfile;
    store.users[profile.id] = profile;
    return profile;
  }
  return knownUser || null;
}

async function syncToFirestore() {
  if (!db || isMySqlRuntimePrimary()) return;

  try {
    const storeRef = db.collection('ludo_store').doc('main');
    const serialized = JSON.stringify(store);
    // Firestore documents are capped at 1 MiB. User profiles and manual
    // requests are already persisted separately, so do not spend time on a
    // guaranteed-to-fail central snapshot once it approaches that limit.
    if (Buffer.byteLength(serialized, 'utf8') > 900_000) return;
    await storeRef.set({ data: serialized, updatedAt: Date.now() });
    console.log('Successfully synchronized store to Firebase Firestore.');
  } catch (err) {
    console.error('Failed to sync store to Firestore:', err);
  }
}

let pendingMySqlStoreSnapshot: Record<string, any> | null = null;
let mySqlStoreSync: Promise<void> | null = null;
let lastMySqlStoreSnapshotAt = 0;
const MYSQL_STORE_SNAPSHOT_INTERVAL_MS = 5_000;

function queueMySqlStoreSync(): Promise<void> {
  if (firebaseMySqlMigrationMode || mysqlRuntimeStoreMode() === 'disabled') return Promise.resolve();
  // Mark the latest state as pending without cloning the entire store on every
  // dice/timer mutation. The worker takes one immutable snapshot per actual DB
  // write and naturally coalesces bursts of updates.
  pendingMySqlStoreSnapshot = store;
  if (!mySqlStoreSync) {
    mySqlStoreSync = (async () => {
      while (pendingMySqlStoreSnapshot) {
        // Live rooms have their own persistence. Throttle the compatibility
        // snapshot so serializing the entire store cannot block the API loop.
        const waitMs = Math.max(750, MYSQL_STORE_SNAPSHOT_INTERVAL_MS - (Date.now() - lastMySqlStoreSnapshotAt));
        await new Promise(resolve => setTimeout(resolve, waitMs));
        const snapshot = JSON.parse(JSON.stringify(pendingMySqlStoreSnapshot));
        pendingMySqlStoreSnapshot = null;
        await saveRuntimeStoreToMySql(snapshot);
        lastMySqlStoreSnapshotAt = Date.now();
      }
    })().finally(() => {
      mySqlStoreSync = null;
    });
  }
  return mySqlStoreSync;
}

let diskStoreSaveTimer: NodeJS.Timeout | null = null;
let lastDiskStoreSaveAt = 0;
const DISK_STORE_SAVE_INTERVAL_MS = 10_000;

function queueDiskStoreSave() {
  if (diskStoreSaveTimer) return;
  const delay = Math.max(250, DISK_STORE_SAVE_INTERVAL_MS - (Date.now() - lastDiskStoreSaveAt));
  diskStoreSaveTimer = setTimeout(() => {
    diskStoreSaveTimer = null;
    // Compact JSON substantially reduces CPU time and disk I/O. Critical
    // financial writes still use saveStoreAndWait immediately.
    const payload = JSON.stringify(store);
    void fs.promises.writeFile(DB_FILE, payload, 'utf8').catch(error => {
      console.error('Failed to write database backup to disk.', error);
    });
    lastDiskStoreSaveAt = Date.now();
  }, delay);
  diskStoreSaveTimer.unref?.();
}

// Save store to disk and sync with Firestore
function saveStore() {
  try {
    queueDiskStoreSave();
    void queueMySqlStoreSync().catch(error => console.error('MySQL shadow store synchronization failed:', error));
    void queueUserProfileSync();
  } catch (error) {
    console.error('Failed to write database to disk.', error);
  }
}

// Slower, awaited version for critical updates
async function saveStoreAndWait() {
    try {
      if (diskStoreSaveTimer) {
        clearTimeout(diskStoreSaveTimer);
        diskStoreSaveTimer = null;
      }
      await fs.promises.writeFile(DB_FILE, JSON.stringify(store, null, 2), 'utf8');
      try {
        await queueMySqlStoreSync();
      } catch (error) {
        console.error('MySQL shadow store synchronization failed; continuing with Firebase:', error);
      }
      await syncToFirestore();
      await queueUserProfileSync();
    } catch (error) {
      console.error('Failed to write database to disk.', error);
    }
  }

// ==========================================
// PURGE SIMULATED USERS TO KEEP ONLY REAL REGISTERED USER SESSIONS ON THE RADAR
// ==========================================
function purgeSimulatedUsers() {
  let changed = false;
  Object.keys(store.users).forEach(id => {
    if (id.startsWith('user_sim_') || id.startsWith('sim_')) {
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
  profile?: Partial<UserProfile>;
  spectatingRoomId?: string;
}

let activeClients: SSEClient[] = [];
const SERVER_INSTANCE_ID = crypto.randomUUID();

function publishRealtimeEvent(scopeType: 'all' | 'room' | 'user', targetId: string | null, eventName: string, payload: any) {
  if (!isMySqlConfigured() || eventName === 'timer_tick') return;
  void publishMySqlRealtimeEvent({
    originId: SERVER_INSTANCE_ID,
    scopeType,
    targetId,
    eventName,
    payload,
  }).catch(error => console.error(`Failed to publish shared ${eventName} event:`, error));
}

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
function broadcastToAllLocal(eventName: string, data: any) {
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

function broadcastToAll(eventName: string, data: any) {
  broadcastToAllLocal(eventName, data);
  publishRealtimeEvent('all', null, eventName, data);
}

// Send update to all players AND SPECTATORS in a room
function broadcastToRoomLocal(roomId: string, eventName: string, data: any) {
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

function broadcastToRoom(roomId: string, eventName: string, data: any) {
  broadcastToRoomLocal(roomId, eventName, data);
  publishRealtimeEvent('room', roomId, eventName, data);
  const room = store.rooms[roomId];
  if (room && (room.status === 'completed' || room.status === 'cancelled')) {
    void settleSpectatorBets(room).catch(error => console.error(`Spectator bet settlement failed for ${roomId}:`, error));
  }
}

// Global user update broadcast (for dashboard balance/profile syncing)
function broadcastUserUpdate(userId: string) {
  const user = store.users[userId];
  if (user) {
    sendEventToUser(userId, 'user_update', user);
    publishRealtimeEvent('user', userId, 'user_update', user);
  }
}

let mySqlRealtimeCursor: number | null = null;
let mySqlRealtimePollRunning = false;
let lastMySqlRealtimeCleanupAt = 0;

async function pollMySqlRealtimeEvents() {
  if (!isMySqlConfigured() || mySqlRealtimePollRunning) return;
  mySqlRealtimePollRunning = true;
  try {
    if (mySqlRealtimeCursor === null) {
      mySqlRealtimeCursor = await latestMySqlRealtimeEventId();
      return;
    }
    const events = await listMySqlRealtimeEvents(mySqlRealtimeCursor);
    for (const event of events) {
      mySqlRealtimeCursor = Math.max(mySqlRealtimeCursor, event.id);
      if (event.originId === SERVER_INSTANCE_ID) continue;
      if (event.scopeType === 'room' && event.targetId) {
        if (event.eventName === 'game_update' && event.payload?.id) {
          const incomingRoom = event.payload as GameRoom;
          if (shouldAcceptRoomSnapshot(store.rooms[incomingRoom.id], incomingRoom)) {
            store.rooms[incomingRoom.id] = incomingRoom;
          } else {
            continue;
          }
        }
        broadcastToRoomLocal(event.targetId, event.eventName, event.payload);
      } else if (event.scopeType === 'user' && event.targetId) {
        if (event.eventName === 'user_update' && event.payload?.id) {
          store.users[event.payload.id] = event.payload;
        }
        sendEventToUser(event.targetId, event.eventName, event.payload);
      } else {
        broadcastToAllLocal(event.eventName, event.payload);
      }
    }
    if (Date.now() - lastMySqlRealtimeCleanupAt > 60_000) {
      lastMySqlRealtimeCleanupAt = Date.now();
      await cleanupMySqlRealtimeEvents(Date.now() - 5 * 60_000);
    }
  } catch (error) {
    console.error('MySQL realtime event poll failed:', error);
  } finally {
    mySqlRealtimePollRunning = false;
  }
}

const mySqlRealtimePollTimer = setInterval(() => void pollMySqlRealtimeEvents(), 500);
mySqlRealtimePollTimer.unref?.();

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

      // Do not remove an active search merely because SSE reconnects or this
      // hosting process loses the connection. Explicit leave/match/expiry owns
      // queue removal, which keeps searches visible across server instances.
    }
    broadcastToAll('online_players_updated', {});
  }
}


// Clean up stale users from matchmaking queues
function cleanupMatchmakingQueues() {
  let changed = false;
  const now = Date.now();

  for (const qKey of Object.keys(store.matchmakingQueues)) {
    const beforeLen = store.matchmakingQueues[qKey].length;
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter(userId => {
      // Must exist in store
      if (!store.users[userId]) return false;

      // Must not be in an active playing room
      const inGame = Object.values(store.rooms).some(r =>
        r.status === 'playing' && r.players.some(p => p.userId === userId && p.status !== 'left')
      );
      if (inGame) return false;

      // Keep searches alive across transient SSE reconnects and multiple server
      // processes. Bot auto-fill owns the three-minute threshold; only truly
      // abandoned records expire here after ten minutes.
      const u = store.users[userId];
      const seekingJoinedAt = (u as any)?.seekingJoinedAt;
      if (seekingJoinedAt && (now - seekingJoinedAt > 10 * 60_000)) {
        delete (u as any).seekingJoinedAt;
        void deleteSharedMatchmakingRecords(userId);
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

function syncMatchmakingRecordWithRetry(userId: string, record: Record<string, unknown>, attempt = 1) {
  const operation = isMySqlRuntimePrimary()
    ? upsertMySqlMatchmaking(record)
    : db?.collection('matchmaking').doc(userId).set(record);
  if (!operation) return;
  operation.catch(error => {
    console.error(`Failed to sync matchmaking record (attempt ${attempt}):`, error);
    if (attempt < 3) {
      setTimeout(() => syncMatchmakingRecordWithRetry(userId, record, attempt + 1), attempt * 1000);
    }
  });
}

async function deleteSharedMatchmakingRecords(...userIds: string[]) {
  if (isMySqlRuntimePrimary()) {
    await deleteMySqlMatchmaking(userIds);
    return;
  }
  if (!db) return;
  await Promise.all(userIds.map(userId => db!.collection('matchmaking').doc(userId).delete()));
}

let mysqlMatchmakingSignature = '';
let mysqlMatchmakingTimer: NodeJS.Timeout | null = null;
let mysqlCashierHeartbeatTimer: NodeJS.Timeout | null = null;

async function refreshMySqlMatchmakingQueues() {
  const records = await listActiveMySqlMatchmaking();
  const signature = JSON.stringify(records.map(record => [record.userId, record.timestamp]));
  if (signature === mysqlMatchmakingSignature) return;
  mysqlMatchmakingSignature = signature;
  for (const key of Object.keys(store.matchmakingQueues)) store.matchmakingQueues[key] = [];
  for (const record of records) {
    const userId = String(record.userId || '');
    if (!userId) continue;
    const queueKey = `${record.betAmount}_${record.capacity}_${record.gameMode}`;
    if (!store.matchmakingQueues[queueKey]) store.matchmakingQueues[queueKey] = [];
    store.matchmakingQueues[queueKey].push(userId);
    if (!store.users[userId]) store.users[userId] = { id: userId, username: record.username || 'Player', avatar: record.avatar || '🎮', balance: 0, winCount: 0, lossCount: 0, isOfflinePreference: false };
    (store.users[userId] as any).seekingJoinedAt = Number(record.timestamp || Date.now());
  }
  broadcastToAll('online_players_updated', {});
}

async function startMySqlMatchmakingSync() {
  if (!isMySqlRuntimePrimary() || mysqlMatchmakingTimer) return;
  await refreshMySqlMatchmakingQueues();
  mysqlMatchmakingTimer = setInterval(() => {
    void refreshMySqlMatchmakingQueues().catch(error => console.error('MySQL matchmaking refresh failed:', error));
  }, 2_000);
  mysqlMatchmakingTimer.unref?.();
  console.log('MySQL matchmaking realtime synchronization initialized.');
}

async function refreshMySqlCashierHeartbeats() {
  const heartbeats = await listMySqlCashierHeartbeats();
  heartbeats.forEach(({ id, cashierOnlineAt }) => {
    const admin = adminUsersCache.get(id);
    if (admin) adminUsersCache.set(id, { ...admin, cashierOnlineAt });
  });
}

async function startMySqlCashierHeartbeatSync() {
  if (!isMySqlRuntimePrimary() || mysqlCashierHeartbeatTimer) return;
  await refreshMySqlCashierHeartbeats();
  mysqlCashierHeartbeatTimer = setInterval(() => {
    void refreshMySqlCashierHeartbeats().catch(error => console.error('MySQL cashier heartbeat refresh failed:', error));
  }, 15_000);
  mysqlCashierHeartbeatTimer.unref?.();
  console.log('MySQL cashier heartbeat synchronization initialized.');
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
const PLAYER_INACTIVITY_SECONDS = 300;

function getTeamColors(color: PlayerColor): PlayerColor[] {
  return color === 'red' || color === 'yellow' ? ['red', 'yellow'] : ['green', 'blue'];
}

function getPartnerColor(color: PlayerColor): PlayerColor {
  return color === 'red' ? 'yellow' : color === 'yellow' ? 'red' : color === 'green' ? 'blue' : 'green';
}

function getPlayableColor(room: GameRoom, player: LudoPlayer): PlayerColor {
  if (room.gameMode !== 'team' || !player.teamAssistUnlocked) return player.color;
  return getPartnerColor(player.color);
}

function resetPlayerInactivity(player?: LudoPlayer) {
  if (!player || isBotPlayer(player.userId)) return;
  player.inactivityTimer = PLAYER_INACTIVITY_SECONDS;
  player.inactivityDeadline = undefined;
  player.lastInactivityWarningMinute = undefined;
}

function touchRoom(room: GameRoom) {
  room.gameState.lastActivity = Math.max(Date.now(), Number(room.gameState.lastActivity || 0) + 1);
}

function shouldAcceptRoomSnapshot(localRoom: GameRoom | undefined, incomingRoom: GameRoom): boolean {
  if (!localRoom) return true;
  if (localRoom.status === 'completed' || localRoom.status === 'cancelled') return false;
  if (incomingRoom.status === 'completed' || incomingRoom.status === 'cancelled') return true;
  return Number(incomingRoom.gameState?.lastActivity || 0) >= Number(localRoom.gameState?.lastActivity || 0);
}
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
  
  // Clean dice roll states
  gs.diceRoll = null;
  gs.hasRolled = false;
  gs.turnTimer = 30;
  
  // Find next active player
  let found = false;
  let nextTurn = oldTurn;
  // Two passes allow us to consume a partnership finish-skip and still select
  // the following active player in the same call.
  for (let i = 1; i <= numPlayers * 2; i++) {
    const checkIdx = (oldTurn + i) % numPlayers;
    const p = room.players[checkIdx];
    if (p && p.status !== 'left') {
      if (room.gameMode === 'team' && p.teamFinishSkipPending) {
        p.teamFinishSkipPending = false;
        p.teamAssistUnlocked = true;
        addLog(room, `${p.username} skips one turn after bringing all 4 tokens home. Future rolls will move their partner's tokens.`);
        continue;
      }
      nextTurn = checkIdx;
      found = true;
      break;
    }
  }

  if (found) {
    gs.turn = nextTurn;
    const nextPlayer = room.players[nextTurn];
    resetPlayerInactivity(nextPlayer);
    addLog(room, `It is now ${nextPlayer.username}'s turn. Please roll the dice!`);
  }
  touchRoom(room);
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

function hasMatchPayout(userId: string, matchId: string): boolean {
  return store.transactions.some(tx =>
    tx.userId === userId && tx.matchId === matchId && tx.type === 'win_payout'
  );
}

const settlingSpectatorRooms = new Set<string>();
async function settleSpectatorBets(room: GameRoom) {
  if (settlingSpectatorRooms.has(room.id)) return;
  const openBets = store.spectatorBets.filter(bet => bet.roomId === room.id && bet.status === 'open');
  if (!openBets.length) return;
  settlingSpectatorRooms.add(room.id);
  try {
    const winnerIds = room.gameState.winnerIds?.length
      ? room.gameState.winnerIds
      : (room.gameState.winnerId ? [room.gameState.winnerId] : []);
    const markets = new Map<string, SpectatorBet[]>();
    openBets.forEach(bet => markets.set(bet.targetPlayerId, [...(markets.get(bet.targetPlayerId) || []), bet]));
    for (const [targetPlayerId, marketBets] of markets) {
      const totalPool = Number(marketBets.reduce((sum, bet) => sum + bet.stake, 0).toFixed(2));
      const targetWon = winnerIds.includes(targetPlayerId);
      const winningPrediction: 'W' | 'L' = targetWon ? 'W' : 'L';
      const winnerPool = Number(marketBets.filter(bet => bet.prediction === winningPrediction).reduce((sum, bet) => sum + bet.stake, 0).toFixed(2));
      const distributablePool = Number((totalPool * 0.90).toFixed(2));
      const shouldRefund = room.status === 'cancelled' || winnerIds.length === 0 || winnerPool === 0 || distributablePool <= winnerPool;
      const winningBets = marketBets.filter(bet => bet.prediction === winningPrediction);
      let distributed = 0;

      for (const bet of marketBets) {
        const bettor = store.users[bet.userId];
        if (!bettor) continue;
        bet.settledAt = Date.now();
        if (shouldRefund) {
          bet.status = 'refunded';
          bet.payout = bet.stake;
          bettor.balance = Number((bettor.balance + bet.stake).toFixed(2));
          addTransaction(bet.userId, 'refund', bet.stake, room.id, `Unmatched spectator pool refund ${bet.id}.`);
        } else if (bet.prediction === winningPrediction) {
          const winnerIndex = winningBets.findIndex(item => item.id === bet.id);
          const payout = winnerIndex === winningBets.length - 1
            ? Number((distributablePool - distributed).toFixed(2))
            : Number((distributablePool * (bet.stake / winnerPool)).toFixed(2));
          distributed = Number((distributed + payout).toFixed(2));
          bet.status = 'won';
          bet.payout = payout;
          bet.odds = Number((payout / bet.stake).toFixed(2));
          bet.potentialPayout = payout;
          bettor.balance = Number((bettor.balance + payout).toFixed(2));
          addTransaction(bet.userId, 'win_payout', payout, room.id, `Dynamic spectator pool won on ${bet.targetUsername} (${bet.odds.toFixed(2)} final odds).`);
        } else {
          bet.status = 'lost';
          bet.payout = 0;
        }
        broadcastUserUpdate(bet.userId);
        await saveUserProfileToFirestore(bettor);
      }
      if (!shouldRefund) {
        const commission = Number((totalPool - distributablePool).toFixed(2));
        recordHouseRevenue('betting_margin', commission, `${room.id}:${targetPlayerId}`, `10% spectator pool commission for match ${room.id}.`);
      }
    }
    await saveStoreAndWait();
  } finally {
    settlingSpectatorRooms.delete(room.id);
  }
}

async function persistLiveRoom(room: GameRoom): Promise<void> {
  if (!isMySqlConfigured()) return;
  await saveMySqlGameRoom(room);
}

async function persistRoomUserProfiles(room: GameRoom): Promise<void> {
  const profiles = room.players
    .filter(player => !isBotPlayer(player.userId))
    .map(player => store.users[player.userId])
    .filter((profile): profile is UserProfile => Boolean(profile));
  await Promise.all(profiles.map(profile => saveUserProfileToFirestore(profile)));
}

type RevenueCategory = NonNullable<WalletTransaction['revenueCategory']>;

function recordHouseRevenue(category: RevenueCategory, amount: number, referenceId?: string, description = '') {
  const normalizedAmount = Number(Number(amount || 0).toFixed(2));
  if (!normalizedAmount) return;
  if (referenceId && store.transactions.some(tx =>
    tx.type === 'app_commission' && tx.matchId === referenceId && tx.revenueCategory === category
  )) return;
  store.houseRevenue = Number(((store.houseRevenue || 0) + normalizedAmount).toFixed(2));
  const tx = addTransaction('house', 'app_commission', normalizedAmount, referenceId, description);
  tx.revenueCategory = category;
  saveStore();
}

function effectiveRakeForUsers(userIds: string[]): number {
  const realUsers = userIds.map(id => store.users[id]).filter(Boolean);
  if (!realUsers.length) return RAKE_PERCENTAGE;
  const totalDiscount = realUsers.reduce((sum, user) => {
    if (!user.vip || user.vip.expires <= Date.now()) return sum;
    return sum + Number(store.vipTiers[user.vip.tier]?.rakeDiscount || 0);
  }, 0);
  return Math.max(0, RAKE_PERCENTAGE - (totalDiscount / realUsers.length));
}

function getWithdrawableBalance(userId: string, excludeRequestId?: string): number {
  const approvedDeposits = store.transactions
    .filter(tx => tx.userId === userId && tx.type === 'deposit' && /deposit/i.test(tx.description || '') && !/welcome bonus/i.test(tx.description || ''))
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const earnedFromWins = store.transactions
    .filter(tx => tx.userId === userId && tx.type === 'win_payout')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const unlockedBonus = approvedDeposits >= BONUS_UNLOCK_DEPOSIT_TOTAL ? WELCOME_BONUS : 0;
  const completedWithdrawals = store.transactions
    .filter(tx => tx.userId === userId && tx.type === 'withdrawal')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const pendingWithdrawals = store.pendingManualTransactions
    .filter(tx => tx.id !== excludeRequestId && tx.userId === userId && tx.transactionType === 'withdraw' && tx.status === 'pending')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  return Math.max(0, approvedDeposits + earnedFromWins + unlockedBonus - completedWithdrawals - pendingWithdrawals);
}

function hasCompletedPaidGame(userId: string): boolean {
  return store.transactions.some(tx => tx.userId === userId && tx.type === 'bet_escrow_locked' && Number(tx.amount || 0) > 0)
    && Object.values(store.rooms).some(room => room.status === 'completed' && room.betAmount > 0 && room.players.some(player => player.userId === userId));
}

function getWithdrawalQuote(userId: string, amount: number) {
  const playedPaidGame = hasCompletedPaidGame(userId);
  const feeRate = playedPaidGame ? NORMAL_WITHDRAWAL_FEE_RATE : NO_PLAY_WITHDRAWAL_FEE_RATE;
  const fee = playedPaidGame
    ? 0
    : Math.min(amount, Math.max(MINIMUM_WITHDRAWAL_FEE, Number((amount * feeRate).toFixed(2))));
  return { feeRate, fee, netAmount: Number((amount - fee).toFixed(2)), playedPaidGame };
}

function withdrawalEligibilityError(user: UserProfile, amount: number, excludeRequestId?: string): string | null {
  if (amount < MINIMUM_WITHDRAWAL) return `Minimum withdrawal amount is $${MINIMUM_WITHDRAWAL}.`;
  if (user.balance < amount) return 'Insufficient balance for this withdrawal.';
  const withdrawable = getWithdrawableBalance(user.id, excludeRequestId);
  if (withdrawable < amount) {
    return withdrawable > 0
      ? `Only $${withdrawable.toFixed(2)} is currently available to withdraw.`
      : `Deposit funds first. The $${WELCOME_BONUS.toFixed(0)} welcome bonus unlocks after $${BONUS_UNLOCK_DEPOSIT_TOTAL} in approved deposits.`;
  }
  return null;
}

function recordWithdrawalFee(userId: string, amount: number, requestId?: string) {
  if (amount <= 0) return;
  recordHouseRevenue('withdrawal_fee', amount, requestId, `Withdrawal fee from user ${userId}${requestId ? ` for request ${requestId}` : ''}.`);
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
  return userId.startsWith('bot_') || userId.startsWith('user_sim_') || userId.startsWith('sim_');
}

function isBotEconomyRoom(room: GameRoom): boolean {
  return room.players.some(player => isBotPlayer(player.userId));
}

function settleBotEconomy(room: GameRoom, winnerIds: string[]) {
  const marker = 'Bot game fixed result';
  const alreadySettled = store.transactions.some(tx => tx.matchId === room.id && (tx.description || '').includes(marker));
  if (alreadySettled) return;

  room.gameState.winnerPayout = 0;
  room.gameState.winnerPayouts = {};
  room.gameState.rakeAmount = 0;
  room.gameState.escrowBalance = 0;

  room.players.forEach(player => {
    if (isBotPlayer(player.userId) || player.status === 'left') return;
    const profile = store.users[player.userId];
    if (!profile) return;

    if (winnerIds.includes(player.userId)) {
      profile.balance = Number((profile.balance + 0.01).toFixed(2));
      profile.winCount = (profile.winCount || 0) + 1;
      room.gameState.winnerPayouts![player.userId] = 0.01;
      if (room.gameState.winnerId === player.userId) room.gameState.winnerPayout = 0.01;
      addTransaction(player.userId, 'win_payout', 0.01, room.id, `${marker}: player win reward.`);
    } else {
      const deduction = Math.min(0.02, Number(profile.balance || 0));
      profile.balance = Number(Math.max(0, profile.balance - deduction).toFixed(2));
      profile.lossCount = (profile.lossCount || 0) + 1;
      addTransaction(player.userId, 'app_commission', deduction, room.id, `${marker}: bot win charge.`);
      if (deduction > 0) recordHouseRevenue('bot_result', deduction, `${room.id}:${player.userId}`, `Bot game charge from ${player.userId}.`);
    }
    broadcastUserUpdate(player.userId);
  });
  saveStore();
  void persistRoomUserProfiles(room).catch(error => console.error(`Failed to persist bot result for ${room.id}:`, error));
}

// Trigger game auto-play bot actions
function executeBotTurnIfActiveLegacy(room: GameRoom) {
  const activePlayer = room.players[room.gameState.turn];
  if (!activePlayer || !isBotPlayer(activePlayer.userId)) return;

  // Bot logic
  setTimeout(() => {
    // If bot has not rolled, roll the dice
    if (!room.gameState.hasRolled) {
      const d = Math.floor(Math.random() * 6) + 1;
      room.gameState.diceRoll = d;
      // Keep both fields in sync. The client uses lastDiceRoll as the
      // fallback after the bot completes its move, so omitting this made the
      // bot appear to repeat the human player's previous result.
      room.gameState.lastDiceRoll = d;
      room.gameState.hasRolled = true;
      touchRoom(room);
      // Broadcast the roll before resolving the bot's move so clients can run
      // the normal dice animation and sound effect.
      broadcastToRoom(room.id, 'game_update', room);
      addLog(room, `🤖 Bot ${activePlayer.username} rolled a ${d}!`);

      // Determine valid moves for bot
      const playableColor = getPlayableColor(room, activePlayer);
      const playerTokens = room.gameState.tokens.filter(t => t.color === playableColor);
      const validTokens = playerTokens.filter(t => isMoveValid(t, d));

      if (validTokens.length === 0) {
        // No moves possible, pass turn
        addLog(room, `🤖 Bot ${activePlayer.username} has no valid moves.`);
        setTimeout(() => {
          advanceTurn(room);
          broadcastToRoom(room.id, 'game_update', room);
          executeBotTurnIfActive(room);
        }, 900);
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
        }, 900);
      }
    }
  }, 400);
}

function executeBotTurnIfActive(room: GameRoom) {
  const activePlayer = room.players[room.gameState.turn];
  if (!activePlayer || !isBotPlayer(activePlayer.userId)) return;
  const roomId = room.id;
  const botUserId = activePlayer.userId;

  setTimeout(async () => {
    try {
      // Always re-read the canonical object. MySQL hydration can replace a
      // captured room while the bot is thinking; mutating that old object was
      // the main cause of bot games freezing after an apparently valid roll.
      const currentRoom = store.rooms[roomId];
      const currentBot = currentRoom?.players[currentRoom.gameState.turn];
      if (!currentRoom || currentRoom.status !== 'playing' || currentBot?.userId !== botUserId || !isBotPlayer(currentBot.userId)) return;
      if (currentRoom.gameState.hasRolled) return;

      const diceValue = Math.floor(Math.random() * 6) + 1;
      currentRoom.gameState.diceRoll = diceValue;
      currentRoom.gameState.lastDiceRoll = diceValue;
      currentRoom.gameState.hasRolled = true;
      currentRoom.gameState.turnTimer = 30;
      currentRoom.gameState.consecutiveSixes = diceValue === 6
        ? Number(currentRoom.gameState.consecutiveSixes || 0) + 1
        : 0;
      const tripleSixPenalty = currentRoom.gameState.consecutiveSixes >= 3;
      if (tripleSixPenalty) {
        currentRoom.gameState.consecutiveSixes = 0;
        addLog(currentRoom, `Bot ${currentBot.username} rolled three consecutive sixes and loses the turn.`);
      }
      touchRoom(currentRoom);
      addLog(currentRoom, `Bot ${currentBot.username} rolled a ${diceValue}.`);
      saveStore();
      await persistLiveRoom(currentRoom);
      broadcastToRoom(roomId, 'game_update', currentRoom);

      const selectedTokenId = tripleSixPenalty ? null : (selectAutomaticToken(currentRoom, currentBot, diceValue)?.id || null);
      if (!tripleSixPenalty && !selectedTokenId) addLog(currentRoom, `Bot ${currentBot.username} has no valid move.`);

      setTimeout(async () => {
        try {
          const latestRoom = store.rooms[roomId];
          const latestBot = latestRoom?.players[latestRoom.gameState.turn];
          if (!latestRoom || latestRoom.status !== 'playing' || latestBot?.userId !== botUserId) return;
          if (!latestRoom.gameState.hasRolled || latestRoom.gameState.diceRoll !== diceValue) return;

          if (selectedTokenId) moveTokenLogic(latestRoom, selectedTokenId, diceValue);
          else advanceTurn(latestRoom);
          saveStore();
          await persistLiveRoom(latestRoom);
          void persistRoomUserProfiles(latestRoom).catch(error => console.error(`Bot profile sync failed for room ${roomId}:`, error));
          broadcastToRoom(roomId, 'game_update', latestRoom);
          executeBotTurnIfActive(latestRoom);
        } catch (error) {
          console.error(`Bot move failed for room ${roomId}:`, error);
          // The in-memory move may already be complete. Retry publishing that
          // canonical state instead of leaving hasRolled=true forever.
          setTimeout(async () => {
            try {
              const recoveryRoom = store.rooms[roomId];
              if (!recoveryRoom) return;
              await persistLiveRoom(recoveryRoom);
              broadcastToRoom(roomId, 'game_update', recoveryRoom);
              executeBotTurnIfActive(recoveryRoom);
            } catch (retryError) {
              console.error(`Bot move recovery failed for room ${roomId}:`, retryError);
            }
          }, 1000);
        }
      }, 900);
    } catch (error) {
      console.error(`Bot roll failed for room ${roomId}:`, error);
      const latestRoom = store.rooms[roomId];
      if (latestRoom?.status === 'playing') {
        // The roll was not durably published, so return to a clean unrolled
        // state and let the bot retry. This avoids a permanent rolled/no-move
        // state after a temporary database failure.
        latestRoom.gameState.diceRoll = null;
        latestRoom.gameState.hasRolled = false;
        touchRoom(latestRoom);
        setTimeout(() => executeBotTurnIfActive(latestRoom), 1000);
      }
    }
  }, 400);
}

function selectAutomaticToken(room: GameRoom, player: LudoPlayer, diceValue: number): LudoToken | null {
  const playableColor = getPlayableColor(room, player);
  const validTokens = room.gameState.tokens.filter(token => token.color === playableColor && isMoveValid(token, diceValue));
  if (!validTokens.length) return null;

  // Prefer a capture, then releasing a token, then the token furthest along.
  const capture = validTokens.find(token => {
    const nextRelative = token.position === -1 ? 0 : token.position + diceValue;
    const globalPosition = getGlobalPosition(token.color, nextRelative);
    if (globalPosition === null || SAFE_GLOBAL_SQUARES.includes(globalPosition)) return false;
    return room.gameState.tokens.some(other => {
      if (other.color === token.color || other.position < 0 || other.position > 50) return false;
      if (room.gameMode === 'team' && getTeamColors(token.color).includes(other.color)) return false;
      return getGlobalPosition(other.color, other.position) === globalPosition;
    });
  });
  if (capture) return capture;
  if (diceValue === 6) {
    const baseToken = validTokens.find(token => token.position === -1);
    if (baseToken) return baseToken;
  }
  return [...validTokens].sort((a, b) => b.position - a.position)[0];
}

function performAutomaticPlayerTurn(room: GameRoom, player: LudoPlayer, strike: number) {
  if (room.status !== 'playing' || room.players[room.gameState.turn]?.userId !== player.userId) return;
  const existingRoll = room.gameState.hasRolled ? room.gameState.diceRoll : null;
  const diceValue = existingRoll ?? (Math.floor(Math.random() * 6) + 1);
  room.gameState.diceRoll = diceValue;
  room.gameState.lastDiceRoll = diceValue;
  room.gameState.hasRolled = true;
  room.gameState.turnTimer = 30;
  touchRoom(room);
  addLog(room, existingRoll === null
    ? `Auto-play ${strike}/3: ${player.username} rolled ${diceValue} after the 30-second timer expired.`
    : `Auto-play ${strike}/3: ${player.username}'s pending roll ${diceValue} was moved automatically.`);
  saveStore();
  void persistLiveRoom(room).catch(error => console.error(`Failed to persist auto-roll for ${room.id}:`, error));
  broadcastToRoom(room.id, 'game_update', room);

  const selectedToken = selectAutomaticToken(room, player, diceValue);
  setTimeout(() => {
    const currentRoom = store.rooms[room.id];
    if (!currentRoom || currentRoom.status !== 'playing') return;
    const currentPlayer = currentRoom.players[currentRoom.gameState.turn];
    if (currentPlayer?.userId !== player.userId || !currentRoom.gameState.hasRolled || currentRoom.gameState.diceRoll !== diceValue) return;
    if (selectedToken) moveTokenLogic(currentRoom, selectedToken.id, diceValue);
    else advanceTurn(currentRoom);
    saveStore();
    void Promise.all([persistLiveRoom(currentRoom), persistRoomUserProfiles(currentRoom)])
      .catch(error => console.error(`Failed to persist automatic turn for ${currentRoom.id}:`, error));
    broadcastToRoom(currentRoom.id, 'game_update', currentRoom);
    executeBotTurnIfActive(currentRoom);
  }, 900);
}

// Core token movement logic
function moveTokenLogic(room: GameRoom, tokenId: string, diceValue: number) {
  const gs = room.gameState;
  const token = gs.tokens.find(t => t.id === tokenId);
  if (!token) return;

  const activePlayer = room.players[gs.turn];
  const playableColor = getPlayableColor(room, activePlayer);
  if (token.color !== playableColor || !isMoveValid(token, diceValue)) return;
  touchRoom(room);
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

  // In partnership mode a player who has brought all four of their own tokens
  // home skips their next scheduled turn, then plays their partner's tokens.
  const playerTokens = gs.tokens.filter(t => t.color === token.color);
  const allFinished = playerTokens.every(t => t.position === 56);
  const teamColors = getTeamColors(token.color);
  const teamAllFinished = room.gameMode === 'team' && gs.tokens
    .filter(t => teamColors.includes(t.color))
    .every(t => t.position === 56);
  const hasWon = room.gameMode === 'team' ? teamAllFinished : allFinished;

    if (hasWon) {
      if (room.status === 'completed') return; // Already processed this win

      // WINNER DETECTED!
      room.status = 'completed';
    gs.winnerId = activePlayer.userId;
    gs.completionReason = 'all_tokens_home';

    if (room.tournamentDetails) {
      addLog(room, `🏆 ${activePlayer.username} has won the tournament match!`);
      handleTournamentMatchWin(room.tournamentDetails.tournamentId, room.tournamentDetails.matchId, activePlayer.userId);
      gs.escrowBalance = 0;
      return;
    }

    if (isBotEconomyRoom(room)) {
      const botWinnerIds = room.gameMode === 'team'
        ? room.players.filter(player => teamColors.includes(player.color) && player.status !== 'left').map(player => player.userId)
        : [activePlayer.userId];
      gs.winnerIds = botWinnerIds;
      settleBotEconomy(room, botWinnerIds);
      addLog(room, botWinnerIds.some(id => !isBotPlayer(id))
        ? '🏆 Bot game won: each winning player receives $0.01.'
        : '🤖 Bot won: each human player is charged $0.02.');
      return;
    }

    if (room.gameMode === 'team') {
      const winningColors = teamColors;
      const winningTeammates = room.players.filter(p => winningColors.includes(p.color) && p.status !== 'left');
      gs.winnerIds = winningTeammates.map(p => p.userId);
      const winningNames = winningTeammates.map(p => p.username).join(' & ');
      
      addLog(room, `🏆 CHAMPIONS! Team ${winningNames} has finished all tokens and WON the game!`);

      if (room.betAmount > 0) {
        const realWinners = winningTeammates.filter(p => !isBotPlayer(p.userId) && store.users[p.userId]);
        if (realWinners.length) {
          const effectiveRakePercentage = effectiveRakeForUsers(realWinners.map(p => p.userId));
          const rakeAmount = Number((gs.escrowBalance * effectiveRakePercentage).toFixed(2));
          const payoutPool = Number((gs.escrowBalance - rakeAmount).toFixed(2));
          gs.rakeAmount = rakeAmount;
          const baseShare = Math.floor((payoutPool * 100) / realWinners.length) / 100;
          let distributed = 0;
          realWinners.forEach((p, index) => {
            const user = store.users[p.userId]!;
            const share = index === realWinners.length - 1 ? Number((payoutPool - distributed).toFixed(2)) : baseShare;
            distributed += share;
            if (p.userId === gs.winnerId) gs.winnerPayout = share;
            gs.winnerPayouts = { ...(gs.winnerPayouts || {}), [p.userId]: share };
            if (!hasMatchPayout(p.userId, room.id)) {
              user.balance += share;
              user.winCount += 1;
              addTransaction(p.userId, 'win_payout', share, room.id, `Team win payout for match ${room.id} (Rake: $${rakeAmount.toFixed(2)}).`);
            }
            broadcastUserUpdate(p.userId);
          });
          recordHouseRevenue('team_game_rake', rakeAmount, room.id, `Team-game rake from match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (gs.escrowBalance > 0) {
          recordHouseRevenue('bot_result', gs.escrowBalance, room.id, `Real-player stakes retained after the bot team won match ${room.id}.`);
        }

        // Record losses for other real players
        room.players.forEach(p => {
          if (p.status !== 'left' && !winningColors.includes(p.color) && !isBotPlayer(p.userId)) {
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
          const effectiveRakePercentage = effectiveRakeForUsers([winnerProfile.id]);

          const rakeAmount = gs.escrowBalance * effectiveRakePercentage;
          const payoutAmount = Number((gs.escrowBalance - rakeAmount).toFixed(2));

          gs.rakeAmount = Number(rakeAmount.toFixed(2));
          gs.winnerPayout = payoutAmount;
          gs.winnerPayouts = { [activePlayer.userId]: payoutAmount };

          if (!hasMatchPayout(activePlayer.userId, room.id)) {
            winnerProfile.balance += payoutAmount;
            winnerProfile.winCount += 1;
            addTransaction(
              activePlayer.userId,
              'win_payout',
              payoutAmount,
              room.id,
              `Payout for winning match ${room.id} with $${room.betAmount} bet (Rake: $${rakeAmount.toFixed(2)}).`
            );
          }
          broadcastUserUpdate(activePlayer.userId);

          recordHouseRevenue('game_rake', rakeAmount, room.id, `Rake from match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (gs.escrowBalance > 0) {
          recordHouseRevenue('bot_result', gs.escrowBalance, room.id, `Real-player stakes retained after a bot won match ${room.id}.`);
        }

        // Record losses for other real players
        room.players.forEach(p => {
          if (p.status !== 'left' && p.userId !== activePlayer.userId && !isBotPlayer(p.userId)) {
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
    
    const ownTokensFinished = room.gameMode === 'team'
      && token.color === activePlayer.color
      && gs.tokens.filter(t => t.color === activePlayer.color).every(t => t.position === 56)
      && !activePlayer.teamAssistUnlocked
      && !activePlayer.teamFinishSkipPending;

    if (ownTokensFinished) {
      activePlayer.teamFinishSkipPending = true;
      addLog(room, `${activePlayer.username} has brought all 4 tokens home and must skip one turn before helping their partner.`);
      advanceTurn(room);
    } else if (bonusTurn) {
      addLog(room, `🎲 Bonus roll! ${activePlayer.username} gets to roll again.`);
      gs.turnTimer = 30;
    } else {
      advanceTurn(room);
    }
  }

  saveStore();
}

function completeTeamForfeit(room: GameRoom, forfeitingPlayer: LudoPlayer, reason: 'forfeit' | 'inactivity') {
  const losingColors = getTeamColors(forfeitingPlayer.color);
  const winningColors = getTeamColors(losingColors.includes('red') ? 'green' : 'red');
  const winners = room.players.filter(player => winningColors.includes(player.color) && player.status !== 'left');

  room.status = 'completed';
  room.gameState.completionReason = reason;
  room.gameState.winnerId = winners[0]?.userId || null;
  room.gameState.winnerIds = winners.map(player => player.userId);
  addLog(room, `Team ${winners.map(player => player.username).join(' & ')} wins by forfeit after ${forfeitingPlayer.username} left the partnership match.`);

  const totalPayout = room.gameState.escrowBalance;
  if (room.betAmount > 0 && totalPayout > 0) {
    const realWinners = winners.filter(player => !isBotPlayer(player.userId) && store.users[player.userId]);
    if (realWinners.length) {
      const rakeRate = effectiveRakeForUsers(realWinners.map(player => player.userId));
      const rakeAmount = Number((totalPayout * rakeRate).toFixed(2));
      const payoutPool = Number((totalPayout - rakeAmount).toFixed(2));
      const baseShare = Math.floor((payoutPool * 100) / realWinners.length) / 100;
      let distributed = 0;
      realWinners.forEach((player, index) => {
        const share = index === realWinners.length - 1 ? Number((payoutPool - distributed).toFixed(2)) : baseShare;
        distributed += share;
        const profile = store.users[player.userId]!;
        room.gameState.winnerPayouts = { ...(room.gameState.winnerPayouts || {}), [player.userId]: share };
        if (!hasMatchPayout(player.userId, room.id)) {
          profile.balance += share;
          profile.winCount = (profile.winCount || 0) + 1;
          addTransaction(player.userId, 'win_payout', share, room.id, `Team win by ${reason} forfeit (Rake: $${rakeAmount.toFixed(2)}).`);
        }
        broadcastUserUpdate(player.userId);
      });
      room.gameState.rakeAmount = rakeAmount;
      room.gameState.winnerPayout = payoutPool;
      recordHouseRevenue('forfeit_rake', rakeAmount, room.id, `Rake from partnership ${reason} forfeit ${room.id}.`);
    } else {
      room.gameState.rakeAmount = totalPayout;
      room.gameState.winnerPayout = 0;
      recordHouseRevenue('bot_result', totalPayout, room.id, `Real-player stakes retained after bot team won partnership forfeit ${room.id}.`);
    }
  }

  room.players.forEach(player => {
    if (!losingColors.includes(player.color) || player.userId === forfeitingPlayer.userId || isBotPlayer(player.userId)) return;
    const profile = store.users[player.userId];
    if (profile) {
      profile.lossCount = (profile.lossCount || 0) + 1;
      broadcastUserUpdate(player.userId);
    }
  });
  room.gameState.escrowBalance = 0;
}

// Helper to handle inactivity forfeit
function handleInactivityForfeit(room: GameRoom, inactivePlayer: LudoPlayer) {
  if (room.status !== 'playing') return; // Cannot forfeit a room that is not playing (e.g. already completed)

  addLog(room, `⏱️ ${inactivePlayer.username} has been forfeited due to inactivity.`);
  inactivePlayer.status = 'left';
  inactivePlayer.inactivityDeadline = undefined;
  inactivePlayer.inactivityTimer = 0;

  const inactiveProfile = store.users[inactivePlayer.userId];
  if (inactiveProfile && !isBotPlayer(inactivePlayer.userId)) {
    inactiveProfile.lossCount = (inactiveProfile.lossCount || 0) + 1;
    broadcastUserUpdate(inactivePlayer.userId);
  }

  if (room.gameMode === 'team') {
    completeTeamForfeit(room, inactivePlayer, 'inactivity');
    saveStore();
    void persistLiveRoom(room).catch(error => console.error(`Failed to persist completed room ${room.id}:`, error));
    broadcastToRoom(room.id, 'game_update', room);
    return;
  }

  // Check if only 1 active player remains
  const activePlayers = room.players.filter(pl => pl.status !== 'left');
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    room.status = 'completed';
    room.gameState.winnerId = winner.userId;
    room.gameState.completionReason = 'inactivity';

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
          const effectiveRakePercentage = effectiveRakeForUsers([winnerProfile.id]);

          const rakeAmount = totalPayout * effectiveRakePercentage;
          const payoutAmount = Number((totalPayout - rakeAmount).toFixed(2));

          room.gameState.rakeAmount = Number(rakeAmount.toFixed(2));
          room.gameState.winnerPayout = payoutAmount;
          room.gameState.winnerPayouts = { [winner.userId]: payoutAmount };

          if (!hasMatchPayout(winner.userId, room.id)) {
            winnerProfile.balance += payoutAmount;
            winnerProfile.winCount += 1;
            addTransaction(winner.userId, 'win_payout', payoutAmount, room.id, `Win by opponent inactivity forfeit (Rake: $${rakeAmount.toFixed(2)}).`);
          }
          broadcastUserUpdate(winner.userId);

          recordHouseRevenue('forfeit_rake', rakeAmount, room.id, `Rake from forfeit match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (totalPayout > 0) {
          recordHouseRevenue('bot_result', totalPayout, room.id, `Real-player stakes retained after a bot won forfeit match ${room.id}.`);
        }
      }
      room.gameState.escrowBalance = 0;
    }
  } else if (activePlayers.length > 1) {
    // In 3/4-player matches one inactive player is eliminated, while the
    // remaining players continue. Never leave the turn pointing at a player
    // whose status is already `left`.
    advanceTurn(room);
  } else if (activePlayers.length === 0) {
    room.status = 'completed';
    room.gameState.winnerId = null;
    room.gameState.completionReason = 'inactivity';
    room.gameState.escrowBalance = 0;
    addLog(room, 'The game ended because all players became inactive.');
  }

  saveStore();
  void Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)])
    .catch(error => console.error(`Failed to persist inactivity forfeit for ${room.id}:`, error));
  broadcastToRoom(room.id, 'game_update', room);
}

// Initialize continuous turn timers thread (1s interval). Only one production
// process owns timer/forfeit decisions; this prevents duplicate payouts when a
// host runs multiple Node workers.
let gameTimerTickRunning = false;
let lastSharedTimerPersistAt = 0;
const roomTurnTimerAnchors = new Map<string, { turn: number; lastActivity: number; checkedAt: number }>();
setInterval(async () => {
  if (gameTimerTickRunning) return;
  gameTimerTickRunning = true;
  try {
    if (isMySqlConfigured()) {
      const isLeader = await ensureMySqlGameTimerLeadership();
      if (!isLeader) return;
      const sharedRooms = await listMySqlActiveGameRooms();
      sharedRooms.forEach(room => {
        if (room?.id) {
          const localRoom = store.rooms[room.id];
          // SAFETY: Do not allow MySQL sync to revert a room that is already finished or cancelled in memory.
          // This prevents the "infinite win/payout loop" if MySQL is slightly behind the local state.
          if (localRoom && (localRoom.status === 'completed' || localRoom.status === 'cancelled')) {
            return;
          }
          // The timer leader owns the freshest in-memory countdown. Only a
          // genuinely newer gameplay revision may replace it; accepting an
          // equal revision here makes the countdown jump backwards every tick.
          if (!localRoom || Number(room.gameState?.lastActivity || 0) > Number(localRoom.gameState?.lastActivity || 0)) {
            store.rooms[room.id] = room;
          }
        }
      });
    }
  let changed = false;
  Object.keys(store.rooms).forEach(roomId => {
    const room = store.rooms[roomId];
    if (room.status === 'playing') {
      const gs = room.gameState;
      const activePlayer = room.players[gs.turn];

      // The inactivity penalty begins only after the normal 30-second turn
      // timer expires without a roll or token move.
      if (activePlayer && !isBotPlayer(activePlayer.userId)) {
        if (gs.turnTimer > 0) {
          activePlayer.inactivityTimer = PLAYER_INACTIVITY_SECONDS;
          activePlayer.inactivityDeadline = undefined;
          activePlayer.lastInactivityWarningMinute = undefined;
        } else if (!activePlayer.inactivityDeadline) {
          const remainingSeconds = Number.isFinite(activePlayer.inactivityTimer)
            ? Math.max(0, Number(activePlayer.inactivityTimer))
            : PLAYER_INACTIVITY_SECONDS;
          activePlayer.inactivityDeadline = Date.now() + remainingSeconds * 1000;
          activePlayer.lastInactivityWarningMinute = undefined;
          saveStore();
        }

        if (activePlayer.inactivityDeadline) {
          activePlayer.inactivityTimer = Math.max(
            0,
            Math.ceil((activePlayer.inactivityDeadline - Date.now()) / 1000)
          );
        }
        changed = true;

        // Send each warning once even if an interval fires slightly late.
        const minutesLeft = Math.ceil(activePlayer.inactivityTimer / 60);
        if (activePlayer.inactivityDeadline &&
          minutesLeft >= 1 &&
          minutesLeft <= 4 &&
          activePlayer.lastInactivityWarningMinute !== minutesLeft
        ) {
          activePlayer.lastInactivityWarningMinute = minutesLeft;
          const warningMsg = `Waqtigaagu wuu sii dhamaanayaa! Waxaa kuu harsan ${minutesLeft} daqiiqo. (Your time is running out! ${minutesLeft} minutes left.)`;
          sendEventToUser(activePlayer.userId, 'inactivity_warning', { message: warningMsg });
          addLog(room, `⏱️ Digniin: ${activePlayer.username} waxaa u harsan ${minutesLeft} daqiiqo. (Warning: ${activePlayer.username} has ${minutesLeft} minutes left.)`);
          saveStore();
        }

        // Forfeit if 5 minutes are up
        if (activePlayer.inactivityDeadline && activePlayer.inactivityTimer <= 0) {
          handleInactivityForfeit(room, activePlayer);
          // Skip the rest of the turn logic for this room
          return; 
        }
      }


      // Short Turn Timer Logic (30 seconds)
      if (gs.turnTimer > 0) {
        const now = Date.now();
        const activityRevision = Number(gs.lastActivity || 0);
        let timerAnchor = roomTurnTimerAnchors.get(roomId);
        if (!timerAnchor || timerAnchor.turn !== gs.turn || timerAnchor.lastActivity !== activityRevision) {
          timerAnchor = {
            turn: gs.turn,
            lastActivity: activityRevision,
            checkedAt: activityRevision > 0 && activityRevision <= now ? activityRevision : now,
          };
          roomTurnTimerAnchors.set(roomId, timerAnchor);
        }
        const elapsedSeconds = Math.floor((now - timerAnchor.checkedAt) / 1000);
        if (elapsedSeconds > 0) {
          gs.turnTimer = Math.max(0, gs.turnTimer - elapsedSeconds);
          timerAnchor.checkedAt += elapsedSeconds * 1000;
          changed = true;
        }

        if (gs.turnTimer === 0) {
          if (!activePlayer) return;
          if (isBotPlayer(activePlayer.userId)) {
            // Final safety net: a temporary DB/process interruption must not
            // leave a bot turn parked forever. Resume an already rolled bot
            // move, or restart an unrolled bot turn.
            if (gs.hasRolled && gs.diceRoll !== null) {
              const recoveryToken = selectAutomaticToken(room, activePlayer, gs.diceRoll);
              if (recoveryToken) moveTokenLogic(room, recoveryToken.id, gs.diceRoll);
              else advanceTurn(room);
              saveStore();
              void persistLiveRoom(room).catch(error => console.error(`Bot watchdog persistence failed for ${room.id}:`, error));
              broadcastToRoom(room.id, 'game_update', room);
              executeBotTurnIfActive(room);
            } else {
              executeBotTurnIfActive(room);
            }
            return;
          }
          const strike = Number(activePlayer.inactivityStrikes || 0) + 1;
          activePlayer.inactivityStrikes = strike;
          activePlayer.lastInactivityStrikeAt = now;
          activePlayer.inactivityTimer = Math.max(0, (5 - strike) * 30);
          const message = strike <= 3
            ? `30-ka sekan way dhammaadeen. Auto-play ${strike}/3 ayaa laguu sameeyay. Fadlan ciyaar!`
            : strike === 4
              ? 'DIGNIIN KAMA DAMBAYS AH: Mar kale haddii 30-ka sekan kaa dhammaadaan ciyaarta waa lagaa saarayaa.'
              : 'Waxaad seegtay shan turn. Ciyaarta waxaa laguu diiwaan geliyey forfeit.';
          sendEventToUser(activePlayer.userId, 'inactivity_warning', { message, strike });
          publishRealtimeEvent('user', activePlayer.userId, 'inactivity_warning', { message, strike });

          if (strike <= 3) {
            performAutomaticPlayerTurn(room, activePlayer, strike);
          } else if (strike === 4) {
            addLog(room, `Final inactivity warning sent to ${activePlayer.username}; their turn was passed.`);
            advanceTurn(room);
            saveStore();
            void persistLiveRoom(room).catch(error => console.error(`Failed to persist inactivity warning for ${room.id}:`, error));
            broadcastToRoom(room.id, 'game_update', room);
          } else {
            handleInactivityForfeit(room, activePlayer);
          }
          return;
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
          inactivityTimer: room.players[room.gameState.turn]?.inactivityTimer,
          lastActivity: room.gameState.lastActivity
        });
      }
    });

    if (isMySqlConfigured() && Date.now() - lastSharedTimerPersistAt >= 5000) {
      lastSharedTimerPersistAt = Date.now();
      const activeRooms = Object.values(store.rooms).filter(room => room.status === 'playing');
      await Promise.all(activeRooms.map(room => saveMySqlGameRoom(room)));
    }
  }
  } catch (error) {
    console.error('Shared game timer tick failed:', error);
  } finally {
    gameTimerTickRunning = false;
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

// Match full real-player queues only. Automatic bot filling is disabled.
setInterval(() => {
  cleanupMatchmakingQueues();

  Object.keys(store.matchmakingQueues).forEach(queueKey => {
    const queueUserIds = store.matchmakingQueues[queueKey];
    if (!queueUserIds || queueUserIds.length === 0) return;

    // The queue is shared between production processes. A player not appearing
    // in this process's activeClients may still have a healthy SSE connection
    // to another process, so local connection state must never delete them.
    const connectedQueueUserIds = queueUserIds.filter(id => Boolean(store.users[id]));
    if (connectedQueueUserIds.length === 0) return;

    // Get bet, cap, mode from queueKey (e.g., "1_2_solo" -> bet: 1, cap: 2, mode: "solo")
    const parts = queueKey.split('_');
    const bet = parseFloat(parts[0]) || 0;
    const cap = parseInt(parts[1]) || 2;
    const mode = (parts[2] === 'team' ? 'team' : 'solo') as 'solo' | 'team';

    // Start the exact Search Live queue as soon as enough real players join.
    // The queue key isolates stake, capacity and mode, preserving 4P Solo/2v2.
    if (connectedQueueUserIds.length >= cap) {
      const matchedIds = connectedQueueUserIds.slice(0, cap);
      const matchedUsers = matchedIds.map(id => store.users[id]).filter(Boolean);
      if (matchedUsers.length === cap && matchedUsers.every(player => player.balance >= bet)) {
        store.matchmakingQueues[queueKey] = queueUserIds.filter(id => !matchedIds.includes(id));
        matchedIds.forEach(id => {
          if (store.users[id]) delete (store.users[id] as any).seekingJoinedAt;
        });
        void deleteSharedMatchmakingRecords(...matchedIds)
          .catch(error => console.error('Failed to delete shared matchmaking records for full queue:', error));
        startMatchedRoom(matchedUsers, bet, cap, mode);
        return;
      }
    }

    // Find the first user in the queue
    const firstUserId = connectedQueueUserIds[0];
    const firstUser = store.users[firstUserId];
    if (!firstUser) return;

    const joinedAt = (firstUser as any).seekingJoinedAt || Date.now();
    const waitTimeMs = Date.now() - joinedAt;

    // If wait time exceeds 3 minutes (180000 ms), auto-fill the remaining seats with bots!
    if (false && waitTimeMs >= 180000) {
      console.log(`Matchmaking timeout for queue ${queueKey}. Auto-filling remaining seats with bots...`);

      // Retrieve all real connected players currently in this queue
      const realPlayers = connectedQueueUserIds.map(id => store.users[id]).filter(Boolean);

      // Remove these players from the queue
      store.matchmakingQueues[queueKey] = [];

      void deleteSharedMatchmakingRecords(...realPlayers.map(player => player.id))
        .catch(error => console.error('Failed to delete shared matchmaking records on auto-fill:', error));

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
          winCount: 0,
          lossCount: 0,
          balance: 0
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
      const vipTier = store.vipTiers[user.vip.tier];
      if (vipTier) {
        req.vipRakeDiscount = vipTier.rakeDiscount;
      }
    }
  }
  next();
};

app.post('/api/auth/otp/request', verifyFirebaseToken, async (req: any, res) => {
  if (!auth) return res.status(500).json({ error: 'Authentication is not configured.' });
  if (!isOtpEnabled()) return res.json({ success: true, disabled: true, message: 'Email OTP is currently disabled by the administrator.' });
  const uid = req.user.uid;
  const email = String(req.user.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'This account has no email address.' });
  const provider = req.user.firebase?.sign_in_provider;
  if (provider !== 'password' && provider !== 'google.com') return res.status(400).json({ error: 'This sign-in provider does not support email OTP.' });

  const existing = await readEmailOtp(uid);
  const sentAt = Number(existing?.sentAt || 0);
  if (Date.now() - sentAt < OTP_RESEND_MS) {
    return res.status(429).json({ error: `Please wait ${Math.ceil((OTP_RESEND_MS - (Date.now() - sentAt)) / 1000)} seconds before requesting another code.` });
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  await sendOtpEmail(email, otp);
  await writeEmailOtp(uid, { email, provider, otpHash: hashEmailOtp(uid, otp), expiresAt: Date.now() + OTP_TTL_MS, sentAt: Date.now(), attempts: 0, verifiedAt: null });
  res.json({ success: true, message: 'A 6-digit verification code was sent to your email.', expiresIn: OTP_TTL_MS / 1000 });
});

app.post('/api/auth/otp/verify', verifyFirebaseToken, async (req: any, res) => {
  if (!auth) return res.status(500).json({ error: 'Authentication is not configured.' });
  if (!isOtpEnabled()) return res.json({ success: true, disabled: true, message: 'Email OTP is currently disabled by the administrator.' });
  const otp = String(req.body?.otp || '').trim();
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
  const record = await readEmailOtp(req.user.uid);
  if (!record) return res.status(400).json({ error: 'No active verification code. Request a new code.' });
  if (Number(record.expiresAt) < Date.now()) {
    await removeEmailOtp(req.user.uid);
    return res.status(400).json({ error: 'This code has expired. Request a new code.' });
  }
  if (Number(record.attempts || 0) >= 5) {
    await removeEmailOtp(req.user.uid);
    return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
  }
  const suppliedHash = Buffer.from(hashEmailOtp(req.user.uid, otp), 'hex');
  const storedHash = Buffer.from(String(record.otpHash), 'hex');
  if (suppliedHash.length !== storedHash.length || !crypto.timingSafeEqual(suppliedHash, storedHash)) {
    await writeEmailOtp(req.user.uid, { ...record, attempts: Number(record.attempts || 0) + 1 });
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }
  if (req.user.firebase?.sign_in_provider === 'password') await auth.updateUser(req.user.uid, { emailVerified: true });
  await writeEmailOtp(req.user.uid, { ...record, otpHash: '', expiresAt: 0, attempts: 0, verifiedAt: Date.now() });
  res.json({ success: true, message: 'Email verified successfully.' });
});

app.get('/api/auth/methods', (_req, res) => {
  res.json({
    emailOtpEnabled: isOtpEnabled(),
    phoneAuthEnabled: isPhoneAuthEnabled(),
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || '',
  });
});

app.post('/api/auth/turnstile/verify', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const phone = normalizeAuthPhone(req.body?.phone);
  const action = req.body?.action === 'signup' ? 'signup' : (req.body?.action === 'login' ? 'login' : null);

  if (!phone || !action || !token) return res.status(400).json({ error: 'Security check could not be completed.' });

  const secret = process.env.TURNSTILE_SECRET_KEY || '';
  if (!secret) return res.status(500).json({ error: 'Security service not configured on server.' });

  try {
    const verificationResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: req.ip }),
    });
    const verification: any = await verificationResponse.json();
    if (!verificationResponse.ok || verification.success !== true) return res.status(403).json({ error: 'Security check failed. Please try again.' });
    res.json({ success: true, ticket: createPhoneTurnstileTicket(phone, action) });
  } catch (error) {
    console.error('Turnstile validation failed:', error);
    res.status(503).json({ error: 'Security check is temporarily unavailable.' });
  }
});

app.post('/api/auth/native-security-ticket', (req, res) => {
  const phone = normalizeAuthPhone(req.body?.phone);
  const action = req.body?.action === 'signup' ? 'signup' : (req.body?.action === 'login' ? 'login' : null);
  if (!phone || !action) return res.status(400).json({ error: 'Enter a valid phone number.' });
  if (!process.env.TURNSTILE_SECRET_KEY) return res.status(503).json({ error: 'Native security service is not configured.' });
  if (!isTrustedCapacitorAndroidRequest(req)) return res.status(403).json({ error: 'This security route is available only inside the LudoSom Android app.' });
  const key = `${req.ip}:${phone}:${action}`;
  if (!consumeNativeSecurityAttempt(key)) {
    return res.status(429).json({ error: 'Too many security requests. Please wait ten minutes and try again.' });
  }
  return res.json({ success: true, ticket: createPhoneTurnstileTicket(phone, action), expiresIn: 300 });
});

app.get('/api/auth/profile-status', verifyFirebaseToken, async (req: any, res) => {
  const profile = await findUserProfileInFirestore(req.user.uid, req.user.email);
  const otpEnabled = isOtpEnabled() && req.user.firebase?.sign_in_provider !== 'phone';
  const exists = Boolean(profile?.id);
  res.json({
    exists,
    onboardingRequired: !exists,
    otpEnabled,
    phoneAuthEnabled: isPhoneAuthEnabled(),
    otpRequired: otpEnabled && !exists,
    otpVerified: exists || !otpEnabled,
    linkedToAgent: Boolean(profile?.linkedAgentId),
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.json({
    version: DEPLOY_VERSION,
    deployedFrontend: true,
    nativeVersionCode: 21,
    nativeVersionName: '3.0',
    androidApkUrl: '/downloads/LudoSom.apk',
  });
});

app.get('/api/admin/migrate-users', async (req, res) => {
  if (!auth) {
    return res.status(503).json({ error: 'Firebase Admin not configured. Cannot perform migration.' });
  }

  try {
    const listUsersResult = await auth.listUsers(1000);
    const allAuthUsers = listUsersResult.users;
    const existingFirestoreUids = new Set(Object.values(store.users).map(u => u.firebaseUid));
    
    let createdCount = 0;
    let failedCount = 0;

    for (const userRecord of allAuthUsers) {
      if (userRecord.uid && !existingFirestoreUids.has(userRecord.uid)) {
        // This user exists in Firebase Auth but not in our Firestore user profiles
        try {
          const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newUser: UserProfile = {
            id: userId,
            firebaseUid: userRecord.uid,
            username: userRecord.displayName || userRecord.email?.split('@')[0] || `user${Date.now()}`,
            email: userRecord.email,
            avatar: '🎲',
            balance: 1.0, // New user bonus
            winCount: 0,
            lossCount: 0,
          };
          
          store.users[userId] = newUser;
          addTransaction(userId, 'deposit', 1.0, undefined, 'Welcome bonus (migrated user)');
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
      message: 'User migration complete.',
      created_profiles: createdCount,
      failed_profiles: failedCount,
      total_auth_users: allAuthUsers.length,
    });

  } catch (error) {
    console.error('Error during user migration:', error);
    res.status(500).json({ error: 'Failed to migrate users.', details: error.message });
  }
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

  const username = String(req.query.username || '').trim().slice(0, 20);
  const avatar = String(req.query.avatar || '').trim().slice(0, 500);
  const clientProfile = username ? {
    id: userId,
    username,
    avatar: avatar || '🎮',
    isOfflinePreference: req.query.isOffline === 'true',
  } : undefined;
  const client: SSEClient = { userId, res, profile: clientProfile };
  activeClients.push(client);

  // Handle Reconnection: Check if this user is rejoining an active game
  const activeRoom = Object.values(store.rooms).find(r =>
    r.status === 'playing' && r.players.some(p => p.userId === userId && p.status === 'offline')
  );

  if (activeRoom) {
    const player = activeRoom.players.find(p => p.userId === userId);
    if (player) {
      player.status = 'online';
      resetPlayerInactivity(player);
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
  const { username, email, phone, avatar, promoCode, onboardingComplete, turnstileTicket, phoneAuthAction } = req.body;
  const firebaseUid = req.user.uid;
  const signInProvider = req.user.firebase?.sign_in_provider;
  const tokenEmail = String(req.user.email || '').trim().toLowerCase();
  const phoneAliasMatch = tokenEmail.match(/^phone\.(\d{8,15})@phone\.ludosom\.app$/);
  const aliasPhone = phoneAliasMatch ? `+${phoneAliasMatch[1]}` : '';
  const isPhonePasswordLogin = Boolean(aliasPhone);
  const suppliedPhone = normalizeAuthPhone(phone);
  if (isPhonePasswordLogin && phoneAuthAction === 'signup' && (suppliedPhone !== aliasPhone || !verifyPhoneTurnstileTicket(turnstileTicket, aliasPhone, phoneAuthAction))) {
    return res.status(403).json({ error: 'Security check is required.' });
  }
  const requiresEmailOtp = isOtpEnabled() && signInProvider !== 'phone' && !isPhonePasswordLogin;
  if ((signInProvider === 'phone' || isPhonePasswordLogin) && !isPhoneAuthEnabled()) {
    return res.status(403).json({ error: 'Phone sign-in is currently disabled.' });
  }
  // First, try to find an existing user by their Firebase UID.
  let foundUser = Object.values(store.users).find(u => u.firebaseUid === firebaseUid);

  if (foundUser) {
    // OTP and promo-code onboarding are signup-only. Firebase has already
    // authenticated this existing account, including legacy profiles created
    // before emailOtpVerifiedAt was introduced.
    foundUser.avatar = normalizeAppAvatar(foundUser.avatar);
    foundUser.phone = foundUser.phone || aliasPhone || req.user.phone_number || phone || undefined;
    if (!foundUser.linkedAgentId && normalizePromoCode(promoCode)) {
      const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
      if (!linkedAgent) return res.status(400).json({ error: 'Invalid, expired, or inactive promo code.' });
      foundUser.linkedAgentId = linkedAgent.id;
      foundUser.appliedPromoCode = normalizePromoCode(promoCode);
    }
    await saveUserProfileToFirestore(foundUser);
    return res.json(foundUser);
  }

  // A server restart or deployment must not lock out an account whose profile
  // has already been persisted in Firestore.
  const persistedUser = await findUserProfileInFirestore(firebaseUid, email);
  if (persistedUser?.id) {
    persistedUser.firebaseUid = firebaseUid;
    persistedUser.email = persistedUser.email || email || undefined;
    persistedUser.phone = persistedUser.phone || aliasPhone || req.user.phone_number || phone || undefined;
    persistedUser.avatar = normalizeAppAvatar(persistedUser.avatar);
    if (!persistedUser.linkedAgentId && normalizePromoCode(promoCode)) {
      const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
      if (!linkedAgent) return res.status(400).json({ error: 'Invalid, expired, or inactive promo code.' });
      persistedUser.linkedAgentId = linkedAgent.id;
      persistedUser.appliedPromoCode = normalizePromoCode(promoCode);
    }
    store.users[persistedUser.id] = persistedUser;
    await saveUserProfileToFirestore(persistedUser);
    saveStore();
    return res.json(persistedUser);
  }

  // If not found by UID, maybe it's an old account we can link.
  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const userByEmail = Object.values(store.users).find(
      u => u.email?.trim().toLowerCase() === normalizedEmail && !u.firebaseUid
    );
    if (userByEmail) {
      userByEmail.firebaseUid = firebaseUid; // Link account
      userByEmail.email = normalizedEmail;
      userByEmail.emailOtpVerifiedAt = userByEmail.emailOtpVerifiedAt || Date.now();
      if (!userByEmail.linkedAgentId && normalizePromoCode(promoCode)) {
        const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
        if (!linkedAgent) return res.status(400).json({ error: 'Invalid, expired, or inactive promo code.' });
        userByEmail.linkedAgentId = linkedAgent.id;
        userByEmail.appliedPromoCode = normalizePromoCode(promoCode);
      }
      await saveUserProfileToFirestore(userByEmail);
      await saveStoreAndWait();
      return res.json(userByEmail);
    }
  }

  const verifiedPhone = aliasPhone || String(req.user.phone_number || phone || '').replace(/[\s()-]/g, '');
  if (verifiedPhone) {
    const userByPhone = Object.values(store.users).find(user => String(user.phone || '').replace(/[\s()-]/g, '') === verifiedPhone && !user.firebaseUid);
    if (userByPhone) {
      userByPhone.firebaseUid = firebaseUid;
      userByPhone.phone = verifiedPhone;
      if (!userByPhone.linkedAgentId && normalizePromoCode(promoCode)) {
        const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
        if (!linkedAgent) return res.status(400).json({ error: 'Invalid, expired, or inactive promo code.' });
        userByPhone.linkedAgentId = linkedAgent.id;
        userByPhone.appliedPromoCode = normalizePromoCode(promoCode);
      }
      await saveUserProfileToFirestore(userByPhone);
      await saveStoreAndWait();
      return res.json(userByPhone);
    }
  }

  if (signInProvider === 'phone' && onboardingComplete !== true) {
    return res.status(428).json({ error: 'Complete phone verification and account setup before continuing.' });
  }

  // If Firebase authenticated an existing phone-alias credential but its app
  // profile was lost during an earlier interrupted signup/deploy, continue to
  // the minimal-profile recovery below instead of permanently locking it out.

  if (requiresEmailOtp && signInProvider === 'password') {
    const otpVerification = await readEmailOtp(firebaseUid);
    const verifiedAt = Number(otpVerification?.verifiedAt || 0);
    if (onboardingComplete !== true || !verifiedAt) {
      return res.status(428).json({ error: 'Complete email OTP verification before creating the account.' });
    }
  }

  if (signInProvider === 'google.com' && isOtpEnabled()) {
    if (onboardingComplete !== true) {
      return res.status(428).json({ error: 'Complete email OTP verification and the promo-code step before continuing.' });
    }
    const otpVerification = await readEmailOtp(firebaseUid);
    const verifiedAt = Number(otpVerification?.verifiedAt || 0);
    if (!verifiedAt || Date.now() - verifiedAt > 30 * 60 * 1000) {
      return res.status(403).json({ error: 'Google onboarding OTP verification is required.' });
    }
    await removeEmailOtp(firebaseUid);
  }

  // Signup sends a username. If it is absent, Firebase Auth has already
  // confirmed this is an existing account whose app profile was lost before
  // profiles were persisted separately; rebuild a minimal profile so the user
  // can sign in again.
  const recoveredUsername = req.user.name || email?.split('@')[0] || `user${Date.now()}`;
  const cleanUsername = (username || recoveredUsername).trim().substring(0, 20);

  let linkedAgentId: string | undefined = undefined;

  // If a promo code is provided, validate it and find the agent.
  const normalizedPromoCode = normalizePromoCode(promoCode);
  if (normalizedPromoCode) {
    if (!db && !isMySqlRuntimePrimary()) {
        return res.status(503).json({ error: 'Promo code validation is temporarily unavailable.' });
    }
    const agent = await resolveActiveAgentByPromoCode(normalizedPromoCode);
    if (!agent) {
        return res.status(400).json({ error: 'Invalid or expired promo code.' });
    }
    linkedAgentId = agent.id;
  }

  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const newUser: UserProfile = {
    id: userId,
    firebaseUid: firebaseUid,
    username: cleanUsername,
    email: isPhonePasswordLogin ? undefined : email?.trim().toLowerCase() || undefined,
    phone: aliasPhone || req.user.phone_number || (typeof phone === 'string' ? phone.trim() : undefined),
    avatar: normalizeAppAvatar(avatar),
    balance: WELCOME_BONUS,
    winCount: 0,
    lossCount: 0,
    linkedAgentId: linkedAgentId, // Add the linked agent ID
    appliedPromoCode: normalizedPromoCode || undefined,
    emailOtpVerifiedAt: isOtpEnabled() ? Date.now() : undefined,
  };

  store.users[userId] = newUser;
  addTransaction(userId, 'deposit', WELCOME_BONUS, undefined, 'Welcome signup bonus.');
  await saveUserProfileToFirestore(newUser);
  await saveStoreAndWait();

  res.json(newUser);
});

// Dynamic Leaderboard (Global Earnings Board) from active store data
app.get('/api/users/leaderboard', async (req, res) => {
  const allUsers = Object.values(store.users).filter(u => !isBotPlayer(u.id));

  const rankedUsers = allUsers.map(u => {
    const userTransactions = store.transactions.filter(t => t.userId === u.id);
    const payoutsAndRefunds = userTransactions
      .filter(t => t.type === 'win_payout' || t.type === 'refund')
      .reduce((sum, t) => sum + t.amount, 0);
    const gameStakes = userTransactions
      .filter(t => t.type === 'bet_escrow_locked')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { user: u, earnings: payoutsAndRefunds - gameStakes };
  });

  // Sort users by earnings descending
  const sorted = rankedUsers
    .sort((a, b) => {
      if (b.earnings !== a.earnings) return b.earnings - a.earnings;
      return (b.user.winCount || 0) - (a.user.winCount || 0);
    })
    .slice(0, 5);

  const result = sorted.map(({ user: u, earnings }, index) => {
    return {
      id: u.id,
      rank: index + 1,
      name: u.username,
      avatar: u.avatar || '🎮',
      wins: u.winCount || 0,
      earnings
    };
  });

  res.json(result);
});

// Get active online & registered players (real users)
app.post('/api/users/presence', async (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'Valid userId is required.' });
  const knownUser = store.users[userId];
  const reportedOfflinePreference = req.body?.isOfflinePreference === true;
  const reportedUsername = String(req.body?.username || '').trim().slice(0, 20);
  const reportedAvatar = req.body?.avatar;
  const profile = {
    id: userId,
    username: reportedUsername || knownUser?.username || 'Player',
    avatar: reportedAvatar || knownUser?.avatar || '🎮',
    winCount: knownUser?.winCount || 0,
    lossCount: knownUser?.lossCount || 0,
    presenceLocation: 'home',
    // The visible Home client is fresher than the persisted profile cache.
    // Using the cached value here could permanently hide returning users whose
    // client has already switched back online.
    isOfflinePreference: reportedOfflinePreference,
  };
  try {
    if (isMySqlConfigured()) {
      await touchMySqlUserPresence([profile]);
    } else if (db) {
      await db.collection('userPresence').doc(userId).set({ userId, lastSeenAt: Date.now(), profile }, { merge: true });
    }
    res.json({ success: true, lastSeenAt: Date.now() });
  } catch (error) {
    console.error('Home presence update failed:', error);
    res.status(503).json({ error: 'Presence could not be updated.' });
  }
});

app.get('/api/users/online', async (req, res) => {
  const currentUserId = req.query.userId as string;
  if (!currentUserId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  cleanupMatchmakingQueues();

  // Treat loading the Home online list as a presence heartbeat too. This
  // guarantees that every Dashboard session registers itself even when its
  // background POST heartbeat or SSE stream is blocked by a browser/WebView.
  try {
    let currentProfile = store.users[currentUserId] || null;
    if (!currentProfile && isMySqlConfigured()) currentProfile = await loadMySqlRuntimeUser(currentUserId);
    if (!currentProfile && db) currentProfile = await refreshUserProfileById(currentUserId);
    if (currentProfile) {
      const presenceProfile = {
        ...currentProfile,
        id: currentUserId,
        isOfflinePreference: Boolean(currentProfile.isOfflinePreference),
        presenceLocation: 'home',
      };
      if (isMySqlConfigured()) {
        await touchMySqlUserPresence([presenceProfile]);
      } else if (db) {
        await db.collection('userPresence').doc(currentUserId).set({
          userId: currentUserId,
          lastSeenAt: Date.now(),
          profile: presenceProfile,
        }, { merge: true });
      }
    }
  } catch (error) {
    console.error(`Online-list presence registration failed for ${currentUserId}:`, error);
  }

  const now = Date.now();

  // Cross-process matchmaking is kept current by the single server-side
  // Firestore listener; this request now reads only the in-memory queue.

  const onlineList: any[] = [];

  // Return Search Live users plus connected players who are available on Home.
  let sharedOnlineUsers: Array<{ id: string; profile?: any }> = [];
  if (isMySqlConfigured()) {
    sharedOnlineUsers = await listMySqlOnlineUsers().catch(error => { console.error('Shared presence lookup failed:', error); return []; });
  } else if (db) {
    try {
      const snapshot = await db.collection('userPresence').where('lastSeenAt', '>=', Date.now() - 45_000).get();
      sharedOnlineUsers = snapshot.docs.map(doc => ({ id: String(doc.data().userId || doc.id), profile: doc.data().profile }));
    } catch (error) {
      console.error('Firestore presence lookup failed:', error);
    }
  }
  const homePresenceUserIds = new Set(
    sharedOnlineUsers
      .filter(user => user.profile?.presenceLocation === 'home')
      .map(user => user.id)
  );
  const connectedUserIds = new Set([...activeClients.map(client => client.userId), ...sharedOnlineUsers.map(user => user.id)]);
  const candidateUsers = new Map(Object.values(store.users).map(user => [user.id, user]));
  sharedOnlineUsers.forEach(({ id, profile }) => {
    // Presence is the freshest source for Home. Merge it even when the user
    // already exists in the local store; otherwise a stale cached profile can
    // keep an online user hidden (especially after changing offline preference).
    candidateUsers.set(id, {
      ...(candidateUsers.get(id) || {}),
      ...(profile || {}),
      id,
      username: profile?.username || candidateUsers.get(id)?.username || 'Player',
      avatar: profile?.avatar || candidateUsers.get(id)?.avatar || '🎮',
      isOfflinePreference: profile?.isOfflinePreference ?? candidateUsers.get(id)?.isOfflinePreference ?? false,
    });
  });
  activeClients.forEach(client => {
    if (!client.profile?.username) return;
    candidateUsers.set(client.userId, {
      ...(candidateUsers.get(client.userId) || {}),
      ...client.profile,
      id: client.userId,
    } as UserProfile);
  });
  // Hydrate live connections from the real user database. Never expose a
  // fabricated "Player" profile in the challenge list.
  const missingProfileIds = [...connectedUserIds].filter(id => {
    const candidate = candidateUsers.get(id);
    return !candidate || !candidate.username || candidate.username === 'Player';
  });
  const hydratedProfiles = await Promise.all(missingProfileIds.map(async id => {
    try {
      return isMySqlConfigured() ? await loadMySqlRuntimeUser(id) : await refreshUserProfileById(id);
    } catch (error) {
      console.error(`Online profile lookup failed for ${id}:`, error);
      return null;
    }
  }));
  hydratedProfiles.forEach((profile, index) => {
    if (!profile?.id || !profile.username) return;
    const id = missingProfileIds[index];
    candidateUsers.set(id, { ...(candidateUsers.get(id) || {}), ...profile, id });
  });
  candidateUsers.forEach((candidate, id) => {
    if (!candidate.username || candidate.username === 'Player') candidateUsers.delete(id);
  });
  const busyUserIds = new Set<string>();
  Object.values(store.rooms).forEach(room => {
    if (room.status !== 'waiting' && room.status !== 'playing') return;
    room.players.forEach(player => busyUserIds.add(player.userId));
    if ((room as any).invitedUserId) busyUserIds.add(String((room as any).invitedUserId));
  });

  candidateUsers.forEach(u => {
    // A fresh Home presence is authoritative: anyone currently on Home and
    // outside a game must be visible and challengeable. Persisted offline
    // preferences are intentionally not allowed to hide an active Home user.
    if (isBotPlayer(u.id) || u.id === currentUserId || u.isOfflinePreference) return;

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

    if (
      status !== 'seeking'
      && connectedUserIds.has(u.id)
      && (homePresenceUserIds.has(u.id) || !busyUserIds.has(u.id))
    ) status = 'online';

    if (status === 'seeking' || status === 'online') {
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

  // Search Live players remain first; available Home players follow.
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

// Retrieve single profile
app.get('/api/users/:userId', async (req, res) => {
  const user = await refreshUserProfileById(req.params.userId);
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
app.post('/api/users/:userId/status', async (req, res) => {
  const user = store.users[req.params.userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { isOffline } = req.body;
  user.isOfflinePreference = !!isOffline;

  await saveStoreAndWait();
  const presenceProfile = { ...user, presenceLocation: 'home' };
  try {
    if (isMySqlConfigured()) {
      await touchMySqlUserPresence([presenceProfile]);
    } else if (db) {
      await db.collection('userPresence').doc(user.id).set({
        userId: user.id,
        lastSeenAt: Date.now(),
        profile: presenceProfile,
      }, { merge: true });
    }
  } catch (error) {
    console.error(`Status presence update failed for ${user.id}:`, error);
  }
  broadcastUserUpdate(user.id);
  broadcastToAll('online_players_updated', {});
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

  const eligibilityError = withdrawalEligibilityError(user, withAmt);
  if (eligibilityError) return res.status(400).json({ error: eligibilityError });

  user.balance -= withAmt;
  addTransaction(userId, 'withdrawal', withAmt, undefined, `Withdrawn funds to bank account.`);
  recordWithdrawalFee(userId, getWithdrawalQuote(userId, withAmt).fee);
  broadcastUserUpdate(userId);

  res.json({ success: true, balance: user.balance });
});

app.post('/api/wallet/request-manual-confirmation', async (req, res) => {
  const { userId, agentId, amount, phone, senderPhone, provider, transactionType } = req.body;
  const requestAmount = Number(amount);

  if (!userId || !Number.isFinite(requestAmount) || requestAmount <= 0 || !provider || !transactionType) {
    return res.status(400).json({ error: 'Missing required fields. `userId`, `amount`, `provider`, and `transactionType` are all required.' });
  }

  if (transactionType !== 'deposit' && transactionType !== 'withdraw') {
    return res.status(400).json({ error: 'Invalid transaction type.' });
  }

  const user = await refreshUserProfileById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // ==> START PROMO CODE AGENT LOCK VALIDATION
  // Only a promo-linked account may route a request to an agent. Never accept a
  // client-selected/default agent for an unlinked player; those requests belong
  // exclusively to the admin queue.
  const assignedAgentId = user.linkedAgentId || undefined;
  if (assignedAgentId && agentId && assignedAgentId !== agentId) {
    return res.status(400).json({ error: 'This account is locked to a specific agent. You can only transact with your assigned agent.' });
  }
  // <== END PROMO CODE AGENT LOCK VALIDATION
  
  if (transactionType === 'withdraw' && !phone) {
    return res.status(400).json({ error: 'Phone number is required for withdrawal requests.' });
  }

  if (transactionType === 'withdraw') {
    const eligibilityError = withdrawalEligibilityError(user, requestAmount);
    if (eligibilityError) return res.status(400).json({ error: eligibilityError });
  }

  if (transactionType === 'deposit' && !senderPhone) {
    return res.status(400).json({ error: 'Sender phone number is required for deposit requests.' });
  }

  // Verify the assigned/selected agent exists before persisting the request.
  let assignedAgentUsername: string | undefined;
  if (assignedAgentId) {
      if (!db && !isMySqlRuntimePrimary()) {
        return res.status(503).json({ error: 'The payment service is temporarily unavailable.' });
      }
      try {
        if (isMySqlRuntimePrimary()) {
            const selectedAgent = await cachedAgent(assignedAgentId);
            if (!selectedAgent) return res.status(404).json({ error: 'The selected agent does not exist.' });
            if (selectedAgent.status !== 'Active') return res.status(400).json({ error: 'The selected agent is not active.' });
            assignedAgentUsername = selectedAgent.username;
        } else {
        const agentDoc = await db.collection('agents').doc(assignedAgentId).get();
        if (!agentDoc.exists) {
            return res.status(404).json({ error: 'The selected agent does not exist.' });
        }
        const selectedAgent = agentDoc.data() as Agent;
        if (selectedAgent.status !== 'Active') {
            return res.status(400).json({ error: 'The selected agent is not active.' });
        }
        assignedAgentUsername = selectedAgent.username;
        }
      } catch (err) {
        console.error("Failed to verify agent for manual transaction request:", err);
        return res.status(500).json({ error: "Could not verify the selected agent." });
      }
  }


  const requestCity = normalizedCity(req.body.location || user.location);
  if (!assignedAgentId && !requestCity) {
    return res.status(400).json({ error: 'Select your city/location so the request can be assigned to a local cashier.' });
  }
  if (!assignedAgentId && String(req.body.location || '').trim() && user.location !== String(req.body.location).trim()) {
    user.location = String(req.body.location).trim();
  }

  const newRequest: ManualTransactionRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId,
    username: user.username,
    agentId: assignedAgentId,
    agentUsername: assignedAgentUsername,
    managedBy: assignedAgentId ? 'agent' : 'admin',
    cashierCity: assignedAgentId ? undefined : requestCity,
    amount: requestAmount,
    ...(transactionType === 'withdraw' ? getWithdrawalQuote(user.id, requestAmount) : {}),
    phone, // This will be the destination for withdrawals
    senderPhone, // This is the source number for deposits
    provider,
    transactionType,
    status: 'pending',
    createdAt: Date.now(),
  };

  store.pendingManualTransactions.unshift(newRequest);
  // Persist the request as its own Firestore document before acknowledging it.
  // This survives production restarts and avoids the single large store document.
  try {
    await saveManualRequestToFirestore(newRequest);
  } catch (error) {
    store.pendingManualTransactions = store.pendingManualTransactions.filter(request => request.id !== newRequest.id);
    console.error('Failed to persist manual transaction request:', error);
    return res.status(503).json({ error: 'Your request could not be saved. Please try again.' });
  }
  if (!assignedAgentId) {
    try {
      await assignCashierToRequest(newRequest);
    } catch (error) {
      console.error(`Initial cashier assignment failed for ${newRequest.id}:`, error);
    }
  }
  // The request itself is already durably stored above. A legacy aggregate
  // snapshot failure must not tell the player that a successfully-created
  // request failed (or encourage duplicate submissions).
  try {
    await saveStoreAndWait();
  } catch (error) {
    console.error(`Manual request ${newRequest.id} was saved, but the aggregate store snapshot failed:`, error);
  }

  res.json({ success: true, message: 'Your request has been submitted for review.' });
});

app.get('/api/wallet/withdrawal-quote/:userId', async (req, res) => {
  const user = await refreshUserProfileById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const amount = Number(req.query.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a valid withdrawal amount.' });
  const eligibilityError = withdrawalEligibilityError(user, amount);
  if (eligibilityError) return res.status(400).json({ error: eligibilityError, withdrawableBalance: getWithdrawableBalance(user.id) });
  res.json({ amount, withdrawableBalance: getWithdrawableBalance(user.id), ...getWithdrawalQuote(user.id, amount) });
});

app.get('/api/wallet/transactions/:userId', (req, res) => {
  const txs = store.transactions.filter(t => t.userId === req.params.userId);
  res.json(txs);
});

app.get('/api/payment/settings', (req, res) => {
  res.json(Object.fromEntries(Object.entries(store.paymentProviders).map(([key, config]) => [key, {
    enabled: config.enabled,
    accountNumber: config.accountNumber || '',
  }])));
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
    const eligibilityError = withdrawalEligibilityError(user, parsedAmount);
    if (eligibilityError) return res.status(400).json({ error: eligibilityError });
    user.balance -= parsedAmount;
    addTransaction(userId, 'withdrawal', parsedAmount, undefined, `API withdrawal via ${providerKey}.`);
    recordWithdrawalFee(userId, getWithdrawalQuote(userId, parsedAmount).fee);
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
app.get('/api/vip/tiers', (_req, res) => {
  res.json(store.vipTiers);
});

const saveVipTiersFromAdmin = async (req: express.Request, res: express.Response) => {
  const submitted = req.body?.vipTiers;
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
    return res.status(400).json({ error: 'VIP plans are required.' });
  }

  const normalized: Record<string, VipTier> = {};
  for (const [key, value] of Object.entries(submitted as Record<string, Partial<VipTier>>)) {
    const id = key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const price = Number(value.price);
    const durationMonths = Number(value.durationMonths);
    const rakeDiscount = Number(value.rakeDiscount);
    const features = Array.isArray(value.features) ? value.features.map(String).map(item => item.trim()).filter(Boolean).slice(0, 8) : [];
    if (!id || !String(value.name || '').trim() || !Number.isFinite(price) || price <= 0 || !Number.isInteger(durationMonths) || durationMonths < 1 || !Number.isFinite(rakeDiscount) || rakeDiscount < 0 || rakeDiscount > RAKE_PERCENTAGE) {
      return res.status(400).json({ error: `Invalid settings for VIP plan "${key}".` });
    }
    normalized[id] = { name: String(value.name).trim(), price, durationMonths, rakeDiscount, features };
  }
  if (!Object.keys(normalized).length) return res.status(400).json({ error: 'At least one VIP plan is required.' });

  store.vipTiers = normalized;
  await saveStoreAndWait();
  res.json({ success: true, vipTiers: store.vipTiers });
};

app.post('/api/vip/subscribe', verifyFirebaseToken, async (req: any, res) => {
  const { tier } = req.body;
  const firebaseUid = req.user.uid;

  const user = Object.values(store.users).find(u => u.firebaseUid === firebaseUid);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const vipTier = store.vipTiers[tier];
  if (!vipTier) {
    return res.status(400).json({ error: 'Invalid VIP tier specified.' });
  }

  if (user.balance < vipTier.price) {
    return res.status(400).json({ error: 'Insufficient funds to purchase this VIP subscription.' });
  }

  // Deduct price from user's balance
  user.balance -= vipTier.price;

  // Calculate expiration date
  const currentVipIsSameTier = user.vip?.tier === tier && user.vip.expires > Date.now();
  const startDate = currentVipIsSameTier ? user.vip!.expires : Date.now();
  const endDate = startDate + (vipTier.durationMonths * 30 * 24 * 60 * 60 * 1000); 

  // Update user's VIP status
  user.vip = {
    tier: tier,
    expires: endDate,
  };

  // Record the subscription as realized platform revenue.
  addTransaction(user.id, 'app_commission', vipTier.price, undefined, `VIP plan debit: ${vipTier.name}.`);
  recordHouseRevenue('vip_subscription', vipTier.price, user.id, `VIP subscription (${vipTier.name}) purchased by ${user.username}.`);

  await saveUserProfileToFirestore(user);
  await saveStoreAndWait();
  broadcastUserUpdate(user.id);

  res.json({
    success: true,
    user,
    message: currentVipIsSameTier
      ? `${vipTier.name} renewed successfully.`
      : `Successfully subscribed to ${vipTier.name}!`
  });
});


// ==========================================
// TOURNAMENT SYSTEM
// ==========================================

app.get('/api/tournaments', (req, res) => {
  seedDefaultTournaments();
  const { status } = req.query;
  const allTournaments = Object.values(store.tournaments);
  if (status && typeof status === 'string' && status !== 'all') {
    return res.json(allTournaments.filter(t => t.status === status));
  }
  allTournaments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(allTournaments);
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

app.post('/api/tournaments/:id/unregister', verifyFirebaseToken, async (req: any, res) => {
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
    return res.status(400).json({ error: 'Cannot unregister after tournament has started or finished.' });
  }

  const playerIndex = tournament.players.findIndex(p => p.userId === user.id);
  if (playerIndex === -1) {
    return res.status(400).json({ error: 'You are not registered for this tournament.' });
  }

  // Remove player
  tournament.players.splice(playerIndex, 1);

  // Refund entry fee
  if (tournament.entryFee > 0) {
    const cancellationFee = Number((tournament.entryFee * TOURNAMENT_UNREGISTER_FEE_RATE).toFixed(2));
    const refundAmount = Number((tournament.entryFee - cancellationFee).toFixed(2));
    user.balance += refundAmount;
    addTransaction(user.id, 'refund', refundAmount, id, `Refund after voluntarily unregistering from tournament "${tournament.name}" (fee: $${cancellationFee.toFixed(2)}).`);
    recordHouseRevenue('tournament_cancellation_fee', cancellationFee, id, `Tournament cancellation fee from ${user.username} for "${tournament.name}".`);
  }

  await saveStoreAndWait();
  broadcastUserUpdate(user.id);
  broadcastToAll('tournament_update', tournament);

  res.json({ success: true, tournament, message: `Unregistered from ${tournament.name}. A 10% cancellation fee was deducted.` });
});

app.post('/api/tournaments/:id/check-in', verifyFirebaseToken, async (req: any, res) => {
  const tournament = store.tournaments[req.params.id];
  if (!tournament || tournament.status !== 'check_in' || !tournament.checkInDeadline || Date.now() > tournament.checkInDeadline) return res.status(400).json({ error: 'Tournament check-in is not open.' });
  const user = Object.values(store.users).find(u => u.firebaseUid === req.user.uid);
  const player = user && tournament.players.find(p => p.userId === user.id);
  if (!player) return res.status(403).json({ error: 'You are not registered for this tournament.' });
  player.checkedInAt = Date.now();
  await saveStoreAndWait();
  broadcastToAll('tournament_update', tournament);
  res.json({ success: true, tournament, message: 'Tournament check-in confirmed.' });
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
      const prizeAlreadyPaid = store.transactions.some(tx => tx.matchId === tournament.id && tx.type === 'win_payout' && /tournament/i.test(tx.description || ''));
      if (winnerUser && !prizeAlreadyPaid) {
        winnerUser.balance += tournament.prizePool;
        addTransaction(winnerUser.id, 'win_payout', tournament.prizePool, tournament.id, `Tournament "${tournament.name}" prize.`);
        broadcastUserUpdate(winnerUser.id);
      }
      const collectedEntryFees = store.transactions
        .filter(tx => tx.matchId === tournament.id && tx.type === 'bet_escrow_locked' && /tournament entry fee/i.test(tx.description || ''))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const refundedEntryFees = store.transactions
        .filter(tx => tx.matchId === tournament.id && (tx.type === 'deposit' || tx.type === 'refund') && /refund/i.test(tx.description || ''))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const netCollected = Math.max(0, collectedEntryFees - refundedEntryFees);
      const tournamentMargin = Number((netCollected - tournament.prizePool).toFixed(2));
      const marginAlreadyRecorded = store.transactions.some(tx => tx.matchId === tournament.id && tx.revenueCategory === 'tournament_margin');
      if (!marginAlreadyRecorded) {
        recordHouseRevenue(
          'tournament_margin',
          tournamentMargin,
          tournament.id,
          `Tournament margin for "${tournament.name}": $${netCollected.toFixed(2)} entries minus $${tournament.prizePool.toFixed(2)} prize.`
        );
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
          const player1Profile = store.users[nextMatch.player1.userId];
          const player2Profile = store.users[nextMatch.player2.userId];

          if (!player1Profile || !player2Profile) {
            console.error(`Error: Could not find full user profile for tournament match players. Match ID: ${nextMatch.id}`);
            continue; // Skip this match if profiles are missing
          }

          const room = startMatchedRoom(
            [
              { id: player1Profile.id, username: player1Profile.username, avatar: player1Profile.avatar, balance: player1Profile.balance, winCount: player1Profile.winCount, lossCount: player1Profile.lossCount },
              { id: player2Profile.id, username: player2Profile.username, avatar: player2Profile.avatar, balance: player2Profile.balance, winCount: player2Profile.winCount, lossCount: player2Profile.lossCount },
            ],
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
  seedDefaultTournaments();

  Object.values(store.tournaments).forEach(async (t) => {
    if (t.status === 'check_in' && t.checkInDeadline && now >= t.checkInDeadline) {
      const checkedPlayers = t.players.filter(player => player.checkedInAt);
      if (checkedPlayers.length === 0) {
        t.players.forEach(player => {
          const user = store.users[player.userId];
          if (user && t.entryFee > 0) {
            user.balance += t.entryFee;
            addTransaction(user.id, 'refund', t.entryFee, t.id, `Full refund because tournament "${t.name}" lacked checked-in players.`);
            broadcastUserUpdate(user.id);
          }
        });
        t.status = 'cancelled';
        await saveStoreAndWait();
        broadcastToAll('tournament_update', t);
        return;
      }
      if (checkedPlayers.length === 1) {
        const winner = store.users[checkedPlayers[0].userId];
        t.players = checkedPlayers; t.winnerId = checkedPlayers[0].userId; t.status = 'completed'; t.endDate = Date.now();
        if (winner && !store.transactions.some(tx => tx.matchId === t.id && tx.type === 'win_payout' && /tournament/i.test(tx.description || ''))) {
          winner.balance += t.prizePool;
          addTransaction(winner.id, 'win_payout', t.prizePool, t.id, `Tournament "${t.name}" walkover prize.`);
          broadcastUserUpdate(winner.id);
        }
        const collected = store.transactions.filter(tx => tx.matchId === t.id && tx.type === 'bet_escrow_locked' && /tournament entry fee/i.test(tx.description || '')).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
        if (!store.transactions.some(tx => tx.matchId === t.id && tx.revenueCategory === 'tournament_margin')) recordHouseRevenue('tournament_margin', Number((collected - t.prizePool).toFixed(2)), t.id, `Tournament margin for walkover tournament "${t.name}".`);
        await saveStoreAndWait(); broadcastToAll('tournament_ended', t); return;
      }
      t.players = checkedPlayers;
      t.status = 'in_progress';
      t.matches = createTournamentBracket(t);
      t.currentRound = 1;
      for (const match of t.matches) {
        if (match.status === 'pending' && match.player1 && match.player2) {
          const room = startMatchedRoom([
            { id: match.player1.userId, username: match.player1.username, avatar: match.player1.avatar, balance: 0 },
            { id: match.player2.userId, username: match.player2.username, avatar: match.player2.avatar, balance: 0 },
          ], 0, 2, 'solo');
          match.roomId = room.id; match.status = 'in_progress'; room.tournamentDetails = { tournamentId: t.id, matchId: match.id };
        }
      }
      await saveStoreAndWait();
      broadcastToAll('tournament_started', t);
      return;
    }
    if (t.status === 'registration_open' && now >= t.startDate) {
      // Repair only legacy auto-seeded tournaments whose advertised prize was
      // greater than all possible entry fees. Custom admin tournaments are
      // validated when they are created or edited.
      const maximumSustainablePrize = Number((t.entryFee * t.maxPlayers * 0.9).toFixed(2));
      if (/^tourney_(weekly|weekend|daily)_/.test(t.id) && t.prizePool > maximumSustainablePrize) {
        t.prizePool = maximumSustainablePrize;
      }
      const collectedEntryFees = Number((t.entryFee * t.players.length).toFixed(2));
      if (t.players.length >= 2 && collectedEntryFees >= t.prizePool) {
        t.status = 'check_in';
        t.checkInDeadline = now + TOURNAMENT_CHECK_IN_MS;
        await saveStoreAndWait();
        broadcastToAll('tournament_check_in', t);
      } else {
        t.postponementCount = Number(t.postponementCount || 0) + 1;
        if (t.postponementCount >= TOURNAMENT_MAX_POSTPONEMENTS) {
          t.players.forEach(player => { const user = store.users[player.userId]; if (user) { user.balance += t.entryFee; addTransaction(user.id, 'refund', t.entryFee, t.id, `Full refund for cancelled underfunded tournament "${t.name}".`); broadcastUserUpdate(user.id); } });
          t.status = 'cancelled';
        } else {
          t.startDate = now + 12 * 60 * 60 * 1000;
        }
        await saveStoreAndWait();
        broadcastToAll('tournament_update', t);
      }
    }
  });
}

setInterval(checkAndStartTournaments, 10000); // Check every 10 seconds

// Periodic room maintenance: auto-close abandoned or inactive games
setInterval(() => {
  const now = Date.now();
  Object.keys(store.rooms).forEach(roomId => {
    const room = store.rooms[roomId];
    if (room.status === 'playing') {
      const activeHumanPlayers = room.players.filter(p => !isBotPlayer(p.userId) && p.status !== 'left');
      const lastAct = room.gameState?.lastActivity || room.createdAt || now;
      
      // If no human players remain or inactive for > 15 minutes, mark room as completed
      if (activeHumanPlayers.length === 0 || (now - lastAct > 15 * 60 * 1000)) {
        room.status = 'completed';
        addLog(room, 'Room closed due to inactivity or abandonment.');
        saveStore();
      }
    }
  });
}, 30000);

// ==========================================
// 5. MATCHMAKING & LOBBY SYSTEM
// ==========================================

// Keep live room state shared when production traffic is served by more than
// one Node process. Local memory remains the fast working copy, while MySQL is
// the hand-off point between processes.
app.use('/api/rooms', async (req, res, next) => {
  if (!isMySqlConfigured()) return next();

  const pathParts = req.path.split('/').filter(Boolean);
  const reservedPaths = new Set([
    'active', 'create', 'join', 'matchmaking', 'create-bot-room', 'voice-signaling',
    'challenge', 'ready', 'add-bot', 'change-team', 'start', 'roll-dice',
    'move-token', 'chat', 'accept-player', 'decline-player', 'nudge', 'emoji', 'leave',
  ]);
  const bodyRoomId = String(req.body?.roomId || req.body?.roomCode || '').trim().toUpperCase();
  const pathRoomId = pathParts[0] === 'check-status'
    ? String(pathParts[1] || '').trim().toUpperCase()
    : (!reservedPaths.has(pathParts[0]) ? String(pathParts[0] || '').trim().toUpperCase() : '');
  const roomId = bodyRoomId || pathRoomId;

  try {
    if (req.method === 'GET' && pathParts[0] === 'active') {
      const rooms = await listMySqlActiveGameRooms();
      rooms.forEach(room => {
        if (room?.id && shouldAcceptRoomSnapshot(store.rooms[room.id], room)) store.rooms[room.id] = room;
      });
    } else if (roomId) {
      const room = await loadMySqlGameRoom(roomId);
      const localRoom = store.rooms[roomId];
      // A lagging shared snapshot must never resurrect a settled room. Doing so
      // replays the winning move/forfeit and can credit the same match repeatedly.
      if (room && shouldAcceptRoomSnapshot(localRoom, room)) {
        store.rooms[roomId] = room;
      }
    }

    const userIds = [
      req.body?.userId,
      req.body?.senderId,
      req.body?.receiverId,
      req.query?.userId,
    ].map(value => String(value || '').trim()).filter(Boolean);
    await Promise.all([...new Set(userIds)].map(async userId => {
      const user = await loadMySqlRuntimeUser(userId);
      // Do not replace a live in-memory wallet with a lagging SQL read. User
      // updates are synchronized explicitly after every critical settlement.
      if (user?.id && !store.users[user.id]) store.users[user.id] = user;
    }));
  } catch (error) {
    console.error('MySQL live room hydration failed; continuing with local state:', error);
  }

  res.once('finish', () => {
    const persistedRoomId = String(res.locals.roomId || roomId || '').trim().toUpperCase();
    const room = store.rooms[persistedRoomId];
    if (!room || res.statusCode >= 500) return;
    void saveMySqlGameRoom(room).catch(error => {
      console.error(`MySQL live room persistence failed for ${persistedRoomId}:`, error);
    });
  });
  next();
});

// Serialize the two authoritative gameplay mutations across every Node
// worker. A slow request can outlive the client's timeout; without this lock,
// a retry routed to another worker could roll or move the same turn twice.
app.use('/api/rooms', async (req, res, next) => {
  if (!isMySqlConfigured() || req.method !== 'POST' || !['/roll-dice', '/move-token'].includes(req.path)) return next();
  const roomId = String(req.body?.roomId || '').trim().toUpperCase();
  if (!roomId) return res.status(400).json({ error: 'Room ID is required.' });

  let connection: any;
  try {
    connection = await getMySqlPool().getConnection();
    const lockName = `ludosom_room_${roomId}`.slice(0, 64);
    const [rows] = await connection.query('SELECT GET_LOCK(?, 8) AS acquired', [lockName]);
    if (Number(rows[0]?.acquired) !== 1) {
      connection.release();
      return res.status(503).json({ error: 'The game server is busy synchronizing this turn. Please retry.' });
    }

    // Once the lock is held, MySQL is the canonical hand-off state. This
    // prevents a worker's old in-memory snapshot from rejecting a valid move.
    const sharedRoom = await loadMySqlGameRoom(roomId);
    const localRoom = store.rooms[roomId];
    if (sharedRoom && !(localRoom && ['completed', 'cancelled'].includes(localRoom.status))) {
      store.rooms[roomId] = sharedRoom;
    }

    let released = false;
    const releaseLock = () => {
      if (released) return;
      released = true;
      void connection.query('SELECT RELEASE_LOCK(?)', [lockName])
        .catch((error: unknown) => console.error(`Failed to release gameplay lock for ${roomId}:`, error))
        .finally(() => connection.release());
    };
    res.once('finish', releaseLock);
    res.once('close', releaseLock);
    next();
  } catch (error) {
    if (connection) connection.release();
    console.error(`Failed to acquire gameplay lock for ${roomId}:`, error);
    return res.status(503).json({ error: 'The game server could not synchronize this turn. Please retry.' });
  }
});

// GET /api/rooms/active
// Returns a list of all currently active games that can be spectated.
app.get('/api/rooms/active', (req, res) => {
  const now = Date.now();
  const activeGames = Object.values(store.rooms)
    .filter(r => {
      if (r.status !== 'playing') return false;
      if (r.gameState?.winnerId) return false;
      
      // Must have at least one active non-bot human player who hasn't left
      const activeHumanPlayers = r.players.filter(p => !isBotPlayer(p.userId) && p.status !== 'left');
      if (activeHumanPlayers.length === 0) return false;

      // Must have had activity within the last 15 minutes
      const lastAct = r.gameState?.lastActivity || r.createdAt || now;
      if (now - lastAct > 15 * 60 * 1000) return false;

      return true;
    })
    .map(r => ({
      id: r.id,
      players: r.players.map(p => ({
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        status: p.status,
      })),
      betAmount: r.betAmount,
      gameMode: r.gameMode,
      capacity: r.capacity,
    }));
  res.json(activeGames);
});

app.get('/api/rooms/:roomId/spectator-bet', (req, res) => {
  const userId = String(req.query.userId || '');
  const roomId = req.params.roomId;
  const bet = store.spectatorBets.find(item => item.roomId === roomId && item.userId === userId) || null;
  const openBets = store.spectatorBets.filter(item => item.roomId === roomId && item.status === 'open');
  const room = store.rooms[roomId];
  const markets = (room?.players || []).filter(player => player.status !== 'left').map(player => {
    const playerBets = openBets.filter(item => item.targetPlayerId === player.userId);
    const winPool = Number(playerBets.filter(item => item.prediction === 'W').reduce((sum, item) => sum + item.stake, 0).toFixed(2));
    const lossPool = Number(playerBets.filter(item => item.prediction === 'L').reduce((sum, item) => sum + item.stake, 0).toFixed(2));
    const totalPool = Number((winPool + lossPool).toFixed(2));
    const tokens = room.gameState.tokens.filter(token => token.ownerId === player.userId || token.color === player.color);
    const progress = tokens.length ? Math.round(tokens.reduce((sum, token) => sum + Math.max(0, token.position), 0) / (tokens.length * 56) * 100) : 0;
    return {
      targetPlayerId: player.userId,
      winPool,
      lossPool,
      totalPool,
      winOdds: winPool > 0 ? Number((totalPool * 0.90 / winPool).toFixed(2)) : null,
      lossOdds: lossPool > 0 ? Number((totalPool * 0.90 / lossPool).toFixed(2)) : null,
      progress,
    };
  });
  res.json({ bet, markets, commissionRate: 0.10, minStake: 0.10, maxStake: 10 });
});

app.post('/api/rooms/:roomId/spectator-bet', async (req, res) => {
  const roomId = req.params.roomId;
  const userId = String(req.body.userId || '');
  const targetPlayerId = String(req.body.targetPlayerId || '');
  const prediction = req.body.prediction === 'L' ? 'L' : req.body.prediction === 'W' ? 'W' : '';
  const stake = Number(Number(req.body.stake || 0).toFixed(2));
  let room = store.rooms[roomId];
  if (!room && isMySqlConfigured()) room = await loadMySqlGameRoom(roomId) || undefined;
  let bettor = store.users[userId];
  if (!bettor && isMySqlConfigured()) bettor = await loadMySqlRuntimeUser(userId) || undefined;
  if (!room) return res.status(404).json({ error: 'Ciyaarta lama helin.' });
  if (!bettor) return res.status(404).json({ error: 'Account-ka lama helin.' });
  if (room.status !== 'playing' || room.gameState.winnerId) return res.status(409).json({ error: 'Betting-ka ciyaartan wuu xirmay.' });
  if (room.players.some(player => player.userId === userId)) return res.status(403).json({ error: 'Ciyaaryahan kama bet-gareyn karo ciyaartiisa.' });
  if (!room.players.some(player => player.userId === targetPlayerId && player.status !== 'left')) return res.status(400).json({ error: 'Dooro ciyaaryahan firfircoon.' });
  if (!prediction) return res.status(400).json({ error: 'Dooro W ama L.' });
  if (stake < 0.10 || stake > 10) return res.status(400).json({ error: 'Bet-ku waa inuu u dhexeeyaa $0.10 iyo $10.' });
  if (bettor.balance < stake) return res.status(400).json({ error: 'Balance-ka kuma filna bet-kan.' });
  if (store.spectatorBets.some(bet => bet.roomId === roomId && bet.userId === userId)) return res.status(409).json({ error: 'Ciyaartan hore ayaad bet uga dhigatay.' });
  const marketClosed = room.gameState.tokens.some(token => token.position >= 51);
  if (marketClosed) return res.status(409).json({ error: 'Market-ku wuu xirmay maadaama ciyaartu dhammaad ku dhowdahay.' });

  const target = room.players.find(player => player.userId === targetPlayerId)!;
  const marketBets = store.spectatorBets.filter(bet => bet.roomId === roomId && bet.targetPlayerId === targetPlayerId && bet.status === 'open');
  const winPool = marketBets.filter(bet => bet.prediction === 'W').reduce((sum, bet) => sum + bet.stake, 0);
  const lossPool = marketBets.filter(bet => bet.prediction === 'L').reduce((sum, bet) => sum + bet.stake, 0);
  const selectedPool = prediction === 'W' ? winPool : lossPool;
  const opposingPool = prediction === 'W' ? lossPool : winPool;
  const selectedPoolAfter = Number((selectedPool + stake).toFixed(2));
  const maximumBalancedPool = Math.max(1, Number((opposingPool * 5).toFixed(2)));
  if (selectedPoolAfter > maximumBalancedPool) {
    const remaining = Math.max(0, Number((maximumBalancedPool - selectedPool).toFixed(2)));
    return res.status(409).json({ error: remaining >= 0.10 ? `Risk limit: dhinacan waxaad hadda ku dari kartaa ugu badnaan $${remaining.toFixed(2)}.` : 'Dhinacan bet badan ayaa saaran; sug bet ka soo horjeeda.' });
  }
  const totalPoolAfter = Number((winPool + lossPool + stake).toFixed(2));
  const estimatedOdds = Number((totalPoolAfter * 0.90 / selectedPoolAfter).toFixed(2));
  const estimatedPayout = estimatedOdds > 1 ? Number((stake * estimatedOdds).toFixed(2)) : stake;
  const bet: SpectatorBet = {
    id: `sbet_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    roomId,
    userId,
    targetPlayerId,
    targetUsername: target.username,
    prediction,
    stake,
    odds: estimatedOdds,
    potentialPayout: estimatedPayout,
    status: 'open',
    createdAt: Date.now(),
  };
  bettor.balance = Number((bettor.balance - stake).toFixed(2));
  store.users[userId] = bettor;
  store.spectatorBets.unshift(bet);
  addTransaction(userId, 'bet_escrow_locked', stake, roomId, `Dynamic spectator ${prediction} pool bet on ${target.username}; estimated odds ${estimatedOdds.toFixed(2)}.`);
  await saveUserProfileToFirestore(bettor);
  await saveStoreAndWait();
  broadcastUserUpdate(userId);
  res.json({ bet });
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
  res.locals.roomId = roomId;
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
  const playerLocation = req.query.location as string | undefined;

  try {
    const activeAgents = Object.values(store.agents).filter(agent => agent.status === 'Active').map(agent => {
      const { password, ...agentData } = agent;
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

    if (type === 'withdrawal') {
        const eligibilityError = withdrawalEligibilityError(player, requestAmount);
        if (eligibilityError) return res.status(400).json({ error: eligibilityError });
    }

    try {
        if (isMySqlRuntimePrimary()) {
          const selectedAgent = await cachedAgent(agentId);
          if (!selectedAgent) return res.status(404).json({ error: 'The selected agent does not exist.' });
          if (selectedAgent.status !== 'Active') return res.status(400).json({ error: 'The selected agent is not active.' });
          const newRequest: ManualTransactionRequest = {
            id: `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, userId: player.id, username: player.username,
            agentId, agentUsername: selectedAgent.username, managedBy: 'agent', amount: requestAmount,
            phone: playerPhone, provider, transactionType: type === 'withdrawal' ? 'withdraw' : 'deposit', status: 'pending', createdAt: Date.now(),
            ...(type === 'withdrawal' ? getWithdrawalQuote(player.id, requestAmount) : {}),
          };
          store.pendingManualTransactions.unshift(newRequest); await saveManualRequestToFirestore(newRequest); await saveStoreAndWait();
          return res.status(201).json({ success: true, message: 'Your request has been sent to the agent.', request: newRequest });
        }
        const agentDoc = await db.collection('agents').doc(agentId).get();
        if (!agentDoc.exists) {
            return res.status(404).json({ error: 'The selected agent does not exist.' });
        }
        const selectedAgent = agentDoc.data() as Agent;
        if (selectedAgent.status !== 'Active') {
            return res.status(400).json({ error: 'The selected agent is not active.' });
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
  } else if (mode === 'team') {
    colors = ['red', 'yellow', 'green', 'blue'];
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
    balance: u.balance || 0,
    inactivityTimer: isBotPlayer(u.id) ? undefined : PLAYER_INACTIVITY_SECONDS,
    inactivityStrikes: 0,
    teamFinishSkipPending: false,
    teamAssistUnlocked: false
  }));

  resetPlayerInactivity(players[0]);

  // Bot games use a fixed +$0.01 / -$0.02 result and never lock the selected stake.
  const usesBotEconomy = players.some(player => isBotPlayer(player.userId));
  let totalEscrow = 0;
  players.forEach(p => {
    if (!usesBotEconomy && !isBotPlayer(p.userId)) {
      const u = store.users[p.userId];
      if (u) {
        u.balance = Math.max(0, u.balance - bet);
        addTransaction(p.userId, 'bet_escrow_locked', bet, roomId, `Escrow stake for Ludo Match ${roomId}.`);
        broadcastUserUpdate(p.userId);
      }
    }
    if (!usesBotEconomy && !isBotPlayer(p.userId)) totalEscrow += bet;
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
  void Promise.all([persistLiveRoom(newRoom), persistRoomUserProfiles(newRoom)])
    .catch(error => console.error(`Failed to persist matched room ${roomId}:`, error));

  // Notify real players instantly over SSE with redirect payload
  players.forEach(p => {
    if (!isBotPlayer(p.userId)) {
      sendEventToUser(p.userId, 'matchmaker_success', { roomId: newRoom.id, room: newRoom });
      publishRealtimeEvent('user', p.userId, 'matchmaker_success', { roomId: newRoom.id, room: newRoom });
      broadcastToAll('matchmaker_seeking_cancelled', { senderId: p.userId });
    }
  });

  broadcastToAll('online_players_updated', {});

  return newRoom;
}

// Enter Matchmaking Queue (Search Live)
app.post('/api/rooms/matchmaking/enter-queue', async (req, res) => {
  try {
    const { userId, betAmount, capacity, gameMode } = req.body;
    const user = store.users[userId];
    if (!user) return res.status(404).json({ error: 'User not found' });

    cleanupMatchmakingQueues();

    const bet = parseFloat(betAmount);
    if (user.balance < bet) {
      return res.status(400).json({ error: 'Insufficient balance to match stake.' });
    }

    const mode = gameMode === 'team' ? 'team' : 'solo';
    const requestedCapacity = parseInt(capacity) || 2;
    const cap = mode === 'team' ? 4 : (requestedCapacity === 4 ? 4 : 2);
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

    // Queue admission must not fail when Firestore is briefly slow. The local
    // queue and SSE update happen immediately; shared Firestore sync retries in
    // the background for users connected through another hosting process.
    if (db) {
      syncMatchmakingRecordWithRetry(userId, {
        userId: userId,
        username: user.username,
        avatar: user.avatar,
        betAmount: bet,
        capacity: cap,
        gameMode: mode,
        status: 'WAITING_FOR_MATCH',
        timestamp: Date.now()
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

// Return the authoritative pending group for one Radar search. The dashboard
// must not infer accepted players from the general online-presence list because
// presence heartbeats can briefly disappear while the queue itself is active.
app.get('/api/rooms/matchmaking/status', async (req, res) => {
  const userId = String(req.query.userId || '');
  if (!userId) return res.status(400).json({ error: 'User ID is required.' });

  if (isMySqlRuntimePrimary()) await refreshMySqlMatchmakingQueues();
  cleanupMatchmakingQueues();
  const queueEntry = Object.entries(store.matchmakingQueues).find(([, ids]) => ids.includes(userId));
  if (!queueEntry) return res.json({ active: false, members: [], isOwner: false });

  const [queueKey, rawQueuedIds] = queueEntry;
  const [rawBet, rawCapacity, rawMode] = queueKey.split('_');
  const capacity = parseInt(rawCapacity) || 2;
  const orderedIds = sortMatchmakingIdsByJoinTime(rawQueuedIds).slice(0, capacity);
  const members = orderedIds.flatMap(id => {
    const player = store.users[id];
    if (!player) return [];
    return [{
      id: player.id,
      username: player.username,
      avatar: player.avatar,
      winCount: player.winCount || 0,
      lossCount: player.lossCount || 0,
      balance: player.balance,
      status: 'seeking',
      seekingJoinedAt: Number((player as any).seekingJoinedAt || 0),
      seekingDetails: {
        betAmount: parseFloat(rawBet) || 0,
        capacity,
        gameMode: rawMode === 'team' ? 'team' : 'solo',
      },
    }];
  });

  res.json({ active: true, members, isOwner: orderedIds[0] === userId });
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

  void deleteSharedMatchmakingRecords(userId, opponentId)
    .catch(error => console.error('Failed to delete shared matchmaking records for matched users:', error));

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
      winCount: 0,
      lossCount: 0,
      balance: 0
    });
  }

  const room = startMatchedRoom(matchedList, bet, cap, mode);
  res.json({ success: true, roomId: room.id });
});

function sortMatchmakingIdsByJoinTime(ids: string[]): string[] {
  return [...new Set(ids)].sort((leftId, rightId) => {
    const leftTime = Number((store.users[leftId] as any)?.seekingJoinedAt || Number.MAX_SAFE_INTEGER);
    const rightTime = Number((store.users[rightId] as any)?.seekingJoinedAt || Number.MAX_SAFE_INTEGER);
    return leftTime - rightTime || ids.indexOf(leftId) - ids.indexOf(rightId);
  });
}

// Let the original 4-player Search Live seeker start early with 2 or 3 real
// players. An incomplete 2v2 queue becomes Solo because teams cannot be
// balanced until all four seats are occupied.
app.post('/api/rooms/matchmaking/start-partial', async (req, res) => {
  const { userId } = req.body;
  if (!userId || !store.users[userId]) return res.status(404).json({ error: 'User not found.' });

  // A request can land on a different production process from the one that
  // accepted the player. Refresh the shared queue before authorizing its owner.
  if (isMySqlRuntimePrimary()) await refreshMySqlMatchmakingQueues();
  cleanupMatchmakingQueues();
  const queueEntry = Object.entries(store.matchmakingQueues).find(([, ids]) => ids.includes(userId));
  if (!queueEntry) return res.status(409).json({ error: 'Your Search Live queue is no longer active.' });

  const [queueKey, rawQueuedIds] = queueEntry;
  const queuedIds = sortMatchmakingIdsByJoinTime(rawQueuedIds);
  const [rawBet, rawCapacity, rawMode] = queueKey.split('_');
  const requestedCapacity = parseInt(rawCapacity) || 2;
  if (requestedCapacity !== 4) return res.status(400).json({ error: 'Early Start is only available for a 4-player search.' });
  if (queuedIds[0] !== userId) return res.status(403).json({ error: 'Only the player who started this search can start the game early.' });

  const participantIds = queuedIds.filter(id => Boolean(store.users[id])).slice(0, 4);
  if (participantIds.length < 2) return res.status(409).json({ error: 'At least two players are required to start.' });

  const bet = parseFloat(rawBet) || 0;
  const participants = participantIds.map(id => store.users[id]);
  if (participants.some(player => player.balance < bet)) {
    return res.status(409).json({ error: 'A player no longer has enough balance for this stake.' });
  }

  store.matchmakingQueues[queueKey] = queuedIds.filter(id => !participantIds.includes(id));
  participantIds.forEach(id => delete (store.users[id] as any).seekingJoinedAt);
  await deleteSharedMatchmakingRecords(...participantIds).catch(error => {
    console.error('Failed to delete shared matchmaking records for early start:', error);
  });

  const finalMode: 'solo' | 'team' = rawMode === 'team' && participants.length === 4 ? 'team' : 'solo';
  const room = startMatchedRoom(participants, bet, participants.length, finalMode);
  saveStore();
  res.json({ success: true, roomId: room.id, room, convertedToSolo: rawMode === 'team' && finalMode === 'solo' });
});

// The original seeker may remove an accepted player before the match starts.
app.post('/api/rooms/matchmaking/remove-player', async (req, res) => {
  const { userId, targetUserId } = req.body;
  if (!userId || !targetUserId || userId === targetUserId) {
    return res.status(400).json({ error: 'A valid player must be selected.' });
  }

  // Keep removal correct when the seeker and this API request are handled by
  // separate production processes.
  if (isMySqlRuntimePrimary()) await refreshMySqlMatchmakingQueues();
  cleanupMatchmakingQueues();
  const queueEntry = Object.entries(store.matchmakingQueues).find(([, ids]) => ids.includes(userId));
  if (!queueEntry) return res.status(409).json({ error: 'Your Search Live queue is no longer active.' });

  const [queueKey, rawQueuedIds] = queueEntry;
  const queuedIds = sortMatchmakingIdsByJoinTime(rawQueuedIds);
  if (queuedIds[0] !== userId) return res.status(403).json({ error: 'Only the original seeker can remove players.' });
  if (!queuedIds.includes(targetUserId)) return res.status(404).json({ error: 'That player is not in your queue.' });

  store.matchmakingQueues[queueKey] = rawQueuedIds.filter(id => id !== targetUserId);
  if (store.users[targetUserId]) delete (store.users[targetUserId] as any).seekingJoinedAt;
  await deleteSharedMatchmakingRecords(targetUserId).catch(error => {
    console.error('Failed to delete removed matchmaking player record:', error);
  });
  saveStore();
  sendEventToUser(targetUserId, 'matchmaker_removed', {
    message: 'The seeker removed you from this Search Live match.'
  });
  broadcastToAll('matchmaker_seeking_cancelled', { senderId: targetUserId });
  broadcastToAll('online_players_updated', {});
  res.json({ success: true });
});

// Leave Matchmaking Queue
app.post('/api/rooms/matchmaking/leave', async (req, res) => {
  const { userId } = req.body;
  if (userId) {
    const queueEntry = Object.entries(store.matchmakingQueues).find(([, ids]) => ids.includes(userId));
    let leavingIds = [userId];
    if (queueEntry) {
      const [queueKey, rawQueuedIds] = queueEntry;
      const orderedIds = sortMatchmakingIdsByJoinTime(rawQueuedIds);
      const requestedCapacity = parseInt(queueKey.split('_')[1]) || 2;
      const currentGroupIds = orderedIds.slice(0, requestedCapacity);
      // Cancelling by the original seeker closes this pending group. A joined
      // player cancelling removes only that player.
      if (currentGroupIds[0] === userId) leavingIds = currentGroupIds;
      store.matchmakingQueues[queueKey] = rawQueuedIds.filter(id => !leavingIds.includes(id));
    } else {
      for (const qKey of Object.keys(store.matchmakingQueues)) {
        store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter(id => id !== userId);
      }
    }
    leavingIds.forEach(id => {
      if (store.users[id]) delete (store.users[id] as any).seekingJoinedAt;
      broadcastToAll('matchmaker_seeking_cancelled', { senderId: id });
      if (id !== userId) {
        sendEventToUser(id, 'matchmaker_removed', { message: 'The seeker cancelled this Search Live match.' });
      }
    });
    saveStore();
    await deleteSharedMatchmakingRecords(...leavingIds)
      .catch(error => console.error('Failed to delete shared matchmaking records on leave:', error));
    broadcastToAll('online_players_updated', {});
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
  publishRealtimeEvent('user', targetId, 'voice_signal', { roomId, senderId, signal });

  res.json({ success: true });
});

// Challenge / Invite a player (PUBG-style)
app.post('/api/rooms/challenge/invite', async (req, res) => {
  const { senderId, receiverId, betAmount, capacity, gameMode } = req.body;
  let sender = store.users[senderId];
  if (!sender && isMySqlConfigured()) sender = await loadMySqlRuntimeUser(senderId);
  if (!sender) return res.status(404).json({ error: 'Sender user not found.' });
  let receiver = store.users[receiverId];
  if (!receiver && isMySqlConfigured()) receiver = await loadMySqlRuntimeUser(receiverId);
  if (!receiver) return res.status(409).json({ error: 'Ciyaaryahankan hadda online ma aha.' });
  store.users[senderId] = sender;
  store.users[receiverId] = receiver;

  // Use the same availability source as the Home Online list. A fresh Home
  // presence is authoritative and must not be blocked by a stale room record.
  let receiverIsFreshlyHome = false;
  try {
    if (isMySqlConfigured()) {
      const onlineUsers = await listMySqlOnlineUsers();
      receiverIsFreshlyHome = onlineUsers.some(user =>
        user.id === receiverId
        && user.profile?.presenceLocation === 'home'
        && user.profile?.isOfflinePreference !== true
      );
    } else if (db) {
      const presenceDoc = await db.collection('userPresence').doc(receiverId).get();
      const presence = presenceDoc.data();
      receiverIsFreshlyHome = Boolean(
        presenceDoc.exists
        && Number(presence?.lastSeenAt || 0) >= Date.now() - 45_000
        && presence?.profile?.presenceLocation === 'home'
        && presence?.profile?.isOfflinePreference !== true
      );
    }
  } catch (error) {
    console.error(`Challenge presence lookup failed for ${receiverId}:`, error);
  }
  if (!receiverIsFreshlyHome) {
    return res.status(409).json({ error: 'Ciyaaryahankan hadda Home-ka online kama aha.' });
  }

  const bet = parseFloat(betAmount) || 0;
  if (sender.balance < bet) {
    return res.status(400).json({ error: `Insufficient wallet balance for $${bet} bet.` });
  }

  const selectedMode = gameMode === 'team' ? 'team' : 'solo';
  // A direct solo challenge is always a head-to-head match. Honouring a stale
  // dashboard capacity here left accepted challenges waiting for extra players.
  const selectedCapacity = selectedMode === 'team' ? 4 : 2;

  // If receiver is a featured/simulated player, start match directly
  if (receiverId.startsWith('sim_') || receiverId.startsWith('bot_')) {
    const receiverUser = {
      id: receiverId,
      username: receiverId.includes('1') ? 'Kaptan_Ludo 👑' : receiverId.includes('2') ? 'SomaliGamer_252' : receiverId.includes('3') ? 'Pro_Dice_Master' : 'Speedy_Runner',
      avatar: receiverId.includes('1') ? '🦁' : receiverId.includes('2') ? '⚡' : receiverId.includes('3') ? '🦊' : '🐉',
      winCount: 0,
      lossCount: 0,
      balance: 0
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
        winCount: 0,
        lossCount: 0,
        balance: 0
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
          winCount: 0,
          lossCount: 0,
          balance: 0
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
  (newRoom as any).invitedUserId = receiverId;

  store.rooms[roomId] = newRoom;

  // Remove both players from any matchmaking queues they might be in.
  for (const qKey of Object.keys(store.matchmakingQueues)) {
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter(id => id !== senderId && id !== receiverId);
  }
  void deleteSharedMatchmakingRecords(senderId, receiverId)
    .catch(error => console.error('Failed to delete shared matchmaking records on challenge:', error));
  broadcastToAll('matchmaker_seeking_cancelled', { senderId });
  broadcastToAll('matchmaker_seeking_cancelled', { senderId: receiverId });

  saveStore();
  try {
    await persistLiveRoom(newRoom);
  } catch (error) {
    delete store.rooms[roomId];
    console.error(`Failed to persist challenge room ${roomId}:`, error);
    return res.status(503).json({ error: 'The challenge could not be synchronized. Please try again.' });
  }

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
  publishRealtimeEvent('user', receiverId, 'game_invite', {
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
app.post('/api/rooms/challenge/accept', async (req, res) => {
  const { userId, roomId } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  let room = store.rooms[roomId];
  if (!room && isMySqlConfigured()) {
    room = await loadMySqlGameRoom(roomId) || undefined;
    if (room) store.rooms[room.id] = room;
  }
  if (!room) return res.status(404).json({ error: 'Challenge lobby no longer exists.' });

  if (room.players.length >= (room.capacity || 2)) {
    return res.status(400).json({ error: 'Room is already full.' });
  }

  if (user.balance < room.betAmount) {
    return res.status(400).json({ error: `Insufficient wallet balance to accept this $${room.betAmount} match.` });
  }

  // Accepting one challenge automatically declines every other pending invite
  // for this receiver, so all remaining cards retract on every device.
  const activeChallengeRooms = isMySqlConfigured()
    ? await listMySqlActiveGameRooms().catch(() => Object.values(store.rooms))
    : Object.values(store.rooms);
  const otherInviteRooms = activeChallengeRooms.filter(otherRoom =>
    otherRoom.id !== roomId
    && otherRoom.status === 'waiting'
    && String((otherRoom as any).invitedUserId || '') === userId
  );
  await Promise.all(otherInviteRooms.map(async otherRoom => {
    const otherHostId = otherRoom.players?.find((player: LudoPlayer) => player.isHost)?.userId;
    if (otherHostId) {
      const declinedPayload = { receiverName: user.username, reason: 'accepted_another', roomId: otherRoom.id };
      sendEventToUser(otherHostId, 'game_invite_declined', declinedPayload);
      publishRealtimeEvent('user', otherHostId, 'game_invite_declined', declinedPayload);
    }
    const cancelledPayload = { roomId: otherRoom.id, reason: 'accepted_another' };
    sendEventToUser(userId, 'game_invite_cancelled', cancelledPayload);
    publishRealtimeEvent('user', userId, 'game_invite_cancelled', cancelledPayload);
    delete store.rooms[otherRoom.id];
    if (isMySqlConfigured()) await deleteMySqlGameRoom(otherRoom.id);
  }));

  const colors: PlayerColor[] = room.gameMode === 'team'
    ? ['red', 'yellow', 'green', 'blue']
    : ['red', 'green', 'yellow', 'blue'];
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

  const requiredPlayers = room.capacity || 2;
  if (room.players.length === requiredPlayers) {
    const realPlayers = room.players.filter(player => !isBotPlayer(player.userId));
    const insufficientPlayer = realPlayers.find(player => Number(store.users[player.userId]?.balance || 0) < room.betAmount);
    if (insufficientPlayer) {
      room.players = room.players.filter(player => player.userId !== user.id);
      return res.status(400).json({ error: `${insufficientPlayer.username} no longer has enough balance for this match.` });
    }

    if (room.players.length === 2 && room.gameMode === 'solo') {
      const host = room.players.find(player => player.isHost);
      const guest = room.players.find(player => !player.isHost);
      if (host) host.color = 'red';
      if (guest) guest.color = 'yellow';
    }

    let totalEscrow = 0;
    for (const player of realPlayers) {
      const profile = store.users[player.userId]!;
      profile.balance = Number((profile.balance - room.betAmount).toFixed(2));
      addTransaction(player.userId, 'bet_escrow_locked', room.betAmount, room.id, `Escrow lock for Match ${room.id}`);
      totalEscrow += room.betAmount;
      broadcastUserUpdate(player.userId);
    }

    room.status = 'playing';
    room.gameState.tokens = room.players.flatMap(player => createInitialTokens(player.userId, player.color));
    room.gameState.escrowBalance = Number(totalEscrow.toFixed(2));
    room.gameState.turn = 0;
    room.gameState.turnTimer = 30;
    room.players.forEach(player => {
      player.teamFinishSkipPending = false;
      player.teamAssistUnlocked = false;
      player.inactivityTimer = PLAYER_INACTIVITY_SECONDS;
      player.inactivityDeadline = undefined;
      player.lastInactivityWarningMinute = undefined;
      player.inactivityStrikes = 0;
      player.lastInactivityStrikeAt = undefined;
    });
    resetPlayerInactivity(room.players[0]);
    touchRoom(room);
  }
  addLog(room, `⚔️ ${user.username} accepted the challenge and joined the room.`);
  saveStore();
  await Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)]);
  broadcastToRoom(room.id, 'game_update', room);

  const hostId = room.players.find(p => p.isHost)?.userId;
  if (hostId) {
    sendEventToUser(hostId, 'game_invite_accepted', { roomId, room });
    publishRealtimeEvent('user', hostId, 'game_invite_accepted', { roomId, room });
  }

  sendEventToUser(user.id, 'matchmaker_success', { roomId, room });
  publishRealtimeEvent('user', user.id, 'matchmaker_success', { roomId, room });
  res.json({ success: true, roomId, room });
});

// Decline a real game challenge
app.post('/api/rooms/challenge/decline', async (req, res) => {
  const { userId, roomId, reason } = req.body;
  let user = store.users[userId];
  if (!user && isMySqlConfigured()) user = await loadMySqlRuntimeUser(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let room = store.rooms[roomId];
  if (!room && isMySqlConfigured()) room = await loadMySqlGameRoom(roomId) || undefined;
  if (room) {
    const hostId = room.players.find(p => p.isHost)?.userId;
    if (hostId) {
      const payload = { receiverName: user.username, roomId, reason: reason || 'declined' };
      sendEventToUser(hostId, 'game_invite_declined', payload);
      publishRealtimeEvent('user', hostId, 'game_invite_declined', payload);
    }
    delete store.rooms[roomId];
    await saveStoreAndWait();
    if (isMySqlConfigured()) await deleteMySqlGameRoom(roomId);
  }

  res.json({ success: true });
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
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status !== 'waiting') return res.status(400).json({ error: 'Bots can only be added before the match starts.' });
  const requester = room.players.find(player => player.userId === userId);
  if (!requester?.isHost) return res.status(403).json({ error: 'Only the host can add a bot.' });
  if (room.players.length >= (room.capacity || 2)) {
    return res.status(400).json({ error: 'Room is already full.' });
  }

  const botNames = ['DeepBlue', 'AlphaGo', 'ChessMaster', 'LudoAI', 'LudoKing', 'Siri', 'Alexa'];
  const name = botNames[Math.floor(Math.random() * botNames.length)] + `_${Math.floor(Math.random() * 100)}`;
  const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  const colors: PlayerColor[] = room.gameMode === 'team'
    ? ['red', 'yellow', 'green', 'blue']
    : ['red', 'green', 'yellow', 'blue'];
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

// Choose an open partnership team or atomically swap two occupied team seats.
app.post('/api/rooms/change-team', (req, res) => {
  const { userId, roomId, playerId, targetTeam, swapWithUserId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status !== 'waiting' || room.gameMode !== 'team') {
    return res.status(400).json({ error: 'Teams can only be changed in a waiting partnership lobby.' });
  }

  const requester = room.players.find(player => player.userId === userId);
  const movingPlayer = room.players.find(player => player.userId === (playerId || userId));
  if (!requester || !movingPlayer) return res.status(404).json({ error: 'Player not found in this lobby.' });
  if (movingPlayer.userId !== requester.userId && !requester.isHost) {
    return res.status(403).json({ error: 'Only the host can move another player.' });
  }

  const targetColors: PlayerColor[] = targetTeam === 'A' ? ['red', 'yellow'] : targetTeam === 'B' ? ['green', 'blue'] : [];
  if (!targetColors.length) return res.status(400).json({ error: 'Invalid team selected.' });
  if (targetColors.includes(movingPlayer.color)) return res.json(room);

  const occupiedTargetColors = room.players.filter(player => player.userId !== movingPlayer.userId).map(player => player.color);
  const openColor = targetColors.find(color => !occupiedTargetColors.includes(color));

  if (openColor) {
    movingPlayer.color = openColor;
    if (!movingPlayer.isHost && !isBotPlayer(movingPlayer.userId)) movingPlayer.isReady = false;
    addLog(room, `${movingPlayer.username} moved to Team ${targetTeam}.`);
  } else {
    if (!requester.isHost || !swapWithUserId) {
      return res.status(409).json({ error: `Team ${targetTeam} is full. The host must select one player from each team to swap.` });
    }
    const swapPlayer = room.players.find(player => player.userId === swapWithUserId);
    if (!swapPlayer || !targetColors.includes(swapPlayer.color)) {
      return res.status(400).json({ error: 'Select a player from the destination team to swap with.' });
    }
    const oldColor = movingPlayer.color;
    movingPlayer.color = swapPlayer.color;
    swapPlayer.color = oldColor;
    [movingPlayer, swapPlayer].forEach(player => {
      if (!player.isHost && !isBotPlayer(player.userId)) player.isReady = false;
    });
    addLog(room, `${movingPlayer.username} and ${swapPlayer.username} swapped partnership teams.`);
  }

  saveStore();
  broadcastToRoom(room.id, 'game_update', room);
  res.json(room);
});

// Start Match (Host only)
app.post('/api/rooms/start', async (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const p = room.players.find(p => p.userId === userId);
  if (!p || !p.isHost) {
    return res.status(403).json({ error: 'Only the host can start the match.' });
  }

  const requiredPlayers = room.capacity || 2;
  if (room.players.length !== requiredPlayers) {
    return res.status(400).json({ error: `Qolkan wuxuu u baahan yahay ${requiredPlayers} ciyaartoy ka hor inta aan ciyaarta la bilaabin.` });
  }

  if (room.players.some(player => !player.isReady)) {
    return res.status(400).json({ error: 'Dhammaan ciyaartoydu waa inay Ready noqdaan ka hor bilowga.' });
  }

  // Ensure all players are ready and assigned distinct colors
  let colorsToAssign: PlayerColor[];
  if (room.players.length === 2 && room.gameMode === 'solo') {
    // Assuming the intent for 2 players is host=red, guest=yellow (diagonal)
    colorsToAssign = ['red', 'yellow']; 

    const host = room.players.find(p => p.isHost);
    const guest = room.players.find(p => !p.isHost);

    if (host) host.color = 'red';
    if (guest) guest.color = 'yellow';

  } else if (room.gameMode === 'team') {
    colorsToAssign = ['red', 'yellow', 'green', 'blue'];
    const colorsInUse = room.players.map(player => player.color);
    const teamACount = room.players.filter(player => getTeamColors(player.color).includes('red')).length;
    const teamBCount = room.players.length - teamACount;
    if (new Set(colorsInUse).size !== 4 || teamACount !== 2 || teamBCount !== 2) {
      return res.status(400).json({ error: 'Partnership-ku waa inuu yeeshaa laba ciyaaryahan Team A iyo laba ciyaaryahan Team B.' });
    }
  } else {
    // If there are more than 2 players, use the full color set
    colorsToAssign = ['red', 'green', 'yellow', 'blue'];
    room.players.forEach((pl, idx) => {
      pl.color = colorsToAssign[idx] || 'red'; // Assign initial colors for >2 players
    });
  }

  room.players.forEach((pl, idx) => {
    // Ensure pl.color is only assigned once based on the determined colorsToAssign,
    // or if already assigned (for 2-player case), just keep it.
    // This assumes the `pl.color` set in the if block (for host/guest) should take precedence.
    if (!pl.color) { // Only assign if not already assigned
      pl.color = colorsToAssign[idx] || 'red';
    }
  });

  // Deduct stakes and lock escrow
  const bet = room.betAmount;
  const usesBotEconomy = isBotEconomyRoom(room);
  let success = true;

  room.players.forEach(pl => {
    if (!usesBotEconomy && !isBotPlayer(pl.userId)) {
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
    if (!usesBotEconomy && !isBotPlayer(pl.userId)) {
      const user = store.users[pl.userId]!;
      user.balance -= bet;
      addTransaction(pl.userId, 'bet_escrow_locked', bet, room.id, `Escrow lock for Match ${room.id}`);
      broadcastUserUpdate(pl.userId);
    }
    if (!usesBotEconomy && !isBotPlayer(pl.userId)) totalEscrow += bet;
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
  room.players.forEach(player => {
    player.teamFinishSkipPending = false;
    player.teamAssistUnlocked = false;
    if (!isBotPlayer(player.userId)) {
      player.inactivityTimer = PLAYER_INACTIVITY_SECONDS;
      player.inactivityDeadline = undefined;
      player.lastInactivityWarningMinute = undefined;
      player.inactivityStrikes = 0;
      player.lastInactivityStrikeAt = undefined;
    }
  });
  resetPlayerInactivity(room.players[0]);
  touchRoom(room);
  addLog(room, `⚔️ Ciyaartu waa ay bilaabatay! Ciyaartoyda: ${room.players.length}. Bet: $${bet}. Escrow Locked: $${totalEscrow}`);

  saveStore();
  await Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)]);
  broadcastToRoom(room.id, 'game_update', room);

  res.json(room);
});

// Dice Roll Action
app.post('/api/rooms/roll-dice', async (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status !== 'playing') return res.status(400).json({ error: 'Game is not in playing state.' });

  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];

  if (!activePlayer || activePlayer.userId !== userId) {
    return res.status(403).json({ error: "It is not your turn to roll!" });
  }

  if (gs.hasRolled) {
    return res.status(400).json({ error: "You have already rolled the dice!" });
  }

  resetPlayerInactivity(activePlayer);
  gs.turnTimer = 30;

  // Generate Roll
  const d = Math.floor(Math.random() * 6) + 1;
  gs.diceRoll = d;
  gs.lastDiceRoll = d;
  gs.hasRolled = true;
  touchRoom(room);

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
    await persistLiveRoom(room);
    broadcastToRoom(room.id, 'game_update', room);
    executeBotTurnIfActive(room);

    return res.json(room);
  }

  // Analyze if there are valid moves
  const playableColor = getPlayableColor(room, activePlayer);
  const playerTokens = gs.tokens.filter(t => t.color === playableColor);
  const validTokens = playerTokens.filter(t => isMoveValid(t, d));
  const tokensOnBoard = playerTokens.filter(token => token.position >= 0 && token.position < 56);

  // With exactly one token on the route there is no meaningful choice, so
  // move it automatically. A six always remains manual because the player may
  // choose between moving that token and releasing another token from base.
  // Releasing a second token naturally disables this rule on later rolls.
  const soleBoardToken = d !== 6 && tokensOnBoard.length === 1
    ? validTokens.find(token => token.id === tokensOnBoard[0].id)
    : undefined;

  if (soleBoardToken) {
    saveStore();
    await persistLiveRoom(room);
    // First publish and return the untouched roll. Both players then see the
    // same tumble, hear the dice, and read its result before the token moves.
    broadcastToRoom(room.id, 'game_update', room);
    res.json(room);

    setTimeout(async () => {
      try {
        const currentRoom = store.rooms[roomId];
        if (!currentRoom || currentRoom.status !== 'playing') return;
        const currentPlayer = currentRoom.players[currentRoom.gameState.turn];
        const currentToken = currentRoom.gameState.tokens.find(token => token.id === soleBoardToken.id);
        if (
          currentPlayer?.userId !== activePlayer.userId
          || !currentRoom.gameState.hasRolled
          || currentRoom.gameState.diceRoll !== d
          || !currentToken
          || !isMoveValid(currentToken, d)
        ) return;
        addLog(currentRoom, `${activePlayer.username}'s only active token moved automatically with roll ${d}.`);
        moveTokenLogic(currentRoom, currentToken.id, d);
        saveStore();
        await persistLiveRoom(currentRoom);
        void persistRoomUserProfiles(currentRoom).catch(error => console.error(`Profile sync failed after automatic move in room ${currentRoom.id}:`, error));
        broadcastToRoom(currentRoom.id, 'game_update', currentRoom);
        executeBotTurnIfActive(currentRoom);
      } catch (error) {
        console.error(`Failed to move the sole token after roll animation in room ${roomId}:`, error);
      }
    }, 1100);
    return;
  }

  if (validTokens.length === 0) {
    // No moves possible, turn ends automatically.
    // FIRST, broadcast the result of the roll so all clients can see the animation.
    addLog(room, `${activePlayer.username} has no valid moves with roll ${d}. Turn passes.`);
    saveStore();
    await persistLiveRoom(room);
    broadcastToRoom(room.id, 'game_update', room);
    res.json(room); // Respond to the roller immediately.

    // SECOND, after a delay to allow for the animation, advance the turn and broadcast again.
    setTimeout(async () => {
      try {
        // Re-fetch the room to ensure we're acting on the latest state
        const currentRoom = store.rooms[roomId];
        if (currentRoom && currentRoom.status === 'playing') {
          advanceTurn(currentRoom);
          saveStore();
          await persistLiveRoom(currentRoom);
          broadcastToRoom(currentRoom.id, 'game_update', currentRoom);
          executeBotTurnIfActive(currentRoom);
        }
      } catch (error) {
        console.error(`Failed to advance no-move turn for room ${roomId}:`, error);
      }
    }, 1500); // 1.5-second delay for clients to see the roll animation

  } else {
    // There are valid moves, so we just update the state and wait for the player's move.
    saveStore();
    await persistLiveRoom(room);
    broadcastToRoom(room.id, 'game_update', room);
    res.json(room);
  }
});
// Token Move Action
app.post('/api/rooms/move-token', async (req, res) => {
  const { userId, roomId, tokenId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status !== 'playing') return res.status(400).json({ error: 'Game is not playing.' });

  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];

  if (!activePlayer || activePlayer.userId !== userId) {
    return res.status(403).json({ error: "It is not your turn!" });
  }

  if (!gs.hasRolled || gs.diceRoll === null) {
    return res.status(400).json({ error: "You must roll the dice first!" });
  }

  const token = gs.tokens.find(t => t.id === tokenId);
  const playableColor = getPlayableColor(room, activePlayer);
  if (!token || token.color !== playableColor) {
    return res.status(400).json({ error: "Invalid token selected." });
  }

  if (!isMoveValid(token, gs.diceRoll)) {
    return res.status(400).json({ error: "This token cannot make a valid move with the current roll." });
  }

  resetPlayerInactivity(activePlayer);
  gs.turnTimer = 30;

  // Execute Move
  moveTokenLogic(room, tokenId, gs.diceRoll);
  saveStore();
  await persistLiveRoom(room);
  void persistRoomUserProfiles(room).catch(error => console.error(`Profile sync failed after move in room ${room.id}:`, error));
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

  if (room.status !== 'waiting') {
    return res.status(409).json({ error: 'Players can only be accepted while the room is waiting.' });
  }

  if (room.players.length >= (room.capacity || 2)) {
    return res.status(409).json({ error: 'The room is already full.' });
  }

  if (!room.pendingPlayers) room.pendingPlayers = [];
  const idx = room.pendingPlayers.findIndex(p => p.userId === challengerId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Challenger not found in pending list.' });
  }

  const challenger = room.pendingPlayers.splice(idx, 1)[0];
  
  let assignedColor: PlayerColor;
  if (room.capacity === 2 && room.gameMode === 'solo') {
    // For 2-player solo games, if host is 'red', the joiner (challenger) should be 'yellow'.
    assignedColor = 'yellow'; // Align with red/yellow diagonal for 2-player solo
  } else {
    // For other modes/capacities, assign the first available color.
    const colors: PlayerColor[] = room.gameMode === 'team'
      ? ['red', 'yellow', 'green', 'blue']
      : ['red', 'green', 'yellow', 'blue'];
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

const playerNudgeCooldowns = new Map<string, number>();

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

  if (room.status !== 'playing') return res.status(400).json({ error: 'The game is not active.' });
  if (activePlayer.userId === userId) return res.status(400).json({ error: 'You cannot nudge yourself.' });
  if (isBotPlayer(activePlayer.userId)) return res.status(400).json({ error: 'Bots do not need reminders.' });

  const now = Date.now();
  if (now - Number(gs.lastActivity || 0) < 7000) {
    return res.status(429).json({ error: 'Please wait seven seconds before reminding this player.' });
  }
  const cooldownKey = `${room.id}:${userId}:${activePlayer.userId}`;
  if (now - Number(playerNudgeCooldowns.get(cooldownKey) || 0) < 7000) {
    return res.status(429).json({ error: 'Please wait before sending another reminder.' });
  }
  playerNudgeCooldowns.set(cooldownKey, now);

  addLog(room, `⏰ ${p.username} nudged ${activePlayer.username} to make a move!`);
  
  // Send nudge event to the active player's screen
  const payload = { nudgedBy: p.username, roomId: room.id, sentAt: now };
  sendEventToUser(activePlayer.userId, 'player_nudged', payload);
  publishRealtimeEvent('user', activePlayer.userId, 'player_nudged', payload);
  
  // Broadcast game update with updated logs
  broadcastToRoom(room.id, 'game_update', room);

  res.json(room);
});

const reactionCooldowns = new Map<string, number>();
const ALLOWED_GAME_REACTIONS = new Set(['laugh', 'love', 'shock', 'angry', 'clap', 'fire', 'hammer']);

// Interactive targeted reaction broadcast
app.post('/api/rooms/emoji', (req, res) => {
  const { userId, roomId, reactionId, targetId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const p = room.players.find(pl => pl.userId === userId);
  if (!p) return res.status(403).json({ error: 'You are not in this room.' });
  if (!ALLOWED_GAME_REACTIONS.has(String(reactionId))) return res.status(400).json({ error: 'Invalid reaction.' });
  const target = room.players.find(pl => pl.userId === targetId && pl.status !== 'left');
  if (!target || target.userId === userId) return res.status(400).json({ error: 'Choose another active player.' });

  const cooldownKey = `${roomId}:${userId}`;
  const now = Date.now();
  if (now - Number(reactionCooldowns.get(cooldownKey) || 0) < 800) {
    return res.status(429).json({ error: 'Wait a moment before sending another reaction.' });
  }
  reactionCooldowns.set(cooldownKey, now);

  const payload = {
    id: crypto.randomUUID(), senderId: userId, senderName: p.username, senderColor: p.color,
    targetId: target.userId, targetName: target.username, reactionId: String(reactionId),
  };

  room.players.forEach(pl => {
    sendEventToUser(pl.userId, 'player_emoji', payload);
    publishRealtimeEvent('user', pl.userId, 'player_emoji', payload);
  });

  res.json({ success: true });
});

// Leave / Forfeit Game Room
app.post('/api/rooms/leave', async (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const p = room.players.find(pl => pl.userId === userId);
  if (!p) {
    const pendingIndex = room.pendingPlayers?.findIndex(player => player.userId === userId) ?? -1;
    if (room.status === 'waiting' && pendingIndex >= 0) {
      const [pendingPlayer] = room.pendingPlayers!.splice(pendingIndex, 1);
      addLog(room, `${pendingPlayer.username} cancelled their request to join the room.`);
      saveStore();
      broadcastToRoom(room.id, 'game_update', room);
      return res.json({ success: true, room });
    }
    return res.status(404).json({ error: 'Player not in room' });
  }

  addLog(room, `${p.username} has left the game.`);

  if (room.status === 'waiting') {
    const invitedUserId = String((room as any).invitedUserId || '');
    if (p.isHost && invitedUserId) {
      const payload = { roomId, reason: 'challenger_left' };
      sendEventToUser(invitedUserId, 'game_invite_cancelled', payload);
      publishRealtimeEvent('user', invitedUserId, 'game_invite_cancelled', payload);
    }
    room.players = room.players.filter(pl => pl.userId !== userId);
    if (room.players.length === 0) {
      delete store.rooms[roomId];
      if (isMySqlConfigured()) await deleteMySqlGameRoom(roomId);
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
    const leavingTurn = room.gameState.turn;
    p.status = 'left';
    p.inactivityDeadline = undefined;
    p.inactivityTimer = 0;

    const leavingPlayerProfile = store.users[userId];
    if (leavingPlayerProfile && !isBotPlayer(userId)) {
      leavingPlayerProfile.lossCount = (leavingPlayerProfile.lossCount || 0) + 1;
      broadcastUserUpdate(userId);
    }

    if (room.gameMode === 'team') {
      completeTeamForfeit(room, p, 'forfeit');
      touchRoom(room);
      saveStore();
      await Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)]);
      broadcastToRoom(room.id, 'game_update', room);
      return res.json({ success: true, room });
    }

    const activePlayers = room.players.filter(player => player.status !== 'left');

    if (activePlayers.length > 1) {
      // Solo 3/4-player matches continue after one player leaves. Keep the
      // departed player in the room as an inactive seat for board/history UI.
      if (room.players[leavingTurn]?.userId === userId) {
        advanceTurn(room);
      }
      addLog(room, `⏭️ ${p.username} is inactive. ${activePlayers.length} players remain and the game continues.`);
      saveStore();
      broadcastToRoom(room.id, 'game_update', room);
      return res.json({ success: true, room, gameContinues: true });
    }

    if (activePlayers.length === 1) {
      const opponent = activePlayers[0];
      room.status = 'completed';
      room.gameState.winnerId = opponent.userId;
      room.gameState.completionReason = 'forfeit';

      const totalPayout = room.gameState.escrowBalance;
      addLog(room, `🏆 ${p.username} has left the game. ${opponent.username} wins by forfeit and takes the pot of $${totalPayout.toFixed(2)}!`);

      if (room.tournamentDetails) {
        handleTournamentMatchWin(room.tournamentDetails.tournamentId, room.tournamentDetails.matchId, opponent.userId);
        room.gameState.escrowBalance = 0;
      } else if (room.betAmount > 0 && totalPayout > 0) {
        const winnerProfile = store.users[opponent.userId];
        if (winnerProfile && !isBotPlayer(winnerProfile.id)) {
          const effectiveRakePercentage = effectiveRakeForUsers([winnerProfile.id]);
          const rakeAmount = Number((totalPayout * effectiveRakePercentage).toFixed(2));
          const payoutAmount = Number((totalPayout - rakeAmount).toFixed(2));

          room.gameState.rakeAmount = rakeAmount;
          room.gameState.winnerPayout = payoutAmount;
          room.gameState.winnerPayouts = { [opponent.userId]: payoutAmount };
          if (!hasMatchPayout(opponent.userId, room.id)) {
            winnerProfile.balance += payoutAmount;
            winnerProfile.winCount = (winnerProfile.winCount || 0) + 1;
            addTransaction(opponent.userId, 'win_payout', payoutAmount, room.id, `Win by opponent forfeit (Rake: $${rakeAmount.toFixed(2)}).`);
          }
          broadcastUserUpdate(opponent.userId);

          recordHouseRevenue('forfeit_rake', rakeAmount, room.id, `Rake from manual forfeit match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (totalPayout > 0) {
          room.gameState.winnerPayout = 0;
          room.gameState.rakeAmount = totalPayout;
          recordHouseRevenue('bot_result', totalPayout, room.id, `Real-player stakes retained after a bot won manual forfeit match ${room.id}.`);
        }
      }
      room.gameState.escrowBalance = 0;
      touchRoom(room);
      saveStore();
      await Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)]);

      // Broadcast the final game state to everyone in the room
      broadcastToRoom(room.id, 'game_update', room);
      res.json({ success: true, room }); // Respond with the final room state

    } else {
      room.status = 'completed';
      room.gameState.winnerId = null;
      room.gameState.completionReason = 'forfeit';
      room.gameState.escrowBalance = 0; // Ensure balance is cleared if no players remain
      addLog(room, 'The game ended because no active players remained.');
      broadcastToRoom(room.id, 'game_update', room);
      res.json({ success: true, room });
    }
  }

  saveStore();
  if (!res.headersSent) {
    return res.json({ success: true, room: store.rooms[roomId] || null });
  }
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
    name?: string;
    status?: 'active' | 'suspended';
    location?: string;
    cashierLocations?: string[];
    cashierOnlineAt?: number;
    cashierMonthlySalary?: number;
    cashierMonthlyTarget?: number;
    cashierTargetBonus?: number;
    cashierNextSalaryDate?: number;
}

// System Data Cleanup (Temporary Admin Tool)
app.post('/api/admin/system/data-cleanup', async (req, res) => {
  // Simple check: Only allow this if a specific secret is provided in the body
  if (req.body?.secret !== 'LUDOSOM_CLEANUP_2026') {
    return res.status(403).json({ error: 'Unauthorized cleanup request.' });
  }

  let usersReset = 0;
  let txRemoved = 0;
  let roomsRemoved = 0;
  let manualRemoved = 0;

  // 1. Reset crazy win/loss counts (Corrupted by Infinite Win bug)
  Object.values(store.users).forEach(u => {
    if ((u.winCount || 0) > 200 || (u.lossCount || 0) > 200) {
      u.winCount = Math.floor(Math.random() * 20) + 5;
      u.lossCount = Math.floor(Math.random() * 15) + 3;
      // Cap balance for bugged accounts, but leave enough for play
      if (u.balance > 200) u.balance = 100.0;
      usersReset++;
    }
  });

  // 2. Truncate transactions to keep file size small (Latest 500)
  if (store.transactions.length > 500) {
    const originalCount = store.transactions.length;
    // Transactions are usually unshifted (latest at index 0)
    store.transactions = store.transactions.slice(0, 500);
    txRemoved += (originalCount - store.transactions.length);
  }

  // 3. Truncate agent transactions (Latest 500)
  if (store.agentTransactions && store.agentTransactions.length > 500) {
    const originalCount = store.agentTransactions.length;
    store.agentTransactions = store.agentTransactions.slice(0, 500);
    txRemoved += (originalCount - store.agentTransactions.length);
  }

  // 4. Clear old rooms (Not in 'playing' status)
  const roomKeys = Object.keys(store.rooms);
  roomKeys.forEach(id => {
    if (store.rooms[id].status !== 'playing') {
      delete store.rooms[id];
      roomsRemoved++;
    }
  });

  // 5. Clear old manual transactions (Expired > 7 days)
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const originalManualCount = store.pendingManualTransactions.length;
  store.pendingManualTransactions = store.pendingManualTransactions.filter(t =>
    t.status === 'pending' || t.createdAt > sevenDaysAgo
  );
  manualRemoved = originalManualCount - store.pendingManualTransactions.length;

  saveStore();
  res.json({
    success: true,
    usersReset,
    transactionsRemoved: txRemoved,
    roomsRemoved,
    manualTransactionsRemoved: manualRemoved,
    message: 'Database cleaned and optimized successfully.'
  });
});

// New Login endpoint for admin
app.post('/api/admin/login', async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password } = req.body;

    try {
        if (isMySqlRuntimePrimary()) {
          let adminUser = [...adminUsersCache.values()].find(admin => admin.username === username);
          if (!adminUser && adminUsersCache.size === 0) {
            adminUser = { id: `admin_${Date.now()}`, username, password, permissions: ['all'], status: 'active' };
            await saveMySqlAdmin(adminUser); adminUsersCache.set(adminUser.id, adminUser);
          }
          if (!adminUser || adminUser.password !== password) return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
          if (adminUser.status === 'suspended') return res.status(403).json({ error: 'Access denied. This admin account is suspended.' });
          adminUser.permissions = normalizeAdminPermissions(adminUser.permissions);
          const { password: _, ...userToReturn } = adminUser;
          return res.json({ success: true, user: userToReturn });
        }
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
        if ((adminUser as any).status === 'suspended') {
            return res.status(403).json({ error: 'Access denied. This admin account is suspended.' });
        }
        adminUser.permissions = normalizeAdminPermissions(adminUser.permissions);

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

// Return the canonical server-side admin profile so permission changes made by
// a Full Admin replace any stale dashboard data cached in the browser.
app.get('/api/admin/me', async (req, res) => {
    const adminId = String(req.query.userId || '').trim();
    if (!adminId) return res.status(401).json({ error: 'Admin session is required.' });
    try {
        let adminUser: AdminUser | undefined;
        if (isMySqlRuntimePrimary()) {
            adminUser = adminUsersCache.get(adminId);
        } else if (db) {
            const snapshot = await db.collection('adminUsers').doc(adminId).get();
            if (snapshot.exists) adminUser = snapshot.data() as AdminUser;
        }
        if (!adminUser) return res.status(401).json({ error: 'Admin session was not found.' });
        if (adminUser.status === 'suspended') return res.status(403).json({ error: 'This admin account is suspended.' });
        const canonicalUser = {
            ...adminUser,
            id: adminUser.id || adminId,
            permissions: normalizeAdminPermissions(adminUser.permissions),
        };
        const { password: _, ...userToReturn } = canonicalUser;
        return res.json({ success: true, user: userToReturn });
    } catch (error) {
        console.error('Failed to refresh admin session:', error);
        return res.status(500).json({ error: 'Admin session could not be refreshed.' });
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
            const adminUser = await cachedAdminUser(adminId);
            if (!adminUser) {
                return res.status(403).json({ error: 'Access denied. Invalid admin user.' });
            }
            if (adminUser.status === 'suspended') {
                return res.status(403).json({ error: 'Access denied. This admin account is suspended.' });
            }
            const permissions = normalizeAdminPermissions(adminUser.permissions);
            // The 'all' permission grants access to everything
            if (permissions.includes('all') || permissions.includes(requiredPermission)) {
                const canonicalAdmin = { ...adminUser, permissions };
                (req as any).adminUser = canonicalAdmin;
                (req as any).adminPermissions = permissions;
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
const hasAnyPermission = (...required: string[]) => async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const adminId = req.query.userId as string; if (!adminId) return res.status(403).json({ error: 'Admin user ID is required.' });
  const admin = await cachedAdminUser(adminId); if (!admin) return res.status(403).json({ error: 'Invalid admin user.' });
  const permissions = normalizeAdminPermissions(admin.permissions);
  if (permissions.includes('all') || required.some(permission => permissions.includes(permission))) { (req as any).adminPermissions = permissions; (req as any).adminUser = admin; return next(); }
  return res.status(403).json({ error: 'You do not have permission for this action.' });
};

app.post('/api/admin/cashier/heartbeat', hasPermission('cashier'), async (req, res) => {
  const adminId = String(req.query.userId || '');
  const admin = (req as any).adminUser as AdminUser;
  if (cashierCities(admin || {}).length === 0) return res.status(400).json({ error: 'Cashier city is not configured.' });
  const cashierOnlineAt = Date.now();
  if (isMySqlRuntimePrimary()) {
    await updateMySqlCashierHeartbeat(adminId, cashierOnlineAt);
  } else {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    await db.collection('adminUsers').doc(adminId).update({ cashierOnlineAt });
  }
  const updatedAdmin = { ...admin, cashierOnlineAt };
  adminUsersCache.set(adminId, updatedAdmin);
  await reassignExpiredCashierRequests(cashierOnlineAt);
  res.json({ success: true, cashierOnlineAt, locations: cashierCities(admin) });
});

// Endpoint to create a new admin user. Only accessible by a root admin with 'all' permission.
app.post('/api/admin/admins/create', hasPermission('all'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { username, password, permissions } = req.body;

    if (!username || !password || !Array.isArray(permissions)) {
        return res.status(400).json({ error: 'Username, password, and a list of permissions are required.' });
    }

    try {
        if (isMySqlRuntimePrimary()) {
          if ([...adminUsersCache.values()].some(admin => admin.username === username)) return res.status(409).json({ error: 'An admin with this username already exists.' });
          const newAdmin: AdminUser = { id: `admin_${Date.now()}`, username, password, permissions: normalizeAdminPermissions(permissions), status: 'active' };
          await saveMySqlAdmin(newAdmin); adminUsersCache.set(newAdmin.id, newAdmin);
          const { password: _, ...userToReturn } = newAdmin;
          return res.status(201).json({ success: true, user: userToReturn });
        }
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
        const admin = await cachedAdminUser(adminId);
        if (admin) {
            if (admin.status === 'suspended') {
                return res.status(403).json({ error: 'Access denied. This admin account is suspended.' });
            }
            next();
        } else {
            res.status(403).json({ error: 'Access denied. Invalid admin user.' });
        }
    } catch (error) {
        console.error('Admin validation failed:', error);
        res.status(500).json({ error: 'An error occurred during admin validation.' });
    }
};

// Admin Tournament Management Endpoints
app.get('/api/admin/tournaments', hasPermission('tournaments'), (req, res) => {
  seedDefaultTournaments();
  const tournamentsList = Object.values(store.tournaments);
  tournamentsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(tournamentsList);
});

app.post('/api/admin/tournaments/create', hasPermission('tournaments'), async (req, res) => {
  const { name, entryFee, prizePool, maxPlayers, startDate } = req.body;
  if (!name || entryFee === undefined || !prizePool || !maxPlayers || !startDate) {
    return res.status(400).json({ error: 'Missing required tournament fields.' });
  }

  const parsedEntryFee = parseFloat(entryFee);
  const parsedPrizePool = parseFloat(prizePool);
  const parsedMaxPlayers = parseInt(maxPlayers, 10);
  if (!Number.isFinite(parsedEntryFee) || parsedEntryFee <= 0 || !Number.isFinite(parsedPrizePool) || parsedPrizePool <= 0 || !Number.isInteger(parsedMaxPlayers) || parsedMaxPlayers < 2) {
    return res.status(400).json({ error: 'Entry fee, prize pool and player capacity must be valid positive values.' });
  }
  const sustainablePrizeLimit = Number((parsedEntryFee * parsedMaxPlayers * 0.9).toFixed(2));
  if (parsedPrizePool > sustainablePrizeLimit) {
    return res.status(400).json({ error: `Prize pool cannot exceed $${sustainablePrizeLimit.toFixed(2)} (90% of maximum entry fees).` });
  }

  const id = `tourney_${Date.now()}`;
  const newTournament: Tournament = {
    id,
    name: String(name).trim(),
    entryFee: parsedEntryFee,
    prizePool: parsedPrizePool,
    status: 'registration_open',
    players: [],
    maxPlayers: parsedMaxPlayers,
    startDate: new Date(startDate).getTime(),
    endDate: 0,
    winnerId: null,
    currentRound: 1,
    matches: [],
    createdAt: Date.now(),
  };

  store.tournaments[id] = newTournament;
  await saveStoreAndWait();
  broadcastToAll('tournament_update', newTournament);

  res.json({ success: true, tournament: newTournament, message: 'Tournament created successfully!' });
});

app.post('/api/admin/tournaments/:id/cancel', hasPermission('tournaments'), async (req, res) => {
  const tournamentId = req.params.id as string;
  const tournament = store.tournaments[tournamentId];

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  if (tournament.status === 'completed' || tournament.status === 'cancelled') {
    return res.status(400).json({ error: 'Tournament is already finished or cancelled.' });
  }

  // Refund all registered players
  tournament.players.forEach((p: { userId: string; username: string; avatar: string }) => {
    const user = store.users[p.userId];
    if (user && tournament.entryFee > 0) {
      user.balance += tournament.entryFee;
      addTransaction(user.id, 'deposit', tournament.entryFee, tournamentId, `Refund for cancelled tournament "${tournament.name}".`);
      broadcastUserUpdate(user.id);
    }
  });

  tournament.status = 'cancelled';
  await saveStoreAndWait();
  broadcastToAll('tournament_update', tournament);

  res.json({ success: true, message: 'Tournament cancelled and entry fees refunded.' });
});

app.delete('/api/admin/tournaments/:id', hasPermission('tournaments'), async (req, res) => {
  const tournamentId = req.params.id as string;
  const tournament = store.tournaments[tournamentId];
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }
  if (tournament.players.length > 0 && tournament.status !== 'cancelled') return res.status(409).json({ error: 'Cancel this tournament and refund its players before deleting it.' });

  delete store.tournaments[tournamentId];
  await saveStoreAndWait();

  res.json({ success: true, message: 'Tournament deleted successfully.' });
});

app.post('/api/admin/tournaments/:id/start', hasPermission('tournaments'), async (req, res) => {
  const tournamentId = req.params.id as string;
  const tournament = store.tournaments[tournamentId];

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  if (tournament.status !== 'registration_open') {
    return res.status(400).json({ error: 'Tournament is not in registration phase.' });
  }

  if (tournament.players.length < 2) {
    return res.status(400).json({ error: 'At least 2 players are required to start a tournament.' });
  }
  const collectedEntryFees = tournament.entryFee * tournament.players.length;
  if (collectedEntryFees < tournament.prizePool) return res.status(400).json({ error: 'Tournament prize is not fully funded by registered entry fees.' });
  tournament.status = 'check_in';
  tournament.checkInDeadline = Date.now() + TOURNAMENT_CHECK_IN_MS;

  await saveStoreAndWait();
  broadcastToAll('tournament_check_in', tournament);

  res.json({ success: true, tournament, message: `Check-in opened for tournament "${tournament.name}".` });
});

app.post('/api/admin/tournaments/:id/remove-player', hasPermission('tournaments'), async (req, res) => {
  const tournamentId = req.params.id as string;
  const { targetUserId } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ error: 'Missing targetUserId.' });
  }

  const tournament = store.tournaments[tournamentId];
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const playerIndex = tournament.players.findIndex((p: any) => p.userId === targetUserId);
  if (playerIndex === -1) {
    return res.status(404).json({ error: 'Player is not registered in this tournament.' });
  }

  const removedPlayer = tournament.players[playerIndex];
  tournament.players.splice(playerIndex, 1);

  // Refund entry fee if any
  const targetUser = store.users[targetUserId];
  if (targetUser && tournament.entryFee > 0) {
    targetUser.balance += tournament.entryFee;
    addTransaction(
      targetUser.id,
      'deposit',
      tournament.entryFee,
      tournamentId,
      `Refund for removal from tournament "${tournament.name}" by admin.`
    );
    broadcastUserUpdate(targetUser.id);
  }

  await saveStoreAndWait();
  broadcastToAll('tournament_update', tournament);

  res.json({
    success: true,
    message: `Player "${removedPlayer.username}" removed from tournament and $${tournament.entryFee} refunded.`,
    tournament,
  });
});

app.post('/api/admin/tournaments/:id/edit', hasPermission('tournaments'), async (req, res) => {
  const tournamentId = req.params.id as string;
  const { name, entryFee, prizePool, maxPlayers, startDate } = req.body;

  const tournament = store.tournaments[tournamentId];
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const nextEntryFee = entryFee !== undefined ? parseFloat(entryFee) : tournament.entryFee;
  const nextPrizePool = prizePool !== undefined ? parseFloat(prizePool) : tournament.prizePool;
  const nextMaxPlayers = maxPlayers !== undefined ? parseInt(maxPlayers, 10) : tournament.maxPlayers;
  if (!Number.isFinite(nextEntryFee) || nextEntryFee <= 0 || !Number.isFinite(nextPrizePool) || nextPrizePool <= 0 || !Number.isInteger(nextMaxPlayers) || nextMaxPlayers < Math.max(2, tournament.players.length)) {
    return res.status(400).json({ error: 'Tournament financial settings or player capacity are invalid.' });
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
  broadcastToAll('tournament_update', tournament);

  res.json({ success: true, tournament, message: `Tournament "${tournament.name}" updated successfully!` });
});

app.get('/api/admin/vip-tiers', hasPermission('settings'), (_req, res) => res.json(store.vipTiers));
app.post('/api/admin/vip-tiers', hasPermission('settings'), saveVipTiersFromAdmin);

app.get('/api/admin/settings', hasPermission('settings'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    
    try {
        if (isMySqlRuntimePrimary()) {
          const roles = [...adminUsersCache.values()].map(admin => { const { password, ...role } = admin; return { ...role, permissions: normalizeAdminPermissions(admin.permissions), status: admin.status === 'suspended' ? 'suspended' : 'active' }; });
          return res.json({ username: store.adminSettings?.username || process.env.ADMIN_USERNAME || 'admin', passwordConfigured: Boolean(store.adminSettings?.password), roles, vipTiers: store.vipTiers, adSettings: store.adSettings, adCampaigns: store.adCampaigns || [], otpEnabled: isOtpEnabled(), phoneAuthEnabled: isPhoneAuthEnabled() });
        }
        const adminUsersSnapshot = await db.collection('adminUsers').get();
        const roles = await Promise.all(adminUsersSnapshot.docs.map(async doc => {
            const data = doc.data();
            const normalizedPermissions = normalizeAdminPermissions(data.permissions);
            const status = data.status === 'suspended' ? 'suspended' : 'active';
            if (JSON.stringify(data.permissions || []) !== JSON.stringify(normalizedPermissions) || data.status !== status) {
                await doc.ref.update({ permissions: normalizedPermissions, status });
            }
            const { password, ...roleData } = data;
            return { ...roleData, id: data.id || doc.id, permissions: normalizedPermissions, status };
        }));

        res.json({
            username: store.adminSettings?.username || process.env.ADMIN_USERNAME || 'admin',
            passwordConfigured: Boolean(store.adminSettings?.password),
            roles: roles,
            vipTiers: store.vipTiers,
            adSettings: store.adSettings,
            adCampaigns: store.adCampaigns || [],
            otpEnabled: isOtpEnabled(),
            phoneAuthEnabled: isPhoneAuthEnabled(),
        });
    } catch (error) {
        console.error('Failed to retrieve admin roles:', error);
        res.status(500).json({ error: 'Failed to retrieve admin roles.' });
    }
});

app.post('/api/admin/otp-settings', hasPermission('settings'), async (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'OTP enabled status must be true or false.' });
    store.adminSettings.otpEnabled = req.body.enabled;
    await saveStoreAndWait();
    res.json({ success: true, otpEnabled: isOtpEnabled(), message: isOtpEnabled() ? 'Email OTP verification is enabled.' : 'Email OTP verification is disabled.' });
});

app.post('/api/admin/phone-auth-settings', hasPermission('settings'), async (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'Phone authentication status must be true or false.' });
    store.adminSettings.phoneAuthEnabled = req.body.enabled;
    await saveStoreAndWait();
    res.json({ success: true, phoneAuthEnabled: isPhoneAuthEnabled(), message: isPhoneAuthEnabled() ? 'Phone sign-in is enabled.' : 'Phone sign-in is disabled.' });
});

// Every active admin may change only their own password. Platform settings remain
// protected by the separate settings-permission endpoints above and below.
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
        if (isMySqlRuntimePrimary()) {
          const adminUser = adminUsersCache.get(adminId);
          if (!adminUser) return res.status(404).json({ error: 'Admin user not found.' });
          if (adminUser.password !== currentPassword) return res.status(400).json({ error: 'Current password is incorrect.' });
          adminUser.password = newPassword; await saveMySqlAdmin(adminUser); adminUsersCache.set(adminId, adminUser);
          return res.json({ success: true, message: 'Password updated successfully.' });
        }
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
    const { username, password, permissions, name, location, cashierLocations, cashierMonthlySalary, cashierMonthlyTarget, cashierTargetBonus } = req.body;

    const normalizedPermissions = normalizeAdminPermissions(permissions);
    if (!username || !password || !Array.isArray(permissions) || !name) {
        return res.status(400).json({ error: 'Role Name, username, password, and a list of permissions are required.' });
    }
    if (String(username).trim().length < 3 || String(password).length < 6 || String(name).trim().length < 2) {
        return res.status(400).json({ error: 'Role name and username are required; password must be at least 6 characters.' });
    }
    if (normalizedPermissions.length === 0) {
        return res.status(400).json({ error: 'Select at least one valid permission.' });
    }
    const submittedCashierLocations = [...new Set([...(Array.isArray(cashierLocations) ? cashierLocations : []), location].map((item: unknown) => String(item || '').trim()).filter(Boolean))].slice(0, 2);
    if (normalizedPermissions.includes('cashier') && submittedCashierLocations.length === 0) {
        return res.status(400).json({ error: 'Cashier location/city is required.' });
    }

    try {
        if (isMySqlRuntimePrimary()) {
          if ([...adminUsersCache.values()].some(admin => admin.username.toLowerCase() === String(username).trim().toLowerCase())) return res.status(409).json({ error: 'An admin with this username already exists.' });
          const newAdmin: AdminUser = { id: `admin_${Date.now()}`, username: String(username).trim(), password, permissions: normalizedPermissions, name: String(name).trim(), status: 'active', location: normalizedPermissions.includes('cashier') ? submittedCashierLocations[0] : '', cashierLocations: normalizedPermissions.includes('cashier') ? submittedCashierLocations : [], cashierMonthlySalary: normalizedPermissions.includes('cashier') ? Math.max(0, Number(cashierMonthlySalary || 0)) : 0, cashierMonthlyTarget: normalizedPermissions.includes('cashier') ? Math.max(0, Math.floor(Number(cashierMonthlyTarget || 0))) : 0, cashierTargetBonus: normalizedPermissions.includes('cashier') ? Math.max(0, Number(cashierTargetBonus || 0)) : 0, cashierNextSalaryDate: normalizedPermissions.includes('cashier') ? Date.now() + 30 * 24 * 60 * 60 * 1000 : undefined };
          await saveMySqlAdmin(newAdmin); adminUsersCache.set(newAdmin.id, newAdmin);
          const { password: _, ...userToReturn } = newAdmin;
          return res.status(201).json({ success: true, user: userToReturn });
        }
        const adminUsersRef = db.collection('adminUsers');
        const existingAdmin = await adminUsersRef.where('username', '==', username).get();
        if (!existingAdmin.empty) {
            return res.status(409).json({ error: 'An admin with this username already exists.' });
        }
        
        const newAdminId = `admin_${Date.now()}`;
        const newAdmin: AdminUser = {
            id: newAdminId,
            username: String(username).trim(),
            password, // In a real app, this MUST be hashed.
            permissions: normalizedPermissions,
            name: String(name).trim(),
            status: 'active',
            location: normalizedPermissions.includes('cashier') ? submittedCashierLocations[0] : '',
            cashierLocations: normalizedPermissions.includes('cashier') ? submittedCashierLocations : [],
            cashierMonthlySalary: normalizedPermissions.includes('cashier') ? Math.max(0, Number(cashierMonthlySalary || 0)) : 0,
            cashierMonthlyTarget: normalizedPermissions.includes('cashier') ? Math.max(0, Math.floor(Number(cashierMonthlyTarget || 0))) : 0,
            cashierTargetBonus: normalizedPermissions.includes('cashier') ? Math.max(0, Number(cashierTargetBonus || 0)) : 0,
            cashierNextSalaryDate: normalizedPermissions.includes('cashier') ? Date.now() + 30 * 24 * 60 * 60 * 1000 : undefined,
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
    const roleId = req.params.roleId as string;
        const updatedData = { ...req.body };

    if (!roleId) {
        return res.status(400).json({ error: 'Role ID is required.' });
    }

    try {
        const adminRef = isMySqlRuntimePrimary() ? null : db.collection('adminUsers').doc(roleId);
        const doc = adminRef ? await adminRef.get() : null;
        const adminData = isMySqlRuntimePrimary() ? adminUsersCache.get(roleId) : (doc?.data() as AdminUser | undefined);
        if (!adminData) return res.status(404).json({ error: 'Admin role not found.' });
        const targetUsername = String(adminData.username || '').toLowerCase();
        const targetName = String((adminData as any).name || '').toLowerCase();
        const isFullAdminTarget = adminData.permissions?.includes('all') || targetUsername === 'admin' || targetName.includes('super admin') || targetName.includes('full admin');

        if (isFullAdminTarget) {
            return res.status(400).json({ error: 'Full Admin accounts are protected and cannot be edited, suspended, or deleted.' });
        }

        // Do not allow updating the password to an empty string.
        if (updatedData.password === '') {
            delete updatedData.password;
        }

        if (updatedData.permissions !== undefined) {
            const normalizedPermissions = normalizeAdminPermissions(updatedData.permissions);
            if (normalizedPermissions.length === 0) {
                return res.status(400).json({ error: 'Select at least one valid permission.' });
            }
            updatedData.permissions = normalizedPermissions;
        }
        const effectivePermissions = updatedData.permissions || normalizeAdminPermissions(adminData.permissions);
        const effectiveCashierLocations = [...new Set([...(Array.isArray(updatedData.cashierLocations) ? updatedData.cashierLocations : (adminData.cashierLocations || [])), updatedData.location ?? adminData.location].map((item: unknown) => String(item || '').trim()).filter(Boolean))].slice(0, 2);
        if (effectivePermissions.includes('cashier') && effectiveCashierLocations.length === 0) {
            return res.status(400).json({ error: 'Cashier location/city is required.' });
        }
        updatedData.location = effectivePermissions.includes('cashier') ? effectiveCashierLocations[0] : '';
        updatedData.cashierLocations = effectivePermissions.includes('cashier') ? effectiveCashierLocations : [];
        for (const field of ['cashierMonthlySalary', 'cashierTargetBonus']) {
            if (updatedData[field] !== undefined) updatedData[field] = Math.max(0, Number(updatedData[field]) || 0);
        }
        if (updatedData.cashierMonthlyTarget !== undefined) updatedData.cashierMonthlyTarget = Math.max(0, Math.floor(Number(updatedData.cashierMonthlyTarget) || 0));
        if (!effectivePermissions.includes('cashier')) {
            updatedData.cashierMonthlySalary = 0;
            updatedData.cashierMonthlyTarget = 0;
            updatedData.cashierTargetBonus = 0;
        }
        delete updatedData.cashierOnlineAt;
        if (updatedData.status !== undefined && !['active', 'suspended'].includes(updatedData.status)) {
            return res.status(400).json({ error: 'Invalid role status.' });
        }
        if (updatedData.name !== undefined) updatedData.name = String(updatedData.name).trim();
        if (updatedData.username !== undefined) updatedData.username = String(updatedData.username).trim();

        const updatedAdmin = { ...adminData, ...updatedData } as AdminUser;
        if (isMySqlRuntimePrimary()) { await saveMySqlAdmin(updatedAdmin); adminUsersCache.set(roleId, updatedAdmin); }
        else await adminRef!.update(updatedData);
        const finalAdmin = isMySqlRuntimePrimary() ? updatedAdmin : ((await adminRef!.get()).data() as AdminUser);
        const { password, ...returnData } = finalAdmin;

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
    const roleId = req.params.roleId as string;
    if (!roleId) {
        return res.status(400).json({ error: 'Admin user ID is required.' });
    }

    try {
        const adminRef = isMySqlRuntimePrimary() ? null : db.collection('adminUsers').doc(roleId);
        const doc = adminRef ? await adminRef.get() : null;
        const adminData = isMySqlRuntimePrimary() ? adminUsersCache.get(roleId) : (doc?.data() as AdminUser | undefined);
        if (!adminData) return res.status(404).json({ error: 'Admin user not found.' });
        const targetUsername = String(adminData.username || '').toLowerCase();
        const targetName = String((adminData as any).name || '').toLowerCase();
        const isFullAdminTarget = adminData.permissions?.includes('all') || targetUsername === 'admin' || targetName.includes('super admin') || targetName.includes('full admin');

        if (isFullAdminTarget) {
            return res.status(400).json({ error: 'Full Admin accounts are protected and cannot be deleted.' });
        }

        if (adminData.permissions.includes('all')) {
            const allAdminsSnapshot = await db.collection('adminUsers').where('permissions', 'array-contains', 'all').get();
            if (allAdminsSnapshot.size <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last super administrator.' });
            }
        }
        
        if (isMySqlRuntimePrimary()) { await deleteMySqlAdmin(roleId); adminUsersCache.delete(roleId); }
        else await adminRef!.delete();
        res.json({ success: true, message: 'Admin user deleted successfully.' });

    } catch (error) {
        console.error('Failed to delete admin user:', error);
        res.status(500).json({ error: 'Failed to delete admin user.' });
    }
});

type CachedAdminFinancialMetrics = {
  totalAgents: number;
  activeAgents: number;
  pendingAgentRequests: number;
  agentFloatIssued: number;
  agentFloatCash: number;
  agentCommissionDiscounts: number;
  monthlyAgents: number;
  monthlySalaryLiability: number;
  cashierPayrollPaid: number;
};
async function getAdminFinancialMetrics(): Promise<CachedAdminFinancialMetrics> {
  const empty: CachedAdminFinancialMetrics = { totalAgents: 0, activeAgents: 0, pendingAgentRequests: 0, agentFloatIssued: 0, agentFloatCash: 0, agentCommissionDiscounts: 0, monthlyAgents: 0, monthlySalaryLiability: 0, cashierPayrollPaid: 0 };
    const agents = Object.values(store.agents);
    const value = { ...empty };
    value.totalAgents = agents.length;
    value.activeAgents = agents.filter(agent => agent.status === 'Active').length;
    value.monthlyAgents = agents.filter(agent => agent.businessModel === 'monthly').length;
    value.monthlySalaryLiability = agents.filter(agent => agent.businessModel === 'monthly' && agent.status === 'Active').reduce((sum, agent) => sum + Number(agent.monthlySalary || 0), 0);
    value.pendingAgentRequests = [...agentRequestsCache.values()].filter(request => request.status === 'pending').length;
    agentTransactionsCache.forEach(transaction => {
      if (transaction.type !== 'FloatPurchase' || Number(transaction.amount || 0) <= 0) return;
      const amount = Number(transaction.amount || 0);
      const discount = Math.max(0, Number(transaction.discountAmount || 0));
      value.agentFloatIssued += amount;
      value.agentCommissionDiscounts += discount;
      value.agentFloatCash += Math.max(0, amount - discount);
    });
    value.cashierPayrollPaid = [...cashierPaymentsCache.values()].reduce((sum, payment) => sum + Number(payment.total || 0), 0);
    return value;
}

// Get all runtime stats
app.get('/api/admin/stats', hasPermission('stats'), async (req, res) => {
    const users = Object.values(store.users).filter(user => !isBotPlayer(user.id));
    const rooms = Object.values(store.rooms);
    const tournaments = Object.values(store.tournaments);
    const manualTransactions = store.pendingManualTransactions || [];
    const monthBuckets = new Map<string, { month: string; deposits: number; withdrawals: number; transactions: number }>();
    const now = new Date();
    const revenueBreakdown: Record<RevenueCategory, number> = {
        game_rake: 0,
        team_game_rake: 0,
        forfeit_rake: 0,
        bot_result: 0,
        betting_margin: 0,
        withdrawal_fee: 0,
        vip_subscription: 0,
        tournament_margin: 0,
        tournament_cancellation_fee: 0,
    };
    const inferRevenueCategory = (tx: WalletTransaction): RevenueCategory | null => {
        if (tx.revenueCategory) return tx.revenueCategory;
        const description = String(tx.description || '');
        if (/vip subscription/i.test(description)) return 'vip_subscription';
        if (/withdrawal fee/i.test(description)) return 'withdrawal_fee';
        if (/forfeit.*rake|rake from forfeit/i.test(description)) return 'forfeit_rake';
        if (/team-game rake|team game rake/i.test(description)) return 'team_game_rake';
        if (/bot.*won|bot result/i.test(description)) return 'bot_result';
        if (/tournament margin/i.test(description)) return 'tournament_margin';
        if (/tournament cancellation fee/i.test(description)) return 'tournament_cancellation_fee';
        if (/rake from match/i.test(description)) return 'game_rake';
        return null;
    };
    store.transactions.forEach(tx => {
        if (tx.type !== 'app_commission') return;
        const category = inferRevenueCategory(tx);
        if (category) revenueBreakdown[category] += Number(tx.amount || 0);
    });
    Object.keys(revenueBreakdown).forEach(key => {
        revenueBreakdown[key as RevenueCategory] = Number(revenueBreakdown[key as RevenueCategory].toFixed(2));
    });
    const recordedHouseRevenue = Number(Object.values(revenueBreakdown).reduce((sum, value) => sum + value, 0).toFixed(2));
    const welcomeBonusCost = Number(store.transactions
        .filter(tx => /welcome signup bonus/i.test(tx.description || ''))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0).toFixed(2));
    for (let offset = 5; offset >= 0; offset--) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        monthBuckets.set(key, { month: date.toLocaleString('en', { month: 'short' }), deposits: 0, withdrawals: 0, transactions: 0 });
    }
    store.transactions.forEach(tx => {
        const date = new Date(tx.timestamp);
        const bucket = monthBuckets.get(`${date.getFullYear()}-${date.getMonth()}`);
        if (!bucket) return;
        bucket.transactions += 1;
        if (tx.type === 'deposit') bucket.deposits += Number(tx.amount || 0);
        if (tx.type === 'withdrawal') bucket.withdrawals += Number(tx.amount || 0);
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
        const metrics = await getAdminFinancialMetrics();
        ({ totalAgents, activeAgents, pendingAgentRequests, agentFloatIssued, agentFloatCash, agentCommissionDiscounts, monthlyAgents, monthlySalaryLiability, cashierPayrollPaid } = metrics);
      } catch (error) {
        console.error('Failed to include Firestore agent metrics in admin stats:', error);
      }
    }

    const recentActivity = [
        ...store.transactions.slice(0, 8).map(tx => ({ id: tx.id, kind: 'transaction', title: tx.description, amount: tx.amount, status: tx.status || 'completed', timestamp: tx.timestamp })),
        ...manualTransactions.slice(0, 8).map(tx => ({ id: tx.id, kind: 'manual', title: `${tx.username} requested a ${tx.transactionType}`, amount: tx.amount, status: tx.status, timestamp: tx.createdAt })),
    ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);

    res.json({
        totalUsers: users.length,
        totalRooms: rooms.length,
        activeRooms: rooms.filter(r => r.status === 'playing').length,
        waitingRooms: rooms.filter(r => r.status === 'waiting').length,
        completedRooms: rooms.filter(r => r.status === 'completed').length,
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
        pendingAdminTransactions: manualTransactions.filter(tx => tx.status === 'pending' && tx.managedBy !== 'agent').length,
        pendingAgentTransactions: manualTransactions.filter(tx => tx.status === 'pending' && tx.managedBy === 'agent').length,
        totalAgents,
        activeAgents,
        pendingAgentRequests,
        openTournaments: tournaments.filter(t => t.status === 'registration_open').length,
        activeTournaments: tournaments.filter(t => t.status === 'in_progress').length,
        totalTournamentPlayers: tournaments.reduce((sum, tournament) => sum + tournament.players.length, 0),
        monthlyActivity: [...monthBuckets.values()],
        recentActivity,
    });
});

// Get all users
app.get('/api/admin/users', hasPermission('users'), (req, res) => {
    res.json(Object.values(store.users).filter(user => !isBotPlayer(user.id)));
});

// Get all rooms
app.get('/api/admin/rooms', hasPermission('rooms'), (req, res) => {
    res.json(Object.values(store.rooms).filter(room => room.status !== 'cancelled'));
});

// Get all transactions
app.get('/api/admin/transactions', hasPermission('transactions'), (req, res) => {
    res.json(store.transactions);
});

// Get all pending manual transactions
app.get('/api/admin/manual-transactions', hasAnyPermission('transactions', 'cashier'), async (req, res) => {
    const permissions = (req as any).adminPermissions as string[] || [];
    const cashierOnly = permissions.includes('cashier') && !permissions.includes('transactions') && !permissions.includes('all');
    const adminId = String(req.query.userId || '');

    // Listing the cashier queue is itself proof that this cashier is online.
    // Register it before assignment so the first queue request cannot race the
    // separate heartbeat request and incorrectly return an empty list.
    if (cashierOnly) {
        const currentAdmin = (req as any).adminUser as AdminUser;
        const cashierOnlineAt = Date.now();
        adminUsersCache.set(adminId, { ...currentAdmin, cashierOnlineAt });
        if (isMySqlRuntimePrimary()) {
            await updateMySqlCashierHeartbeat(adminId, cashierOnlineAt);
        } else if (db) {
            await db.collection('adminUsers').doc(adminId).update({ cashierOnlineAt });
        }
    }

    // Production may serve the player and cashier from different instances.
    // MySQL is canonical, so merge its latest requests before assigning/filtering
    // instead of relying on instance-local memory populated by another request.
    if (isMySqlRuntimePrimary()) {
        const persistedRequests = await listMySqlManualRequests();
        const mergedRequests = new Map(store.pendingManualTransactions.map(request => [request.id, request]));
        persistedRequests.forEach(request => mergedRequests.set(request.id, request));
        store.pendingManualTransactions = [...mergedRequests.values()]
            .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    }
    await reassignExpiredCashierRequests();
    const agentNames = new Map(Object.values(store.agents).map(agent => [agent.id, agent.username]));

    const transactions = (store.pendingManualTransactions || []).map(tx => {
        const user = store.users[tx.userId];
        const linkedAgentId = user?.linkedAgentId;
        return {
            ...tx,
            agentId: linkedAgentId || tx.agentId,
            agentUsername: tx.agentUsername || (linkedAgentId ? agentNames.get(linkedAgentId) : undefined),
            managedBy: tx.managedBy || (linkedAgentId ? 'agent' : 'admin'),
        };
    });
    const currentAdmin = (req as any).adminUser as AdminUser;
    res.json(cashierOnly
        ? transactions.filter(tx => tx.managedBy !== 'agent' && cashierCanServeRequest(currentAdmin, tx))
        : transactions);
});

function cashierPeriod(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  return { key, start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1) };
}

app.get('/api/admin/cashier-overview', hasPermission('cashier'), async (req, res) => {
  const cashier = (req as any).adminUser as AdminUser;
  const now = Date.now();
  const period = cashierPeriod();
  if (isMySqlRuntimePrimary()) {
    const persistedRequests = await listMySqlManualRequests();
    const merged = new Map(store.pendingManualTransactions.map(request => [request.id, request]));
    persistedRequests.forEach(request => merged.set(request.id, request));
    store.pendingManualTransactions = [...merged.values()];
  }
  const cityRequests = store.pendingManualTransactions.filter(request =>
    request.managedBy !== 'agent' && cashierCanServeRequest(cashier, request));
  const periodRequests = cityRequests.filter(request => request.createdAt >= period.start && request.createdAt < period.end);
  const resolved = periodRequests.filter(request => request.resolvedBy === cashier.id);
  const approved = resolved.filter(request => request.status === 'approved');
  const rejected = resolved.filter(request => request.status === 'rejected');
  const pending = cityRequests.filter(request => request.status === 'pending').length;
  const monthlyTarget = Math.max(0, Number(cashier.cashierMonthlyTarget || 0));
  const remainingTarget = Math.max(0, monthlyTarget - approved.length);
  const targetReached = monthlyTarget > 0 && remainingTarget === 0;
  const monthlySalary = Math.max(0, Number(cashier.cashierMonthlySalary || 0));
  const targetBonus = Math.max(0, Number(cashier.cashierTargetBonus || 0));
  const earnedBonus = targetReached ? targetBonus : 0;
  const payment = [...cashierPaymentsCache.values()].find(item => item.cashierId === cashier.id && item.period === period.key);
  const peopleServed = new Set(resolved.map(request => request.userId)).size;
  return res.json({
    period: period.key,
    name: cashier.name || cashier.username,
    username: cashier.username,
    locations: cashierCities(cashier),
    online: Number(cashier.cashierOnlineAt || 0) >= now - CASHIER_ONLINE_WINDOW_MS,
    pending,
    approved: approved.length,
    rejected: rejected.length,
    completed: resolved.length,
    peopleServed,
    handledAmount: Number(approved.reduce((sum, request) => sum + Number(request.amount || 0), 0).toFixed(2)),
    monthlyTarget,
    remainingTarget,
    targetProgress: monthlyTarget > 0 ? Math.min(100, approved.length / monthlyTarget * 100) : 0,
    targetReached,
    monthlySalary,
    targetBonus,
    earnedBonus,
    currentEarnings: Number((monthlySalary + earnedBonus).toFixed(2)),
    salaryStatus: payment ? 'paid' : (Number(cashier.cashierNextSalaryDate || 0) <= now ? 'due' : 'pending'),
    paidAt: payment?.paidAt,
  });
});

app.get('/api/admin/cashiers', hasPermission('settings'), async (_req, res) => {
  const now = Date.now();
  const period = cashierPeriod();
  const payments = [...cashierPaymentsCache.values()];
  const paidByCashier = new Map(payments
    .filter(payment => payment.period === period.key)
    .map(payment => [payment.cashierId, payment]));
  const periodRequests = store.pendingManualTransactions.filter(request => request.createdAt >= period.start && request.createdAt < period.end && request.managedBy !== 'agent');

  const cashiers = [...adminUsersCache.values()]
    .filter(admin => normalizeAdminPermissions(admin.permissions).includes('cashier'))
    .map(cashier => {
      const resolved = periodRequests.filter(request => request.resolvedBy === cashier.id);
      const approved = resolved.filter(request => request.status === 'approved');
      const rejected = resolved.filter(request => request.status === 'rejected');
      const responseSamples = resolved.filter(request => request.resolvedAt && request.assignedCashierAt)
        .map(request => Math.max(0, Number(request.resolvedAt) - Number(request.assignedCashierAt)));
      const timedOut = periodRequests.reduce((count, request) => count + (request.cashierTimedOutIds || []).filter(id => id === cashier.id).length, 0);
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
        status: cashier.status || 'active',
        online: cashier.status !== 'suspended' && Number(cashier.cashierOnlineAt || 0) >= now - CASHIER_ONLINE_WINDOW_MS,
        lastSeenAt: Number(cashier.cashierOnlineAt || 0),
        monthlySalary: salary,
        monthlyTarget,
        targetBonus: Math.max(0, Number(cashier.cashierTargetBonus || 0)),
        targetReached,
        approved: approved.length,
        rejected: rejected.length,
        completed: resolved.length,
        deposits: approved.filter(request => request.transactionType === 'deposit').length,
        withdrawals: approved.filter(request => request.transactionType === 'withdraw').length,
        handledAmount: Number(approved.reduce((sum, request) => sum + Number(request.amount || 0), 0).toFixed(2)),
        averageResponseSeconds: responseSamples.length ? Math.round(responseSamples.reduce((sum, value) => sum + value, 0) / responseSamples.length / 1000) : 0,
        timedOut,
        period: period.key,
        salaryStatus: payment ? 'paid' : (Number(cashier.cashierNextSalaryDate || 0) <= now ? 'due' : 'pending'),
        payableAmount: Number((salary + bonus).toFixed(2)),
        paidAt: payment?.paidAt,
      };
    });
  const history = payments.sort((a: any, b: any) => Number(b.paidAt || 0) - Number(a.paidAt || 0));
  res.json({ period: period.key, cashiers, history });
});

app.post('/api/admin/cashiers/:cashierId/pay', hasPermission('settings'), async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const cashierId = String(req.params.cashierId || '');
  const adminId = String(req.query.userId || '');
  const period = cashierPeriod();
  const cashierRef = db.collection('adminUsers').doc(cashierId);
  const paymentRef = db.collection('cashierPayments').doc(`${cashierId}_${period.key}`);
  try {
    if (isMySqlRuntimePrimary()) {
      const cashier = adminUsersCache.get(cashierId);
      if (!cashier) throw new Error('Cashier not found.');
      if (!normalizeAdminPermissions(cashier.permissions).includes('cashier')) throw new Error('Selected account is not a cashier.');
      if ([...cashierPaymentsCache.values()].some(payment => payment.cashierId === cashierId && payment.period === period.key)) throw new Error('This cashier has already been paid for the current period.');
      const approved = store.pendingManualTransactions.filter(request => request.managedBy !== 'agent' && request.resolvedBy === cashierId && request.status === 'approved' && request.createdAt >= period.start && request.createdAt < period.end).length;
      const target = Math.max(0, Number(cashier.cashierMonthlyTarget || 0)); const salary = Math.max(0, Number(cashier.cashierMonthlySalary || 0)); const bonus = target > 0 && approved >= target ? Math.max(0, Number(cashier.cashierTargetBonus || 0)) : 0;
      const payment = await saveMySqlCashierPayment({ cashierId, cashierName: cashier.name || cashier.username, period: period.key, salary, bonus, total: Number((salary + bonus).toFixed(2)), approvedCount: approved, paidAt: Date.now(), paidBy: adminId });
      cashier.cashierNextSalaryDate = period.end; await saveMySqlAdmin(cashier); adminUsersCache.set(cashierId, cashier); cashierPaymentsCache.set(payment.id, payment);
      return res.json({ success: true, payment });
    }
    const result = await db.runTransaction(async transaction => {
      const [cashierDoc, paymentDoc] = await Promise.all([transaction.get(cashierRef), transaction.get(paymentRef)]);
      if (!cashierDoc.exists) throw new Error('Cashier not found.');
      if (paymentDoc.exists) throw new Error('This cashier has already been paid for the current period.');
      const cashier = cashierDoc.data() as AdminUser;
      if (!normalizeAdminPermissions(cashier.permissions).includes('cashier')) throw new Error('Selected account is not a cashier.');
      const approved = store.pendingManualTransactions.filter(request => request.managedBy !== 'agent' && request.resolvedBy === cashierId && request.status === 'approved' && request.createdAt >= period.start && request.createdAt < period.end).length;
      const target = Math.max(0, Number(cashier.cashierMonthlyTarget || 0));
      const salary = Math.max(0, Number(cashier.cashierMonthlySalary || 0));
      const bonus = target > 0 && approved >= target ? Math.max(0, Number(cashier.cashierTargetBonus || 0)) : 0;
      const payment = { cashierId, cashierName: cashier.name || cashier.username, period: period.key, salary, bonus, total: Number((salary + bonus).toFixed(2)), approvedCount: approved, paidAt: Date.now(), paidBy: adminId };
      transaction.set(paymentRef, payment);
      transaction.update(cashierRef, { cashierNextSalaryDate: period.end });
      return payment;
    });
    res.json({ success: true, payment: result });
  } catch (error: any) {
    const message = error?.message || 'Cashier payment could not be recorded.';
    res.status(message.includes('already been paid') ? 409 : 400).json({ error: message });
  }
});

app.get('/api/admin/payment-settings', hasPermission('settings'), (req, res) => {
    res.json(store.paymentProviders);
});

app.post('/api/admin/payment-settings', hasPermission('settings'), async (req, res) => {
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

app.get('/api/ads/active', (_req, res) => res.json(store.adCampaigns || []));
app.get('/api/admin/ad-settings', hasPermission('settings'), (_req, res) => res.json(store.adCampaigns || []));
app.post('/api/admin/ad-settings', hasPermission('settings'), async (req, res) => {
  const submitted = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.campaigns) ? req.body.campaigns : [req.body || {}];
  const formats = ['banner', 'ticker', 'popup', 'adsense'];
  const placements = ['all', 'dashboard', 'game'];
  const campaigns: PlatformAdSettings[] = [];
  for (const raw of submitted) {
    const value = raw || {};
    const durationSeconds = Math.max(1, Math.min(180, Math.round(Number(value.durationSeconds) || 3)));
    const intervalSeconds = Math.max(10, durationSeconds, Math.min(3600, Math.round(Number(value.intervalSeconds) || 60)));
    if (!formats.includes(value.format) || !placements.includes(value.placement)) return res.status(400).json({ error: 'Invalid ad format or placement.' });
    if (value.enabled && value.format !== 'adsense' && !String(value.title || value.message || value.imageUrl || '').trim()) return res.status(400).json({ error: 'Every enabled campaign needs ad text, an image or a video.' });
    const startAt = Number(value.startAt) > 0 ? Number(value.startAt) : undefined;
    const endAt = Number(value.endAt) > 0 ? Number(value.endAt) : undefined;
    if (startAt && endAt && endAt <= startAt) return res.status(400).json({ error: 'Campaign end time must be after its start time.' });
    campaigns.push({ ...DEFAULT_AD_SETTINGS, ...value, id: String(value.id || crypto.randomUUID()), durationSeconds, intervalSeconds, startAt, endAt, updatedAt: Date.now() });
  }
  store.adCampaigns = campaigns;
  store.adSettings = campaigns[0] || { ...DEFAULT_AD_SETTINGS };
  await saveStoreAndWait();
  broadcastToAll('ad_settings_updated', store.adCampaigns);
  res.json({ success: true, adCampaigns: store.adCampaigns, adSettings: store.adSettings });
});

// Approve a manual transaction
app.post('/api/admin/manual-transactions/:transactionId/approve', hasAnyPermission('transactions', 'cashier'), async (req, res) => {
    const { transactionId } = req.params;
    const tx = store.pendingManualTransactions.find(t => t.id === transactionId);

    if (!tx || tx.status !== 'pending') {
        return res.status(404).json({ error: 'Pending transaction not found or already processed.' });
    }
    const permissions = (req as any).adminPermissions as string[] || [];
    const cashierOnly = permissions.includes('cashier') && !permissions.includes('transactions') && !permissions.includes('all');
    if (cashierOnly && (tx.managedBy === 'agent' || Boolean(tx.agentId))) {
        return res.status(403).json({ error: 'Agent-managed requests are viewable only by transaction administrators.' });
    }
    if (cashierOnly && !cashierCanServeRequest((req as any).adminUser, tx)) {
        return res.status(403).json({ error: 'This request belongs to a cashier serving another location.' });
    }
    if (cashierOnly && (tx.assignedCashierId !== String(req.query.userId || '') || Number(tx.assignmentExpiresAt || 0) <= Date.now())) {
        tx.assignedCashierId = String(req.query.userId || '');
        tx.assignedCashierName = String((req as any).adminUser?.name || (req as any).adminUser?.username || 'Cashier');
        tx.assignedCashierAt = Date.now();
        tx.assignmentExpiresAt = Date.now() + CASHIER_ASSIGNMENT_MS;
        await saveManualRequestToFirestore(tx);
    }

    const user = store.users[tx.userId];
    if (!user) {
        return res.status(404).json({ error: 'User associated with transaction not found.' });
    }

    if (tx.managedBy === 'agent' || user.linkedAgentId) {
        return res.status(403).json({ error: 'This transaction is assigned to an agent and is read-only for administrators.' });
    }

    if (isMySqlRuntimePrimary()) {
        if (tx.transactionType === 'withdraw') {
            const eligibilityError = withdrawalEligibilityError(user, tx.amount, tx.id);
            if (eligibilityError) return res.status(400).json({ error: eligibilityError });
        }
        try {
            const result = await resolveMySqlManualRequest({ requestId: tx.id, admin: (req as any).adminUser, approved: true });
            Object.assign(tx, result.request);
            if (result.user) {
                store.users[tx.userId] = { ...store.users[tx.userId], ...result.user };
                const description = tx.transactionType === 'deposit'
                    ? `Manual deposit approved by cashier/admin. Request ID: ${tx.id}`
                    : `Manual withdrawal approved by cashier/admin. Request ID: ${tx.id}`;
                addTransaction(tx.userId, tx.transactionType === 'deposit' ? 'deposit' : 'withdrawal', tx.amount, undefined, description);
                if (tx.transactionType === 'withdraw') recordWithdrawalFee(tx.userId, Number(tx.fee || 0), tx.id);
                broadcastUserUpdate(tx.userId);
            }
            await saveStoreAndWait();
            return res.json({ success: true, transaction: tx });
        } catch (error: any) {
            const message = String(error?.message || 'Request could not be approved.');
            return res.status(/already been processed/i.test(message) ? 409 : 400).json({ error: message });
        }
    }

    if (tx.transactionType === 'deposit') {
        user.balance += tx.amount;
        addTransaction(user.id, 'deposit', tx.amount, undefined, `Manual deposit approved by admin. Request ID: ${tx.id}`);
    } else { // withdrawal
        const eligibilityError = withdrawalEligibilityError(user, tx.amount, tx.id);
        if (eligibilityError) {
            tx.status = 'rejected';
            await saveManualRequestToFirestore(tx);
            await saveStoreAndWait();
            return res.status(400).json({ error: eligibilityError });
        }
        if (user.balance < tx.amount) {
            // Not enough balance, reject it instead
            tx.status = 'rejected';
            await saveStoreAndWait();
            // No balance change needed since funds were never held
            return res.status(400).json({ error: 'Insufficient balance to approve this withdrawal request. Transaction has been rejected.' });
        }
        user.balance -= tx.amount;
        addTransaction(user.id, 'withdrawal', tx.amount, undefined, `Manual withdrawal approved by admin. Request ID: ${tx.id}`);
        recordWithdrawalFee(user.id, Number(tx.fee || 0), tx.id);
    }

    tx.status = 'approved';
    tx.managedBy = 'admin';
    tx.resolvedBy = String(req.query.userId || 'admin');
    tx.resolverUsername = String((req as any).adminUser?.name || (req as any).adminUser?.username || 'Admin');
    tx.resolvedAt = Date.now();
    await saveManualRequestToFirestore(tx);
    await saveStoreAndWait();

    broadcastUserUpdate(user.id);
    res.json({ success: true, transaction: tx });
});

// Reject a manual transaction
app.post('/api/admin/manual-transactions/:transactionId/reject', hasAnyPermission('transactions', 'cashier'), async (req, res) => {
    const { transactionId } = req.params;
    const tx = store.pendingManualTransactions.find(t => t.id === transactionId);

    if (!tx || tx.status !== 'pending') {
        return res.status(404).json({ error: 'Pending transaction not found or already processed.' });
    }
    const permissions = (req as any).adminPermissions as string[] || [];
    const cashierOnly = permissions.includes('cashier') && !permissions.includes('transactions') && !permissions.includes('all');
    if (cashierOnly && (tx.managedBy === 'agent' || Boolean(tx.agentId))) {
        return res.status(403).json({ error: 'Agent-managed requests are viewable only by transaction administrators.' });
    }
    if (cashierOnly && !cashierCanServeRequest((req as any).adminUser, tx)) {
        return res.status(403).json({ error: 'This request belongs to a cashier serving another location.' });
    }
    if (cashierOnly && (tx.assignedCashierId !== String(req.query.userId || '') || Number(tx.assignmentExpiresAt || 0) <= Date.now())) {
        tx.assignedCashierId = String(req.query.userId || '');
        tx.assignedCashierName = String((req as any).adminUser?.name || (req as any).adminUser?.username || 'Cashier');
        tx.assignedCashierAt = Date.now();
        tx.assignmentExpiresAt = Date.now() + CASHIER_ASSIGNMENT_MS;
        await saveManualRequestToFirestore(tx);
    }


    const user = store.users[tx.userId];
    if (tx.managedBy === 'agent' || user?.linkedAgentId) {
        return res.status(403).json({ error: 'This transaction is assigned to an agent and is read-only for administrators.' });
    }

    if (isMySqlRuntimePrimary()) {
        try {
            const result = await resolveMySqlManualRequest({ requestId: tx.id, admin: (req as any).adminUser, approved: false });
            Object.assign(tx, result.request);
            await saveStoreAndWait();
            if (user) sendEventToUser(user.id, 'user_notification', { type: 'info', message: `Your ${tx.transactionType} request for $${tx.amount} was rejected.` });
            return res.json({ success: true, transaction: tx });
        } catch (error: any) {
            const message = String(error?.message || 'Request could not be rejected.');
            return res.status(/already been processed/i.test(message) ? 409 : 400).json({ error: message });
        }
    }

    if (!user) {
        // Even if user not found, we can still mark transaction as rejected
        tx.status = 'rejected';
        await saveStoreAndWait();
        return res.status(404).json({ error: 'User associated with transaction not found. Transaction rejected.' });
    }
    
    // On rejection, no balance change should occur. Funds are only moved on approval.
    // The previous logic incorrectly "refunded" money that was never taken.
    tx.status = 'rejected';
    tx.managedBy = 'admin';
    tx.resolvedBy = String(req.query.userId || 'admin');
    tx.resolverUsername = String((req as any).adminUser?.name || (req as any).adminUser?.username || 'Admin');
    tx.resolvedAt = Date.now();
    await saveManualRequestToFirestore(tx);
    await saveStoreAndWait();
    
    // Notify the user their request was rejected, but their balance is unchanged.
    sendEventToUser(user.id, 'user_notification', {
        type: 'info',
        message: `Your ${tx.transactionType} request for $${tx.amount} was rejected.`
    });
    
    res.json({ success: true, transaction: tx });
});


// Impersonate a user
app.post('/api/admin/impersonate', hasPermission('users'), (req, res) => {
    const { userId, targetUserId } = req.body;
    const targetId = targetUserId || userId;
    const user = store.users[targetId];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    const uName = String(user.username || '').toLowerCase();
    const uRole = String(user.role || '').toLowerCase();
    if (uName === 'admin' || uName === 'superadmin' || uRole.includes('admin') || uRole.includes('super')) {
        return res.status(400).json({ error: 'Full Admin accounts are protected and cannot be impersonated.' });
    }
    // For this simple app, we'll just return the user object.
    // In a real app with JWT, you would generate a new token for the user.
    res.json({ success: true, user });
});

// Update a user's details (e.g., balance, role)
app.post('/api/admin/users/:userId/update', hasPermission('users'), async (req, res) => {
    const userId = req.params.userId as string;
    const userToUpdate = store.users[userId];

    if (!userToUpdate) {
        return res.status(404).json({ error: 'User not found.' });
    }
    
    const uName = String(userToUpdate.username || '').toLowerCase();
    const uRole = String(userToUpdate.role || '').toLowerCase();
    if (uName === 'admin' || uRole.includes('admin') || uRole.includes('super')) {
        return res.status(400).json({ error: 'Full Admin users are protected and cannot be edited.' });
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
app.get('/api/admin/agents', hasPermission('agents'), async (req, res) => {
  try {
    res.json(Object.values(store.agents));
  } catch (error) {
    console.error('Failed to get agents:', error);
    res.status(500).json({ error: 'Failed to retrieve agents from database.' });
  }
});

// Create a new agent
app.post('/api/admin/agents/create', hasPermission('agents'), async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const { username, password, commissionRate, location, phone, promoCode, businessModel, monthlySalary, monthlyTarget, dailyTransactionLimit } = req.body;

  const normalizedPromoCode = normalizePromoCode(promoCode);
  if (!username || !password || !commissionRate || !phone || !normalizedPromoCode || !location) {
    return res.status(400).json({ error: 'Username, password, commission rate, phone, promo code, and location are required.' });
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
    if (isMySqlRuntimePrimary()) {
      if (Object.values(store.agents).some(agent => agent.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'Agent with this username already exists.' });
      if (Object.values(store.agents).some(agent => normalizePromoCode(agent.promoCode) === normalizedPromoCode)) return res.status(400).json({ error: 'Promo code is already in use.' });
      const agentId = `agent_${Date.now()}`;
      const newAgent: Agent = { id: agentId, username, password, phone, location, commissionRate: rate, promoCode: normalizedPromoCode, balance: 0, floatBalance: 0, status: 'Active', createdAt: Date.now(), businessModel: businessModel === 'monthly' ? 'monthly' : 'independent', monthlySalary: businessModel === 'monthly' ? Math.max(0, Number(monthlySalary || 0)) : 0, monthlyTarget: businessModel === 'monthly' ? Math.max(0, Number(monthlyTarget || 0)) : 0, dailyTransactionLimit: businessModel === 'monthly' ? Math.max(0, Number(dailyTransactionLimit || 0)) : 0, salaryStatus: businessModel === 'monthly' ? 'current' : undefined, nextSalaryDate: businessModel === 'monthly' ? Date.now() + 30 * 24 * 60 * 60 * 1000 : undefined };
      await saveMySqlAgent(newAgent); store.agents[agentId] = newAgent; agentCache.set(agentId, newAgent); await saveStoreAndWait();
      return res.status(201).json(newAgent);
    }
    const agentsRef = db.collection('agents');
    
    // Check if username already exists in Firestore
    const existingAgentSnapshot = await agentsRef.where('username', '==', username).get();
    if (!existingAgentSnapshot.empty) {
      return res.status(409).json({ error: 'Agent with this username already exists.' });
    }

    // Check for promo code uniqueness
    const matchingPromoDocs = await findAgentDocsByPromoCode(agentsRef, normalizedPromoCode);
    if (matchingPromoDocs.length > 0) {
        return res.status(400).json({ error: 'Promo code is already in use.' });
    }

    const agentId = `agent_${Date.now()}`;
    const newAgent: Agent = {
      id: agentId,
      username,
      password, // In a real app, this should be hashed and salted
      phone,
      location: location || '',
      commissionRate: rate,
      promoCode: normalizedPromoCode,
      balance: 0,
      floatBalance: 0,
      status: 'Active',
      createdAt: Date.now(),
      businessModel: businessModel === 'monthly' ? 'monthly' : 'independent',
      monthlySalary: businessModel === 'monthly' ? Math.max(0, Number(monthlySalary || 0)) : 0,
      monthlyTarget: businessModel === 'monthly' ? Math.max(0, Number(monthlyTarget || 0)) : 0,
      dailyTransactionLimit: businessModel === 'monthly' ? Math.max(0, Number(dailyTransactionLimit || 0)) : 0,
      salaryStatus: businessModel === 'monthly' ? 'current' : undefined,
      nextSalaryDate: businessModel === 'monthly' ? Date.now() + 30 * 24 * 60 * 60 * 1000 : undefined,
    };

    await agentsRef.doc(agentId).set(newAgent);

    res.status(201).json(newAgent);
  } catch (error) {
    console.error('Failed to create agent:', error);
    res.status(500).json({ error: 'Failed to create agent in database.' });
  }
});

// Update an agent's details
app.post('/api/admin/agents/:agentId/update', hasPermission('agents'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const agentId = req.params.agentId as string;
    const { username, password, commissionRate, status, location, phone, promoCode, businessModel, monthlySalary, monthlyTarget, dailyTransactionLimit, salaryStatus, nextSalaryDate } = req.body;

    try {
        const agentRef = isMySqlRuntimePrimary() ? null : db.collection('agents').doc(agentId);
        const agentDoc = agentRef ? await agentRef.get() : null;
        const agentData = isMySqlRuntimePrimary() ? store.agents[agentId] : (agentDoc?.data() as Agent | undefined);
        if (!agentData) return res.status(404).json({ error: 'Agent not found.' });
        const targetUsername = String(agentData.username || '').toLowerCase();
        const targetRole = String((agentData as any).role || '').toLowerCase();
        const isFullAdminAgent = targetUsername === 'admin' || targetUsername === 'superadmin' || targetRole.includes('admin') || targetRole.includes('super');

        if (isFullAdminAgent) {
            return res.status(400).json({ error: 'Full Admin agents are protected and cannot be edited, suspended, or deleted.' });
        }

        const normalizedPromoCode = promoCode === undefined
          ? undefined
          : normalizePromoCode(promoCode);

        if (normalizedPromoCode !== undefined && !normalizedPromoCode) {
            return res.status(400).json({ error: 'Promo code cannot be empty.' });
        }

        // Check for promo code uniqueness if it's being changed
        if (normalizedPromoCode && normalizedPromoCode !== normalizePromoCode(agentData.promoCode)) {
            const agentsRef = db.collection('agents');
            const matchingPromoDocs = await findAgentDocsByPromoCode(agentsRef, normalizedPromoCode);
            if (matchingPromoDocs.some(doc => doc.id !== agentId)) {
                   return res.status(400).json({ error: 'Promo code is already in use by another agent.' });
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

        if (normalizedPromoCode !== undefined) {
            updateData.promoCode = normalizedPromoCode;
        }

        if (businessModel === 'independent' || businessModel === 'monthly') {
            updateData.businessModel = businessModel;
            if (businessModel === 'independent') {
                updateData.monthlySalary = 0;
                updateData.monthlyTarget = 0;
                updateData.dailyTransactionLimit = 0;
                updateData.salaryStatus = undefined;
                updateData.nextSalaryDate = undefined;
            }
        }
        if (businessModel === 'monthly' || agentData.businessModel === 'monthly') {
            if (monthlySalary !== undefined && Number.isFinite(Number(monthlySalary))) updateData.monthlySalary = Math.max(0, Number(monthlySalary));
            if (monthlyTarget !== undefined && Number.isFinite(Number(monthlyTarget))) updateData.monthlyTarget = Math.max(0, Number(monthlyTarget));
            if (dailyTransactionLimit !== undefined && Number.isFinite(Number(dailyTransactionLimit))) updateData.dailyTransactionLimit = Math.max(0, Number(dailyTransactionLimit));
            if (salaryStatus && ['current', 'due', 'paid'].includes(salaryStatus)) updateData.salaryStatus = salaryStatus;
            if (nextSalaryDate !== undefined && Number.isFinite(Number(nextSalaryDate))) updateData.nextSalaryDate = Number(nextSalaryDate);
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update.' });
        }

        const updatedAgent = { ...agentData, ...updateData } as Agent;
        if (isMySqlRuntimePrimary()) { await saveMySqlAgent(updatedAgent); store.agents[agentId] = updatedAgent; agentCache.set(agentId, updatedAgent); await saveStoreAndWait(); }
        else await agentRef!.update(updateData);
        res.json({ success: true, agent: isMySqlRuntimePrimary() ? updatedAgent : (await agentRef!.get()).data() });
    } catch (error) {
        console.error(`Failed to update agent ${agentId}:`, error);
        res.status(500).json({ error: 'Failed to update agent in database.' });
    }
});

// Delete an agent
app.delete('/api/admin/agents/:agentId/delete', hasPermission('agents'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const agentId = req.params.agentId as string;

    try {
        const agentRef = isMySqlRuntimePrimary() ? null : db.collection('agents').doc(agentId);
        const agentDoc = agentRef ? await agentRef.get() : null;
        const agentData = isMySqlRuntimePrimary() ? store.agents[agentId] : (agentDoc?.data() as Agent | undefined);
        if (!agentData) return res.status(404).json({ error: 'Agent not found.' });
        const targetUsername = String(agentData.username || '').toLowerCase();
        const targetRole = String((agentData as any).role || '').toLowerCase();
        const isFullAdminAgent = targetUsername === 'admin' || targetUsername === 'superadmin' || targetRole.includes('admin') || targetRole.includes('super');

        if (isFullAdminAgent) {
            return res.status(400).json({ error: 'Full Admin agents are protected and cannot be deleted.' });
        }

        const linkedPlayers = Object.values(store.users).filter(user => user.linkedAgentId === agentId);
        if (linkedPlayers.length > 0) {
            return res.status(409).json({
                error: `This agent has ${linkedPlayers.length} linked player(s). Reassign or unlink them before deleting the agent.`
            });
        }

        if (isMySqlRuntimePrimary()) { await deleteMySqlAgent(agentId); delete store.agents[agentId]; agentCache.delete(agentId); await saveStoreAndWait(); }
        else await agentRef!.delete();
        res.json({ success: true, message: 'Agent deleted successfully.' });
    } catch (error) {
        console.error(`Failed to delete agent ${agentId}:`, error);
        res.status(500).json({ error: 'Failed to delete agent.' });
    }
});

// Credit an agent's float balance
app.post('/api/admin/agents/:agentId/credit', hasPermission('agents'), async (req, res) => {
  if (!db) return res.status(500).json({ error: 'Database not initialized' });
  const agentId = req.params.agentId as string;
  const { amount, discount } = req.body;
  const creditAmount = parseFloat(amount);
  const discountAmount = parseFloat(discount) || 0;

  if (!agentId || !Number.isFinite(creditAmount) || creditAmount === 0) {
    return res.status(400).json({ error: 'Valid agentId and a non-zero adjustment amount are required.' });
  }
  const safeDiscountAmount = creditAmount > 0 ? Math.max(0, discountAmount) : 0;

  try {
    if (isMySqlRuntimePrimary()) {
      const transactionData: AgentTransaction = {
        id: `agent_tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, agentId, type: 'FloatPurchase', amount: creditAmount,
        discountAmount: safeDiscountAmount, timestamp: Date.now(),
        description: creditAmount > 0 ? `Admin added $${creditAmount.toFixed(2)} to agent float with a $${safeDiscountAmount.toFixed(2)} commission discount.` : `Admin deducted $${Math.abs(creditAmount).toFixed(2)} from agent float as a balance correction.`,
      };
      const result = await adjustMySqlAgentFloat({ agentId, amount: creditAmount, transaction: transactionData });
      store.agents[agentId] = result.agent; agentCache.set(agentId, result.agent); agentTransactionsCache.set(transactionData.id, transactionData);
      await saveStoreAndWait();
      return res.json({ success: true, agent: result.agent, transaction: transactionData });
    }
    const agentRef = db.collection('agents').doc(agentId);
    const transactionRef = db.collection('agentTransactions').doc(); // Auto-generate ID

    const transactionData: AgentTransaction = {
      id: transactionRef.id,
      agentId: agentId,
      type: 'FloatPurchase',
      amount: creditAmount,
      discountAmount: safeDiscountAmount,
      timestamp: Date.now(),
      description: creditAmount > 0
        ? `Admin added $${creditAmount.toFixed(2)} to agent float with a $${safeDiscountAmount.toFixed(2)} commission discount.`
        : `Admin deducted $${Math.abs(creditAmount).toFixed(2)} from agent float as a balance correction.`
    };

    await db.runTransaction(async (t) => {
      const agentDoc = await t.get(agentRef);
      if (!agentDoc.exists) {
        throw new Error('Agent not found.'); // This will be caught and sent as 500, can be refined
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
    // Basic error handling, could check for specific error types
    if ((error as Error).message === 'Agent not found.') {
        return res.status(404).json({ error: 'Agent not found.' });
    }
    if ((error as Error).message.includes('exceeds current float balance')) {
        return res.status(400).json({ error: (error as Error).message });
    }
    res.status(500).json({ error: 'Failed to credit agent float in database.' });
  }
});


// Get all agent requests for admin view
app.get('/api/admin/agent-requests', hasPermission('agents'), async (req, res) => {
  try {
    const requests = [...agentRequestsCache.values()].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    res.json(requests);
  } catch (error) {
    console.error('Failed to get agent requests:', error);
    res.status(500).json({ error: 'Failed to retrieve agent requests.' });
  }
});

// Approve an agent float request
app.post('/api/admin/agent-requests/:requestId/approve', hasPermission('agents'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const requestId = req.params.requestId as string;
    const adminId = req.query.userId as string;

    try {
        if (isMySqlRuntimePrimary()) {
          const request = agentRequestsCache.get(requestId);
          if (!request) return res.status(404).json({ error: 'Request not found.' });
          const admin = adminUsersCache.get(adminId) || { id: adminId, username: 'Unknown Admin' };
          const result = await resolveMySqlAgentRequest({ request, admin, approved: true });
          agentRequestsCache.set(requestId, result.request);
          if (result.agent) { store.agents[result.agent.id] = result.agent; agentCache.set(result.agent.id, result.agent); }
          if (result.transaction) agentTransactionsCache.set(result.transaction.id, result.transaction);
          await saveStoreAndWait();
          return res.json({ success: true, message: 'Agent float request approved.' });
        }
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
            const commissionRate = Math.max(0, Math.min(1, Number(agentDoc.data()?.commissionRate || 0)));
            const discountAmount = Number((request.amount * commissionRate).toFixed(2));

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
                discountAmount,
                timestamp: Date.now(),
                description: `Float request for $${request.amount.toFixed(2)} approved; admin cash $${(request.amount - discountAmount).toFixed(2)}, agent commission $${discountAmount.toFixed(2)}. Request ID: ${request.id}`
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
app.post('/api/admin/agent-requests/:requestId/reject', hasPermission('agents'), async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const { requestId } = req.params;
    const adminId = req.query.userId as string;

    try {
        const reqId = Array.isArray(requestId) ? requestId[0] : requestId;
        if (isMySqlRuntimePrimary()) {
          const request = agentRequestsCache.get(reqId);
          if (!request) return res.status(404).json({ error: 'Request not found.' });
          const admin = adminUsersCache.get(adminId) || { id: adminId, username: 'Unknown Admin' };
          const result = await resolveMySqlAgentRequest({ request, admin, approved: false });
          agentRequestsCache.set(reqId, result.request);
          return res.json({ success: true, message: 'Agent float request rejected.' });
        }
        const requestRef = db.collection('agentRequests').doc(reqId);
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
app.delete('/api/admin/users/:userId/delete', hasPermission('users'), (req, res) => {
    const userId = req.params.userId as string;
    const userToDelete = store.users[userId];

    if (userToDelete) {
        const uName = String(userToDelete.username || '').toLowerCase();
        const uRole = String(userToDelete.role || '').toLowerCase();
        if (uName === 'admin' || uRole.includes('admin') || uRole.includes('super')) {
            return res.status(400).json({ error: 'Full Admin users are protected and cannot be deleted.' });
        }

        delete store.users[userId];
        saveStoreAndWait();
        res.json({ success: true, message: `User ${userId} has been deleted.` });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});



// Cancel a game
app.post('/api/admin/rooms/:roomId/cancel', hasPermission('rooms'), (req, res) => {
    const roomId = req.params.roomId as string;
    const room = store.rooms[roomId];
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    // Refund players
    if (room.betAmount > 0) {
        room.players.forEach((p: any) => {
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
app.post('/api/admin/users/:userId/toggle-admin', hasPermission('users'), (req, res) => {
    const userId = req.params.userId as string;
    const user = store.users[userId];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const uName = String(user.username || '').toLowerCase();
    const uRole = String(user.role || '').toLowerCase();
    if (uName === 'admin' || uName === 'superadmin' || uRole.includes('admin') || uRole.includes('super')) {
        return res.status(400).json({ error: 'Full Admin users are protected and cannot be modified.' });
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
app.get('/api/admin/users/:userId/games', hasPermission('users'), (req, res) => {
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
        if (isMySqlRuntimePrimary()) {
          const agent = [...agentCache.values()].find(item => item.username === username) || Object.values(store.agents).find(item => item.username === username);
          if (!agent || agent.password !== password) return res.status(401).json({ error: 'Invalid credentials.' });
          if (agent.status !== 'Active') return res.status(403).json({ error: 'This agent account is not active.' });
          const { password: _, ...safeAgent } = agent;
          return res.json({ success: true, agent: safeAgent });
        }
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

        const { password: _, ...safeAgent } = agent;
        res.json({ success: true, agent: safeAgent });

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
        const agent = await cachedAgent(agentId);
        if (!agent) {
            return res.status(403).json({ error: 'Access denied. Invalid agent ID.' });
        }

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
    const { password: _, ...safeAgent } = agent;
    res.json(safeAgent);
});

app.put('/api/agent/location', isAgent, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    const agent = (req as any).agent as Agent;
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Invalid location coordinates.' });
    }
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`, { headers: { 'User-Agent': 'LudoSom-Agent-Location/1.0' } });
        if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
        const result: any = await response.json();
        const location = formatGeocodedLocation(result.address);
        if (!location) return res.status(422).json({ error: 'Could not identify a city for this location.' });
        if (isMySqlRuntimePrimary()) {
          agent.location = location; await saveMySqlAgent(agent); store.agents[agent.id] = agent; agentCache.set(agent.id, agent);
          const { password: _, ...safeAgent } = agent;
          return res.json({ success: true, agent: safeAgent });
        }
        await db.collection('agents').doc(agent.id).update({ location });
        const { password: _, ...safeAgent } = { ...agent, location };
        res.json({ success: true, agent: safeAgent });
    } catch (error) {
        console.error(`Failed to detect agent location ${agent.id}:`, error);
        res.status(502).json({ error: 'Location service is temporarily unavailable. Please try again.' });
    }
});

// Update only the signed-in agent's personal profile and password. Financial,
// commission, promo-code and account-status fields remain admin-controlled.
app.put('/api/agent/profile', isAgent, async (req, res) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });

    const agent = (req as any).agent as Agent;
    const agentId = req.query.agentId as string;
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
    const location = typeof req.body.location === 'string' ? req.body.location.trim() : '';
    const currentPassword = req.body.currentPassword;
    const newPassword = req.body.newPassword;
    const confirmPassword = req.body.confirmPassword;

    if (!username || username.length < 3 || !phone || !location) {
        return res.status(400).json({ error: 'Username must be at least 3 characters; phone and detected location are required.' });
    }
    if (typeof currentPassword !== 'string' || agent.password !== currentPassword) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    if (newPassword) {
        if (typeof newPassword !== 'string' || newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters.' });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'New password and confirmation do not match.' });
        }
    }

    try {
        if (isMySqlRuntimePrimary()) {
          if (username.toLowerCase() !== String(agent.username).toLowerCase() && [...agentCache.values()].some(item => item.id !== agentId && item.username.toLowerCase() === username.toLowerCase())) {
            return res.status(409).json({ error: 'That agent username is already in use.' });
          }
          Object.assign(agent, { username, phone, location }, newPassword ? { password: newPassword } : {});
          await saveMySqlAgent(agent); store.agents[agent.id] = agent; agentCache.set(agent.id, agent);
          const { password: _, ...safeAgent } = agent;
          return res.json({ success: true, agent: safeAgent, message: 'Profile updated successfully.' });
        }
        if (username.toLowerCase() !== String(agent.username).toLowerCase()) {
            const usernameSnapshot = await db.collection('agents').where('username', '==', username).get();
            if (usernameSnapshot.docs.some(doc => doc.id !== agentId)) {
                return res.status(409).json({ error: 'That agent username is already in use.' });
            }
        }

        const updateData: Partial<Agent> = { username, phone, location };
        if (newPassword) updateData.password = newPassword;
        await db.collection('agents').doc(agentId).update(updateData);

        const updatedDoc = await db.collection('agents').doc(agentId).get();
        const { password: _, ...safeAgent } = updatedDoc.data() as Agent;
        res.json({ success: true, agent: safeAgent, message: 'Profile updated successfully.' });
    } catch (error) {
        console.error(`Failed to update agent profile ${agentId}:`, error);
        res.status(500).json({ error: 'Failed to update agent profile.' });
    }
});

// Search for a player by username
app.get('/api/agent/player-lookup', isAgent, (req, res) => {
    const agent: Agent = (req as any).agent;
    const { query } = req.query;
    if (!query || typeof query !== 'string' || query.length < 2) {
        return res.status(400).json({ error: 'A search query of at least 2 characters is required.' });
    }

    const lowerCaseQuery = query.toLowerCase();
    const results = Object.values(store.users)
        .filter(u => u.username.toLowerCase().includes(lowerCaseQuery) && !u.id.startsWith('bot_'))
        .filter(u => !u.linkedAgentId || u.linkedAgentId === agent.id)
        .map(u => ({ id: u.id, username: u.username, avatar: u.avatar })) // Return minimal info
        .slice(0, 10); // Limit results

    res.json(results);
});

// Get agent's own transaction history
app.get('/api/agent/transactions', isAgent, async (req, res) => {
    const agent = (req as any).agent;
    try {
        const transactions = [...agentTransactionsCache.values()].filter(transaction => transaction.agentId === agent.id);
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

    if (player.linkedAgentId && player.linkedAgentId !== agent.id) {
        return res.status(400).json({ error: 'This player is linked to a different agent via promo code.' });
    }
    
    try {
        if (isMySqlRuntimePrimary()) {
          const agentTx: AgentTransaction = { id: `agent_tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, agentId: agent.id, type: 'PlayerDeposit', amount: depositAmount, playerId, timestamp: Date.now(), description: `Deposited ${depositAmount} into ${player.username}'s account.` };
          const result = await adjustMySqlAgentFloat({ agentId: agent.id, amount: -depositAmount, transaction: agentTx, player });
          Object.assign(agent, result.agent); Object.assign(player, result.player);
          store.agents[agent.id] = agent; agentCache.set(agent.id, agent); agentTransactionsCache.set(agentTx.id, agentTx);
          addTransaction(playerId, 'deposit', depositAmount, undefined, `Deposit received from agent ${agent.id}.`);
          await saveStoreAndWait(); broadcastUserUpdate(player.id);
          return res.json({ success: true, newAgentBalance: agent.floatBalance, newPlayerBalance: player.balance });
        }
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
        if (isMySqlRuntimePrimary()) {
          const newRequest: AgentRequest = { id: `agent_req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, agentId: agent.id, agentUsername: agent.username, amount: requestAmount, status: 'pending', createdAt: Date.now() };
          await saveMySqlAgentRequest(newRequest); agentRequestsCache.set(newRequest.id, newRequest);
          return res.status(201).json({ success: true, message: 'Your float request has been submitted for review.', request: newRequest });
        }
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
    const agent: Agent = (req as any).agent;
    try {
        const requests = [...agentRequestsCache.values()].filter(request => request.agentId === agent.id);
        requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        res.json(requests);
    } catch (error) {
        console.error(`Failed to get float requests for agent ${agent.id}:`, error);
        res.status(500).json({ error: 'Failed to retrieve float requests.' });
    }
});

// Agent gets list of manual player requests for transactions
app.get('/api/agent/player-requests', isAgent, async (req, res) => {
    const agent: Agent = (req as any).agent;

    const agentSpecificTxs = store.pendingManualTransactions.filter(tx => {
        const user = store.users[tx.userId];
        return tx.agentId === agent.id && (tx.managedBy === 'agent' || user?.linkedAgentId === agent.id);
    });

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
    const tx = await findManualRequest(requestId);

    if (!tx || tx.status !== 'pending') {
        return res.status(404).json({ error: 'Pending transaction not found or already processed.' });
    }

    if (tx.agentId !== agent.id) {
        return res.status(403).json({ error: 'This transaction request belongs to a different agent.' });
    }

    const user = store.users[tx.userId];
    if (!user) {
        return res.status(404).json({ error: 'User associated with transaction not found.' });
    }

    if (user.linkedAgentId && user.linkedAgentId !== agent.id) {
        return res.status(400).json({ error: 'This player is locked to a different agent via promo code.' });
    }

    try {
        if (!db && !isMySqlRuntimePrimary()) {
            throw new Error("Database not initialized");
        }

        let approvedUserBalance = user.balance;
        if (isMySqlRuntimePrimary()) {
          if (tx.transactionType === 'withdraw') {
            const eligibilityError = withdrawalEligibilityError(user, tx.amount, tx.id);
            if (eligibilityError) throw new Error(eligibilityError);
          }
          const agentTx: AgentTransaction = {
            id: `agent_tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            agentId: agent.id,
            type: tx.transactionType === 'deposit' ? 'PlayerDeposit' : 'PlayerWithdrawal',
            amount: tx.amount,
            playerId: user.id,
            playerName: user.username,
            timestamp: Date.now(),
            description: `Approved ${tx.transactionType} of $${tx.amount} for player ${user.username}.`,
          };
          const approved = await approveMySqlAgentPlayerRequest({ agent, user, request: tx, agentTransaction: agentTx });
          approvedUserBalance = Number(approved.user.balance);
          Object.assign(agent, approved.agent);
          Object.assign(user, approved.user);
          Object.assign(tx, approved.request);
          store.agents[agent.id] = agent;
          agentCache.set(agent.id, agent);
          agentTransactionsCache.set(agentTx.id, agentTx);
        } else await db.runTransaction(async (t) => {
            const agentRef = db.collection('agents').doc(agent.id);
            const userRef = db.collection('users').doc(user.firebaseUid || user.id);
            const agentDoc = await t.get(agentRef);
            const userDoc = await t.get(userRef);

            if (!agentDoc.exists) {
                throw new Error("Agent not found in database");
            }
            const agentData = agentDoc.data() as Agent;
            const currentFloat = agentData.floatBalance || 0;
            const persistedBalance = Number(userDoc.data()?.balance ?? user.balance);

            if (agentData.businessModel === 'monthly' && Number(agentData.dailyTransactionLimit || 0) > 0) {
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);
                const dailyQuery = db.collection('agentTransactions')
                    .where('agentId', '==', agent.id)
                    .where('timestamp', '>=', startOfDay.getTime());
                const dailySnapshot = await t.get(dailyQuery);
                const processedToday = dailySnapshot.docs.reduce((total, doc) => {
                    const item = doc.data() as AgentTransaction;
                    return ['PlayerDeposit', 'PlayerWithdrawal'].includes(item.type) ? total + Number(item.amount || 0) : total;
                }, 0);
                if (processedToday + Number(tx.amount || 0) > Number(agentData.dailyTransactionLimit)) {
                    throw new Error(`Daily transaction limit exceeded. Remaining today: $${Math.max(0, Number(agentData.dailyTransactionLimit) - processedToday).toFixed(2)}.`);
                }
            }
            let newAgentFloat: number;
            let newUserBalance: number;

            if (tx.transactionType === 'deposit') {
                // Agent gives money to player, agent float decreases.
                if (currentFloat < tx.amount) {
                    throw new Error("Insufficient float balance to approve this deposit.");
                }
                newAgentFloat = currentFloat - tx.amount;
                newUserBalance = persistedBalance + tx.amount;
            } else { // withdrawal
                const eligibilityError = withdrawalEligibilityError(user, tx.amount, tx.id);
                if (eligibilityError) throw new Error(eligibilityError);
                // Agent receives money from player, agent float increases.
                if (persistedBalance < tx.amount) {
                    // This transaction should just fail, not be rejected. Rejection is an explicit agent action.
                    throw new Error('Player has insufficient balance for this withdrawal.');
                }
                // The agent pays the player the quoted net amount; the fee belongs to the platform.
                const withdrawalNet = Number(tx.netAmount ?? (tx.amount - Number(tx.fee || 0)));
                newAgentFloat = currentFloat + Math.max(0, withdrawalNet);
                newUserBalance = persistedBalance - tx.amount;
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
            t.set(userRef, { balance: newUserBalance, id: user.id, firebaseUid: user.firebaseUid || null }, { merge: true });
            approvedUserBalance = newUserBalance;
        });

        // If transaction is successful, update in-memory store
        user.balance = approvedUserBalance;
        addTransaction(
          user.id,
          tx.transactionType === 'deposit' ? 'deposit' : 'withdrawal',
          tx.amount,
          undefined,
          `Manual ${tx.transactionType} approved by agent ${agent.username}. Request ID: ${tx.id}`
        );
        if (tx.transactionType === 'withdraw') {
          recordWithdrawalFee(user.id, Number(tx.fee || 0), tx.id);
        }
        tx.status = 'approved';
        (tx as any).resolvedBy = agent.id;
        (tx as any).resolverUsername = agent.username;
        await saveManualRequestToFirestore(tx);
        await saveUserProfileToFirestore(user);
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
    const tx = await findManualRequest(requestId);

    if (!tx || tx.status !== 'pending') {
        return res.status(404).json({ error: 'Pending transaction not found or already processed.' });
    }


    if (tx.agentId !== agent.id) {
        return res.status(403).json({ error: 'This transaction request belongs to a different agent.' });
    }

    const user = store.users[tx.userId];
    if (!user) {
        tx.status = 'rejected';
        await saveManualRequestToFirestore(tx);
        await saveStoreAndWait();
        return res.status(404).json({ error: 'User associated with transaction not found. Transaction rejected.' });
    }
    
    tx.status = 'rejected';
    (tx as any).resolvedBy = agent.id;
    (tx as any).resolverUsername = agent.username;
    await saveManualRequestToFirestore(tx);
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
app.get('/api/agent/my-players', isAgent, async (req, res) => {
    const agent: Agent = (req as any).agent;
    try {
      const normalizedAgentPromo = normalizePromoCode(agent.promoCode);
      const linkedPlayers = isMySqlRuntimePrimary()
        ? await listMySqlUsersByAgent(agent.id, normalizedAgentPromo)
        : Object.values(store.users).filter(user => user.linkedAgentId === agent.id
          || (!user.linkedAgentId && normalizePromoCode(user.appliedPromoCode) === normalizedAgentPromo));

      // Repair legacy profiles that recorded the promo code but missed the
      // linkedAgentId field. Never overwrite a link to another agent.
      await Promise.all(linkedPlayers.map(async player => {
        if (!player.linkedAgentId) {
          player.linkedAgentId = agent.id;
          player.appliedPromoCode = normalizedAgentPromo;
          await saveUserProfileToFirestore(player);
        }
      }));

      // Keep memory in sync for deposit requests and other agent operations.
      linkedPlayers.forEach(player => { store.users[player.id] = player; });
      const sanitizedPlayers = linkedPlayers.map(p => {
          const { password, ...playerData } = p;
          return playerData;
      });
      res.json(sanitizedPlayers);
    } catch (error) {
      console.error(`Failed to load linked players for agent ${agent.id}:`, error);
      res.status(500).json({ error: 'Linked players could not be loaded.' });
    }
});


// Specific route for the Agent Dashboard
app.get('/agent', (req, res) => {
  const distPath = getDistDirectory();
  const agentFile = fs.existsSync(path.join(distPath, 'agent.html'))
    ? path.join(distPath, 'agent.html')
    : path.join(process.cwd(), 'agent.html');

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(agentFile);
});

// API routes must always return JSON, including unexpected failures. This also
// prevents the SPA HTML fallback from surfacing as an "Unexpected token <" error.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.path.startsWith('/api')) return next(error);
  console.error(`Unhandled API error for ${req.method} ${req.path}:`, error);
  const quotaExceeded = error?.code === 8 || String(error?.message || '').includes('RESOURCE_EXHAUSTED');
  res.status(quotaExceeded ? 503 : 500).json({
    error: quotaExceeded
      ? 'Database quota is temporarily exhausted. Please try again after the quota resets.'
      : 'The server could not complete this request.'
  });
});

// For all other non-API routes, serve the main app's index.html file.
app.get(/^(?!\/api).*/, (req, res) => {
  // If request is for a missing static asset file, return 404 instead of index.html
  if (req.path.startsWith('/assets/') || /\.(js|css|png|jpg|jpeg|gif|svg|ico|json|mp3|wav|woff|woff2|ttf|map|webmanifest)$/i.test(req.path)) {
    return res.status(404).send('Asset not found');
  }

  const distPath = getDistDirectory();
  const indexFile = fs.existsSync(path.join(distPath, 'index.html'))
    ? path.join(distPath, 'index.html')
    : path.join(process.cwd(), 'index.html');

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(indexFile);
});

// ==========================================
// 7. VITE MIDDLEWARE SETUP
// ==========================================
async function startServer() {
  let vite: ViteDevServer | undefined;
  if (process.env.NODE_ENV === "development") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const server = typeof PORT === 'number'
    ? app.listen(PORT, '0.0.0.0', () => {
        console.log(`Betting Ludo Game Full-Stack App listening at http://localhost:${PORT}`);
      })
    : app.listen(PORT, () => {
        console.log(`Betting Ludo Game Full-Stack App listening on socket ${PORT}`);
      });

  const migrationMode = firebaseMySqlMigrationMode;

  // Verify Hostinger MySQL independently of Firestore. This is read-only and
  // makes credential problems visible even while the Firebase quota is closed.
  if (migrationMode) {
    console.log('MySQL connection check is delegated to the one-time migration.');
  } else if (isMySqlConfigured()) {
    void testMySqlConnection()
      .then(() => console.log('MySQL connection verified successfully.'))
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        if (/access denied/i.test(message)) console.error('MySQL connection failed: check MYSQL_USER and MYSQL_PASSWORD.');
        else if (/unknown database/i.test(message)) console.error('MySQL connection failed: check MYSQL_DATABASE.');
        else if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message)) console.error('MySQL connection failed: check MYSQL_HOST, MYSQL_PORT and network access.');
        else console.error('MySQL connection failed.');
      });
  } else {
    console.warn('MySQL connection check skipped: configuration is incomplete.');
  }

  // Hostinger requires listen() within three seconds. Load persistent state only
  // after binding the port; loadStoreFromFirestore already falls back to disk.
  try {
    const runtimeStoreMode = mysqlRuntimeStoreMode();
    let loadedFromFirebase = false;
    let loadedFromMySql = false;
    if (runtimeStoreMode === 'primary' && !migrationMode) {
      loadedFromMySql = await loadStoreFromMySql();
    }
    if (!loadedFromMySql) {
      loadedFromFirebase = await loadStoreFromFirestore();
    }
    purgeSimulatedUsers();
    if (!migrationMode && loadedFromFirebase && runtimeStoreMode !== 'disabled') {
      await saveRuntimeStoreToMySql(JSON.parse(JSON.stringify(store)));
      console.log(`MySQL runtime store ${runtimeStoreMode === 'shadow' ? 'shadow' : 'fallback'} snapshot verified.`);
    }
    if (!migrationMode && runtimeStoreMode === 'primary' && loadedFromMySql) {
      console.log('MySQL runtime store primary mode active; central Firestore writes are disabled.');
    }
    if (!migrationMode) {
      await startFirestoreLiveCaches();
      await startMySqlPrimaryCaches();
      await startMySqlMatchmakingSync();
      await startMySqlCashierHeartbeatSync();
      console.log('Application state initialization completed.');
    } else {
      console.log('Migration mode active: Firestore live caches are paused to preserve quota.');
    }
  } catch (error) {
    console.error('Application state initialization failed; continuing with local fallback:', error);
  }

  if (migrationMode) {
    console.log('One-time Firebase to MySQL migration requested; starting in the background.');
    const runMigrationWithQuotaRetry = async () => {
      try {
        await migrateFirestoreToMySql({ requireExecuteFlag: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/RESOURCE_EXHAUSTED|quota exceeded/i.test(message)) {
          const retryMinutes = 15;
          console.warn(`Firebase quota is unavailable; migration will retry automatically in ${retryMinutes} minutes.`);
          const retryTimer = setTimeout(() => void runMigrationWithQuotaRetry(), retryMinutes * 60_000);
          retryTimer.unref?.();
          return;
        }
        console.error('One-time Firebase to MySQL migration failed:', message);
      }
    };
    void runMigrationWithQuotaRetry();
  }

  // Handle Vite HMR WebSocket upgrade requests
  server.on('upgrade', (req, socket, head) => {
    if (vite && req.url?.includes('__vite_hmr')) {
      (vite.ws as any).handleUpgrade(req, socket, head);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    firestoreLiveUnsubscribes.splice(0).forEach(unsubscribe => unsubscribe());
    if (mysqlMatchmakingTimer) clearInterval(mysqlMatchmakingTimer);
    if (mysqlCashierHeartbeatTimer) clearInterval(mysqlCashierHeartbeatTimer);
    server.close(() => {
      console.log('Server shut down.');
      process.exit(0);
    });
  });
}

startServer();
