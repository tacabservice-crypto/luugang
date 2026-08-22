var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_url = require("url");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_app2 = require("firebase-admin/app");
var import_firestore2 = require("firebase-admin/firestore");

// scripts/migrate-firestore-to-mysql.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");

// src/server/mysql.ts
var import_promise = __toESM(require("mysql2/promise"), 1);
var pool = null;
function isMySqlConfigured() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}
function mysqlConfig() {
  if (!isMySqlConfigured()) {
    throw new Error("MySQL is not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE.");
  }
  const useSsl = String(process.env.MYSQL_SSL || "").toLowerCase() === "true";
  return {
    host: process.env.MYSQL_HOST,
    port: Math.max(1, Number(process.env.MYSQL_PORT) || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: Math.max(1, Math.min(20, Number(process.env.MYSQL_CONNECTION_LIMIT) || 5)),
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z",
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    ...useSsl ? { ssl: { rejectUnauthorized: String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false" } } : {}
  };
}
function getMySqlPool() {
  if (!pool) pool = import_promise.default.createPool(mysqlConfig());
  return pool;
}
async function testMySqlConnection() {
  const connection = await getMySqlPool().getConnection();
  try {
    const [rows] = await connection.query("SELECT DATABASE() AS databaseName, UTC_TIMESTAMP() AS serverTime");
    return rows;
  } finally {
    connection.release();
  }
}
async function closeMySqlPool() {
  if (!pool) return;
  const activePool = pool;
  pool = null;
  await activePool.end();
}

// scripts/migrate-firestore-to-mysql.ts
var now = () => Date.now();
var json = (value) => JSON.stringify(value ?? {});
var money = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00";
var timestamp = (value, fallback = now()) => Math.max(0, Number(value) || fallback);
function firebaseCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) return JSON.parse(inline);
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    import_node_path.default.join(process.cwd(), "firebase-admin-key.json"),
    import_node_path.default.join(process.cwd(), "service-account.json"),
    import_node_path.default.join(process.cwd(), "firebase-key.json")
  ].filter(Boolean);
  const found = candidates.find((file) => import_node_fs.default.existsSync(file));
  if (!found) throw new Error("Firebase Admin credentials were not found.");
  return JSON.parse(import_node_fs.default.readFileSync(found, "utf8"));
}
async function collectionMap(collectionName) {
  const snapshot = await (0, import_firestore.getFirestore)().collection(collectionName).get();
  return new Map(snapshot.docs.map((document) => [document.id, { id: document.id, ...document.data() }]));
}
async function loadSourceSnapshot() {
  const db2 = (0, import_firestore.getFirestore)();
  const mainDocument = await db2.collection("ludo_store").doc("main").get();
  if (!mainDocument.exists || !mainDocument.data()?.data) throw new Error("Firestore ludo_store/main snapshot is missing.");
  const store2 = JSON.parse(String(mainDocument.data().data));
  const [firestoreUsers, manualRequests, agents, adminUsers, agentRequests, agentTransactions, cashierPayments, emailOtps] = await Promise.all([
    collectionMap("users"),
    collectionMap("manualTransactionRequests"),
    collectionMap("agents"),
    collectionMap("adminUsers"),
    collectionMap("agentRequests"),
    collectionMap("agentTransactions"),
    collectionMap("cashierPayments"),
    collectionMap("emailOtps")
  ]);
  const users = /* @__PURE__ */ new Map();
  Object.values(store2.users || {}).forEach((user) => {
    if (user?.id && !String(user.id).startsWith("bot_") && !String(user.id).startsWith("user_sim_")) users.set(String(user.id), user);
  });
  firestoreUsers.forEach((user) => {
    if (user?.id) users.set(String(user.id), { ...users.get(String(user.id)) || {}, ...user });
  });
  const mergedAgents = new Map(Object.entries(store2.agents || {}));
  agents.forEach((agent, id) => mergedAgents.set(id, { ...mergedAgents.get(id) || {}, ...agent }));
  const mergedManual = new Map((store2.pendingManualTransactions || []).map((request) => [String(request.id), request]));
  manualRequests.forEach((request, id) => mergedManual.set(id, { ...mergedManual.get(id) || {}, ...request }));
  const ensureUser = (userId) => {
    const id = String(userId || "").trim();
    if (!id || id === "house" || id === "platform") return;
    if (!users.has(id)) users.set(id, { id, username: "Migrated Account", balance: 0, winCount: 0, lossCount: 0, createdAt: now(), migrationPlaceholder: true });
  };
  (store2.transactions || []).forEach((transaction) => ensureUser(transaction.userId));
  mergedManual.forEach((request) => ensureUser(request.userId));
  return { store: store2, users, manualRequests: mergedManual, agents: mergedAgents, adminUsers, agentRequests, agentTransactions, cashierPayments, emailOtps };
}
async function migrateFirestoreToMySql(options = {}) {
  if (options.requireExecuteFlag !== false && !process.argv.includes("--execute")) throw new Error("Safety stop: add --execute to run the one-way Firebase to MySQL copy.");
  if (!isMySqlConfigured()) throw new Error("MySQL environment variables are incomplete.");
  if (!(0, import_app.getApps)().length) {
    const serviceAccount2 = firebaseCredential();
    serviceAccount2.private_key = String(serviceAccount2.private_key || "").replace(/\\n/g, "\n");
    (0, import_app.initializeApp)({ credential: (0, import_app.cert)(serviceAccount2) });
  }
  const pool2 = getMySqlPool();
  const connection = await pool2.getConnection();
  const migrationId = `firebase_${Date.now()}`;
  const sourceName = "firebase_initial_v1";
  let advisoryLockHeld = false;
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS data_migration_runs (
      id VARCHAR(191) PRIMARY KEY,
      source_name VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      summary_json JSON NOT NULL,
      started_at BIGINT UNSIGNED NOT NULL,
      completed_at BIGINT UNSIGNED NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const [lockRows] = await connection.query("SELECT GET_LOCK('ludosom_firebase_initial_v1', 0) AS acquired");
    advisoryLockHeld = Number(lockRows[0]?.acquired) === 1;
    if (!advisoryLockHeld) {
      console.log("Firebase to MySQL migration is already running in another application instance.");
      return { status: "already-running" };
    }
    const [completedRows] = await connection.execute("SELECT id FROM data_migration_runs WHERE source_name = ? AND status = ? LIMIT 1", [sourceName, "verified"]);
    if (completedRows.length) {
      console.log(`Firebase to MySQL migration was already verified (${completedRows[0].id}); skipping.`);
      return { status: "already-verified", migrationId: String(completedRows[0].id) };
    }
    const source = await loadSourceSnapshot();
    await connection.execute("INSERT INTO data_migration_runs (id, source_name, status, summary_json, started_at) VALUES (?, ?, ?, ?, ?)", [migrationId, sourceName, "running", json({}), now()]);
    await connection.beginTransaction();
    for (const user of source.users.values()) {
      const id = String(user.id);
      await connection.execute(
        `INSERT INTO app_users
        (id, firebase_uid, email, phone, username, avatar, balance, win_count, loss_count, linked_agent_id, applied_promo_code, email_verified, status, created_at, updated_at, profile_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE firebase_uid=VALUES(firebase_uid), email=VALUES(email), phone=VALUES(phone), username=VALUES(username), avatar=VALUES(avatar), balance=VALUES(balance), win_count=VALUES(win_count), loss_count=VALUES(loss_count), linked_agent_id=VALUES(linked_agent_id), applied_promo_code=VALUES(applied_promo_code), email_verified=VALUES(email_verified), status=VALUES(status), updated_at=VALUES(updated_at), profile_json=VALUES(profile_json), version=version+1`,
        [id, user.firebaseUid || null, user.email || null, user.phone || user.phoneNumber || null, user.username || "Player", user.avatar || null, money(user.balance), Number(user.winCount || 0), Number(user.lossCount || 0), user.linkedAgentId || null, user.appliedPromoCode || user.promoCode || null, Boolean(user.emailVerified), user.status || "active", timestamp(user.createdAt), now(), json(user)]
      );
    }
    for (const transaction of source.store.transactions || []) {
      const userId = String(transaction.userId || "");
      if (!source.users.has(userId)) continue;
      await connection.execute(
        `INSERT INTO wallet_transactions (id, user_id, transaction_type, amount, balance_after, status, reference_id, revenue_category, description, created_at, transaction_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), description=VALUES(description), transaction_json=VALUES(transaction_json)`,
        [String(transaction.id), userId, transaction.type || "unknown", money(transaction.amount), transaction.balanceAfter === void 0 ? null : money(transaction.balanceAfter), transaction.status || "completed", transaction.referenceId || transaction.matchId || transaction.roomId || null, transaction.revenueCategory || null, transaction.description || null, timestamp(transaction.timestamp || transaction.createdAt), json(transaction)]
      );
    }
    for (const [id, agent] of source.agents) {
      await connection.execute(
        `INSERT INTO agents (id, username, password_hash, phone, location, promo_code, commission_rate, balance, float_balance, business_model, status, created_at, updated_at, agent_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE username=VALUES(username), password_hash=VALUES(password_hash), phone=VALUES(phone), location=VALUES(location), promo_code=VALUES(promo_code), commission_rate=VALUES(commission_rate), balance=VALUES(balance), float_balance=VALUES(float_balance), business_model=VALUES(business_model), status=VALUES(status), updated_at=VALUES(updated_at), agent_json=VALUES(agent_json)`,
        [id, agent.username || id, agent.password || agent.passwordHash || null, agent.phone || null, agent.location || null, agent.promoCode || null, Number(agent.commissionRate || 0), money(agent.balance), money(agent.floatBalance), agent.businessModel || "independent", agent.status || "Active", timestamp(agent.createdAt), now(), json(agent)]
      );
    }
    for (const [id, admin] of source.adminUsers) {
      await connection.execute(
        `INSERT INTO admin_users (id, username, password_hash, name, permissions_json, status, location, cashier_locations_json, cashier_online_at, admin_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE username=VALUES(username), password_hash=VALUES(password_hash), name=VALUES(name), permissions_json=VALUES(permissions_json), status=VALUES(status), location=VALUES(location), cashier_locations_json=VALUES(cashier_locations_json), cashier_online_at=VALUES(cashier_online_at), admin_json=VALUES(admin_json), updated_at=VALUES(updated_at)`,
        [id, admin.username || id, admin.password || admin.passwordHash || null, admin.name || null, json(admin.permissions || []), admin.status || "active", admin.location || null, json(admin.cashierLocations || []), admin.cashierOnlineAt || null, json(admin), timestamp(admin.createdAt), now()]
      );
    }
    for (const [id, request] of source.manualRequests) {
      if (!source.users.has(String(request.userId || ""))) continue;
      await connection.execute(
        `INSERT INTO manual_transaction_requests (id, user_id, agent_id, managed_by, transaction_type, amount, status, assigned_cashier_id, created_at, resolved_at, request_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE agent_id=VALUES(agent_id), managed_by=VALUES(managed_by), status=VALUES(status), assigned_cashier_id=VALUES(assigned_cashier_id), resolved_at=VALUES(resolved_at), request_json=VALUES(request_json)`,
        [id, request.userId, request.agentId || null, request.managedBy || (request.agentId ? "agent" : "admin"), request.transactionType || request.type || "deposit", money(request.amount), request.status || "pending", request.assignedCashierId || null, timestamp(request.createdAt), request.resolvedAt || null, json(request)]
      );
    }
    for (const [id, request] of source.agentRequests) {
      await connection.execute(
        `INSERT INTO agent_requests (id, agent_id, amount, status, created_at, resolved_at, request_json) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount=VALUES(amount), status=VALUES(status), resolved_at=VALUES(resolved_at), request_json=VALUES(request_json)`,
        [id, request.agentId, money(request.amount), request.status || "pending", timestamp(request.createdAt), request.resolvedAt || null, json(request)]
      );
    }
    for (const [id, transaction] of source.agentTransactions) {
      await connection.execute(
        `INSERT INTO agent_transactions (id, agent_id, player_id, transaction_type, amount, discount_amount, created_at, transaction_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE transaction_json=VALUES(transaction_json)`,
        [id, transaction.agentId, transaction.playerId || null, transaction.type || "unknown", money(transaction.amount), money(transaction.discountAmount), timestamp(transaction.timestamp || transaction.createdAt), json(transaction)]
      );
    }
    for (const [id, room] of Object.entries(source.store.rooms || {})) {
      await connection.execute(
        `INSERT INTO game_rooms (id, status, bet_amount, created_at, updated_at, room_json) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), bet_amount=VALUES(bet_amount), updated_at=VALUES(updated_at), room_json=VALUES(room_json)`,
        [id, room.status || "unknown", money(room.betAmount), timestamp(room.createdAt), now(), json(room)]
      );
    }
    for (const [id, tournament] of Object.entries(source.store.tournaments || {})) {
      await connection.execute(
        `INSERT INTO tournaments (id, name, status, entry_fee, prize_pool, start_at, end_at, tournament_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status), entry_fee=VALUES(entry_fee), prize_pool=VALUES(prize_pool), start_at=VALUES(start_at), end_at=VALUES(end_at), tournament_json=VALUES(tournament_json), updated_at=VALUES(updated_at)`,
        [id, tournament.name || id, tournament.status || "unknown", money(tournament.entryFee), money(tournament.prizePool), timestamp(tournament.startDate), tournament.endDate || null, json(tournament), now()]
      );
    }
    for (const user of source.users.values()) {
      if (!user.vip?.tier || !Number(user.vip?.expires)) continue;
      const subscriptionId = `vip_${user.id}_${Number(user.vip.expires)}`;
      await connection.execute(
        `INSERT INTO vip_subscriptions (id, user_id, tier_key, amount, starts_at, expires_at, status, subscription_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE tier_key=VALUES(tier_key), expires_at=VALUES(expires_at), status=VALUES(status), subscription_json=VALUES(subscription_json)`,
        [subscriptionId, user.id, user.vip.tier, money(0), timestamp(user.vip.startedAt || user.createdAt), Number(user.vip.expires), Number(user.vip.expires) > now() ? "active" : "expired", json(user.vip)]
      );
    }
    for (const campaign of source.store.adCampaigns || []) {
      await connection.execute(
        `INSERT INTO ad_campaigns (id, enabled, format, placement, company_name, title, starts_at, ends_at, campaign_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), format=VALUES(format), placement=VALUES(placement), company_name=VALUES(company_name), title=VALUES(title), starts_at=VALUES(starts_at), ends_at=VALUES(ends_at), campaign_json=VALUES(campaign_json), updated_at=VALUES(updated_at)`,
        [String(campaign.id), Boolean(campaign.enabled), campaign.format || "banner", campaign.placement || "all", campaign.companyName || null, campaign.title || null, campaign.startAt || null, campaign.endAt || null, json(campaign), now()]
      );
    }
    const settings = { paymentProviders: source.store.paymentProviders || {}, agentFloatInstructions: source.store.agentFloatInstructions || "", vipTiers: source.store.vipTiers || {}, adminSettings: source.store.adminSettings || {}, adSettings: source.store.adSettings || {} };
    for (const [key, value] of Object.entries(settings)) await connection.execute("INSERT INTO app_settings (setting_key, setting_json, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_json=VALUES(setting_json), updated_at=VALUES(updated_at)", [key, json(value), now()]);
    for (const [id, payment] of source.cashierPayments) {
      await connection.execute(
        `INSERT INTO cashier_payments (id, cashier_id, period_key, salary, bonus, total, paid_at, paid_by, payment_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE payment_json=VALUES(payment_json)`,
        [id, payment.cashierId, payment.period || payment.periodKey || "", money(payment.salary), money(payment.bonus), money(payment.total), timestamp(payment.paidAt), payment.paidBy || "unknown", json(payment)]
      );
    }
    for (const [id, otp] of source.emailOtps) {
      if (!otp.email || !otp.otpHash || !otp.expiresAt) continue;
      await connection.execute(
        `INSERT INTO email_otp_challenges (subject_id, email, otp_hash, expires_at, resend_at, attempts, verified_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE email=VALUES(email), otp_hash=VALUES(otp_hash), expires_at=VALUES(expires_at), resend_at=VALUES(resend_at), attempts=VALUES(attempts), verified_at=VALUES(verified_at), updated_at=VALUES(updated_at)`,
        [id, otp.email, otp.otpHash, timestamp(otp.expiresAt), otp.sentAt ? Number(otp.sentAt) + 6e4 : null, Number(otp.attempts || 0), otp.verifiedAt || null, now()]
      );
    }
    await connection.commit();
    const [userRows] = await connection.query("SELECT id, balance FROM app_users");
    const mysqlUsers = new Map(userRows.map((row) => [String(row.id), Number(row.balance)]));
    const balanceMismatches = [...source.users.values()].filter((user) => Math.abs((mysqlUsers.get(String(user.id)) ?? Number.NaN) - Number(user.balance || 0)) > 9e-3).map((user) => user.id);
    const tableCounts = {};
    for (const table of ["app_users", "wallet_transactions", "agents", "admin_users", "manual_transaction_requests", "agent_requests", "agent_transactions", "game_rooms", "tournaments", "ad_campaigns"]) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
      tableCounts[table] = Number(rows[0]?.total || 0);
    }
    const summary = { sourceUsers: source.users.size, mysqlUsers: tableCounts.app_users, balanceMismatches, tableCounts };
    if (balanceMismatches.length) throw new Error(`Balance verification failed for ${balanceMismatches.length} user(s).`);
    await connection.execute("UPDATE data_migration_runs SET status = ?, summary_json = ?, completed_at = ? WHERE id = ?", ["verified", json(summary), now(), migrationId]);
    console.log(JSON.stringify({ migrationId, status: "verified", ...summary }, null, 2));
    console.log("Firebase was read only; no Firebase documents were changed or deleted.");
    return { migrationId, status: "verified", ...summary };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
    }
    try {
      await connection.execute("UPDATE data_migration_runs SET status = ?, summary_json = ?, completed_at = ? WHERE id = ?", ["failed", json({ error: error instanceof Error ? error.message : String(error) }), now(), migrationId]);
    } catch {
    }
    throw error;
  } finally {
    if (advisoryLockHeld) {
      try {
        await connection.query("SELECT RELEASE_LOCK('ludosom_firebase_initial_v1')");
      } catch {
      }
    }
    connection.release();
    await closeMySqlPool();
  }
}

// src/server/mysql-runtime-store.ts
var gameRoomSchemaReady = null;
var realtimeEventSchemaReady = null;
var gameTimerLeaderConnection = null;
var gameTimerLeadershipAttempt = null;
function ensureMySqlGameRoomSchema() {
  if (!gameRoomSchemaReady) {
    gameRoomSchemaReady = getMySqlPool().execute(
      `CREATE TABLE IF NOT EXISTS game_rooms (
        id VARCHAR(191) PRIMARY KEY,
        status VARCHAR(32) NOT NULL,
        bet_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        created_at BIGINT UNSIGNED NOT NULL,
        updated_at BIGINT UNSIGNED NOT NULL,
        room_json JSON NOT NULL,
        INDEX idx_rooms_status_updated (status, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ).then(() => void 0).catch((error) => {
      gameRoomSchemaReady = null;
      throw error;
    });
  }
  return gameRoomSchemaReady;
}
function ensureMySqlRealtimeEventSchema() {
  if (!realtimeEventSchemaReady) {
    realtimeEventSchemaReady = getMySqlPool().execute(
      `CREATE TABLE IF NOT EXISTS realtime_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        origin_id VARCHAR(64) NOT NULL,
        scope_type VARCHAR(16) NOT NULL,
        target_id VARCHAR(191) NULL,
        event_name VARCHAR(64) NOT NULL,
        payload_json JSON NOT NULL,
        created_at BIGINT UNSIGNED NOT NULL,
        INDEX idx_realtime_events_created (created_at),
        INDEX idx_realtime_events_target (scope_type, target_id, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ).then(() => void 0).catch((error) => {
      realtimeEventSchemaReady = null;
      throw error;
    });
  }
  return realtimeEventSchemaReady;
}
async function publishMySqlRealtimeEvent(event) {
  await ensureMySqlRealtimeEventSchema();
  await getMySqlPool().execute(
    `INSERT INTO realtime_events (origin_id, scope_type, target_id, event_name, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [event.originId, event.scopeType, event.targetId, event.eventName, JSON.stringify(event.payload), Date.now()]
  );
}
async function latestMySqlRealtimeEventId() {
  await ensureMySqlRealtimeEventSchema();
  const [rows] = await getMySqlPool().query("SELECT COALESCE(MAX(id), 0) AS latest_id FROM realtime_events");
  return Number(rows[0]?.latest_id || 0);
}
async function listMySqlRealtimeEvents(afterId) {
  await ensureMySqlRealtimeEventSchema();
  const [rows] = await getMySqlPool().execute(
    `SELECT id, origin_id, scope_type, target_id, event_name, payload_json
     FROM realtime_events WHERE id > ? ORDER BY id ASC LIMIT 500`,
    [afterId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    originId: String(row.origin_id),
    scopeType: row.scope_type,
    targetId: row.target_id == null ? null : String(row.target_id),
    eventName: String(row.event_name),
    payload: typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json
  }));
}
async function cleanupMySqlRealtimeEvents(olderThan) {
  await ensureMySqlRealtimeEventSchema();
  await getMySqlPool().execute("DELETE FROM realtime_events WHERE created_at < ?", [olderThan]);
}
async function ensureMySqlGameTimerLeadership() {
  if (gameTimerLeaderConnection) {
    try {
      await gameTimerLeaderConnection.ping();
      return true;
    } catch {
      try {
        gameTimerLeaderConnection.destroy();
      } catch {
      }
      gameTimerLeaderConnection = null;
    }
  }
  if (gameTimerLeadershipAttempt) return gameTimerLeadershipAttempt;
  gameTimerLeadershipAttempt = (async () => {
    const connection = await getMySqlPool().getConnection();
    try {
      const [rows] = await connection.query("SELECT GET_LOCK('ludosom_game_timer_v1', 0) AS acquired");
      if (Number(rows[0]?.acquired) !== 1) {
        connection.release();
        return false;
      }
      gameTimerLeaderConnection = connection;
      return true;
    } catch (error) {
      connection.release();
      throw error;
    }
  })().finally(() => {
    gameTimerLeadershipAttempt = null;
  });
  return gameTimerLeadershipAttempt;
}
function mysqlRuntimeStoreMode() {
  if (!isMySqlConfigured()) return "disabled";
  const configured = String(process.env.MYSQL_RUNTIME_STORE_MODE || "shadow").trim().toLowerCase();
  return configured === "primary" ? "primary" : configured === "disabled" ? "disabled" : "shadow";
}
async function loadRuntimeStoreFromMySql() {
  const [rows] = await getMySqlPool().execute(
    "SELECT setting_json FROM app_settings WHERE setting_key = ? LIMIT 1",
    ["runtime_store"]
  );
  if (!rows.length) return null;
  const value = rows[0].setting_json;
  if (typeof value === "string") return JSON.parse(value);
  return value && typeof value === "object" ? value : null;
}
async function saveRuntimeStoreToMySql(snapshot) {
  await getMySqlPool().execute(
    `INSERT INTO app_settings (setting_key, setting_json, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
    ["runtime_store", JSON.stringify(snapshot), Date.now()]
  );
}
async function loadMySqlGameRoom(roomId) {
  await ensureMySqlGameRoomSchema();
  const [rows] = await getMySqlPool().execute(
    "SELECT room_json FROM game_rooms WHERE id = ? LIMIT 1",
    [roomId]
  );
  if (!rows.length) return null;
  const value = rows[0].room_json;
  return typeof value === "string" ? JSON.parse(value) : value;
}
async function saveMySqlGameRoom(room) {
  if (!room?.id) return;
  await ensureMySqlGameRoomSchema();
  const updatedAt = Date.now();
  await getMySqlPool().execute(
    `INSERT INTO game_rooms (id, status, bet_amount, created_at, updated_at, room_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status=VALUES(status), bet_amount=VALUES(bet_amount), updated_at=VALUES(updated_at), room_json=VALUES(room_json)`,
    [room.id, room.status || "waiting", Number(room.betAmount || 0), Number(room.createdAt || updatedAt), updatedAt, JSON.stringify(room)]
  );
}
async function deleteMySqlGameRoom(roomId) {
  if (!roomId) return;
  await ensureMySqlGameRoomSchema();
  await getMySqlPool().execute("DELETE FROM game_rooms WHERE id = ?", [roomId]);
}
async function listMySqlActiveGameRooms() {
  await ensureMySqlGameRoomSchema();
  const [rows] = await getMySqlPool().execute(
    `SELECT room_json FROM game_rooms
     WHERE status IN ('waiting', 'playing')
     ORDER BY updated_at DESC`
  );
  return rows.map((row) => typeof row.room_json === "string" ? JSON.parse(row.room_json) : row.room_json);
}
async function loadMySqlRuntimeUser(userId) {
  const [rows] = await getMySqlPool().execute(
    "SELECT profile_json, balance, win_count, loss_count FROM app_users WHERE id = ? LIMIT 1",
    [userId]
  );
  if (!rows.length) return null;
  const profile = typeof rows[0].profile_json === "string" ? JSON.parse(rows[0].profile_json) : rows[0].profile_json;
  return {
    ...profile,
    balance: Number(rows[0].balance || 0),
    winCount: Number(rows[0].win_count || 0),
    lossCount: Number(rows[0].loss_count || 0)
  };
}

// src/server/mysql-realtime.ts
var schemaReady = null;
function ensureMySqlRealtimeSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getMySqlPool().query(`CREATE TABLE IF NOT EXISTS matchmaking_queue (
        user_id VARCHAR(191) PRIMARY KEY,
        status VARCHAR(40) NOT NULL,
        bet_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        capacity SMALLINT UNSIGNED NOT NULL DEFAULT 2,
        game_mode VARCHAR(20) NOT NULL DEFAULT 'solo',
        updated_at BIGINT UNSIGNED NOT NULL,
        expires_at BIGINT UNSIGNED NOT NULL,
        record_json JSON NOT NULL,
        INDEX idx_matchmaking_active (status, expires_at),
        INDEX idx_matchmaking_queue (bet_amount, capacity, game_mode, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await getMySqlPool().query(`CREATE TABLE IF NOT EXISTS user_presence (
        user_id VARCHAR(191) PRIMARY KEY,
        last_seen_at BIGINT UNSIGNED NOT NULL,
        profile_json JSON NULL,
        INDEX idx_user_presence_seen (last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      try {
        await getMySqlPool().query("ALTER TABLE user_presence ADD COLUMN profile_json JSON NULL");
      } catch (error) {
        if (error?.code !== "ER_DUP_FIELDNAME") throw error;
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
async function touchMySqlUserPresence(users) {
  const entries = users.map((value) => {
    const profile = typeof value === "string" ? null : value;
    const id = String(profile?.id || value || "");
    return [id, { id, profile }];
  });
  const records = [...new Map(entries.filter(([id]) => Boolean(id))).values()];
  if (!records.length) return;
  await ensureMySqlRealtimeSchema();
  const now2 = Date.now();
  await getMySqlPool().query(
    `INSERT INTO user_presence (user_id, last_seen_at, profile_json) VALUES ?
     ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at), profile_json=COALESCE(VALUES(profile_json), profile_json)`,
    [records.map(({ id, profile }) => [id, now2, profile ? JSON.stringify(profile) : null])]
  );
}
async function listMySqlOnlineUsers(windowMs = 45e3) {
  await ensureMySqlRealtimeSchema();
  const cutoff = Date.now() - windowMs;
  const [rows] = await getMySqlPool().execute("SELECT user_id, profile_json FROM user_presence WHERE last_seen_at >= ?", [cutoff]);
  return rows.map((row) => {
    let profile;
    try {
      const value = Buffer.isBuffer(row.profile_json) ? row.profile_json.toString("utf8") : row.profile_json;
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      profile = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
    } catch (error) {
      console.error(`Invalid presence profile for ${String(row.user_id)}:`, error);
    }
    return { id: String(row.user_id), profile };
  });
}
async function upsertMySqlMatchmaking(record) {
  await ensureMySqlRealtimeSchema();
  const updatedAt = Number(record.timestamp || Date.now());
  await getMySqlPool().execute(
    `INSERT INTO matchmaking_queue (user_id, status, bet_amount, capacity, game_mode, updated_at, expires_at, record_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status=VALUES(status), bet_amount=VALUES(bet_amount), capacity=VALUES(capacity), game_mode=VALUES(game_mode), updated_at=VALUES(updated_at), expires_at=VALUES(expires_at), record_json=VALUES(record_json)`,
    [String(record.userId), record.status || "WAITING_FOR_MATCH", Number(record.betAmount || 0).toFixed(2), Number(record.capacity || 2), record.gameMode || "solo", updatedAt, updatedAt + 10 * 6e4, JSON.stringify(record)]
  );
}
async function deleteMySqlMatchmaking(userIds) {
  const ids = [...new Set(userIds.map(String).filter(Boolean))];
  if (!ids.length) return;
  await ensureMySqlRealtimeSchema();
  await getMySqlPool().query("DELETE FROM matchmaking_queue WHERE user_id IN (?)", [ids]);
}
async function listActiveMySqlMatchmaking() {
  await ensureMySqlRealtimeSchema();
  const now2 = Date.now();
  await getMySqlPool().execute("DELETE FROM matchmaking_queue WHERE expires_at <= ?", [now2]);
  const [rows] = await getMySqlPool().execute("SELECT record_json FROM matchmaking_queue WHERE status = ? AND expires_at > ? ORDER BY updated_at ASC", ["WAITING_FOR_MATCH", now2]);
  return rows.map((row) => typeof row.record_json === "string" ? JSON.parse(row.record_json) : row.record_json);
}
async function updateMySqlCashierHeartbeat(adminId, cashierOnlineAt) {
  await getMySqlPool().execute("UPDATE admin_users SET cashier_online_at = ?, updated_at = ? WHERE id = ?", [cashierOnlineAt, Date.now(), adminId]);
}
async function listMySqlCashierHeartbeats() {
  const [rows] = await getMySqlPool().query("SELECT id, cashier_online_at FROM admin_users WHERE cashier_online_at IS NOT NULL");
  return rows.map((row) => ({ id: String(row.id), cashierOnlineAt: Number(row.cashier_online_at || 0) }));
}

// src/server/mysql-otp.ts
async function getMySqlEmailOtp(subjectId) {
  const [rows] = await getMySqlPool().execute("SELECT * FROM email_otp_challenges WHERE subject_id = ? LIMIT 1", [subjectId]);
  if (!rows.length) return null;
  const row = rows[0];
  return { email: row.email, provider: void 0, otpHash: row.otp_hash || "", expiresAt: Number(row.expires_at || 0), sentAt: Number(row.resend_at || 0) - 6e4, attempts: Number(row.attempts || 0), verifiedAt: row.verified_at == null ? null : Number(row.verified_at) };
}
async function saveMySqlEmailOtp(subjectId, record) {
  await getMySqlPool().execute(
    `INSERT INTO email_otp_challenges (subject_id, email, otp_hash, expires_at, resend_at, attempts, verified_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email=VALUES(email), otp_hash=VALUES(otp_hash), expires_at=VALUES(expires_at), resend_at=VALUES(resend_at), attempts=VALUES(attempts), verified_at=VALUES(verified_at), updated_at=VALUES(updated_at)`,
    [subjectId, record.email, record.otpHash, record.expiresAt, record.sentAt + 6e4, record.attempts, record.verifiedAt, Date.now()]
  );
}
async function deleteMySqlEmailOtp(subjectId) {
  await getMySqlPool().execute("DELETE FROM email_otp_challenges WHERE subject_id = ?", [subjectId]);
}

// src/server/mysql-primary-data.ts
var manualRequestSchemaPromise = null;
async function ensureManualRequestSchema() {
  if (!manualRequestSchemaPromise) {
    manualRequestSchemaPromise = getMySqlPool().execute(
      `CREATE TABLE IF NOT EXISTS manual_transaction_requests (
        id VARCHAR(191) PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL,
        agent_id VARCHAR(191) NULL,
        managed_by VARCHAR(32) NOT NULL,
        transaction_type VARCHAR(32) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        assigned_cashier_id VARCHAR(191) NULL,
        created_at BIGINT UNSIGNED NOT NULL,
        resolved_at BIGINT UNSIGNED NULL,
        request_json JSON NOT NULL,
        INDEX idx_manual_status_created (status, created_at),
        INDEX idx_manual_agent_status (agent_id, status),
        INDEX idx_manual_cashier_status (assigned_cashier_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ).then(() => void 0).catch((error) => {
      manualRequestSchemaPromise = null;
      throw error;
    });
  }
  return manualRequestSchemaPromise;
}
function parseJson(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}
async function saveMySqlUserProfile(user) {
  const now2 = Date.now();
  await getMySqlPool().execute(
    `INSERT INTO app_users (id, firebase_uid, email, phone, username, avatar, balance, win_count, loss_count, linked_agent_id, applied_promo_code, email_verified, status, created_at, updated_at, profile_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       firebase_uid=IF(id=VALUES(id), firebase_uid, VALUES(firebase_uid)),
       email=VALUES(email), phone=VALUES(phone), username=VALUES(username), avatar=VALUES(avatar),
       balance=VALUES(balance), win_count=VALUES(win_count), loss_count=VALUES(loss_count),
       linked_agent_id=VALUES(linked_agent_id), applied_promo_code=VALUES(applied_promo_code),
       email_verified=VALUES(email_verified), status=VALUES(status), updated_at=VALUES(updated_at),
       profile_json=VALUES(profile_json), version=version+1`,
    [user.id, user.firebaseUid || null, user.email || null, user.phone || null, user.username, user.avatar || null, Number(user.balance || 0), Number(user.winCount || 0), Number(user.lossCount || 0), user.linkedAgentId || null, user.appliedPromoCode || null, Boolean(user.emailOtpVerifiedAt), user.status || "active", Number(user.createdAt || now2), now2, JSON.stringify(user)]
  );
}
async function listMySqlUsersByAgent(agentId, promoCode) {
  const [rows] = await getMySqlPool().execute(
    `SELECT profile_json, id, linked_agent_id, balance, win_count, loss_count
     FROM app_users
     WHERE linked_agent_id = ?
        OR (linked_agent_id IS NULL AND UPPER(TRIM(applied_promo_code)) = ?)
     ORDER BY updated_at DESC`,
    [agentId, promoCode]
  );
  return rows.map((row) => ({
    ...parseJson(row.profile_json),
    id: row.id,
    linkedAgentId: row.linked_agent_id,
    balance: Number(row.balance || 0),
    winCount: Number(row.win_count || 0),
    lossCount: Number(row.loss_count || 0)
  }));
}
async function saveMySqlManualRequest(request, user) {
  await ensureManualRequestSchema();
  let databaseUserId = request.userId;
  if (user?.firebaseUid) {
    const [ownerRows] = await getMySqlPool().execute(
      `SELECT id FROM app_users
       WHERE id = ? OR firebase_uid = ?
       ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
       LIMIT 1`,
      [request.userId, user.firebaseUid, request.userId]
    );
    if (ownerRows.length) databaseUserId = ownerRows[0].id;
  }
  await getMySqlPool().execute(
    `INSERT INTO manual_transaction_requests (id, user_id, agent_id, managed_by, transaction_type, amount, status, assigned_cashier_id, created_at, resolved_at, request_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE agent_id=VALUES(agent_id), managed_by=VALUES(managed_by), transaction_type=VALUES(transaction_type), amount=VALUES(amount), status=VALUES(status), assigned_cashier_id=VALUES(assigned_cashier_id), resolved_at=VALUES(resolved_at), request_json=VALUES(request_json)`,
    [request.id, databaseUserId, request.agentId || null, request.managedBy || (request.agentId ? "agent" : "admin"), request.transactionType, Number(request.amount || 0), request.status || "pending", request.assignedCashierId || null, Number(request.createdAt || Date.now()), request.resolvedAt || null, JSON.stringify(request)]
  );
}
async function listMySqlManualRequests() {
  await ensureManualRequestSchema();
  const [rows] = await getMySqlPool().query(
    `SELECT request_json FROM manual_transaction_requests
     ORDER BY created_at DESC`
  );
  return rows.map((row) => parseJson(row.request_json));
}
async function resolveMySqlManualRequest(args) {
  await ensureManualRequestSchema();
  const connection = await getMySqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [requestRows] = await connection.execute(
      "SELECT request_json, status, user_id FROM manual_transaction_requests WHERE id = ? FOR UPDATE",
      [args.requestId]
    );
    if (!requestRows.length) throw new Error("Request not found.");
    if (requestRows[0].status !== "pending") throw new Error("This request has already been processed.");
    const request = parseJson(requestRows[0].request_json);
    const databaseUserId = String(requestRows[0].user_id || request.userId);
    let user;
    if (args.approved) {
      const [userRows] = await connection.execute(
        "SELECT profile_json, balance FROM app_users WHERE id = ? FOR UPDATE",
        [databaseUserId]
      );
      if (!userRows.length) throw new Error("User associated with transaction not found.");
      user = parseJson(userRows[0].profile_json);
      const balance = Number(userRows[0].balance || 0);
      const amount = Number(request.amount || 0);
      if (request.transactionType === "withdraw" && balance < amount) throw new Error("Insufficient balance to approve this withdrawal request.");
      user.balance = request.transactionType === "deposit" ? balance + amount : balance - amount;
      await connection.execute(
        "UPDATE app_users SET balance = ?, profile_json = ?, updated_at = ?, version = version + 1 WHERE id = ?",
        [user.balance, JSON.stringify(user), Date.now(), databaseUserId]
      );
    }
    request.status = args.approved ? "approved" : "rejected";
    request.managedBy = "admin";
    request.resolvedBy = args.admin.id;
    request.resolverUsername = args.admin.name || args.admin.username || "Admin";
    request.resolvedAt = Date.now();
    await connection.execute(
      "UPDATE manual_transaction_requests SET status = ?, resolved_at = ?, request_json = ? WHERE id = ?",
      [request.status, request.resolvedAt, JSON.stringify(request), args.requestId]
    );
    await connection.commit();
    return { request, user, databaseUserId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
async function saveMySqlAgent(agent) {
  const now2 = Date.now();
  await getMySqlPool().execute(
    `INSERT INTO agents (id, username, password_hash, phone, location, promo_code, commission_rate, balance, float_balance, business_model, status, created_at, updated_at, agent_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE username=VALUES(username), password_hash=VALUES(password_hash), phone=VALUES(phone), location=VALUES(location), promo_code=VALUES(promo_code), commission_rate=VALUES(commission_rate), balance=VALUES(balance), float_balance=VALUES(float_balance), business_model=VALUES(business_model), status=VALUES(status), updated_at=VALUES(updated_at), agent_json=VALUES(agent_json)`,
    [agent.id, agent.username, agent.password || null, agent.phone || null, agent.location || null, agent.promoCode || null, Number(agent.commissionRate || 0), Number(agent.balance || 0), Number(agent.floatBalance || 0), agent.businessModel || "independent", agent.status || "Active", Number(agent.createdAt || now2), now2, JSON.stringify(agent)]
  );
}
async function deleteMySqlAgent(agentId) {
  await getMySqlPool().execute("DELETE FROM agents WHERE id=?", [agentId]);
}
async function saveMySqlAdmin(admin) {
  const now2 = Date.now();
  await getMySqlPool().execute(
    `INSERT INTO admin_users (id, username, password_hash, name, permissions_json, status, location, cashier_locations_json, cashier_online_at, admin_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE username=VALUES(username), password_hash=VALUES(password_hash), name=VALUES(name), permissions_json=VALUES(permissions_json), status=VALUES(status), location=VALUES(location), cashier_locations_json=VALUES(cashier_locations_json), cashier_online_at=VALUES(cashier_online_at), admin_json=VALUES(admin_json), updated_at=VALUES(updated_at)`,
    [admin.id, admin.username, admin.password || null, admin.name || null, JSON.stringify(admin.permissions || []), admin.status || "active", admin.location || null, JSON.stringify(admin.cashierLocations || []), admin.cashierOnlineAt || null, JSON.stringify(admin), Number(admin.createdAt || now2), now2]
  );
}
async function deleteMySqlAdmin(adminId) {
  await getMySqlPool().execute("DELETE FROM admin_users WHERE id=?", [adminId]);
}
async function saveMySqlCashierPayment(payment) {
  const id = `${payment.cashierId}_${payment.period}`;
  await getMySqlPool().execute(
    `INSERT INTO cashier_payments (id, cashier_id, period_key, salary, bonus, total, paid_at, paid_by, payment_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, payment.cashierId, payment.period, Number(payment.salary || 0), Number(payment.bonus || 0), Number(payment.total || 0), Number(payment.paidAt), payment.paidBy, JSON.stringify({ ...payment, id })]
  );
  return { ...payment, id };
}
async function saveMySqlAgentRequest(request) {
  await getMySqlPool().execute(
    `INSERT INTO agent_requests (id, agent_id, amount, status, created_at, resolved_at, request_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE amount=VALUES(amount), status=VALUES(status), resolved_at=VALUES(resolved_at), request_json=VALUES(request_json)`,
    [request.id, request.agentId, Number(request.amount || 0), request.status || "pending", Number(request.createdAt || Date.now()), request.resolvedAt || null, JSON.stringify(request)]
  );
}
async function adjustMySqlAgentFloat(args) {
  const connection = await getMySqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT agent_json, float_balance FROM agents WHERE id = ? FOR UPDATE", [args.agentId]);
    if (!rows.length) throw new Error("Agent not found.");
    const agent = parseJson(rows[0].agent_json);
    const currentFloat = Number(rows[0].float_balance || 0);
    const nextFloat = currentFloat + Number(args.amount);
    if (nextFloat < 0) throw new Error(`Insufficient float balance. Current balance: $${currentFloat.toFixed(2)}.`);
    agent.floatBalance = nextFloat;
    agent.updatedAt = Date.now();
    await connection.execute("UPDATE agents SET float_balance=?, agent_json=?, updated_at=? WHERE id=?", [nextFloat, JSON.stringify(agent), agent.updatedAt, agent.id]);
    if (args.player) {
      const [userRows] = await connection.execute("SELECT profile_json, balance FROM app_users WHERE id=? FOR UPDATE", [args.player.id]);
      if (!userRows.length) throw new Error("Player not found.");
      const player = { ...parseJson(userRows[0].profile_json), ...args.player };
      player.balance = Number(userRows[0].balance || 0) + Math.abs(Number(args.amount));
      await connection.execute("UPDATE app_users SET balance=?, profile_json=?, updated_at=?, version=version+1 WHERE id=?", [player.balance, JSON.stringify(player), Date.now(), player.id]);
      args.player = player;
    }
    await connection.execute(
      `INSERT INTO agent_transactions (id, agent_id, player_id, transaction_type, amount, discount_amount, created_at, transaction_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [args.transaction.id, agent.id, args.transaction.playerId || null, args.transaction.type, Number(args.transaction.amount || 0), Number(args.transaction.discountAmount || 0), Number(args.transaction.timestamp || Date.now()), JSON.stringify(args.transaction)]
    );
    await connection.commit();
    return { agent, player: args.player };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
async function resolveMySqlAgentRequest(args) {
  const connection = await getMySqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [requestRows] = await connection.execute("SELECT request_json, status FROM agent_requests WHERE id=? FOR UPDATE", [args.request.id]);
    if (!requestRows.length) throw new Error("Request not found.");
    if (requestRows[0].status !== "pending") throw new Error("This request has already been processed.");
    const request = { ...parseJson(requestRows[0].request_json), ...args.request };
    request.status = args.approved ? "approved" : "rejected";
    request.resolvedAt = Date.now();
    request.resolvedBy = args.admin.id;
    request.resolverUsername = args.admin.username || "Unknown Admin";
    let agent;
    let transaction;
    if (args.approved) {
      const [agentRows] = await connection.execute("SELECT agent_json, float_balance FROM agents WHERE id=? FOR UPDATE", [request.agentId]);
      if (!agentRows.length) throw new Error("Agent associated with the request not found.");
      agent = parseJson(agentRows[0].agent_json);
      agent.floatBalance = Number(agentRows[0].float_balance || 0) + Number(request.amount || 0);
      agent.updatedAt = Date.now();
      const discountAmount = Number((Number(request.amount || 0) * Math.max(0, Math.min(1, Number(agent.commissionRate || 0)))).toFixed(2));
      transaction = { id: `agent_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, agentId: agent.id, type: "FloatPurchase", amount: Number(request.amount), discountAmount, timestamp: Date.now(), description: `Float request for $${Number(request.amount).toFixed(2)} approved; admin cash $${(Number(request.amount) - discountAmount).toFixed(2)}, agent commission $${discountAmount.toFixed(2)}. Request ID: ${request.id}` };
      await connection.execute("UPDATE agents SET float_balance=?, agent_json=?, updated_at=? WHERE id=?", [agent.floatBalance, JSON.stringify(agent), agent.updatedAt, agent.id]);
      await connection.execute(`INSERT INTO agent_transactions (id, agent_id, player_id, transaction_type, amount, discount_amount, created_at, transaction_json) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`, [transaction.id, agent.id, transaction.type, transaction.amount, discountAmount, transaction.timestamp, JSON.stringify(transaction)]);
    }
    await connection.execute("UPDATE agent_requests SET status=?, resolved_at=?, request_json=? WHERE id=?", [request.status, request.resolvedAt, JSON.stringify(request), request.id]);
    await connection.commit();
    return { request, agent, transaction };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
async function loadMySqlPrimaryCaches() {
  const pool2 = getMySqlPool();
  const [admins, agents, requests, transactions, payments] = await Promise.all([
    pool2.query("SELECT admin_json AS value_json FROM admin_users"),
    pool2.query("SELECT agent_json AS value_json FROM agents"),
    pool2.query("SELECT request_json AS value_json FROM agent_requests"),
    pool2.query("SELECT transaction_json AS value_json FROM agent_transactions"),
    pool2.query("SELECT payment_json AS value_json FROM cashier_payments")
  ]);
  const values = (result) => result[0].map((row) => parseJson(row.value_json));
  return {
    admins: values(admins),
    agents: values(agents),
    requests: values(requests),
    transactions: values(transactions),
    payments: values(payments)
  };
}
async function approveMySqlAgentPlayerRequest(args) {
  const connection = await getMySqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [agentRows] = await connection.execute("SELECT agent_json, float_balance FROM agents WHERE id = ? FOR UPDATE", [args.agent.id]);
    const [requestRows] = await connection.execute("SELECT request_json, status, user_id FROM manual_transaction_requests WHERE id = ? FOR UPDATE", [args.request.id]);
    if (!agentRows.length) throw new Error("Agent not found.");
    if (!requestRows.length || requestRows[0].status !== "pending") throw new Error("Request was already processed.");
    const databaseUserId = String(requestRows[0].user_id || args.user.id);
    const [userRows] = await connection.execute("SELECT profile_json, balance FROM app_users WHERE id = ? FOR UPDATE", [databaseUserId]);
    if (!userRows.length) throw new Error("User not found.");
    const agent = { ...parseJson(agentRows[0].agent_json), ...args.agent };
    const user = { ...parseJson(userRows[0].profile_json), ...args.user };
    const request = { ...parseJson(requestRows[0].request_json), ...args.request };
    const amount = Number(request.amount || 0);
    const currentFloat = Number(agentRows[0].float_balance || agent.floatBalance || 0);
    const currentBalance = Number(userRows[0].balance || user.balance || 0);
    if (agent.businessModel === "monthly" && Number(agent.dailyTransactionLimit || 0) > 0) {
      const startOfDay = /* @__PURE__ */ new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [dailyRows] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM agent_transactions
         WHERE agent_id = ? AND transaction_type IN ('PlayerDeposit', 'PlayerWithdrawal') AND created_at >= ?`,
        [agent.id, startOfDay.getTime()]
      );
      const remaining = Number(agent.dailyTransactionLimit) - Number(dailyRows[0]?.total || 0);
      if (amount > remaining) throw new Error(`Daily transaction limit exceeded. Remaining today: $${Math.max(0, remaining).toFixed(2)}.`);
    }
    let nextFloat;
    let nextBalance;
    if (request.transactionType === "deposit") {
      if (currentFloat < amount) throw new Error("Insufficient float balance to approve this deposit.");
      nextFloat = currentFloat - amount;
      nextBalance = currentBalance + amount;
    } else {
      if (currentBalance < amount) throw new Error("Player has insufficient balance for this withdrawal.");
      const withdrawalNet = Number(request.netAmount ?? amount - Number(request.fee || 0));
      nextFloat = currentFloat + Math.max(0, withdrawalNet);
      nextBalance = currentBalance - amount;
    }
    agent.floatBalance = nextFloat;
    agent.updatedAt = Date.now();
    user.balance = nextBalance;
    request.status = "approved";
    request.resolvedBy = agent.id;
    request.resolverUsername = agent.username;
    request.resolvedAt = Date.now();
    await connection.execute("UPDATE agents SET float_balance = ?, agent_json = ?, updated_at = ? WHERE id = ?", [nextFloat, JSON.stringify(agent), agent.updatedAt, agent.id]);
    await connection.execute("UPDATE app_users SET balance = ?, profile_json = ?, updated_at = ?, version = version + 1 WHERE id = ?", [nextBalance, JSON.stringify(user), Date.now(), databaseUserId]);
    await connection.execute("UPDATE manual_transaction_requests SET status = ?, resolved_at = ?, request_json = ? WHERE id = ?", ["approved", request.resolvedAt, JSON.stringify(request), request.id]);
    await connection.execute(
      `INSERT INTO agent_transactions (id, agent_id, player_id, transaction_type, amount, discount_amount, created_at, transaction_json)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [args.agentTransaction.id, agent.id, databaseUserId, args.agentTransaction.type, amount, args.agentTransaction.timestamp, JSON.stringify(args.agentTransaction)]
    );
    await connection.commit();
    return { agent, user, request, agentTransaction: args.agentTransaction };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// server.ts
var import_auth = require("firebase-admin/auth");
var import_meta = {};
import_dotenv.default.config();
import_dotenv.default.config({ path: import_path.default.join(process.cwd(), ".env.production") });
var firebaseMySqlMigrationMode = String(process.env.RUN_FIREBASE_MYSQL_MIGRATION_ON_START || "").trim().toLowerCase() === "true";
var appDir = typeof __dirname !== "undefined" ? __dirname : import_meta && import_meta.url ? import_path.default.dirname((0, import_url.fileURLToPath)(import_meta.url)) : process.cwd();
function getDistDirectory() {
  const cwdDist = import_path.default.join(process.cwd(), "dist");
  if (import_fs.default.existsSync(import_path.default.join(cwdDist, "index.html"))) {
    return cwdDist;
  }
  const currentDir = typeof __dirname !== "undefined" ? __dirname : import_meta && import_meta.url ? import_path.default.dirname((0, import_url.fileURLToPath)(import_meta.url)) : process.cwd();
  if (import_fs.default.existsSync(import_path.default.join(currentDir, "index.html"))) {
    return currentDir;
  }
  const currentDist = import_path.default.join(currentDir, "dist");
  if (import_fs.default.existsSync(import_path.default.join(currentDist, "index.html"))) {
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
var app = (0, import_express.default)();
app.set("trust proxy", 1);
var DEPLOY_VERSION = String(
  process.env.DEPLOY_VERSION || process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT_SHA || (() => {
    try {
      return Math.floor(import_fs.default.statSync(import_path.default.join(appDir, "server.js")).mtimeMs).toString(36);
    } catch {
      return "development";
    }
  })()
).trim();
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
  "https://darkgray-jellyfish-374710.hostingersite.com",
  "https://ludo31.onrender.com",
  "https://dhili-dhili-ludo.onrender.com",
  "https://dhilidhili.onrender.com",
  "http://localhost:3000",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3002",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
  ...configuredAllowedOrigins
]));
function isAllowedCorsOrigin(origin) {
  if (allowedOrigins.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol === "https:" && (hostname === "ludosom.com" || hostname.endsWith(".ludosom.com"))) {
      return true;
    }
    if (hostname === "localhost") {
      return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "capacitor:" || parsed.protocol === "ionic:";
    }
  } catch {
    return false;
  }
  return false;
}
app.use((0, import_cors.default)({
  origin: function(origin, callback) {
    if (!origin || isAllowedCorsOrigin(origin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS origin: ${origin}`);
      callback(new Error("Origin is not allowed by LudoSom CORS policy."));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-LudoSom-Platform"],
  credentials: true
}));
app.use("/api", (_req, res, next) => {
  if (!firebaseMySqlMigrationMode) return next();
  res.setHeader("Retry-After", "900");
  return res.status(503).json({ error: "Maintenance in progress. Please try again shortly." });
});
var rawPort = process.env.PORT || 3002;
var PORT = typeof rawPort === "string" && !isNaN(Number(rawPort)) ? Number(rawPort) : rawPort;
var DB_FILE = import_path.default.join(process.cwd(), "db_store.json");
var WELCOME_BONUS = 1;
var OTP_TTL_MS = 10 * 60 * 1e3;
var OTP_RESEND_MS = 60 * 1e3;
var isOtpEnabled = () => store.adminSettings?.otpEnabled !== false;
var isPhoneAuthEnabled = () => store.adminSettings?.phoneAuthEnabled !== false;
var MINIMUM_WITHDRAWAL = 2;
var BONUS_UNLOCK_DEPOSIT_TOTAL = 5;
var NORMAL_WITHDRAWAL_FEE_RATE = 0;
var NO_PLAY_WITHDRAWAL_FEE_RATE = 0.1;
var MINIMUM_WITHDRAWAL_FEE = 0.1;
var TOURNAMENT_UNREGISTER_FEE_RATE = 0.1;
var TOURNAMENT_MAX_POSTPONEMENTS = 2;
var TOURNAMENT_CHECK_IN_MS = 5 * 60 * 1e3;
function hashEmailOtp(uid, otp) {
  return import_crypto.default.createHash("sha256").update(`${uid}:${otp}:${process.env.OTP_HASH_SECRET || process.env.FIREBASE_PROJECT_ID || "ludosom"}`).digest("hex");
}
async function readEmailOtp(uid) {
  if (isMySqlRuntimePrimary()) return getMySqlEmailOtp(uid);
  if (!db) return null;
  const snapshot = await db.collection("emailOtps").doc(uid).get();
  return snapshot.exists ? snapshot.data() : null;
}
async function writeEmailOtp(uid, record) {
  if (isMySqlRuntimePrimary()) return saveMySqlEmailOtp(uid, record);
  if (!db) throw new Error("Database not initialized");
  await db.collection("emailOtps").doc(uid).set(record);
}
async function removeEmailOtp(uid) {
  if (isMySqlRuntimePrimary()) return deleteMySqlEmailOtp(uid);
  if (db) await db.collection("emailOtps").doc(uid).delete();
}
function normalizeAuthPhone(value) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : "";
}
function createPhoneTurnstileTicket(phone, action) {
  const payload = Buffer.from(JSON.stringify({ phone, action, expiresAt: Date.now() + 5 * 60 * 1e3 })).toString("base64url");
  const secret = process.env.TURNSTILE_SECRET_KEY || "";
  const signature = import_crypto.default.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function verifyPhoneTurnstileTicket(ticket, phone, action) {
  try {
    const [payload, signature] = String(ticket || "").split(".");
    if (!payload || !signature || !process.env.TURNSTILE_SECRET_KEY) return false;
    const expected = import_crypto.default.createHmac("sha256", process.env.TURNSTILE_SECRET_KEY).update(payload).digest("base64url");
    if (signature.length !== expected.length || !import_crypto.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.phone === phone && decoded.action === action && Number(decoded.expiresAt) > Date.now();
  } catch {
    return false;
  }
}
var nativeSecurityAttempts = /* @__PURE__ */ new Map();
function isTrustedCapacitorAndroidRequest(req) {
  const origin = String(req.headers.origin || "").toLowerCase();
  const platform = String(req.headers["x-ludosom-platform"] || "").toLowerCase();
  const userAgent = String(req.headers["user-agent"] || "");
  return isAllowedCorsOrigin(origin) && platform === "android" && /android/i.test(userAgent) && /;\s*wv\)|version\/\d+\.\d+.*chrome/i.test(userAgent);
}
function consumeNativeSecurityAttempt(key) {
  const now2 = Date.now();
  const current = nativeSecurityAttempts.get(key);
  if (!current || current.resetAt <= now2) {
    nativeSecurityAttempts.set(key, { count: 1, resetAt: now2 + 10 * 60 * 1e3 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
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
  if (!normalizedPromoCode) return null;
  if (isMySqlRuntimePrimary()) {
    return Object.values(store.agents).find((agent2) => normalizePromoCode(agent2.promoCode) === normalizedPromoCode && agent2.status === "Active") || null;
  }
  if (!db) return null;
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
app.use(import_express.default.json());
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
app.post("/api/locations/detect", async (req, res) => {
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "Invalid location coordinates." });
  }
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`, { headers: { "User-Agent": "LudoSom-Player-Location/1.0" } });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const result = await response.json();
    const location = formatGeocodedLocation(result.address);
    if (!location) return res.status(422).json({ error: "Could not identify a city for this location." });
    return res.json({ success: true, location, city: normalizedCity(location) });
  } catch (error) {
    console.error("Player location detection failed:", error);
    return res.status(502).json({ error: "Location service is temporarily unavailable." });
  }
});
app.use(import_express.default.static(import_path.default.join(process.cwd(), "public")));
app.use(import_express.default.static(getDistDirectory()));
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
    import_path.default.join(process.cwd(), "firebase-admin-key.json"),
    import_path.default.join(appDir, "firebase-admin-key.json"),
    import_path.default.join(process.cwd(), "dist", "firebase-admin-key.json"),
    import_path.default.join(process.cwd(), "service-account.json"),
    import_path.default.join(process.cwd(), "firebase-key.json")
  ];
  const serviceAccountPath = possiblePaths.find((p) => import_fs.default.existsSync(p));
  if (!serviceAccountPath) {
    return null;
  }
  try {
    const serviceAccountFile = import_fs.default.readFileSync(serviceAccountPath, "utf8");
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
      (0, import_app2.getApp)();
    } catch (error) {
      (0, import_app2.initializeApp)({
        credential: (0, import_app2.cert)(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
    }
    db = (0, import_firestore2.getFirestore)();
    auth = (0, import_auth.getAuth)();
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
var normalizeStoredAdCampaigns = (value) => {
  if (Array.isArray(value?.adCampaigns)) return value.adCampaigns.map((campaign) => ({ ...DEFAULT_AD_SETTINGS, ...campaign, id: String(campaign.id || import_crypto.default.randomUUID()) }));
  if (value?.adSettings && (value.adSettings.enabled || value.adSettings.title || value.adSettings.message || value.adSettings.imageUrl)) {
    return [{ ...DEFAULT_AD_SETTINGS, ...value.adSettings, id: String(value.adSettings.id || import_crypto.default.randomUUID()) }];
  }
  return [];
};
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
  roles: DEFAULT_ADMIN_ROLES,
  otpEnabled: true,
  phoneAuthEnabled: true
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
  adSettings: { ...DEFAULT_AD_SETTINGS },
  adCampaigns: [],
  spectatorBets: []
};
var adminUsersCache = /* @__PURE__ */ new Map();
var agentCache = /* @__PURE__ */ new Map();
var agentRequestsCache = /* @__PURE__ */ new Map();
var agentTransactionsCache = /* @__PURE__ */ new Map();
var cashierPaymentsCache = /* @__PURE__ */ new Map();
var firestoreLiveUnsubscribes = [];
function removeUserFromMatchmakingQueues(userId) {
  for (const key of Object.keys(store.matchmakingQueues)) {
    store.matchmakingQueues[key] = store.matchmakingQueues[key].filter((id) => id !== userId);
  }
  if (store.users[userId]) delete store.users[userId].seekingJoinedAt;
}
async function startFirestoreLiveCaches() {
  if (isMySqlRuntimePrimary()) return;
  if (!db || firestoreLiveUnsubscribes.length) return;
  const watch = (collectionName, cache, onChange) => new Promise((resolve) => {
    let initialized = false;
    const unsubscribe = db.collection(collectionName).onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "removed") {
          cache.delete(change.doc.id);
          onChange?.(change.doc.id, null);
        } else {
          const value = { id: change.doc.id, ...change.doc.data() };
          cache.set(change.doc.id, value);
          onChange?.(change.doc.id, value);
        }
      });
      if (!initialized) {
        initialized = true;
        resolve();
      }
    }, (error) => {
      console.error(`Live cache listener failed for ${collectionName}:`, error);
      if (!initialized) {
        initialized = true;
        resolve();
      }
    });
    firestoreLiveUnsubscribes.push(unsubscribe);
  });
  const watchers = [
    watch("adminUsers", adminUsersCache),
    watch("agents", agentCache, (id, value) => {
      if (value) store.agents[id] = value;
      else delete store.agents[id];
    }),
    watch("agentRequests", agentRequestsCache),
    watch("agentTransactions", agentTransactionsCache),
    watch("cashierPayments", cashierPaymentsCache)
  ];
  if (!isMySqlRuntimePrimary()) {
    watchers.push(watch("matchmaking", /* @__PURE__ */ new Map(), (id, value) => {
      removeUserFromMatchmakingQueues(id);
      if (!value || value.status !== "WAITING_FOR_MATCH" || Date.now() - Number(value.timestamp || 0) > 18e4) return;
      const userId = value.userId || id;
      const queueKey = `${value.betAmount}_${value.capacity}_${value.gameMode}`;
      if (!store.matchmakingQueues[queueKey]) store.matchmakingQueues[queueKey] = [];
      store.matchmakingQueues[queueKey].push(userId);
      if (!store.users[userId]) {
        store.users[userId] = { id: userId, username: value.username || "Player", avatar: value.avatar || "\u{1F3AE}", balance: 0, winCount: 0, lossCount: 0, isOfflinePreference: false };
      }
      store.users[userId].seekingJoinedAt = Number(value.timestamp || Date.now());
      broadcastToAll("online_players_updated", {});
    }));
  }
  await Promise.all(watchers);
  console.log(`Firestore live caches initialized for admins and agents${isMySqlRuntimePrimary() ? "; matchmaking uses MySQL" : " and matchmaking"}.`);
}
var mySqlPrimaryCacheTimer = null;
async function refreshMySqlPrimaryCaches() {
  if (!isMySqlRuntimePrimary()) return;
  const data = await loadMySqlPrimaryCaches();
  adminUsersCache.clear();
  data.admins.forEach((admin) => adminUsersCache.set(admin.id, admin));
  agentCache.clear();
  data.agents.forEach((agent) => {
    agentCache.set(agent.id, agent);
    store.agents[agent.id] = agent;
  });
  agentRequestsCache.clear();
  data.requests.forEach((request) => agentRequestsCache.set(request.id, request));
  agentTransactionsCache.clear();
  data.transactions.forEach((transaction) => agentTransactionsCache.set(transaction.id, transaction));
  cashierPaymentsCache.clear();
  data.payments.forEach((payment) => cashierPaymentsCache.set(payment.id, payment));
}
async function startMySqlPrimaryCaches() {
  if (!isMySqlRuntimePrimary() || mySqlPrimaryCacheTimer) return;
  await refreshMySqlPrimaryCaches();
  mySqlPrimaryCacheTimer = setInterval(() => {
    void refreshMySqlPrimaryCaches().catch((error) => console.error("MySQL primary cache refresh failed:", error));
  }, 15e3);
  mySqlPrimaryCacheTimer.unref?.();
  console.log("MySQL primary caches initialized; Firestore live listeners are disabled.");
}
async function cachedAdminUser(adminId) {
  const cached = adminUsersCache.get(adminId);
  if (cached || !db || isMySqlRuntimePrimary()) return cached;
  const snapshot = await db.collection("adminUsers").doc(adminId).get();
  if (!snapshot.exists) return void 0;
  const admin = { id: snapshot.id, ...snapshot.data() };
  adminUsersCache.set(adminId, admin);
  return admin;
}
async function cachedAgent(agentId) {
  const cached = agentCache.get(agentId) || store.agents[agentId];
  if (cached || !db || isMySqlRuntimePrimary()) return cached;
  const snapshot = await db.collection("agents").doc(agentId).get();
  if (!snapshot.exists) return void 0;
  const agent = { id: snapshot.id, ...snapshot.data() };
  agentCache.set(agentId, agent);
  store.agents[agentId] = agent;
  return agent;
}
function seedDefaultTournaments() {
  const now2 = Date.now();
  const oneHour = 60 * 60 * 1e3;
  const oneDay = 24 * 60 * 60 * 1e3;
  const openOrActive = Object.values(store.tournaments).filter(
    (t) => t.status === "registration_open" || t.status === "in_progress"
  );
  if (openOrActive.length < 3) {
    const t1 = {
      id: `tourney_weekly_${now2}_1`,
      name: "Ludo$om Weekly Champion Cup \u{1F3C6}",
      entryFee: 5,
      prizePool: 72,
      status: "registration_open",
      players: [],
      maxPlayers: 16,
      startDate: now2 + oneDay * 2,
      endDate: 0,
      winnerId: null,
      currentRound: 1,
      matches: [],
      createdAt: now2
    };
    const t2 = {
      id: `tourney_weekend_${now2}_2`,
      name: "Weekend High Stakes Knockout \u26A1",
      entryFee: 10,
      prizePool: 72,
      status: "registration_open",
      players: [],
      maxPlayers: 8,
      startDate: now2 + oneDay * 4,
      endDate: 0,
      winnerId: null,
      currentRound: 1,
      matches: [],
      createdAt: now2
    };
    const t3 = {
      id: `tourney_daily_${now2}_3`,
      name: "Daily Quick Sprint Tournament \u{1F680}",
      entryFee: 2,
      prizePool: 7.2,
      status: "registration_open",
      players: [],
      maxPlayers: 4,
      startDate: now2 + oneHour * 6,
      endDate: 0,
      winnerId: null,
      currentRound: 1,
      matches: [],
      createdAt: now2
    };
    if (!store.tournaments[t1.id]) store.tournaments[t1.id] = t1;
    if (!store.tournaments[t2.id]) store.tournaments[t2.id] = t2;
    if (!store.tournaments[t3.id]) store.tournaments[t3.id] = t3;
  }
}
function loadStore() {
  try {
    if (import_fs.default.existsSync(DB_FILE)) {
      const raw = import_fs.default.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(raw);
      store.users = parsed.users || {};
      store.transactions = parsed.transactions || [];
      store.spectatorBets = parsed.spectatorBets || [];
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
      store.adCampaigns = normalizeStoredAdCampaigns(parsed);
      seedDefaultTournaments();
      const persistedRoles = Array.isArray(parsed.adminSettings?.roles) ? parsed.adminSettings.roles : [];
      store.adminSettings = {
        username: parsed.adminSettings?.username || process.env.ADMIN_USERNAME || "admin",
        password: parsed.adminSettings?.password || process.env.ADMIN_PASSWORD || "password",
        roles: persistedRoles.length ? persistedRoles : DEFAULT_ADMIN_ROLES,
        otpEnabled: parsed.adminSettings?.otpEnabled !== false,
        phoneAuthEnabled: parsed.adminSettings?.phoneAuthEnabled !== false
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
async function loadStoreFromMySql() {
  try {
    const snapshot = await loadRuntimeStoreFromMySql();
    if (!snapshot) return false;
    import_fs.default.writeFileSync(DB_FILE, JSON.stringify(snapshot), "utf8");
    loadStore();
    console.log("Database loaded successfully from MySQL runtime store.");
    return true;
  } catch (error) {
    console.error("Failed to load MySQL runtime store; using Firebase fallback.", error);
    return false;
  }
}
async function loadStoreFromFirestore() {
  if (!db) {
    loadStore();
    return false;
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
        store.spectatorBets = parsed.spectatorBets || [];
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
          roles: persistedRoles.length ? persistedRoles : DEFAULT_ADMIN_ROLES,
          otpEnabled: parsed.adminSettings?.otpEnabled !== false,
          phoneAuthEnabled: parsed.adminSettings?.phoneAuthEnabled !== false
        };
        store.agents = parsed.agents || {};
        store.agentTransactions = parsed.agentTransactions || [];
        store.tournaments = parsed.tournaments || {};
        store.adSettings = { ...DEFAULT_AD_SETTINGS, ...parsed.adSettings || {} };
        store.adCampaigns = normalizeStoredAdCampaigns(parsed);
        console.log("Database loaded successfully from Firebase Firestore.");
        import_fs.default.writeFileSync(DB_FILE, payload.data, "utf8");
        await loadUserProfilesFromFirestore();
        await loadManualRequestsFromFirestore();
        await syncUserProfilesToFirestore();
        return true;
      }
    }
    console.log("No existing state in Firestore. Loading from local store fallback...");
    loadStore();
    await loadUserProfilesFromFirestore();
    await loadManualRequestsFromFirestore();
    await syncUserProfilesToFirestore();
    return false;
  } catch (err) {
    console.error("Failed to load store from Firestore:", err);
    loadStore();
    return false;
  }
}
var persistedUserProfiles = /* @__PURE__ */ new Map();
var userProfileSyncQueue = Promise.resolve();
var userProfileSyncTimer = null;
var resolveScheduledUserProfileSync = null;
var scheduledUserProfileSync = null;
function serializeUserProfile(user) {
  return JSON.stringify(user);
}
var isMySqlRuntimePrimary = () => mysqlRuntimeStoreMode() === "primary";
async function loadUserProfilesFromFirestore() {
  if (!db || isMySqlRuntimePrimary()) return;
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
  if (isMySqlRuntimePrimary()) {
    const changedUsers = Object.values(store.users).filter((user) => !isBotPlayer(user.id) && persistedUserProfiles.get(user.firebaseUid || user.id) !== serializeUserProfile(user));
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
      batch.set(db.collection("users").doc(documentId), cleanProfile, { merge: true });
    }
    await batch.commit();
    for (const user of users.slice(offset, offset + 500)) {
      persistedUserProfiles.set(user.firebaseUid || user.id, serializeUserProfile(user));
    }
  }
}
function queueUserProfileSync() {
  if (!scheduledUserProfileSync) {
    scheduledUserProfileSync = new Promise((resolve) => {
      resolveScheduledUserProfileSync = resolve;
    });
    userProfileSyncTimer = setTimeout(() => {
      userProfileSyncTimer = null;
      const resolve = resolveScheduledUserProfileSync;
      resolveScheduledUserProfileSync = null;
      scheduledUserProfileSync = null;
      userProfileSyncQueue = userProfileSyncQueue.then(() => syncUserProfilesToFirestore()).catch((error) => console.error("Failed to synchronize user profiles:", error)).finally(() => resolve?.());
    }, 750);
    userProfileSyncTimer.unref?.();
  }
  return scheduledUserProfileSync;
}
async function saveUserProfileToFirestore(user) {
  if (isMySqlRuntimePrimary()) return saveMySqlUserProfile(user);
  if (!db) return;
  const documentId = user.firebaseUid || user.id;
  const cleanProfile = JSON.parse(JSON.stringify(user));
  await db.collection("users").doc(documentId).set(cleanProfile, { merge: true });
  persistedUserProfiles.set(documentId, serializeUserProfile(user));
}
async function saveManualRequestToFirestore(request) {
  if (isMySqlRuntimePrimary()) {
    const requestUser = store.users[request.userId];
    if (!requestUser) throw new Error(`Cannot persist manual request for missing user ${request.userId}`);
    await saveMySqlUserProfile(requestUser);
    return saveMySqlManualRequest(request, requestUser);
  }
  if (db) {
    try {
      await db.collection("manualTransactionRequests").doc(request.id).set(JSON.parse(JSON.stringify(request)), { merge: true });
      return;
    } catch (error) {
      if (!isMySqlConfigured()) throw error;
      console.error("Firestore manual request write failed; falling back to MySQL:", error);
    }
  }
  if (isMySqlConfigured()) {
    const requestUser = store.users[request.userId];
    if (requestUser) await saveMySqlUserProfile(requestUser);
    return saveMySqlManualRequest(request, requestUser);
  }
  throw new Error("Database not initialized");
}
async function loadManualRequestsFromFirestore() {
  if (!db || isMySqlRuntimePrimary()) return;
  const snapshot = await db.collection("manualTransactionRequests").get();
  const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const merged = new Map(store.pendingManualTransactions.map((request) => [request.id, request]));
  requests.forEach((request) => merged.set(request.id, request));
  store.pendingManualTransactions = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}
async function findManualRequest(requestId) {
  const localRequest = store.pendingManualTransactions.find((request2) => request2.id === requestId);
  if (localRequest || !db || isMySqlRuntimePrimary()) return localRequest;
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
    baidoa: "baidoa",
    garowe: "garowe",
    garoowe: "garowe",
    gaarowe: "garowe",
    nugaal: "garowe"
  };
  return aliases[city] || city;
}
function cashierCities(admin) {
  return [...new Set([...Array.isArray(admin.cashierLocations) ? admin.cashierLocations : [], admin.location].map(normalizedCity).filter(Boolean))].slice(0, 2);
}
function cashierCanServeRequest(admin, request) {
  const user = store.users[request.userId];
  const requestCity = normalizedCity(request.cashierCity || user?.location);
  return Boolean(requestCity && cashierCities(admin).includes(requestCity));
}
async function assignCashierToRequest(request, now2 = Date.now()) {
  if (!db && !isMySqlConfigured() || request.managedBy === "agent" || request.status !== "pending") return false;
  const user = store.users[request.userId];
  const city = normalizedCity(request.cashierCity || user?.location);
  request.cashierCity = city;
  if (!city) return false;
  if (request.assignedCashierId && Number(request.assignmentExpiresAt || 0) <= now2) {
    request.cashierTimedOutIds = [...request.cashierTimedOutIds || [], request.assignedCashierId];
  }
  const eligible = [...adminUsersCache.values()].filter((admin) => admin.status !== "suspended" && normalizeAdminPermissions(admin.permissions).includes("cashier") && cashierCities(admin).includes(city) && Number(admin.cashierOnlineAt || 0) >= now2 - CASHIER_ONLINE_WINDOW_MS);
  if (eligible.length === 0) {
    const assignmentChanged = Boolean(request.assignedCashierId || request.assignedCashierName || request.assignedCashierAt || request.assignmentExpiresAt);
    request.assignedCashierId = void 0;
    request.assignedCashierName = void 0;
    request.assignedCashierAt = void 0;
    request.assignmentExpiresAt = void 0;
    if (assignmentChanged) await saveManualRequestToFirestore(request);
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
  const selected = candidates[import_crypto.default.randomInt(candidates.length)];
  request.assignedCashierId = selected.id;
  request.assignedCashierName = selected.name || selected.username;
  request.assignedCashierAt = now2;
  request.assignmentExpiresAt = now2 + CASHIER_ASSIGNMENT_MS;
  request.cashierAssignmentHistory = [.../* @__PURE__ */ new Set([...nextHistory, selected.id])];
  await saveManualRequestToFirestore(request);
  return true;
}
async function reassignExpiredCashierRequests(now2 = Date.now()) {
  const requests = store.pendingManualTransactions.filter((request) => request.status === "pending" && request.managedBy !== "agent" && (!request.assignedCashierId || Number(request.assignmentExpiresAt || 0) <= now2));
  for (const request of requests) {
    try {
      await assignCashierToRequest(request, now2);
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
  if (isMySqlRuntimePrimary()) {
    return Object.values(store.users).find((user) => user.firebaseUid === firebaseUid || Boolean(email && user.email?.trim().toLowerCase() === email.trim().toLowerCase())) || null;
  }
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
  if (isMySqlRuntimePrimary()) return store.users[userId] || null;
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
  if (!db || isMySqlRuntimePrimary()) return;
  try {
    const storeRef = db.collection("ludo_store").doc("main");
    const serialized = JSON.stringify(store);
    if (Buffer.byteLength(serialized, "utf8") > 9e5) return;
    await storeRef.set({ data: serialized, updatedAt: Date.now() });
    console.log("Successfully synchronized store to Firebase Firestore.");
  } catch (err) {
    console.error("Failed to sync store to Firestore:", err);
  }
}
var pendingMySqlStoreSnapshot = null;
var mySqlStoreSync = null;
var lastMySqlStoreSnapshotAt = 0;
var MYSQL_STORE_SNAPSHOT_INTERVAL_MS = 5e3;
function queueMySqlStoreSync() {
  if (firebaseMySqlMigrationMode || mysqlRuntimeStoreMode() === "disabled") return Promise.resolve();
  pendingMySqlStoreSnapshot = store;
  if (!mySqlStoreSync) {
    mySqlStoreSync = (async () => {
      while (pendingMySqlStoreSnapshot) {
        const waitMs = Math.max(750, MYSQL_STORE_SNAPSHOT_INTERVAL_MS - (Date.now() - lastMySqlStoreSnapshotAt));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
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
var diskStoreSaveTimer = null;
var lastDiskStoreSaveAt = 0;
var DISK_STORE_SAVE_INTERVAL_MS = 1e4;
function queueDiskStoreSave() {
  if (diskStoreSaveTimer) return;
  const delay = Math.max(250, DISK_STORE_SAVE_INTERVAL_MS - (Date.now() - lastDiskStoreSaveAt));
  diskStoreSaveTimer = setTimeout(() => {
    diskStoreSaveTimer = null;
    const payload = JSON.stringify(store);
    void import_fs.default.promises.writeFile(DB_FILE, payload, "utf8").catch((error) => {
      console.error("Failed to write database backup to disk.", error);
    });
    lastDiskStoreSaveAt = Date.now();
  }, delay);
  diskStoreSaveTimer.unref?.();
}
function saveStore() {
  try {
    queueDiskStoreSave();
    void queueMySqlStoreSync().catch((error) => console.error("MySQL shadow store synchronization failed:", error));
    void queueUserProfileSync();
  } catch (error) {
    console.error("Failed to write database to disk.", error);
  }
}
async function saveStoreAndWait() {
  try {
    if (diskStoreSaveTimer) {
      clearTimeout(diskStoreSaveTimer);
      diskStoreSaveTimer = null;
    }
    await import_fs.default.promises.writeFile(DB_FILE, JSON.stringify(store, null, 2), "utf8");
    try {
      await queueMySqlStoreSync();
    } catch (error) {
      console.error("MySQL shadow store synchronization failed; continuing with Firebase:", error);
    }
    await syncToFirestore();
    await queueUserProfileSync();
  } catch (error) {
    console.error("Failed to write database to disk.", error);
  }
}
function purgeSimulatedUsers() {
  let changed = false;
  Object.keys(store.users).forEach((id) => {
    if (id.startsWith("user_sim_") || id.startsWith("sim_")) {
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
var SERVER_INSTANCE_ID = import_crypto.default.randomUUID();
function publishRealtimeEvent(scopeType, targetId, eventName, payload) {
  if (!isMySqlConfigured() || eventName === "timer_tick") return;
  void publishMySqlRealtimeEvent({
    originId: SERVER_INSTANCE_ID,
    scopeType,
    targetId,
    eventName,
    payload
  }).catch((error) => console.error(`Failed to publish shared ${eventName} event:`, error));
}
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
function broadcastToAllLocal(eventName, data) {
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
function broadcastToAll(eventName, data) {
  broadcastToAllLocal(eventName, data);
  publishRealtimeEvent("all", null, eventName, data);
}
function broadcastToRoomLocal(roomId, eventName, data) {
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
function broadcastToRoom(roomId, eventName, data) {
  broadcastToRoomLocal(roomId, eventName, data);
  publishRealtimeEvent("room", roomId, eventName, data);
  const room = store.rooms[roomId];
  if (room && (room.status === "completed" || room.status === "cancelled")) {
    void settleSpectatorBets(room).catch((error) => console.error(`Spectator bet settlement failed for ${roomId}:`, error));
  }
}
function broadcastUserUpdate(userId) {
  const user = store.users[userId];
  if (user) {
    sendEventToUser(userId, "user_update", user);
    publishRealtimeEvent("user", userId, "user_update", user);
  }
}
var mySqlRealtimeCursor = null;
var mySqlRealtimePollRunning = false;
var lastMySqlRealtimeCleanupAt = 0;
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
      if (event.scopeType === "room" && event.targetId) {
        if (event.eventName === "game_update" && event.payload?.id) {
          const incomingRoom = event.payload;
          if (shouldAcceptRoomSnapshot(store.rooms[incomingRoom.id], incomingRoom)) {
            store.rooms[incomingRoom.id] = incomingRoom;
          } else {
            continue;
          }
        }
        broadcastToRoomLocal(event.targetId, event.eventName, event.payload);
      } else if (event.scopeType === "user" && event.targetId) {
        if (event.eventName === "user_update" && event.payload?.id) {
          store.users[event.payload.id] = event.payload;
        }
        sendEventToUser(event.targetId, event.eventName, event.payload);
      } else {
        broadcastToAllLocal(event.eventName, event.payload);
      }
    }
    if (Date.now() - lastMySqlRealtimeCleanupAt > 6e4) {
      lastMySqlRealtimeCleanupAt = Date.now();
      await cleanupMySqlRealtimeEvents(Date.now() - 5 * 6e4);
    }
  } catch (error) {
    console.error("MySQL realtime event poll failed:", error);
  } finally {
    mySqlRealtimePollRunning = false;
  }
}
var mySqlRealtimePollTimer = setInterval(() => void pollMySqlRealtimeEvents(), 500);
mySqlRealtimePollTimer.unref?.();
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
  const now2 = Date.now();
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
      if (seekingJoinedAt && now2 - seekingJoinedAt > 10 * 6e4) {
        delete u.seekingJoinedAt;
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
function syncMatchmakingRecordWithRetry(userId, record, attempt = 1) {
  const operation = isMySqlRuntimePrimary() ? upsertMySqlMatchmaking(record) : db?.collection("matchmaking").doc(userId).set(record);
  if (!operation) return;
  operation.catch((error) => {
    console.error(`Failed to sync matchmaking record (attempt ${attempt}):`, error);
    if (attempt < 3) {
      setTimeout(() => syncMatchmakingRecordWithRetry(userId, record, attempt + 1), attempt * 1e3);
    }
  });
}
async function deleteSharedMatchmakingRecords(...userIds) {
  if (isMySqlRuntimePrimary()) {
    await deleteMySqlMatchmaking(userIds);
    return;
  }
  if (!db) return;
  await Promise.all(userIds.map((userId) => db.collection("matchmaking").doc(userId).delete()));
}
var mysqlMatchmakingSignature = "";
var mysqlMatchmakingTimer = null;
var mysqlCashierHeartbeatTimer = null;
async function refreshMySqlMatchmakingQueues() {
  const records = await listActiveMySqlMatchmaking();
  const signature = JSON.stringify(records.map((record) => [record.userId, record.timestamp]));
  if (signature === mysqlMatchmakingSignature) return;
  mysqlMatchmakingSignature = signature;
  for (const key of Object.keys(store.matchmakingQueues)) store.matchmakingQueues[key] = [];
  for (const record of records) {
    const userId = String(record.userId || "");
    if (!userId) continue;
    const queueKey = `${record.betAmount}_${record.capacity}_${record.gameMode}`;
    if (!store.matchmakingQueues[queueKey]) store.matchmakingQueues[queueKey] = [];
    store.matchmakingQueues[queueKey].push(userId);
    if (!store.users[userId]) store.users[userId] = { id: userId, username: record.username || "Player", avatar: record.avatar || "\u{1F3AE}", balance: 0, winCount: 0, lossCount: 0, isOfflinePreference: false };
    store.users[userId].seekingJoinedAt = Number(record.timestamp || Date.now());
  }
  broadcastToAll("online_players_updated", {});
}
async function startMySqlMatchmakingSync() {
  if (!isMySqlRuntimePrimary() || mysqlMatchmakingTimer) return;
  await refreshMySqlMatchmakingQueues();
  mysqlMatchmakingTimer = setInterval(() => {
    void refreshMySqlMatchmakingQueues().catch((error) => console.error("MySQL matchmaking refresh failed:", error));
  }, 2e3);
  mysqlMatchmakingTimer.unref?.();
  console.log("MySQL matchmaking realtime synchronization initialized.");
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
    void refreshMySqlCashierHeartbeats().catch((error) => console.error("MySQL cashier heartbeat refresh failed:", error));
  }, 15e3);
  mysqlCashierHeartbeatTimer.unref?.();
  console.log("MySQL cashier heartbeat synchronization initialized.");
}
var START_OFFSETS = {
  green: 0,
  yellow: 13,
  blue: 26,
  red: 39
};
var SAFE_GLOBAL_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];
var PLAYER_INACTIVITY_SECONDS = 300;
function getTeamColors(color) {
  return color === "red" || color === "yellow" ? ["red", "yellow"] : ["green", "blue"];
}
function getPartnerColor(color) {
  return color === "red" ? "yellow" : color === "yellow" ? "red" : color === "green" ? "blue" : "green";
}
function getPlayableColor(room, player) {
  if (room.gameMode !== "team" || !player.teamAssistUnlocked) return player.color;
  return getPartnerColor(player.color);
}
function resetPlayerInactivity(player) {
  if (!player || isBotPlayer(player.userId)) return;
  player.inactivityTimer = PLAYER_INACTIVITY_SECONDS;
  player.inactivityDeadline = void 0;
  player.lastInactivityWarningMinute = void 0;
}
function touchRoom(room) {
  room.gameState.lastActivity = Math.max(Date.now(), Number(room.gameState.lastActivity || 0) + 1);
}
function shouldAcceptRoomSnapshot(localRoom, incomingRoom) {
  if (!localRoom) return true;
  if (localRoom.status === "completed" || localRoom.status === "cancelled") return false;
  if (incomingRoom.status === "completed" || incomingRoom.status === "cancelled") return true;
  return Number(incomingRoom.gameState?.lastActivity || 0) >= Number(localRoom.gameState?.lastActivity || 0);
}
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
  gs.diceRoll = null;
  gs.hasRolled = false;
  gs.turnTimer = 30;
  let found = false;
  let nextTurn = oldTurn;
  for (let i = 1; i <= numPlayers * 2; i++) {
    const checkIdx = (oldTurn + i) % numPlayers;
    const p = room.players[checkIdx];
    if (p && p.status !== "left") {
      if (room.gameMode === "team" && p.teamFinishSkipPending) {
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
function hasMatchPayout(userId, matchId) {
  return store.transactions.some(
    (tx) => tx.userId === userId && tx.matchId === matchId && tx.type === "win_payout"
  );
}
var settlingSpectatorRooms = /* @__PURE__ */ new Set();
async function settleSpectatorBets(room) {
  if (settlingSpectatorRooms.has(room.id)) return;
  const openBets = store.spectatorBets.filter((bet) => bet.roomId === room.id && bet.status === "open");
  if (!openBets.length) return;
  settlingSpectatorRooms.add(room.id);
  try {
    const winnerIds = room.gameState.winnerIds?.length ? room.gameState.winnerIds : room.gameState.winnerId ? [room.gameState.winnerId] : [];
    const markets = /* @__PURE__ */ new Map();
    openBets.forEach((bet) => markets.set(bet.targetPlayerId, [...markets.get(bet.targetPlayerId) || [], bet]));
    for (const [targetPlayerId, marketBets] of markets) {
      const totalPool = Number(marketBets.reduce((sum, bet) => sum + bet.stake, 0).toFixed(2));
      const targetWon = winnerIds.includes(targetPlayerId);
      const winningPrediction = targetWon ? "W" : "L";
      const winnerPool = Number(marketBets.filter((bet) => bet.prediction === winningPrediction).reduce((sum, bet) => sum + bet.stake, 0).toFixed(2));
      const distributablePool = Number((totalPool * 0.9).toFixed(2));
      const shouldRefund = room.status === "cancelled" || winnerIds.length === 0 || winnerPool === 0 || distributablePool <= winnerPool;
      const winningBets = marketBets.filter((bet) => bet.prediction === winningPrediction);
      let distributed = 0;
      for (const bet of marketBets) {
        const bettor = store.users[bet.userId];
        if (!bettor) continue;
        bet.settledAt = Date.now();
        if (shouldRefund) {
          bet.status = "refunded";
          bet.payout = bet.stake;
          bettor.balance = Number((bettor.balance + bet.stake).toFixed(2));
          addTransaction(bet.userId, "refund", bet.stake, room.id, `Unmatched spectator pool refund ${bet.id}.`);
        } else if (bet.prediction === winningPrediction) {
          const winnerIndex = winningBets.findIndex((item) => item.id === bet.id);
          const payout = winnerIndex === winningBets.length - 1 ? Number((distributablePool - distributed).toFixed(2)) : Number((distributablePool * (bet.stake / winnerPool)).toFixed(2));
          distributed = Number((distributed + payout).toFixed(2));
          bet.status = "won";
          bet.payout = payout;
          bet.odds = Number((payout / bet.stake).toFixed(2));
          bet.potentialPayout = payout;
          bettor.balance = Number((bettor.balance + payout).toFixed(2));
          addTransaction(bet.userId, "win_payout", payout, room.id, `Dynamic spectator pool won on ${bet.targetUsername} (${bet.odds.toFixed(2)} final odds).`);
        } else {
          bet.status = "lost";
          bet.payout = 0;
        }
        broadcastUserUpdate(bet.userId);
        await saveUserProfileToFirestore(bettor);
      }
      if (!shouldRefund) {
        const commission = Number((totalPool - distributablePool).toFixed(2));
        recordHouseRevenue("betting_margin", commission, `${room.id}:${targetPlayerId}`, `10% spectator pool commission for match ${room.id}.`);
      }
    }
    await saveStoreAndWait();
  } finally {
    settlingSpectatorRooms.delete(room.id);
  }
}
async function persistLiveRoom(room) {
  if (!isMySqlConfigured()) return;
  await saveMySqlGameRoom(room);
}
async function persistRoomUserProfiles(room) {
  const profiles = room.players.filter((player) => !isBotPlayer(player.userId)).map((player) => store.users[player.userId]).filter((profile) => Boolean(profile));
  await Promise.all(profiles.map((profile) => saveUserProfileToFirestore(profile)));
}
function recordHouseRevenue(category, amount, referenceId, description = "") {
  const normalizedAmount = Number(Number(amount || 0).toFixed(2));
  if (!normalizedAmount) return;
  if (referenceId && store.transactions.some(
    (tx2) => tx2.type === "app_commission" && tx2.matchId === referenceId && tx2.revenueCategory === category
  )) return;
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
  return userId.startsWith("bot_") || userId.startsWith("user_sim_") || userId.startsWith("sim_");
}
function isBotEconomyRoom(room) {
  return room.players.some((player) => isBotPlayer(player.userId));
}
function settleBotEconomy(room, winnerIds) {
  const marker = "Bot game fixed result";
  const alreadySettled = store.transactions.some((tx) => tx.matchId === room.id && (tx.description || "").includes(marker));
  if (alreadySettled) return;
  room.gameState.winnerPayout = 0;
  room.gameState.winnerPayouts = {};
  room.gameState.rakeAmount = 0;
  room.gameState.escrowBalance = 0;
  room.players.forEach((player) => {
    if (isBotPlayer(player.userId) || player.status === "left") return;
    const profile = store.users[player.userId];
    if (!profile) return;
    if (winnerIds.includes(player.userId)) {
      profile.balance = Number((profile.balance + 0.01).toFixed(2));
      profile.winCount = (profile.winCount || 0) + 1;
      room.gameState.winnerPayouts[player.userId] = 0.01;
      if (room.gameState.winnerId === player.userId) room.gameState.winnerPayout = 0.01;
      addTransaction(player.userId, "win_payout", 0.01, room.id, `${marker}: player win reward.`);
    } else {
      const deduction = Math.min(0.02, Number(profile.balance || 0));
      profile.balance = Number(Math.max(0, profile.balance - deduction).toFixed(2));
      profile.lossCount = (profile.lossCount || 0) + 1;
      addTransaction(player.userId, "app_commission", deduction, room.id, `${marker}: bot win charge.`);
      if (deduction > 0) recordHouseRevenue("bot_result", deduction, `${room.id}:${player.userId}`, `Bot game charge from ${player.userId}.`);
    }
    broadcastUserUpdate(player.userId);
  });
  saveStore();
  void persistRoomUserProfiles(room).catch((error) => console.error(`Failed to persist bot result for ${room.id}:`, error));
}
function executeBotTurnIfActive(room) {
  const activePlayer = room.players[room.gameState.turn];
  if (!activePlayer || !isBotPlayer(activePlayer.userId)) return;
  const roomId = room.id;
  const botUserId = activePlayer.userId;
  setTimeout(async () => {
    try {
      const currentRoom = store.rooms[roomId];
      const currentBot = currentRoom?.players[currentRoom.gameState.turn];
      if (!currentRoom || currentRoom.status !== "playing" || currentBot?.userId !== botUserId || !isBotPlayer(currentBot.userId)) return;
      if (currentRoom.gameState.hasRolled) return;
      const diceValue = Math.floor(Math.random() * 6) + 1;
      currentRoom.gameState.diceRoll = diceValue;
      currentRoom.gameState.lastDiceRoll = diceValue;
      currentRoom.gameState.hasRolled = true;
      currentRoom.gameState.turnTimer = 30;
      currentRoom.gameState.consecutiveSixes = diceValue === 6 ? Number(currentRoom.gameState.consecutiveSixes || 0) + 1 : 0;
      const tripleSixPenalty = currentRoom.gameState.consecutiveSixes >= 3;
      if (tripleSixPenalty) {
        currentRoom.gameState.consecutiveSixes = 0;
        addLog(currentRoom, `Bot ${currentBot.username} rolled three consecutive sixes and loses the turn.`);
      }
      touchRoom(currentRoom);
      addLog(currentRoom, `Bot ${currentBot.username} rolled a ${diceValue}.`);
      saveStore();
      await persistLiveRoom(currentRoom);
      broadcastToRoom(roomId, "game_update", currentRoom);
      const selectedTokenId = tripleSixPenalty ? null : selectAutomaticToken(currentRoom, currentBot, diceValue)?.id || null;
      if (!tripleSixPenalty && !selectedTokenId) addLog(currentRoom, `Bot ${currentBot.username} has no valid move.`);
      setTimeout(async () => {
        try {
          const latestRoom = store.rooms[roomId];
          const latestBot = latestRoom?.players[latestRoom.gameState.turn];
          if (!latestRoom || latestRoom.status !== "playing" || latestBot?.userId !== botUserId) return;
          if (!latestRoom.gameState.hasRolled || latestRoom.gameState.diceRoll !== diceValue) return;
          if (selectedTokenId) moveTokenLogic(latestRoom, selectedTokenId, diceValue);
          else advanceTurn(latestRoom);
          saveStore();
          await persistLiveRoom(latestRoom);
          void persistRoomUserProfiles(latestRoom).catch((error) => console.error(`Bot profile sync failed for room ${roomId}:`, error));
          broadcastToRoom(roomId, "game_update", latestRoom);
          executeBotTurnIfActive(latestRoom);
        } catch (error) {
          console.error(`Bot move failed for room ${roomId}:`, error);
          setTimeout(async () => {
            try {
              const recoveryRoom = store.rooms[roomId];
              if (!recoveryRoom) return;
              await persistLiveRoom(recoveryRoom);
              broadcastToRoom(roomId, "game_update", recoveryRoom);
              executeBotTurnIfActive(recoveryRoom);
            } catch (retryError) {
              console.error(`Bot move recovery failed for room ${roomId}:`, retryError);
            }
          }, 1e3);
        }
      }, 900);
    } catch (error) {
      console.error(`Bot roll failed for room ${roomId}:`, error);
      const latestRoom = store.rooms[roomId];
      if (latestRoom?.status === "playing") {
        latestRoom.gameState.diceRoll = null;
        latestRoom.gameState.hasRolled = false;
        touchRoom(latestRoom);
        setTimeout(() => executeBotTurnIfActive(latestRoom), 1e3);
      }
    }
  }, 400);
}
function selectAutomaticToken(room, player, diceValue) {
  const playableColor = getPlayableColor(room, player);
  const validTokens = room.gameState.tokens.filter((token) => token.color === playableColor && isMoveValid(token, diceValue));
  if (!validTokens.length) return null;
  const capture = validTokens.find((token) => {
    const nextRelative = token.position === -1 ? 0 : token.position + diceValue;
    const globalPosition = getGlobalPosition(token.color, nextRelative);
    if (globalPosition === null || SAFE_GLOBAL_SQUARES.includes(globalPosition)) return false;
    return room.gameState.tokens.some((other) => {
      if (other.color === token.color || other.position < 0 || other.position > 50) return false;
      if (room.gameMode === "team" && getTeamColors(token.color).includes(other.color)) return false;
      return getGlobalPosition(other.color, other.position) === globalPosition;
    });
  });
  if (capture) return capture;
  if (diceValue === 6) {
    const baseToken = validTokens.find((token) => token.position === -1);
    if (baseToken) return baseToken;
  }
  return [...validTokens].sort((a, b) => b.position - a.position)[0];
}
function performAutomaticPlayerTurn(room, player, strike) {
  if (room.status !== "playing" || room.players[room.gameState.turn]?.userId !== player.userId) return;
  const existingRoll = room.gameState.hasRolled ? room.gameState.diceRoll : null;
  const diceValue = existingRoll ?? Math.floor(Math.random() * 6) + 1;
  room.gameState.diceRoll = diceValue;
  room.gameState.lastDiceRoll = diceValue;
  room.gameState.hasRolled = true;
  room.gameState.turnTimer = 30;
  touchRoom(room);
  addLog(room, existingRoll === null ? `Auto-play ${strike}/3: ${player.username} rolled ${diceValue} after the 30-second timer expired.` : `Auto-play ${strike}/3: ${player.username}'s pending roll ${diceValue} was moved automatically.`);
  saveStore();
  void persistLiveRoom(room).catch((error) => console.error(`Failed to persist auto-roll for ${room.id}:`, error));
  broadcastToRoom(room.id, "game_update", room);
  const selectedToken = selectAutomaticToken(room, player, diceValue);
  setTimeout(() => {
    const currentRoom = store.rooms[room.id];
    if (!currentRoom || currentRoom.status !== "playing") return;
    const currentPlayer = currentRoom.players[currentRoom.gameState.turn];
    if (currentPlayer?.userId !== player.userId || !currentRoom.gameState.hasRolled || currentRoom.gameState.diceRoll !== diceValue) return;
    if (selectedToken) moveTokenLogic(currentRoom, selectedToken.id, diceValue);
    else advanceTurn(currentRoom);
    saveStore();
    void Promise.all([persistLiveRoom(currentRoom), persistRoomUserProfiles(currentRoom)]).catch((error) => console.error(`Failed to persist automatic turn for ${currentRoom.id}:`, error));
    broadcastToRoom(currentRoom.id, "game_update", currentRoom);
    executeBotTurnIfActive(currentRoom);
  }, 900);
}
function moveTokenLogic(room, tokenId, diceValue) {
  const gs = room.gameState;
  const token = gs.tokens.find((t) => t.id === tokenId);
  if (!token) return;
  const activePlayer = room.players[gs.turn];
  const playableColor = getPlayableColor(room, activePlayer);
  if (token.color !== playableColor || !isMoveValid(token, diceValue)) return;
  touchRoom(room);
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
  const teamColors = getTeamColors(token.color);
  const teamAllFinished = room.gameMode === "team" && gs.tokens.filter((t) => teamColors.includes(t.color)).every((t) => t.position === 56);
  const hasWon = room.gameMode === "team" ? teamAllFinished : allFinished;
  if (hasWon) {
    if (room.status === "completed") return;
    room.status = "completed";
    gs.winnerId = activePlayer.userId;
    gs.completionReason = "all_tokens_home";
    if (room.tournamentDetails) {
      addLog(room, `\u{1F3C6} ${activePlayer.username} has won the tournament match!`);
      handleTournamentMatchWin(room.tournamentDetails.tournamentId, room.tournamentDetails.matchId, activePlayer.userId);
      gs.escrowBalance = 0;
      return;
    }
    if (isBotEconomyRoom(room)) {
      const botWinnerIds = room.gameMode === "team" ? room.players.filter((player) => teamColors.includes(player.color) && player.status !== "left").map((player) => player.userId) : [activePlayer.userId];
      gs.winnerIds = botWinnerIds;
      settleBotEconomy(room, botWinnerIds);
      addLog(room, botWinnerIds.some((id) => !isBotPlayer(id)) ? "\u{1F3C6} Bot game won: each winning player receives $0.01." : "\u{1F916} Bot won: each human player is charged $0.02.");
      return;
    }
    if (room.gameMode === "team") {
      const winningColors = teamColors;
      const winningTeammates = room.players.filter((p) => winningColors.includes(p.color) && p.status !== "left");
      gs.winnerIds = winningTeammates.map((p) => p.userId);
      const winningNames = winningTeammates.map((p) => p.username).join(" & ");
      addLog(room, `\u{1F3C6} CHAMPIONS! Team ${winningNames} has finished all tokens and WON the game!`);
      if (room.betAmount > 0) {
        const realWinners = winningTeammates.filter((p) => !isBotPlayer(p.userId) && store.users[p.userId]);
        if (realWinners.length) {
          const effectiveRakePercentage = effectiveRakeForUsers(realWinners.map((p) => p.userId));
          const rakeAmount = Number((gs.escrowBalance * effectiveRakePercentage).toFixed(2));
          const payoutPool = Number((gs.escrowBalance - rakeAmount).toFixed(2));
          gs.rakeAmount = rakeAmount;
          const baseShare = Math.floor(payoutPool * 100 / realWinners.length) / 100;
          let distributed = 0;
          realWinners.forEach((p, index) => {
            const user = store.users[p.userId];
            const share = index === realWinners.length - 1 ? Number((payoutPool - distributed).toFixed(2)) : baseShare;
            distributed += share;
            if (p.userId === gs.winnerId) gs.winnerPayout = share;
            gs.winnerPayouts = { ...gs.winnerPayouts || {}, [p.userId]: share };
            if (!hasMatchPayout(p.userId, room.id)) {
              user.balance += share;
              user.winCount += 1;
              addTransaction(p.userId, "win_payout", share, room.id, `Team win payout for match ${room.id} (Rake: $${rakeAmount.toFixed(2)}).`);
            }
            broadcastUserUpdate(p.userId);
          });
          recordHouseRevenue("team_game_rake", rakeAmount, room.id, `Team-game rake from match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (gs.escrowBalance > 0) {
          recordHouseRevenue("bot_result", gs.escrowBalance, room.id, `Real-player stakes retained after the bot team won match ${room.id}.`);
        }
        room.players.forEach((p) => {
          if (p.status !== "left" && !winningColors.includes(p.color) && !isBotPlayer(p.userId)) {
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
          const payoutAmount = Number((gs.escrowBalance - rakeAmount).toFixed(2));
          gs.rakeAmount = Number(rakeAmount.toFixed(2));
          gs.winnerPayout = payoutAmount;
          gs.winnerPayouts = { [activePlayer.userId]: payoutAmount };
          if (!hasMatchPayout(activePlayer.userId, room.id)) {
            winnerProfile.balance += payoutAmount;
            winnerProfile.winCount += 1;
            addTransaction(
              activePlayer.userId,
              "win_payout",
              payoutAmount,
              room.id,
              `Payout for winning match ${room.id} with $${room.betAmount} bet (Rake: $${rakeAmount.toFixed(2)}).`
            );
          }
          broadcastUserUpdate(activePlayer.userId);
          recordHouseRevenue("game_rake", rakeAmount, room.id, `Rake from match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (gs.escrowBalance > 0) {
          recordHouseRevenue("bot_result", gs.escrowBalance, room.id, `Real-player stakes retained after a bot won match ${room.id}.`);
        }
        room.players.forEach((p) => {
          if (p.status !== "left" && p.userId !== activePlayer.userId && !isBotPlayer(p.userId)) {
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
    const ownTokensFinished = room.gameMode === "team" && token.color === activePlayer.color && gs.tokens.filter((t) => t.color === activePlayer.color).every((t) => t.position === 56) && !activePlayer.teamAssistUnlocked && !activePlayer.teamFinishSkipPending;
    if (ownTokensFinished) {
      activePlayer.teamFinishSkipPending = true;
      addLog(room, `${activePlayer.username} has brought all 4 tokens home and must skip one turn before helping their partner.`);
      advanceTurn(room);
    } else if (bonusTurn) {
      addLog(room, `\u{1F3B2} Bonus roll! ${activePlayer.username} gets to roll again.`);
      gs.turnTimer = 30;
    } else {
      advanceTurn(room);
    }
  }
  saveStore();
}
function completeTeamForfeit(room, forfeitingPlayer, reason) {
  const losingColors = getTeamColors(forfeitingPlayer.color);
  const winningColors = getTeamColors(losingColors.includes("red") ? "green" : "red");
  const winners = room.players.filter((player) => winningColors.includes(player.color) && player.status !== "left");
  room.status = "completed";
  room.gameState.completionReason = reason;
  room.gameState.winnerId = winners[0]?.userId || null;
  room.gameState.winnerIds = winners.map((player) => player.userId);
  addLog(room, `Team ${winners.map((player) => player.username).join(" & ")} wins by forfeit after ${forfeitingPlayer.username} left the partnership match.`);
  const totalPayout = room.gameState.escrowBalance;
  if (room.betAmount > 0 && totalPayout > 0) {
    const realWinners = winners.filter((player) => !isBotPlayer(player.userId) && store.users[player.userId]);
    if (realWinners.length) {
      const rakeRate = effectiveRakeForUsers(realWinners.map((player) => player.userId));
      const rakeAmount = Number((totalPayout * rakeRate).toFixed(2));
      const payoutPool = Number((totalPayout - rakeAmount).toFixed(2));
      const baseShare = Math.floor(payoutPool * 100 / realWinners.length) / 100;
      let distributed = 0;
      realWinners.forEach((player, index) => {
        const share = index === realWinners.length - 1 ? Number((payoutPool - distributed).toFixed(2)) : baseShare;
        distributed += share;
        const profile = store.users[player.userId];
        room.gameState.winnerPayouts = { ...room.gameState.winnerPayouts || {}, [player.userId]: share };
        if (!hasMatchPayout(player.userId, room.id)) {
          profile.balance += share;
          profile.winCount = (profile.winCount || 0) + 1;
          addTransaction(player.userId, "win_payout", share, room.id, `Team win by ${reason} forfeit (Rake: $${rakeAmount.toFixed(2)}).`);
        }
        broadcastUserUpdate(player.userId);
      });
      room.gameState.rakeAmount = rakeAmount;
      room.gameState.winnerPayout = payoutPool;
      recordHouseRevenue("forfeit_rake", rakeAmount, room.id, `Rake from partnership ${reason} forfeit ${room.id}.`);
    } else {
      room.gameState.rakeAmount = totalPayout;
      room.gameState.winnerPayout = 0;
      recordHouseRevenue("bot_result", totalPayout, room.id, `Real-player stakes retained after bot team won partnership forfeit ${room.id}.`);
    }
  }
  room.players.forEach((player) => {
    if (!losingColors.includes(player.color) || player.userId === forfeitingPlayer.userId || isBotPlayer(player.userId)) return;
    const profile = store.users[player.userId];
    if (profile) {
      profile.lossCount = (profile.lossCount || 0) + 1;
      broadcastUserUpdate(player.userId);
    }
  });
  room.gameState.escrowBalance = 0;
}
function handleInactivityForfeit(room, inactivePlayer) {
  if (room.status !== "playing") return;
  addLog(room, `\u23F1\uFE0F ${inactivePlayer.username} has been forfeited due to inactivity.`);
  inactivePlayer.status = "left";
  inactivePlayer.inactivityDeadline = void 0;
  inactivePlayer.inactivityTimer = 0;
  const inactiveProfile = store.users[inactivePlayer.userId];
  if (inactiveProfile && !isBotPlayer(inactivePlayer.userId)) {
    inactiveProfile.lossCount = (inactiveProfile.lossCount || 0) + 1;
    broadcastUserUpdate(inactivePlayer.userId);
  }
  if (room.gameMode === "team") {
    completeTeamForfeit(room, inactivePlayer, "inactivity");
    saveStore();
    void persistLiveRoom(room).catch((error) => console.error(`Failed to persist completed room ${room.id}:`, error));
    broadcastToRoom(room.id, "game_update", room);
    return;
  }
  const activePlayers = room.players.filter((pl) => pl.status !== "left");
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    room.status = "completed";
    room.gameState.winnerId = winner.userId;
    room.gameState.completionReason = "inactivity";
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
          const payoutAmount = Number((totalPayout - rakeAmount).toFixed(2));
          room.gameState.rakeAmount = Number(rakeAmount.toFixed(2));
          room.gameState.winnerPayout = payoutAmount;
          room.gameState.winnerPayouts = { [winner.userId]: payoutAmount };
          if (!hasMatchPayout(winner.userId, room.id)) {
            winnerProfile.balance += payoutAmount;
            winnerProfile.winCount += 1;
            addTransaction(winner.userId, "win_payout", payoutAmount, room.id, `Win by opponent inactivity forfeit (Rake: $${rakeAmount.toFixed(2)}).`);
          }
          broadcastUserUpdate(winner.userId);
          recordHouseRevenue("forfeit_rake", rakeAmount, room.id, `Rake from forfeit match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (totalPayout > 0) {
          recordHouseRevenue("bot_result", totalPayout, room.id, `Real-player stakes retained after a bot won forfeit match ${room.id}.`);
        }
      }
      room.gameState.escrowBalance = 0;
    }
  } else if (activePlayers.length > 1) {
    advanceTurn(room);
  } else if (activePlayers.length === 0) {
    room.status = "completed";
    room.gameState.winnerId = null;
    room.gameState.completionReason = "inactivity";
    room.gameState.escrowBalance = 0;
    addLog(room, "The game ended because all players became inactive.");
  }
  saveStore();
  void Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)]).catch((error) => console.error(`Failed to persist inactivity forfeit for ${room.id}:`, error));
  broadcastToRoom(room.id, "game_update", room);
}
var gameTimerTickRunning = false;
var lastSharedTimerPersistAt = 0;
var roomTurnTimerAnchors = /* @__PURE__ */ new Map();
setInterval(async () => {
  if (gameTimerTickRunning) return;
  gameTimerTickRunning = true;
  try {
    if (isMySqlConfigured()) {
      const isLeader = await ensureMySqlGameTimerLeadership();
      if (!isLeader) return;
      const sharedRooms = await listMySqlActiveGameRooms();
      sharedRooms.forEach((room) => {
        if (room?.id) {
          const localRoom = store.rooms[room.id];
          if (localRoom && (localRoom.status === "completed" || localRoom.status === "cancelled")) {
            return;
          }
          if (!localRoom || Number(room.gameState?.lastActivity || 0) > Number(localRoom.gameState?.lastActivity || 0)) {
            store.rooms[room.id] = room;
          }
        }
      });
    }
    let changed = false;
    Object.keys(store.rooms).forEach((roomId) => {
      const room = store.rooms[roomId];
      if (room.status === "playing") {
        const gs = room.gameState;
        const activePlayer = room.players[gs.turn];
        if (activePlayer && !isBotPlayer(activePlayer.userId)) {
          if (gs.turnTimer > 0) {
            activePlayer.inactivityTimer = PLAYER_INACTIVITY_SECONDS;
            activePlayer.inactivityDeadline = void 0;
            activePlayer.lastInactivityWarningMinute = void 0;
          } else if (!activePlayer.inactivityDeadline) {
            const remainingSeconds = Number.isFinite(activePlayer.inactivityTimer) ? Math.max(0, Number(activePlayer.inactivityTimer)) : PLAYER_INACTIVITY_SECONDS;
            activePlayer.inactivityDeadline = Date.now() + remainingSeconds * 1e3;
            activePlayer.lastInactivityWarningMinute = void 0;
            saveStore();
          }
          if (activePlayer.inactivityDeadline) {
            activePlayer.inactivityTimer = Math.max(
              0,
              Math.ceil((activePlayer.inactivityDeadline - Date.now()) / 1e3)
            );
          }
          changed = true;
          const minutesLeft = Math.ceil(activePlayer.inactivityTimer / 60);
          if (activePlayer.inactivityDeadline && minutesLeft >= 1 && minutesLeft <= 4 && activePlayer.lastInactivityWarningMinute !== minutesLeft) {
            activePlayer.lastInactivityWarningMinute = minutesLeft;
            const warningMsg = `Waqtigaagu wuu sii dhamaanayaa! Waxaa kuu harsan ${minutesLeft} daqiiqo. (Your time is running out! ${minutesLeft} minutes left.)`;
            sendEventToUser(activePlayer.userId, "inactivity_warning", { message: warningMsg });
            addLog(room, `\u23F1\uFE0F Digniin: ${activePlayer.username} waxaa u harsan ${minutesLeft} daqiiqo. (Warning: ${activePlayer.username} has ${minutesLeft} minutes left.)`);
            saveStore();
          }
          if (activePlayer.inactivityDeadline && activePlayer.inactivityTimer <= 0) {
            handleInactivityForfeit(room, activePlayer);
            return;
          }
        }
        if (gs.turnTimer > 0) {
          const now2 = Date.now();
          const activityRevision = Number(gs.lastActivity || 0);
          let timerAnchor = roomTurnTimerAnchors.get(roomId);
          if (!timerAnchor || timerAnchor.turn !== gs.turn || timerAnchor.lastActivity !== activityRevision) {
            timerAnchor = {
              turn: gs.turn,
              lastActivity: activityRevision,
              checkedAt: activityRevision > 0 && activityRevision <= now2 ? activityRevision : now2
            };
            roomTurnTimerAnchors.set(roomId, timerAnchor);
          }
          const elapsedSeconds = Math.floor((now2 - timerAnchor.checkedAt) / 1e3);
          if (elapsedSeconds > 0) {
            gs.turnTimer = Math.max(0, gs.turnTimer - elapsedSeconds);
            timerAnchor.checkedAt += elapsedSeconds * 1e3;
            changed = true;
          }
          if (gs.turnTimer === 0) {
            if (!activePlayer) return;
            if (isBotPlayer(activePlayer.userId)) {
              if (gs.hasRolled && gs.diceRoll !== null) {
                const recoveryToken = selectAutomaticToken(room, activePlayer, gs.diceRoll);
                if (recoveryToken) moveTokenLogic(room, recoveryToken.id, gs.diceRoll);
                else advanceTurn(room);
                saveStore();
                void persistLiveRoom(room).catch((error) => console.error(`Bot watchdog persistence failed for ${room.id}:`, error));
                broadcastToRoom(room.id, "game_update", room);
                executeBotTurnIfActive(room);
              } else {
                executeBotTurnIfActive(room);
              }
              return;
            }
            const strike = Number(activePlayer.inactivityStrikes || 0) + 1;
            activePlayer.inactivityStrikes = strike;
            activePlayer.lastInactivityStrikeAt = now2;
            activePlayer.inactivityTimer = Math.max(0, (5 - strike) * 30);
            const message = strike <= 3 ? `30-ka sekan way dhammaadeen. Auto-play ${strike}/3 ayaa laguu sameeyay. Fadlan ciyaar!` : strike === 4 ? "DIGNIIN KAMA DAMBAYS AH: Mar kale haddii 30-ka sekan kaa dhammaadaan ciyaarta waa lagaa saarayaa." : "Waxaad seegtay shan turn. Ciyaarta waxaa laguu diiwaan geliyey forfeit.";
            sendEventToUser(activePlayer.userId, "inactivity_warning", { message, strike });
            publishRealtimeEvent("user", activePlayer.userId, "inactivity_warning", { message, strike });
            if (strike <= 3) {
              performAutomaticPlayerTurn(room, activePlayer, strike);
            } else if (strike === 4) {
              addLog(room, `Final inactivity warning sent to ${activePlayer.username}; their turn was passed.`);
              advanceTurn(room);
              saveStore();
              void persistLiveRoom(room).catch((error) => console.error(`Failed to persist inactivity warning for ${room.id}:`, error));
              broadcastToRoom(room.id, "game_update", room);
            } else {
              handleInactivityForfeit(room, activePlayer);
            }
            return;
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
            inactivityTimer: room.players[room.gameState.turn]?.inactivityTimer,
            lastActivity: room.gameState.lastActivity
          });
        }
      });
      if (isMySqlConfigured() && Date.now() - lastSharedTimerPersistAt >= 5e3) {
        lastSharedTimerPersistAt = Date.now();
        const activeRooms = Object.values(store.rooms).filter((room) => room.status === "playing");
        await Promise.all(activeRooms.map((room) => saveMySqlGameRoom(room)));
      }
    }
  } catch (error) {
    console.error("Shared game timer tick failed:", error);
  } finally {
    gameTimerTickRunning = false;
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
    const connectedQueueUserIds = queueUserIds.filter((id) => Boolean(store.users[id]));
    if (connectedQueueUserIds.length === 0) return;
    const parts = queueKey.split("_");
    const bet = parseFloat(parts[0]) || 0;
    const cap = parseInt(parts[1]) || 2;
    const mode = parts[2] === "team" ? "team" : "solo";
    if (connectedQueueUserIds.length >= cap) {
      const matchedIds = connectedQueueUserIds.slice(0, cap);
      const matchedUsers = matchedIds.map((id) => store.users[id]).filter(Boolean);
      if (matchedUsers.length === cap && matchedUsers.every((player) => player.balance >= bet)) {
        store.matchmakingQueues[queueKey] = queueUserIds.filter((id) => !matchedIds.includes(id));
        matchedIds.forEach((id) => {
          if (store.users[id]) delete store.users[id].seekingJoinedAt;
        });
        void deleteSharedMatchmakingRecords(...matchedIds).catch((error) => console.error("Failed to delete shared matchmaking records for full queue:", error));
        startMatchedRoom(matchedUsers, bet, cap, mode);
        return;
      }
    }
    const firstUserId = connectedQueueUserIds[0];
    const firstUser = store.users[firstUserId];
    if (!firstUser) return;
    const joinedAt = firstUser.seekingJoinedAt || Date.now();
    const waitTimeMs = Date.now() - joinedAt;
    if (false) {
      console.log(`Matchmaking timeout for queue ${queueKey}. Auto-filling remaining seats with bots...`);
      const realPlayers = connectedQueueUserIds.map((id) => store.users[id]).filter(Boolean);
      store.matchmakingQueues[queueKey] = [];
      void deleteSharedMatchmakingRecords(...realPlayers.map((player) => player.id)).catch((error) => console.error("Failed to delete shared matchmaking records on auto-fill:", error));
      const matchedList = [...realPlayers];
      const botAvatars = ["\u{1F916}", "\u{1F98A}", "\u26A1", "\u{1F451}"];
      const botNames = ["Dhili Master AI", "SomaliLudoBot", "LudoPro AI", "DesertFox AI", "NomadLudo AI"];
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
  if (!auth) return res.status(500).json({ error: "Authentication is not configured." });
  if (!isOtpEnabled()) return res.json({ success: true, disabled: true, message: "Email OTP is currently disabled by the administrator." });
  const uid = req.user.uid;
  const email = String(req.user.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "This account has no email address." });
  const provider = req.user.firebase?.sign_in_provider;
  if (provider !== "password" && provider !== "google.com") return res.status(400).json({ error: "This sign-in provider does not support email OTP." });
  const existing = await readEmailOtp(uid);
  const sentAt = Number(existing?.sentAt || 0);
  if (Date.now() - sentAt < OTP_RESEND_MS) {
    return res.status(429).json({ error: `Please wait ${Math.ceil((OTP_RESEND_MS - (Date.now() - sentAt)) / 1e3)} seconds before requesting another code.` });
  }
  const otp = import_crypto.default.randomInt(1e5, 1e6).toString();
  await sendOtpEmail(email, otp);
  await writeEmailOtp(uid, { email, provider, otpHash: hashEmailOtp(uid, otp), expiresAt: Date.now() + OTP_TTL_MS, sentAt: Date.now(), attempts: 0, verifiedAt: null });
  res.json({ success: true, message: "A 6-digit verification code was sent to your email.", expiresIn: OTP_TTL_MS / 1e3 });
});
app.post("/api/auth/otp/verify", verifyFirebaseToken, async (req, res) => {
  if (!auth) return res.status(500).json({ error: "Authentication is not configured." });
  if (!isOtpEnabled()) return res.json({ success: true, disabled: true, message: "Email OTP is currently disabled by the administrator." });
  const otp = String(req.body?.otp || "").trim();
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: "Enter a valid 6-digit code." });
  const record = await readEmailOtp(req.user.uid);
  if (!record) return res.status(400).json({ error: "No active verification code. Request a new code." });
  if (Number(record.expiresAt) < Date.now()) {
    await removeEmailOtp(req.user.uid);
    return res.status(400).json({ error: "This code has expired. Request a new code." });
  }
  if (Number(record.attempts || 0) >= 5) {
    await removeEmailOtp(req.user.uid);
    return res.status(429).json({ error: "Too many incorrect attempts. Request a new code." });
  }
  const suppliedHash = Buffer.from(hashEmailOtp(req.user.uid, otp), "hex");
  const storedHash = Buffer.from(String(record.otpHash), "hex");
  if (suppliedHash.length !== storedHash.length || !import_crypto.default.timingSafeEqual(suppliedHash, storedHash)) {
    await writeEmailOtp(req.user.uid, { ...record, attempts: Number(record.attempts || 0) + 1 });
    return res.status(400).json({ error: "Incorrect verification code." });
  }
  if (req.user.firebase?.sign_in_provider === "password") await auth.updateUser(req.user.uid, { emailVerified: true });
  await writeEmailOtp(req.user.uid, { ...record, otpHash: "", expiresAt: 0, attempts: 0, verifiedAt: Date.now() });
  res.json({ success: true, message: "Email verified successfully." });
});
app.get("/api/auth/methods", (_req, res) => {
  res.json({
    emailOtpEnabled: isOtpEnabled(),
    phoneAuthEnabled: isPhoneAuthEnabled(),
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || ""
  });
});
app.post("/api/auth/turnstile/verify", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const phone = normalizeAuthPhone(req.body?.phone);
  const action = req.body?.action === "signup" ? "signup" : req.body?.action === "login" ? "login" : null;
  if (!phone || !action || !token) return res.status(400).json({ error: "Security check could not be completed." });
  const secret = process.env.TURNSTILE_SECRET_KEY || "";
  if (!secret) return res.status(500).json({ error: "Security service not configured on server." });
  try {
    const verificationResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: req.ip })
    });
    const verification = await verificationResponse.json();
    if (!verificationResponse.ok || verification.success !== true) return res.status(403).json({ error: "Security check failed. Please try again." });
    res.json({ success: true, ticket: createPhoneTurnstileTicket(phone, action) });
  } catch (error) {
    console.error("Turnstile validation failed:", error);
    res.status(503).json({ error: "Security check is temporarily unavailable." });
  }
});
app.post("/api/auth/native-security-ticket", (req, res) => {
  const phone = normalizeAuthPhone(req.body?.phone);
  const action = req.body?.action === "signup" ? "signup" : req.body?.action === "login" ? "login" : null;
  if (!phone || !action) return res.status(400).json({ error: "Enter a valid phone number." });
  if (!process.env.TURNSTILE_SECRET_KEY) return res.status(503).json({ error: "Native security service is not configured." });
  if (!isTrustedCapacitorAndroidRequest(req)) return res.status(403).json({ error: "This security route is available only inside the LudoSom Android app." });
  const key = `${req.ip}:${phone}:${action}`;
  if (!consumeNativeSecurityAttempt(key)) {
    return res.status(429).json({ error: "Too many security requests. Please wait ten minutes and try again." });
  }
  return res.json({ success: true, ticket: createPhoneTurnstileTicket(phone, action), expiresIn: 300 });
});
app.get("/api/auth/profile-status", verifyFirebaseToken, async (req, res) => {
  const profile = await findUserProfileInFirestore(req.user.uid, req.user.email);
  const otpEnabled = isOtpEnabled() && req.user.firebase?.sign_in_provider !== "phone";
  const exists = Boolean(profile?.id);
  res.json({
    exists,
    onboardingRequired: !exists,
    otpEnabled,
    phoneAuthEnabled: isPhoneAuthEnabled(),
    otpRequired: otpEnabled && !exists,
    otpVerified: exists || !otpEnabled,
    linkedToAgent: Boolean(profile?.linkedAgentId)
  });
});
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});
app.get("/api/version", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.json({
    version: DEPLOY_VERSION,
    deployedFrontend: true,
    nativeVersionCode: 21,
    nativeVersionName: "3.0",
    androidApkUrl: "/downloads/LudoSom.apk"
  });
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
      projectId: (0, import_app2.getApp)().options.projectId
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
  const username = String(req.query.username || "").trim().slice(0, 20);
  const avatar = String(req.query.avatar || "").trim().slice(0, 500);
  const clientProfile = username ? {
    id: userId,
    username,
    avatar: avatar || "\u{1F3AE}",
    isOfflinePreference: req.query.isOffline === "true"
  } : void 0;
  const client = { userId, res, profile: clientProfile };
  activeClients.push(client);
  const activeRoom = Object.values(store.rooms).find(
    (r) => r.status === "playing" && r.players.some((p) => p.userId === userId && p.status === "offline")
  );
  if (activeRoom) {
    const player = activeRoom.players.find((p) => p.userId === userId);
    if (player) {
      player.status = "online";
      resetPlayerInactivity(player);
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
  const { username, email, phone, avatar, promoCode, onboardingComplete, turnstileTicket, phoneAuthAction } = req.body;
  const firebaseUid = req.user.uid;
  const signInProvider = req.user.firebase?.sign_in_provider;
  const tokenEmail = String(req.user.email || "").trim().toLowerCase();
  const phoneAliasMatch = tokenEmail.match(/^phone\.(\d{8,15})@phone\.ludosom\.app$/);
  const aliasPhone = phoneAliasMatch ? `+${phoneAliasMatch[1]}` : "";
  const isPhonePasswordLogin = Boolean(aliasPhone);
  const suppliedPhone = normalizeAuthPhone(phone);
  if (isPhonePasswordLogin && phoneAuthAction === "signup" && (suppliedPhone !== aliasPhone || !verifyPhoneTurnstileTicket(turnstileTicket, aliasPhone, phoneAuthAction))) {
    return res.status(403).json({ error: "Security check is required." });
  }
  const requiresEmailOtp = isOtpEnabled() && signInProvider !== "phone" && !isPhonePasswordLogin;
  if ((signInProvider === "phone" || isPhonePasswordLogin) && !isPhoneAuthEnabled()) {
    return res.status(403).json({ error: "Phone sign-in is currently disabled." });
  }
  let foundUser = Object.values(store.users).find((u) => u.firebaseUid === firebaseUid);
  if (foundUser) {
    foundUser.avatar = normalizeAppAvatar(foundUser.avatar);
    foundUser.phone = foundUser.phone || aliasPhone || req.user.phone_number || phone || void 0;
    if (!foundUser.linkedAgentId && normalizePromoCode(promoCode)) {
      const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
      if (!linkedAgent) return res.status(400).json({ error: "Invalid, expired, or inactive promo code." });
      foundUser.linkedAgentId = linkedAgent.id;
      foundUser.appliedPromoCode = normalizePromoCode(promoCode);
    }
    await saveUserProfileToFirestore(foundUser);
    return res.json(foundUser);
  }
  const persistedUser = await findUserProfileInFirestore(firebaseUid, email);
  if (persistedUser?.id) {
    persistedUser.firebaseUid = firebaseUid;
    persistedUser.email = persistedUser.email || email || void 0;
    persistedUser.phone = persistedUser.phone || aliasPhone || req.user.phone_number || phone || void 0;
    persistedUser.avatar = normalizeAppAvatar(persistedUser.avatar);
    if (!persistedUser.linkedAgentId && normalizePromoCode(promoCode)) {
      const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
      if (!linkedAgent) return res.status(400).json({ error: "Invalid, expired, or inactive promo code." });
      persistedUser.linkedAgentId = linkedAgent.id;
      persistedUser.appliedPromoCode = normalizePromoCode(promoCode);
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
      userByEmail.firebaseUid = firebaseUid;
      userByEmail.email = normalizedEmail;
      userByEmail.emailOtpVerifiedAt = userByEmail.emailOtpVerifiedAt || Date.now();
      if (!userByEmail.linkedAgentId && normalizePromoCode(promoCode)) {
        const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
        if (!linkedAgent) return res.status(400).json({ error: "Invalid, expired, or inactive promo code." });
        userByEmail.linkedAgentId = linkedAgent.id;
        userByEmail.appliedPromoCode = normalizePromoCode(promoCode);
      }
      await saveUserProfileToFirestore(userByEmail);
      await saveStoreAndWait();
      return res.json(userByEmail);
    }
  }
  const verifiedPhone = aliasPhone || String(req.user.phone_number || phone || "").replace(/[\s()-]/g, "");
  if (verifiedPhone) {
    const userByPhone = Object.values(store.users).find((user) => String(user.phone || "").replace(/[\s()-]/g, "") === verifiedPhone && !user.firebaseUid);
    if (userByPhone) {
      userByPhone.firebaseUid = firebaseUid;
      userByPhone.phone = verifiedPhone;
      if (!userByPhone.linkedAgentId && normalizePromoCode(promoCode)) {
        const linkedAgent = await resolveActiveAgentByPromoCode(promoCode);
        if (!linkedAgent) return res.status(400).json({ error: "Invalid, expired, or inactive promo code." });
        userByPhone.linkedAgentId = linkedAgent.id;
        userByPhone.appliedPromoCode = normalizePromoCode(promoCode);
      }
      await saveUserProfileToFirestore(userByPhone);
      await saveStoreAndWait();
      return res.json(userByPhone);
    }
  }
  if (signInProvider === "phone" && onboardingComplete !== true) {
    return res.status(428).json({ error: "Complete phone verification and account setup before continuing." });
  }
  if (requiresEmailOtp && signInProvider === "password") {
    const otpVerification = await readEmailOtp(firebaseUid);
    const verifiedAt = Number(otpVerification?.verifiedAt || 0);
    if (onboardingComplete !== true || !verifiedAt) {
      return res.status(428).json({ error: "Complete email OTP verification before creating the account." });
    }
  }
  if (signInProvider === "google.com" && isOtpEnabled()) {
    if (onboardingComplete !== true) {
      return res.status(428).json({ error: "Complete email OTP verification and the promo-code step before continuing." });
    }
    const otpVerification = await readEmailOtp(firebaseUid);
    const verifiedAt = Number(otpVerification?.verifiedAt || 0);
    if (!verifiedAt || Date.now() - verifiedAt > 30 * 60 * 1e3) {
      return res.status(403).json({ error: "Google onboarding OTP verification is required." });
    }
    await removeEmailOtp(firebaseUid);
  }
  const recoveredUsername = req.user.name || email?.split("@")[0] || `user${Date.now()}`;
  const cleanUsername = (username || recoveredUsername).trim().substring(0, 20);
  let linkedAgentId = void 0;
  const normalizedPromoCode = normalizePromoCode(promoCode);
  if (normalizedPromoCode) {
    if (!db && !isMySqlRuntimePrimary()) {
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
    email: isPhonePasswordLogin ? void 0 : email?.trim().toLowerCase() || void 0,
    phone: aliasPhone || req.user.phone_number || (typeof phone === "string" ? phone.trim() : void 0),
    avatar: normalizeAppAvatar(avatar),
    balance: WELCOME_BONUS,
    winCount: 0,
    lossCount: 0,
    linkedAgentId,
    // Add the linked agent ID
    appliedPromoCode: normalizedPromoCode || void 0,
    emailOtpVerifiedAt: isOtpEnabled() ? Date.now() : void 0
  };
  store.users[userId] = newUser;
  addTransaction(userId, "deposit", WELCOME_BONUS, void 0, "Welcome signup bonus.");
  await saveUserProfileToFirestore(newUser);
  await saveStoreAndWait();
  res.json(newUser);
});
app.get("/api/users/leaderboard", async (req, res) => {
  const allUsers = Object.values(store.users).filter((u) => !isBotPlayer(u.id));
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
app.post("/api/users/presence", async (req, res) => {
  const userId = String(req.body?.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "Valid userId is required." });
  const knownUser = store.users[userId];
  const reportedOfflinePreference = req.body?.isOfflinePreference === true;
  const reportedUsername = String(req.body?.username || "").trim().slice(0, 20);
  const reportedAvatar = req.body?.avatar;
  const profile = {
    id: userId,
    username: reportedUsername || knownUser?.username || "Player",
    avatar: reportedAvatar || knownUser?.avatar || "\u{1F3AE}",
    winCount: knownUser?.winCount || 0,
    lossCount: knownUser?.lossCount || 0,
    presenceLocation: "home",
    // The visible Home client is fresher than the persisted profile cache.
    // Using the cached value here could permanently hide returning users whose
    // client has already switched back online.
    isOfflinePreference: reportedOfflinePreference
  };
  try {
    if (isMySqlConfigured()) {
      await touchMySqlUserPresence([profile]);
    } else if (db) {
      await db.collection("userPresence").doc(userId).set({ userId, lastSeenAt: Date.now(), profile }, { merge: true });
    }
    res.json({ success: true, lastSeenAt: Date.now() });
  } catch (error) {
    console.error("Home presence update failed:", error);
    res.status(503).json({ error: "Presence could not be updated." });
  }
});
app.get("/api/users/online", async (req, res) => {
  const currentUserId = req.query.userId;
  if (!currentUserId) {
    return res.status(400).json({ error: "Missing userId parameter" });
  }
  cleanupMatchmakingQueues();
  try {
    let currentProfile = store.users[currentUserId] || null;
    if (!currentProfile && isMySqlConfigured()) currentProfile = await loadMySqlRuntimeUser(currentUserId);
    if (!currentProfile && db) currentProfile = await refreshUserProfileById(currentUserId);
    if (currentProfile) {
      const presenceProfile = {
        ...currentProfile,
        id: currentUserId,
        isOfflinePreference: Boolean(currentProfile.isOfflinePreference),
        presenceLocation: "home"
      };
      if (isMySqlConfigured()) {
        await touchMySqlUserPresence([presenceProfile]);
      } else if (db) {
        await db.collection("userPresence").doc(currentUserId).set({
          userId: currentUserId,
          lastSeenAt: Date.now(),
          profile: presenceProfile
        }, { merge: true });
      }
    }
  } catch (error) {
    console.error(`Online-list presence registration failed for ${currentUserId}:`, error);
  }
  const now2 = Date.now();
  const onlineList = [];
  let sharedOnlineUsers = [];
  if (isMySqlConfigured()) {
    sharedOnlineUsers = await listMySqlOnlineUsers().catch((error) => {
      console.error("Shared presence lookup failed:", error);
      return [];
    });
  } else if (db) {
    try {
      const snapshot = await db.collection("userPresence").where("lastSeenAt", ">=", Date.now() - 45e3).get();
      sharedOnlineUsers = snapshot.docs.map((doc) => ({ id: String(doc.data().userId || doc.id), profile: doc.data().profile }));
    } catch (error) {
      console.error("Firestore presence lookup failed:", error);
    }
  }
  const homePresenceUserIds = new Set(
    sharedOnlineUsers.filter((user) => user.profile?.presenceLocation === "home").map((user) => user.id)
  );
  const connectedUserIds = /* @__PURE__ */ new Set([...activeClients.map((client) => client.userId), ...sharedOnlineUsers.map((user) => user.id)]);
  const candidateUsers = new Map(Object.values(store.users).map((user) => [user.id, user]));
  sharedOnlineUsers.forEach(({ id, profile }) => {
    candidateUsers.set(id, {
      ...candidateUsers.get(id) || {},
      ...profile || {},
      id,
      username: profile?.username || candidateUsers.get(id)?.username || "Player",
      avatar: profile?.avatar || candidateUsers.get(id)?.avatar || "\u{1F3AE}",
      isOfflinePreference: profile?.isOfflinePreference ?? candidateUsers.get(id)?.isOfflinePreference ?? false
    });
  });
  activeClients.forEach((client) => {
    if (!client.profile?.username) return;
    candidateUsers.set(client.userId, {
      ...candidateUsers.get(client.userId) || {},
      ...client.profile,
      id: client.userId
    });
  });
  const missingProfileIds = [...connectedUserIds].filter((id) => {
    const candidate = candidateUsers.get(id);
    return !candidate || !candidate.username || candidate.username === "Player";
  });
  const hydratedProfiles = await Promise.all(missingProfileIds.map(async (id) => {
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
    candidateUsers.set(id, { ...candidateUsers.get(id) || {}, ...profile, id });
  });
  candidateUsers.forEach((candidate, id) => {
    if (!candidate.username || candidate.username === "Player") candidateUsers.delete(id);
  });
  const busyUserIds = /* @__PURE__ */ new Set();
  Object.values(store.rooms).forEach((room) => {
    if (room.status !== "waiting" && room.status !== "playing") return;
    room.players.forEach((player) => busyUserIds.add(player.userId));
    if (room.invitedUserId) busyUserIds.add(String(room.invitedUserId));
  });
  candidateUsers.forEach((u) => {
    if (isBotPlayer(u.id) || u.id === currentUserId || u.isOfflinePreference) return;
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
    if (status !== "seeking" && connectedUserIds.has(u.id) && (homePresenceUserIds.has(u.id) || !busyUserIds.has(u.id))) status = "online";
    if (status === "seeking" || status === "online") {
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
app.post("/api/users/:userId/status", async (req, res) => {
  const user = store.users[req.params.userId];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const { isOffline } = req.body;
  user.isOfflinePreference = !!isOffline;
  await saveStoreAndWait();
  const presenceProfile = { ...user, presenceLocation: "home" };
  try {
    if (isMySqlConfigured()) {
      await touchMySqlUserPresence([presenceProfile]);
    } else if (db) {
      await db.collection("userPresence").doc(user.id).set({
        userId: user.id,
        lastSeenAt: Date.now(),
        profile: presenceProfile
      }, { merge: true });
    }
  } catch (error) {
    console.error(`Status presence update failed for ${user.id}:`, error);
  }
  broadcastUserUpdate(user.id);
  broadcastToAll("online_players_updated", {});
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
    if (!db && !isMySqlRuntimePrimary()) {
      return res.status(503).json({ error: "The payment service is temporarily unavailable." });
    }
    try {
      if (isMySqlRuntimePrimary()) {
        const selectedAgent = await cachedAgent(assignedAgentId);
        if (!selectedAgent) return res.status(404).json({ error: "The selected agent does not exist." });
        if (selectedAgent.status !== "Active") return res.status(400).json({ error: "The selected agent is not active." });
        assignedAgentUsername = selectedAgent.username;
      } else {
        const agentDoc = await db.collection("agents").doc(assignedAgentId).get();
        if (!agentDoc.exists) {
          return res.status(404).json({ error: "The selected agent does not exist." });
        }
        const selectedAgent = agentDoc.data();
        if (selectedAgent.status !== "Active") {
          return res.status(400).json({ error: "The selected agent is not active." });
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
    return res.status(400).json({ error: "Select your city/location so the request can be assigned to a local cashier." });
  }
  if (!assignedAgentId && String(req.body.location || "").trim() && user.location !== String(req.body.location).trim()) {
    user.location = String(req.body.location).trim();
  }
  const newRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId,
    username: user.username,
    agentId: assignedAgentId,
    agentUsername: assignedAgentUsername,
    managedBy: assignedAgentId ? "agent" : "admin",
    cashierCity: assignedAgentId ? void 0 : requestCity,
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
  try {
    await saveStoreAndWait();
  } catch (error) {
    console.error(`Manual request ${newRequest.id} was saved, but the aggregate store snapshot failed:`, error);
  }
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
  const now2 = Date.now();
  seedDefaultTournaments();
  Object.values(store.tournaments).forEach(async (t) => {
    if (t.status === "check_in" && t.checkInDeadline && now2 >= t.checkInDeadline) {
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
    if (t.status === "registration_open" && now2 >= t.startDate) {
      const maximumSustainablePrize = Number((t.entryFee * t.maxPlayers * 0.9).toFixed(2));
      if (/^tourney_(weekly|weekend|daily)_/.test(t.id) && t.prizePool > maximumSustainablePrize) {
        t.prizePool = maximumSustainablePrize;
      }
      const collectedEntryFees = Number((t.entryFee * t.players.length).toFixed(2));
      if (t.players.length >= 2 && collectedEntryFees >= t.prizePool) {
        t.status = "check_in";
        t.checkInDeadline = now2 + TOURNAMENT_CHECK_IN_MS;
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
          t.startDate = now2 + 12 * 60 * 60 * 1e3;
        }
        await saveStoreAndWait();
        broadcastToAll("tournament_update", t);
      }
    }
  });
}
setInterval(checkAndStartTournaments, 1e4);
setInterval(() => {
  const now2 = Date.now();
  Object.keys(store.rooms).forEach((roomId) => {
    const room = store.rooms[roomId];
    if (room.status === "playing") {
      const activeHumanPlayers = room.players.filter((p) => !isBotPlayer(p.userId) && p.status !== "left");
      const lastAct = room.gameState?.lastActivity || room.createdAt || now2;
      if (activeHumanPlayers.length === 0 || now2 - lastAct > 15 * 60 * 1e3) {
        room.status = "completed";
        addLog(room, "Room closed due to inactivity or abandonment.");
        saveStore();
      }
    }
  });
}, 3e4);
app.use("/api/rooms", async (req, res, next) => {
  if (!isMySqlConfigured()) return next();
  const pathParts = req.path.split("/").filter(Boolean);
  const reservedPaths = /* @__PURE__ */ new Set([
    "active",
    "create",
    "join",
    "matchmaking",
    "create-bot-room",
    "voice-signaling",
    "challenge",
    "ready",
    "add-bot",
    "change-team",
    "start",
    "roll-dice",
    "move-token",
    "chat",
    "accept-player",
    "decline-player",
    "nudge",
    "emoji",
    "leave"
  ]);
  const bodyRoomId = String(req.body?.roomId || req.body?.roomCode || "").trim().toUpperCase();
  const pathRoomId = pathParts[0] === "check-status" ? String(pathParts[1] || "").trim().toUpperCase() : !reservedPaths.has(pathParts[0]) ? String(pathParts[0] || "").trim().toUpperCase() : "";
  const roomId = bodyRoomId || pathRoomId;
  try {
    if (req.method === "GET" && pathParts[0] === "active") {
      const rooms = await listMySqlActiveGameRooms();
      rooms.forEach((room) => {
        if (room?.id && shouldAcceptRoomSnapshot(store.rooms[room.id], room)) store.rooms[room.id] = room;
      });
    } else if (roomId) {
      const room = await loadMySqlGameRoom(roomId);
      const localRoom = store.rooms[roomId];
      if (room && shouldAcceptRoomSnapshot(localRoom, room)) {
        store.rooms[roomId] = room;
      }
    }
    const userIds = [
      req.body?.userId,
      req.body?.senderId,
      req.body?.receiverId,
      req.query?.userId
    ].map((value) => String(value || "").trim()).filter(Boolean);
    await Promise.all([...new Set(userIds)].map(async (userId) => {
      const user = await loadMySqlRuntimeUser(userId);
      if (user?.id && !store.users[user.id]) store.users[user.id] = user;
    }));
  } catch (error) {
    console.error("MySQL live room hydration failed; continuing with local state:", error);
  }
  res.once("finish", () => {
    const persistedRoomId = String(res.locals.roomId || roomId || "").trim().toUpperCase();
    const room = store.rooms[persistedRoomId];
    if (!room || res.statusCode >= 500) return;
    void saveMySqlGameRoom(room).catch((error) => {
      console.error(`MySQL live room persistence failed for ${persistedRoomId}:`, error);
    });
  });
  next();
});
app.use("/api/rooms", async (req, res, next) => {
  if (!isMySqlConfigured() || req.method !== "POST" || !["/roll-dice", "/move-token"].includes(req.path)) return next();
  const roomId = String(req.body?.roomId || "").trim().toUpperCase();
  if (!roomId) return res.status(400).json({ error: "Room ID is required." });
  let connection;
  try {
    connection = await getMySqlPool().getConnection();
    const lockName = `ludosom_room_${roomId}`.slice(0, 64);
    const [rows] = await connection.query("SELECT GET_LOCK(?, 8) AS acquired", [lockName]);
    if (Number(rows[0]?.acquired) !== 1) {
      connection.release();
      return res.status(503).json({ error: "The game server is busy synchronizing this turn. Please retry." });
    }
    const sharedRoom = await loadMySqlGameRoom(roomId);
    const localRoom = store.rooms[roomId];
    if (sharedRoom && !(localRoom && ["completed", "cancelled"].includes(localRoom.status))) {
      store.rooms[roomId] = sharedRoom;
    }
    let released = false;
    const releaseLock = () => {
      if (released) return;
      released = true;
      void connection.query("SELECT RELEASE_LOCK(?)", [lockName]).catch((error) => console.error(`Failed to release gameplay lock for ${roomId}:`, error)).finally(() => connection.release());
    };
    res.once("finish", releaseLock);
    res.once("close", releaseLock);
    next();
  } catch (error) {
    if (connection) connection.release();
    console.error(`Failed to acquire gameplay lock for ${roomId}:`, error);
    return res.status(503).json({ error: "The game server could not synchronize this turn. Please retry." });
  }
});
app.get("/api/rooms/active", (req, res) => {
  const now2 = Date.now();
  const activeGames = Object.values(store.rooms).filter((r) => {
    if (r.status !== "playing") return false;
    if (r.gameState?.winnerId) return false;
    const activeHumanPlayers = r.players.filter((p) => !isBotPlayer(p.userId) && p.status !== "left");
    if (activeHumanPlayers.length === 0) return false;
    const lastAct = r.gameState?.lastActivity || r.createdAt || now2;
    if (now2 - lastAct > 15 * 60 * 1e3) return false;
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
app.get("/api/rooms/:roomId/spectator-bet", (req, res) => {
  const userId = String(req.query.userId || "");
  const roomId = req.params.roomId;
  const bet = store.spectatorBets.find((item) => item.roomId === roomId && item.userId === userId) || null;
  const openBets = store.spectatorBets.filter((item) => item.roomId === roomId && item.status === "open");
  const room = store.rooms[roomId];
  const markets = (room?.players || []).filter((player) => player.status !== "left").map((player) => {
    const playerBets = openBets.filter((item) => item.targetPlayerId === player.userId);
    const winPool = Number(playerBets.filter((item) => item.prediction === "W").reduce((sum, item) => sum + item.stake, 0).toFixed(2));
    const lossPool = Number(playerBets.filter((item) => item.prediction === "L").reduce((sum, item) => sum + item.stake, 0).toFixed(2));
    const totalPool = Number((winPool + lossPool).toFixed(2));
    const tokens = room.gameState.tokens.filter((token) => token.ownerId === player.userId || token.color === player.color);
    const progress = tokens.length ? Math.round(tokens.reduce((sum, token) => sum + Math.max(0, token.position), 0) / (tokens.length * 56) * 100) : 0;
    return {
      targetPlayerId: player.userId,
      winPool,
      lossPool,
      totalPool,
      winOdds: winPool > 0 ? Number((totalPool * 0.9 / winPool).toFixed(2)) : null,
      lossOdds: lossPool > 0 ? Number((totalPool * 0.9 / lossPool).toFixed(2)) : null,
      progress
    };
  });
  res.json({ bet, markets, commissionRate: 0.1, minStake: 0.1, maxStake: 10 });
});
app.post("/api/rooms/:roomId/spectator-bet", async (req, res) => {
  const roomId = req.params.roomId;
  const userId = String(req.body.userId || "");
  const targetPlayerId = String(req.body.targetPlayerId || "");
  const prediction = req.body.prediction === "L" ? "L" : req.body.prediction === "W" ? "W" : "";
  const stake = Number(Number(req.body.stake || 0).toFixed(2));
  let room = store.rooms[roomId];
  if (!room && isMySqlConfigured()) room = await loadMySqlGameRoom(roomId) || void 0;
  let bettor = store.users[userId];
  if (!bettor && isMySqlConfigured()) bettor = await loadMySqlRuntimeUser(userId) || void 0;
  if (!room) return res.status(404).json({ error: "Ciyaarta lama helin." });
  if (!bettor) return res.status(404).json({ error: "Account-ka lama helin." });
  if (room.status !== "playing" || room.gameState.winnerId) return res.status(409).json({ error: "Betting-ka ciyaartan wuu xirmay." });
  if (room.players.some((player) => player.userId === userId)) return res.status(403).json({ error: "Ciyaaryahan kama bet-gareyn karo ciyaartiisa." });
  if (!room.players.some((player) => player.userId === targetPlayerId && player.status !== "left")) return res.status(400).json({ error: "Dooro ciyaaryahan firfircoon." });
  if (!prediction) return res.status(400).json({ error: "Dooro W ama L." });
  if (stake < 0.1 || stake > 10) return res.status(400).json({ error: "Bet-ku waa inuu u dhexeeyaa $0.10 iyo $10." });
  if (bettor.balance < stake) return res.status(400).json({ error: "Balance-ka kuma filna bet-kan." });
  if (store.spectatorBets.some((bet2) => bet2.roomId === roomId && bet2.userId === userId)) return res.status(409).json({ error: "Ciyaartan hore ayaad bet uga dhigatay." });
  const marketClosed = room.gameState.tokens.some((token) => token.position >= 51);
  if (marketClosed) return res.status(409).json({ error: "Market-ku wuu xirmay maadaama ciyaartu dhammaad ku dhowdahay." });
  const target = room.players.find((player) => player.userId === targetPlayerId);
  const marketBets = store.spectatorBets.filter((bet2) => bet2.roomId === roomId && bet2.targetPlayerId === targetPlayerId && bet2.status === "open");
  const winPool = marketBets.filter((bet2) => bet2.prediction === "W").reduce((sum, bet2) => sum + bet2.stake, 0);
  const lossPool = marketBets.filter((bet2) => bet2.prediction === "L").reduce((sum, bet2) => sum + bet2.stake, 0);
  const selectedPool = prediction === "W" ? winPool : lossPool;
  const opposingPool = prediction === "W" ? lossPool : winPool;
  const selectedPoolAfter = Number((selectedPool + stake).toFixed(2));
  const maximumBalancedPool = Math.max(1, Number((opposingPool * 5).toFixed(2)));
  if (selectedPoolAfter > maximumBalancedPool) {
    const remaining = Math.max(0, Number((maximumBalancedPool - selectedPool).toFixed(2)));
    return res.status(409).json({ error: remaining >= 0.1 ? `Risk limit: dhinacan waxaad hadda ku dari kartaa ugu badnaan $${remaining.toFixed(2)}.` : "Dhinacan bet badan ayaa saaran; sug bet ka soo horjeeda." });
  }
  const totalPoolAfter = Number((winPool + lossPool + stake).toFixed(2));
  const estimatedOdds = Number((totalPoolAfter * 0.9 / selectedPoolAfter).toFixed(2));
  const estimatedPayout = estimatedOdds > 1 ? Number((stake * estimatedOdds).toFixed(2)) : stake;
  const bet = {
    id: `sbet_${Date.now()}_${import_crypto.default.randomUUID().slice(0, 8)}`,
    roomId,
    userId,
    targetPlayerId,
    targetUsername: target.username,
    prediction,
    stake,
    odds: estimatedOdds,
    potentialPayout: estimatedPayout,
    status: "open",
    createdAt: Date.now()
  };
  bettor.balance = Number((bettor.balance - stake).toFixed(2));
  store.users[userId] = bettor;
  store.spectatorBets.unshift(bet);
  addTransaction(userId, "bet_escrow_locked", stake, roomId, `Dynamic spectator ${prediction} pool bet on ${target.username}; estimated odds ${estimatedOdds.toFixed(2)}.`);
  await saveUserProfileToFirestore(bettor);
  await saveStoreAndWait();
  broadcastUserUpdate(userId);
  res.json({ bet });
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
  res.locals.roomId = roomId;
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
  const playerLocation = req.query.location;
  try {
    const activeAgents = Object.values(store.agents).filter((agent) => agent.status === "Active").map((agent) => {
      const { password, ...agentData } = agent;
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
  if (type === "withdrawal") {
    const eligibilityError = withdrawalEligibilityError(player, requestAmount);
    if (eligibilityError) return res.status(400).json({ error: eligibilityError });
  }
  try {
    if (isMySqlRuntimePrimary()) {
      const selectedAgent2 = await cachedAgent(agentId);
      if (!selectedAgent2) return res.status(404).json({ error: "The selected agent does not exist." });
      if (selectedAgent2.status !== "Active") return res.status(400).json({ error: "The selected agent is not active." });
      const newRequest2 = {
        id: `req_${Date.now()}_${import_crypto.default.randomBytes(4).toString("hex")}`,
        userId: player.id,
        username: player.username,
        agentId,
        agentUsername: selectedAgent2.username,
        managedBy: "agent",
        amount: requestAmount,
        phone: playerPhone,
        provider,
        transactionType: type === "withdrawal" ? "withdraw" : "deposit",
        status: "pending",
        createdAt: Date.now(),
        ...type === "withdrawal" ? getWithdrawalQuote(player.id, requestAmount) : {}
      };
      store.pendingManualTransactions.unshift(newRequest2);
      await saveManualRequestToFirestore(newRequest2);
      await saveStoreAndWait();
      return res.status(201).json({ success: true, message: "Your request has been sent to the agent.", request: newRequest2 });
    }
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
  } else if (mode === "team") {
    colors = ["red", "yellow", "green", "blue"];
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
    inactivityTimer: isBotPlayer(u.id) ? void 0 : PLAYER_INACTIVITY_SECONDS,
    inactivityStrikes: 0,
    teamFinishSkipPending: false,
    teamAssistUnlocked: false
  }));
  resetPlayerInactivity(players[0]);
  const usesBotEconomy = players.some((player) => isBotPlayer(player.userId));
  let totalEscrow = 0;
  players.forEach((p) => {
    if (!usesBotEconomy && !isBotPlayer(p.userId)) {
      const u = store.users[p.userId];
      if (u) {
        u.balance = Math.max(0, u.balance - bet);
        addTransaction(p.userId, "bet_escrow_locked", bet, roomId, `Escrow stake for Ludo Match ${roomId}.`);
        broadcastUserUpdate(p.userId);
      }
    }
    if (!usesBotEconomy && !isBotPlayer(p.userId)) totalEscrow += bet;
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
  void Promise.all([persistLiveRoom(newRoom), persistRoomUserProfiles(newRoom)]).catch((error) => console.error(`Failed to persist matched room ${roomId}:`, error));
  players.forEach((p) => {
    if (!isBotPlayer(p.userId)) {
      sendEventToUser(p.userId, "matchmaker_success", { roomId: newRoom.id, room: newRoom });
      publishRealtimeEvent("user", p.userId, "matchmaker_success", { roomId: newRoom.id, room: newRoom });
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
    const mode = gameMode === "team" ? "team" : "solo";
    const requestedCapacity = parseInt(capacity) || 2;
    const cap = mode === "team" ? 4 : requestedCapacity === 4 ? 4 : 2;
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
app.get("/api/rooms/matchmaking/status", async (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) return res.status(400).json({ error: "User ID is required." });
  if (isMySqlRuntimePrimary()) await refreshMySqlMatchmakingQueues();
  cleanupMatchmakingQueues();
  const queueEntry = Object.entries(store.matchmakingQueues).find(([, ids]) => ids.includes(userId));
  if (!queueEntry) return res.json({ active: false, members: [], isOwner: false });
  const [queueKey, rawQueuedIds] = queueEntry;
  const [rawBet, rawCapacity, rawMode] = queueKey.split("_");
  const capacity = parseInt(rawCapacity) || 2;
  const orderedIds = sortMatchmakingIdsByJoinTime(rawQueuedIds).slice(0, capacity);
  const members = orderedIds.flatMap((id) => {
    const player = store.users[id];
    if (!player) return [];
    return [{
      id: player.id,
      username: player.username,
      avatar: player.avatar,
      winCount: player.winCount || 0,
      lossCount: player.lossCount || 0,
      balance: player.balance,
      status: "seeking",
      seekingJoinedAt: Number(player.seekingJoinedAt || 0),
      seekingDetails: {
        betAmount: parseFloat(rawBet) || 0,
        capacity,
        gameMode: rawMode === "team" ? "team" : "solo"
      }
    }];
  });
  res.json({ active: true, members, isOwner: orderedIds[0] === userId });
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
  void deleteSharedMatchmakingRecords(userId, opponentId).catch((error) => console.error("Failed to delete shared matchmaking records for matched users:", error));
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
      winCount: 0,
      lossCount: 0,
      balance: 0
    });
  }
  const room = startMatchedRoom(matchedList, bet, cap, mode);
  res.json({ success: true, roomId: room.id });
});
function sortMatchmakingIdsByJoinTime(ids) {
  return [...new Set(ids)].sort((leftId, rightId) => {
    const leftTime = Number(store.users[leftId]?.seekingJoinedAt || Number.MAX_SAFE_INTEGER);
    const rightTime = Number(store.users[rightId]?.seekingJoinedAt || Number.MAX_SAFE_INTEGER);
    return leftTime - rightTime || ids.indexOf(leftId) - ids.indexOf(rightId);
  });
}
app.post("/api/rooms/matchmaking/start-partial", async (req, res) => {
  const { userId } = req.body;
  if (!userId || !store.users[userId]) return res.status(404).json({ error: "User not found." });
  if (isMySqlRuntimePrimary()) await refreshMySqlMatchmakingQueues();
  cleanupMatchmakingQueues();
  const queueEntry = Object.entries(store.matchmakingQueues).find(([, ids]) => ids.includes(userId));
  if (!queueEntry) return res.status(409).json({ error: "Your Search Live queue is no longer active." });
  const [queueKey, rawQueuedIds] = queueEntry;
  const queuedIds = sortMatchmakingIdsByJoinTime(rawQueuedIds);
  const [rawBet, rawCapacity, rawMode] = queueKey.split("_");
  const requestedCapacity = parseInt(rawCapacity) || 2;
  if (requestedCapacity !== 4) return res.status(400).json({ error: "Early Start is only available for a 4-player search." });
  if (queuedIds[0] !== userId) return res.status(403).json({ error: "Only the player who started this search can start the game early." });
  const participantIds = queuedIds.filter((id) => Boolean(store.users[id])).slice(0, 4);
  if (participantIds.length < 2) return res.status(409).json({ error: "At least two players are required to start." });
  const bet = parseFloat(rawBet) || 0;
  const participants = participantIds.map((id) => store.users[id]);
  if (participants.some((player) => player.balance < bet)) {
    return res.status(409).json({ error: "A player no longer has enough balance for this stake." });
  }
  store.matchmakingQueues[queueKey] = queuedIds.filter((id) => !participantIds.includes(id));
  participantIds.forEach((id) => delete store.users[id].seekingJoinedAt);
  await deleteSharedMatchmakingRecords(...participantIds).catch((error) => {
    console.error("Failed to delete shared matchmaking records for early start:", error);
  });
  const finalMode = rawMode === "team" && participants.length === 4 ? "team" : "solo";
  const room = startMatchedRoom(participants, bet, participants.length, finalMode);
  saveStore();
  res.json({ success: true, roomId: room.id, room, convertedToSolo: rawMode === "team" && finalMode === "solo" });
});
app.post("/api/rooms/matchmaking/remove-player", async (req, res) => {
  const { userId, targetUserId } = req.body;
  if (!userId || !targetUserId || userId === targetUserId) {
    return res.status(400).json({ error: "A valid player must be selected." });
  }
  if (isMySqlRuntimePrimary()) await refreshMySqlMatchmakingQueues();
  cleanupMatchmakingQueues();
  const queueEntry = Object.entries(store.matchmakingQueues).find(([, ids]) => ids.includes(userId));
  if (!queueEntry) return res.status(409).json({ error: "Your Search Live queue is no longer active." });
  const [queueKey, rawQueuedIds] = queueEntry;
  const queuedIds = sortMatchmakingIdsByJoinTime(rawQueuedIds);
  if (queuedIds[0] !== userId) return res.status(403).json({ error: "Only the original seeker can remove players." });
  if (!queuedIds.includes(targetUserId)) return res.status(404).json({ error: "That player is not in your queue." });
  store.matchmakingQueues[queueKey] = rawQueuedIds.filter((id) => id !== targetUserId);
  if (store.users[targetUserId]) delete store.users[targetUserId].seekingJoinedAt;
  await deleteSharedMatchmakingRecords(targetUserId).catch((error) => {
    console.error("Failed to delete removed matchmaking player record:", error);
  });
  saveStore();
  sendEventToUser(targetUserId, "matchmaker_removed", {
    message: "The seeker removed you from this Search Live match."
  });
  broadcastToAll("matchmaker_seeking_cancelled", { senderId: targetUserId });
  broadcastToAll("online_players_updated", {});
  res.json({ success: true });
});
app.post("/api/rooms/matchmaking/leave", async (req, res) => {
  const { userId } = req.body;
  if (userId) {
    const queueEntry = Object.entries(store.matchmakingQueues).find(([, ids]) => ids.includes(userId));
    let leavingIds = [userId];
    if (queueEntry) {
      const [queueKey, rawQueuedIds] = queueEntry;
      const orderedIds = sortMatchmakingIdsByJoinTime(rawQueuedIds);
      const requestedCapacity = parseInt(queueKey.split("_")[1]) || 2;
      const currentGroupIds = orderedIds.slice(0, requestedCapacity);
      if (currentGroupIds[0] === userId) leavingIds = currentGroupIds;
      store.matchmakingQueues[queueKey] = rawQueuedIds.filter((id) => !leavingIds.includes(id));
    } else {
      for (const qKey of Object.keys(store.matchmakingQueues)) {
        store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter((id) => id !== userId);
      }
    }
    leavingIds.forEach((id) => {
      if (store.users[id]) delete store.users[id].seekingJoinedAt;
      broadcastToAll("matchmaker_seeking_cancelled", { senderId: id });
      if (id !== userId) {
        sendEventToUser(id, "matchmaker_removed", { message: "The seeker cancelled this Search Live match." });
      }
    });
    saveStore();
    await deleteSharedMatchmakingRecords(...leavingIds).catch((error) => console.error("Failed to delete shared matchmaking records on leave:", error));
    broadcastToAll("online_players_updated", {});
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
  publishRealtimeEvent("user", targetId, "voice_signal", { roomId, senderId, signal });
  res.json({ success: true });
});
app.post("/api/rooms/challenge/invite", async (req, res) => {
  const { senderId, receiverId, betAmount, capacity, gameMode } = req.body;
  let sender = store.users[senderId];
  if (!sender && isMySqlConfigured()) sender = await loadMySqlRuntimeUser(senderId);
  if (!sender) return res.status(404).json({ error: "Sender user not found." });
  let receiver = store.users[receiverId];
  if (!receiver && isMySqlConfigured()) receiver = await loadMySqlRuntimeUser(receiverId);
  if (!receiver) return res.status(409).json({ error: "Ciyaaryahankan hadda online ma aha." });
  store.users[senderId] = sender;
  store.users[receiverId] = receiver;
  let receiverIsFreshlyHome = false;
  try {
    if (isMySqlConfigured()) {
      const onlineUsers = await listMySqlOnlineUsers();
      receiverIsFreshlyHome = onlineUsers.some(
        (user) => user.id === receiverId && user.profile?.presenceLocation === "home" && user.profile?.isOfflinePreference !== true
      );
    } else if (db) {
      const presenceDoc = await db.collection("userPresence").doc(receiverId).get();
      const presence = presenceDoc.data();
      receiverIsFreshlyHome = Boolean(
        presenceDoc.exists && Number(presence?.lastSeenAt || 0) >= Date.now() - 45e3 && presence?.profile?.presenceLocation === "home" && presence?.profile?.isOfflinePreference !== true
      );
    }
  } catch (error) {
    console.error(`Challenge presence lookup failed for ${receiverId}:`, error);
  }
  if (!receiverIsFreshlyHome) {
    return res.status(409).json({ error: "Ciyaaryahankan hadda Home-ka online kama aha." });
  }
  const bet = parseFloat(betAmount) || 0;
  if (sender.balance < bet) {
    return res.status(400).json({ error: `Insufficient wallet balance for $${bet} bet.` });
  }
  const selectedMode = gameMode === "team" ? "team" : "solo";
  const selectedCapacity = selectedMode === "team" ? 4 : 2;
  if (receiverId.startsWith("sim_") || receiverId.startsWith("bot_")) {
    const receiverUser2 = {
      id: receiverId,
      username: receiverId.includes("1") ? "Kaptan_Ludo \u{1F451}" : receiverId.includes("2") ? "SomaliGamer_252" : receiverId.includes("3") ? "Pro_Dice_Master" : "Speedy_Runner",
      avatar: receiverId.includes("1") ? "\u{1F981}" : receiverId.includes("2") ? "\u26A1" : receiverId.includes("3") ? "\u{1F98A}" : "\u{1F409}",
      winCount: 0,
      lossCount: 0,
      balance: 0
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
        winCount: 0,
        lossCount: 0,
        balance: 0
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
  newRoom.invitedUserId = receiverId;
  store.rooms[roomId] = newRoom;
  for (const qKey of Object.keys(store.matchmakingQueues)) {
    store.matchmakingQueues[qKey] = store.matchmakingQueues[qKey].filter((id) => id !== senderId && id !== receiverId);
  }
  void deleteSharedMatchmakingRecords(senderId, receiverId).catch((error) => console.error("Failed to delete shared matchmaking records on challenge:", error));
  broadcastToAll("matchmaker_seeking_cancelled", { senderId });
  broadcastToAll("matchmaker_seeking_cancelled", { senderId: receiverId });
  saveStore();
  try {
    await persistLiveRoom(newRoom);
  } catch (error) {
    delete store.rooms[roomId];
    console.error(`Failed to persist challenge room ${roomId}:`, error);
    return res.status(503).json({ error: "The challenge could not be synchronized. Please try again." });
  }
  sendEventToUser(receiverId, "game_invite", {
    senderId: sender.id,
    senderName: sender.username,
    senderAvatar: sender.avatar,
    betAmount: bet,
    capacity: selectedCapacity,
    gameMode: selectedMode,
    roomId
  });
  publishRealtimeEvent("user", receiverId, "game_invite", {
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
app.post("/api/rooms/challenge/accept", async (req, res) => {
  const { userId, roomId } = req.body;
  const user = store.users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  let room = store.rooms[roomId];
  if (!room && isMySqlConfigured()) {
    room = await loadMySqlGameRoom(roomId) || void 0;
    if (room) store.rooms[room.id] = room;
  }
  if (!room) return res.status(404).json({ error: "Challenge lobby no longer exists." });
  if (room.players.length >= (room.capacity || 2)) {
    return res.status(400).json({ error: "Room is already full." });
  }
  if (user.balance < room.betAmount) {
    return res.status(400).json({ error: `Insufficient wallet balance to accept this $${room.betAmount} match.` });
  }
  const activeChallengeRooms = isMySqlConfigured() ? await listMySqlActiveGameRooms().catch(() => Object.values(store.rooms)) : Object.values(store.rooms);
  const otherInviteRooms = activeChallengeRooms.filter(
    (otherRoom) => otherRoom.id !== roomId && otherRoom.status === "waiting" && String(otherRoom.invitedUserId || "") === userId
  );
  await Promise.all(otherInviteRooms.map(async (otherRoom) => {
    const otherHostId = otherRoom.players?.find((player) => player.isHost)?.userId;
    if (otherHostId) {
      const declinedPayload = { receiverName: user.username, reason: "accepted_another", roomId: otherRoom.id };
      sendEventToUser(otherHostId, "game_invite_declined", declinedPayload);
      publishRealtimeEvent("user", otherHostId, "game_invite_declined", declinedPayload);
    }
    const cancelledPayload = { roomId: otherRoom.id, reason: "accepted_another" };
    sendEventToUser(userId, "game_invite_cancelled", cancelledPayload);
    publishRealtimeEvent("user", userId, "game_invite_cancelled", cancelledPayload);
    delete store.rooms[otherRoom.id];
    if (isMySqlConfigured()) await deleteMySqlGameRoom(otherRoom.id);
  }));
  const colors = room.gameMode === "team" ? ["red", "yellow", "green", "blue"] : ["red", "green", "yellow", "blue"];
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
  const requiredPlayers = room.capacity || 2;
  if (room.players.length === requiredPlayers) {
    const realPlayers = room.players.filter((player) => !isBotPlayer(player.userId));
    const insufficientPlayer = realPlayers.find((player) => Number(store.users[player.userId]?.balance || 0) < room.betAmount);
    if (insufficientPlayer) {
      room.players = room.players.filter((player) => player.userId !== user.id);
      return res.status(400).json({ error: `${insufficientPlayer.username} no longer has enough balance for this match.` });
    }
    if (room.players.length === 2 && room.gameMode === "solo") {
      const host = room.players.find((player) => player.isHost);
      const guest = room.players.find((player) => !player.isHost);
      if (host) host.color = "red";
      if (guest) guest.color = "yellow";
    }
    let totalEscrow = 0;
    for (const player of realPlayers) {
      const profile = store.users[player.userId];
      profile.balance = Number((profile.balance - room.betAmount).toFixed(2));
      addTransaction(player.userId, "bet_escrow_locked", room.betAmount, room.id, `Escrow lock for Match ${room.id}`);
      totalEscrow += room.betAmount;
      broadcastUserUpdate(player.userId);
    }
    room.status = "playing";
    room.gameState.tokens = room.players.flatMap((player) => createInitialTokens(player.userId, player.color));
    room.gameState.escrowBalance = Number(totalEscrow.toFixed(2));
    room.gameState.turn = 0;
    room.gameState.turnTimer = 30;
    room.players.forEach((player) => {
      player.teamFinishSkipPending = false;
      player.teamAssistUnlocked = false;
      player.inactivityTimer = PLAYER_INACTIVITY_SECONDS;
      player.inactivityDeadline = void 0;
      player.lastInactivityWarningMinute = void 0;
      player.inactivityStrikes = 0;
      player.lastInactivityStrikeAt = void 0;
    });
    resetPlayerInactivity(room.players[0]);
    touchRoom(room);
  }
  addLog(room, `\u2694\uFE0F ${user.username} accepted the challenge and joined the room.`);
  saveStore();
  await Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)]);
  broadcastToRoom(room.id, "game_update", room);
  const hostId = room.players.find((p) => p.isHost)?.userId;
  if (hostId) {
    sendEventToUser(hostId, "game_invite_accepted", { roomId, room });
    publishRealtimeEvent("user", hostId, "game_invite_accepted", { roomId, room });
  }
  sendEventToUser(user.id, "matchmaker_success", { roomId, room });
  publishRealtimeEvent("user", user.id, "matchmaker_success", { roomId, room });
  res.json({ success: true, roomId, room });
});
app.post("/api/rooms/challenge/decline", async (req, res) => {
  const { userId, roomId, reason } = req.body;
  let user = store.users[userId];
  if (!user && isMySqlConfigured()) user = await loadMySqlRuntimeUser(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  let room = store.rooms[roomId];
  if (!room && isMySqlConfigured()) room = await loadMySqlGameRoom(roomId) || void 0;
  if (room) {
    const hostId = room.players.find((p) => p.isHost)?.userId;
    if (hostId) {
      const payload = { receiverName: user.username, roomId, reason: reason || "declined" };
      sendEventToUser(hostId, "game_invite_declined", payload);
      publishRealtimeEvent("user", hostId, "game_invite_declined", payload);
    }
    delete store.rooms[roomId];
    await saveStoreAndWait();
    if (isMySqlConfigured()) await deleteMySqlGameRoom(roomId);
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
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.status !== "waiting") return res.status(400).json({ error: "Bots can only be added before the match starts." });
  const requester = room.players.find((player) => player.userId === userId);
  if (!requester?.isHost) return res.status(403).json({ error: "Only the host can add a bot." });
  if (room.players.length >= (room.capacity || 2)) {
    return res.status(400).json({ error: "Room is already full." });
  }
  const botNames = ["DeepBlue", "AlphaGo", "ChessMaster", "LudoAI", "LudoKing", "Siri", "Alexa"];
  const name = botNames[Math.floor(Math.random() * botNames.length)] + `_${Math.floor(Math.random() * 100)}`;
  const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const colors = room.gameMode === "team" ? ["red", "yellow", "green", "blue"] : ["red", "green", "yellow", "blue"];
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
app.post("/api/rooms/change-team", (req, res) => {
  const { userId, roomId, playerId, targetTeam, swapWithUserId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.status !== "waiting" || room.gameMode !== "team") {
    return res.status(400).json({ error: "Teams can only be changed in a waiting partnership lobby." });
  }
  const requester = room.players.find((player) => player.userId === userId);
  const movingPlayer = room.players.find((player) => player.userId === (playerId || userId));
  if (!requester || !movingPlayer) return res.status(404).json({ error: "Player not found in this lobby." });
  if (movingPlayer.userId !== requester.userId && !requester.isHost) {
    return res.status(403).json({ error: "Only the host can move another player." });
  }
  const targetColors = targetTeam === "A" ? ["red", "yellow"] : targetTeam === "B" ? ["green", "blue"] : [];
  if (!targetColors.length) return res.status(400).json({ error: "Invalid team selected." });
  if (targetColors.includes(movingPlayer.color)) return res.json(room);
  const occupiedTargetColors = room.players.filter((player) => player.userId !== movingPlayer.userId).map((player) => player.color);
  const openColor = targetColors.find((color) => !occupiedTargetColors.includes(color));
  if (openColor) {
    movingPlayer.color = openColor;
    if (!movingPlayer.isHost && !isBotPlayer(movingPlayer.userId)) movingPlayer.isReady = false;
    addLog(room, `${movingPlayer.username} moved to Team ${targetTeam}.`);
  } else {
    if (!requester.isHost || !swapWithUserId) {
      return res.status(409).json({ error: `Team ${targetTeam} is full. The host must select one player from each team to swap.` });
    }
    const swapPlayer = room.players.find((player) => player.userId === swapWithUserId);
    if (!swapPlayer || !targetColors.includes(swapPlayer.color)) {
      return res.status(400).json({ error: "Select a player from the destination team to swap with." });
    }
    const oldColor = movingPlayer.color;
    movingPlayer.color = swapPlayer.color;
    swapPlayer.color = oldColor;
    [movingPlayer, swapPlayer].forEach((player) => {
      if (!player.isHost && !isBotPlayer(player.userId)) player.isReady = false;
    });
    addLog(room, `${movingPlayer.username} and ${swapPlayer.username} swapped partnership teams.`);
  }
  saveStore();
  broadcastToRoom(room.id, "game_update", room);
  res.json(room);
});
app.post("/api/rooms/start", async (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const p = room.players.find((p2) => p2.userId === userId);
  if (!p || !p.isHost) {
    return res.status(403).json({ error: "Only the host can start the match." });
  }
  const requiredPlayers = room.capacity || 2;
  if (room.players.length !== requiredPlayers) {
    return res.status(400).json({ error: `Qolkan wuxuu u baahan yahay ${requiredPlayers} ciyaartoy ka hor inta aan ciyaarta la bilaabin.` });
  }
  if (room.players.some((player) => !player.isReady)) {
    return res.status(400).json({ error: "Dhammaan ciyaartoydu waa inay Ready noqdaan ka hor bilowga." });
  }
  let colorsToAssign;
  if (room.players.length === 2 && room.gameMode === "solo") {
    colorsToAssign = ["red", "yellow"];
    const host = room.players.find((p2) => p2.isHost);
    const guest = room.players.find((p2) => !p2.isHost);
    if (host) host.color = "red";
    if (guest) guest.color = "yellow";
  } else if (room.gameMode === "team") {
    colorsToAssign = ["red", "yellow", "green", "blue"];
    const colorsInUse = room.players.map((player) => player.color);
    const teamACount = room.players.filter((player) => getTeamColors(player.color).includes("red")).length;
    const teamBCount = room.players.length - teamACount;
    if (new Set(colorsInUse).size !== 4 || teamACount !== 2 || teamBCount !== 2) {
      return res.status(400).json({ error: "Partnership-ku waa inuu yeeshaa laba ciyaaryahan Team A iyo laba ciyaaryahan Team B." });
    }
  } else {
    colorsToAssign = ["red", "green", "yellow", "blue"];
    room.players.forEach((pl, idx) => {
      pl.color = colorsToAssign[idx] || "red";
    });
  }
  room.players.forEach((pl, idx) => {
    if (!pl.color) {
      pl.color = colorsToAssign[idx] || "red";
    }
  });
  const bet = room.betAmount;
  const usesBotEconomy = isBotEconomyRoom(room);
  let success = true;
  room.players.forEach((pl) => {
    if (!usesBotEconomy && !isBotPlayer(pl.userId)) {
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
    if (!usesBotEconomy && !isBotPlayer(pl.userId)) {
      const user = store.users[pl.userId];
      user.balance -= bet;
      addTransaction(pl.userId, "bet_escrow_locked", bet, room.id, `Escrow lock for Match ${room.id}`);
      broadcastUserUpdate(pl.userId);
    }
    if (!usesBotEconomy && !isBotPlayer(pl.userId)) totalEscrow += bet;
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
  room.players.forEach((player) => {
    player.teamFinishSkipPending = false;
    player.teamAssistUnlocked = false;
    if (!isBotPlayer(player.userId)) {
      player.inactivityTimer = PLAYER_INACTIVITY_SECONDS;
      player.inactivityDeadline = void 0;
      player.lastInactivityWarningMinute = void 0;
      player.inactivityStrikes = 0;
      player.lastInactivityStrikeAt = void 0;
    }
  });
  resetPlayerInactivity(room.players[0]);
  touchRoom(room);
  addLog(room, `\u2694\uFE0F Ciyaartu waa ay bilaabatay! Ciyaartoyda: ${room.players.length}. Bet: $${bet}. Escrow Locked: $${totalEscrow}`);
  saveStore();
  await Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)]);
  broadcastToRoom(room.id, "game_update", room);
  res.json(room);
});
app.post("/api/rooms/roll-dice", async (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.status !== "playing") return res.status(400).json({ error: "Game is not in playing state." });
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
  const d = Math.floor(Math.random() * 6) + 1;
  gs.diceRoll = d;
  gs.lastDiceRoll = d;
  gs.hasRolled = true;
  touchRoom(room);
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
    await persistLiveRoom(room);
    broadcastToRoom(room.id, "game_update", room);
    executeBotTurnIfActive(room);
    return res.json(room);
  }
  const playableColor = getPlayableColor(room, activePlayer);
  const playerTokens = gs.tokens.filter((t) => t.color === playableColor);
  const validTokens = playerTokens.filter((t) => isMoveValid(t, d));
  const tokensOnBoard = playerTokens.filter((token) => token.position >= 0 && token.position < 56);
  const soleBoardToken = d !== 6 && tokensOnBoard.length === 1 ? validTokens.find((token) => token.id === tokensOnBoard[0].id) : void 0;
  if (soleBoardToken) {
    saveStore();
    await persistLiveRoom(room);
    broadcastToRoom(room.id, "game_update", room);
    res.json(room);
    setTimeout(async () => {
      try {
        const currentRoom = store.rooms[roomId];
        if (!currentRoom || currentRoom.status !== "playing") return;
        const currentPlayer = currentRoom.players[currentRoom.gameState.turn];
        const currentToken = currentRoom.gameState.tokens.find((token) => token.id === soleBoardToken.id);
        if (currentPlayer?.userId !== activePlayer.userId || !currentRoom.gameState.hasRolled || currentRoom.gameState.diceRoll !== d || !currentToken || !isMoveValid(currentToken, d)) return;
        addLog(currentRoom, `${activePlayer.username}'s only active token moved automatically with roll ${d}.`);
        moveTokenLogic(currentRoom, currentToken.id, d);
        saveStore();
        await persistLiveRoom(currentRoom);
        void persistRoomUserProfiles(currentRoom).catch((error) => console.error(`Profile sync failed after automatic move in room ${currentRoom.id}:`, error));
        broadcastToRoom(currentRoom.id, "game_update", currentRoom);
        executeBotTurnIfActive(currentRoom);
      } catch (error) {
        console.error(`Failed to move the sole token after roll animation in room ${roomId}:`, error);
      }
    }, 1100);
    return;
  }
  if (validTokens.length === 0) {
    addLog(room, `${activePlayer.username} has no valid moves with roll ${d}. Turn passes.`);
    saveStore();
    await persistLiveRoom(room);
    broadcastToRoom(room.id, "game_update", room);
    res.json(room);
    setTimeout(async () => {
      try {
        const currentRoom = store.rooms[roomId];
        if (currentRoom && currentRoom.status === "playing") {
          advanceTurn(currentRoom);
          saveStore();
          await persistLiveRoom(currentRoom);
          broadcastToRoom(currentRoom.id, "game_update", currentRoom);
          executeBotTurnIfActive(currentRoom);
        }
      } catch (error) {
        console.error(`Failed to advance no-move turn for room ${roomId}:`, error);
      }
    }, 1500);
  } else {
    saveStore();
    await persistLiveRoom(room);
    broadcastToRoom(room.id, "game_update", room);
    res.json(room);
  }
});
app.post("/api/rooms/move-token", async (req, res) => {
  const { userId, roomId, tokenId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.status !== "playing") return res.status(400).json({ error: "Game is not playing." });
  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];
  if (!activePlayer || activePlayer.userId !== userId) {
    return res.status(403).json({ error: "It is not your turn!" });
  }
  if (!gs.hasRolled || gs.diceRoll === null) {
    return res.status(400).json({ error: "You must roll the dice first!" });
  }
  const token = gs.tokens.find((t) => t.id === tokenId);
  const playableColor = getPlayableColor(room, activePlayer);
  if (!token || token.color !== playableColor) {
    return res.status(400).json({ error: "Invalid token selected." });
  }
  if (!isMoveValid(token, gs.diceRoll)) {
    return res.status(400).json({ error: "This token cannot make a valid move with the current roll." });
  }
  resetPlayerInactivity(activePlayer);
  gs.turnTimer = 30;
  moveTokenLogic(room, tokenId, gs.diceRoll);
  saveStore();
  await persistLiveRoom(room);
  void persistRoomUserProfiles(room).catch((error) => console.error(`Profile sync failed after move in room ${room.id}:`, error));
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
  if (room.status !== "waiting") {
    return res.status(409).json({ error: "Players can only be accepted while the room is waiting." });
  }
  if (room.players.length >= (room.capacity || 2)) {
    return res.status(409).json({ error: "The room is already full." });
  }
  if (!room.pendingPlayers) room.pendingPlayers = [];
  const idx = room.pendingPlayers.findIndex((p) => p.userId === challengerId);
  if (idx === -1) {
    return res.status(404).json({ error: "Challenger not found in pending list." });
  }
  const challenger = room.pendingPlayers.splice(idx, 1)[0];
  let assignedColor;
  if (room.capacity === 2 && room.gameMode === "solo") {
    assignedColor = "yellow";
  } else {
    const colors = room.gameMode === "team" ? ["red", "yellow", "green", "blue"] : ["red", "green", "yellow", "blue"];
    const occupiedColors = room.players.map((p) => p.color);
    assignedColor = colors.find((c) => !occupiedColors.includes(c)) || "red";
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
var playerNudgeCooldowns = /* @__PURE__ */ new Map();
app.post("/api/rooms/nudge", (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const p = room.players.find((pl) => pl.userId === userId);
  if (!p) return res.status(403).json({ error: "You are not in this room." });
  const gs = room.gameState;
  const activePlayer = room.players[gs.turn];
  if (!activePlayer) return res.status(400).json({ error: "No active player to nudge." });
  if (room.status !== "playing") return res.status(400).json({ error: "The game is not active." });
  if (activePlayer.userId === userId) return res.status(400).json({ error: "You cannot nudge yourself." });
  if (isBotPlayer(activePlayer.userId)) return res.status(400).json({ error: "Bots do not need reminders." });
  const now2 = Date.now();
  if (now2 - Number(gs.lastActivity || 0) < 7e3) {
    return res.status(429).json({ error: "Please wait seven seconds before reminding this player." });
  }
  const cooldownKey = `${room.id}:${userId}:${activePlayer.userId}`;
  if (now2 - Number(playerNudgeCooldowns.get(cooldownKey) || 0) < 7e3) {
    return res.status(429).json({ error: "Please wait before sending another reminder." });
  }
  playerNudgeCooldowns.set(cooldownKey, now2);
  addLog(room, `\u23F0 ${p.username} nudged ${activePlayer.username} to make a move!`);
  const payload = { nudgedBy: p.username, roomId: room.id, sentAt: now2 };
  sendEventToUser(activePlayer.userId, "player_nudged", payload);
  publishRealtimeEvent("user", activePlayer.userId, "player_nudged", payload);
  broadcastToRoom(room.id, "game_update", room);
  res.json(room);
});
var reactionCooldowns = /* @__PURE__ */ new Map();
var ALLOWED_GAME_REACTIONS = /* @__PURE__ */ new Set(["laugh", "love", "shock", "angry", "clap", "fire", "hammer"]);
app.post("/api/rooms/emoji", (req, res) => {
  const { userId, roomId, reactionId, targetId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const p = room.players.find((pl) => pl.userId === userId);
  if (!p) return res.status(403).json({ error: "You are not in this room." });
  if (!ALLOWED_GAME_REACTIONS.has(String(reactionId))) return res.status(400).json({ error: "Invalid reaction." });
  const target = room.players.find((pl) => pl.userId === targetId && pl.status !== "left");
  if (!target || target.userId === userId) return res.status(400).json({ error: "Choose another active player." });
  const cooldownKey = `${roomId}:${userId}`;
  const now2 = Date.now();
  if (now2 - Number(reactionCooldowns.get(cooldownKey) || 0) < 800) {
    return res.status(429).json({ error: "Wait a moment before sending another reaction." });
  }
  reactionCooldowns.set(cooldownKey, now2);
  const payload = {
    id: import_crypto.default.randomUUID(),
    senderId: userId,
    senderName: p.username,
    senderColor: p.color,
    targetId: target.userId,
    targetName: target.username,
    reactionId: String(reactionId)
  };
  room.players.forEach((pl) => {
    sendEventToUser(pl.userId, "player_emoji", payload);
    publishRealtimeEvent("user", pl.userId, "player_emoji", payload);
  });
  res.json({ success: true });
});
app.post("/api/rooms/leave", async (req, res) => {
  const { userId, roomId } = req.body;
  const room = store.rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  const p = room.players.find((pl) => pl.userId === userId);
  if (!p) {
    const pendingIndex = room.pendingPlayers?.findIndex((player) => player.userId === userId) ?? -1;
    if (room.status === "waiting" && pendingIndex >= 0) {
      const [pendingPlayer] = room.pendingPlayers.splice(pendingIndex, 1);
      addLog(room, `${pendingPlayer.username} cancelled their request to join the room.`);
      saveStore();
      broadcastToRoom(room.id, "game_update", room);
      return res.json({ success: true, room });
    }
    return res.status(404).json({ error: "Player not in room" });
  }
  addLog(room, `${p.username} has left the game.`);
  if (room.status === "waiting") {
    const invitedUserId = String(room.invitedUserId || "");
    if (p.isHost && invitedUserId) {
      const payload = { roomId, reason: "challenger_left" };
      sendEventToUser(invitedUserId, "game_invite_cancelled", payload);
      publishRealtimeEvent("user", invitedUserId, "game_invite_cancelled", payload);
    }
    room.players = room.players.filter((pl) => pl.userId !== userId);
    if (room.players.length === 0) {
      delete store.rooms[roomId];
      if (isMySqlConfigured()) await deleteMySqlGameRoom(roomId);
    } else {
      if (p.isHost) {
        room.players[0].isHost = true;
        room.players[0].isReady = true;
        addLog(room, `${room.players[0].username} is now the host.`);
      }
      broadcastToRoom(room.id, "game_update", room);
    }
  } else if (room.status === "playing") {
    const leavingTurn = room.gameState.turn;
    p.status = "left";
    p.inactivityDeadline = void 0;
    p.inactivityTimer = 0;
    const leavingPlayerProfile = store.users[userId];
    if (leavingPlayerProfile && !isBotPlayer(userId)) {
      leavingPlayerProfile.lossCount = (leavingPlayerProfile.lossCount || 0) + 1;
      broadcastUserUpdate(userId);
    }
    if (room.gameMode === "team") {
      completeTeamForfeit(room, p, "forfeit");
      touchRoom(room);
      saveStore();
      await Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)]);
      broadcastToRoom(room.id, "game_update", room);
      return res.json({ success: true, room });
    }
    const activePlayers = room.players.filter((player) => player.status !== "left");
    if (activePlayers.length > 1) {
      if (room.players[leavingTurn]?.userId === userId) {
        advanceTurn(room);
      }
      addLog(room, `\u23ED\uFE0F ${p.username} is inactive. ${activePlayers.length} players remain and the game continues.`);
      saveStore();
      broadcastToRoom(room.id, "game_update", room);
      return res.json({ success: true, room, gameContinues: true });
    }
    if (activePlayers.length === 1) {
      const opponent = activePlayers[0];
      room.status = "completed";
      room.gameState.winnerId = opponent.userId;
      room.gameState.completionReason = "forfeit";
      const totalPayout = room.gameState.escrowBalance;
      addLog(room, `\u{1F3C6} ${p.username} has left the game. ${opponent.username} wins by forfeit and takes the pot of $${totalPayout.toFixed(2)}!`);
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
            addTransaction(opponent.userId, "win_payout", payoutAmount, room.id, `Win by opponent forfeit (Rake: $${rakeAmount.toFixed(2)}).`);
          }
          broadcastUserUpdate(opponent.userId);
          recordHouseRevenue("forfeit_rake", rakeAmount, room.id, `Rake from manual forfeit match ${room.id} (${(effectiveRakePercentage * 100).toFixed(1)}%).`);
        } else if (totalPayout > 0) {
          room.gameState.winnerPayout = 0;
          room.gameState.rakeAmount = totalPayout;
          recordHouseRevenue("bot_result", totalPayout, room.id, `Real-player stakes retained after a bot won manual forfeit match ${room.id}.`);
        }
      }
      room.gameState.escrowBalance = 0;
      touchRoom(room);
      saveStore();
      await Promise.all([persistLiveRoom(room), persistRoomUserProfiles(room)]);
      broadcastToRoom(room.id, "game_update", room);
      res.json({ success: true, room });
    } else {
      room.status = "completed";
      room.gameState.winnerId = null;
      room.gameState.completionReason = "forfeit";
      room.gameState.escrowBalance = 0;
      addLog(room, "The game ended because no active players remained.");
      broadcastToRoom(room.id, "game_update", room);
      res.json({ success: true, room });
    }
  }
  saveStore();
  if (!res.headersSent) {
    return res.json({ success: true, room: store.rooms[roomId] || null });
  }
});
app.post("/api/admin/system/data-cleanup", async (req, res) => {
  if (req.body?.secret !== "LUDOSOM_CLEANUP_2026") {
    return res.status(403).json({ error: "Unauthorized cleanup request." });
  }
  let usersReset = 0;
  let txRemoved = 0;
  let roomsRemoved = 0;
  let manualRemoved = 0;
  Object.values(store.users).forEach((u) => {
    if ((u.winCount || 0) > 200 || (u.lossCount || 0) > 200) {
      u.winCount = Math.floor(Math.random() * 20) + 5;
      u.lossCount = Math.floor(Math.random() * 15) + 3;
      if (u.balance > 200) u.balance = 100;
      usersReset++;
    }
  });
  if (store.transactions.length > 500) {
    const originalCount = store.transactions.length;
    store.transactions = store.transactions.slice(0, 500);
    txRemoved += originalCount - store.transactions.length;
  }
  if (store.agentTransactions && store.agentTransactions.length > 500) {
    const originalCount = store.agentTransactions.length;
    store.agentTransactions = store.agentTransactions.slice(0, 500);
    txRemoved += originalCount - store.agentTransactions.length;
  }
  const roomKeys = Object.keys(store.rooms);
  roomKeys.forEach((id) => {
    if (store.rooms[id].status !== "playing") {
      delete store.rooms[id];
      roomsRemoved++;
    }
  });
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1e3;
  const originalManualCount = store.pendingManualTransactions.length;
  store.pendingManualTransactions = store.pendingManualTransactions.filter(
    (t) => t.status === "pending" || t.createdAt > sevenDaysAgo
  );
  manualRemoved = originalManualCount - store.pendingManualTransactions.length;
  saveStore();
  res.json({
    success: true,
    usersReset,
    transactionsRemoved: txRemoved,
    roomsRemoved,
    manualTransactionsRemoved: manualRemoved,
    message: "Database cleaned and optimized successfully."
  });
});
app.post("/api/admin/login", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const { username, password } = req.body;
  try {
    if (isMySqlRuntimePrimary()) {
      let adminUser2 = [...adminUsersCache.values()].find((admin) => admin.username === username);
      if (!adminUser2 && adminUsersCache.size === 0) {
        adminUser2 = { id: `admin_${Date.now()}`, username, password, permissions: ["all"], status: "active" };
        await saveMySqlAdmin(adminUser2);
        adminUsersCache.set(adminUser2.id, adminUser2);
      }
      if (!adminUser2 || adminUser2.password !== password) return res.status(401).json({ success: false, error: "Invalid admin credentials." });
      if (adminUser2.status === "suspended") return res.status(403).json({ error: "Access denied. This admin account is suspended." });
      adminUser2.permissions = normalizeAdminPermissions(adminUser2.permissions);
      const { password: _, ...userToReturn } = adminUser2;
      return res.json({ success: true, user: userToReturn });
    }
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
app.get("/api/admin/me", async (req, res) => {
  const adminId = String(req.query.userId || "").trim();
  if (!adminId) return res.status(401).json({ error: "Admin session is required." });
  try {
    let adminUser;
    if (isMySqlRuntimePrimary()) {
      adminUser = adminUsersCache.get(adminId);
    } else if (db) {
      const snapshot = await db.collection("adminUsers").doc(adminId).get();
      if (snapshot.exists) adminUser = snapshot.data();
    }
    if (!adminUser) return res.status(401).json({ error: "Admin session was not found." });
    if (adminUser.status === "suspended") return res.status(403).json({ error: "This admin account is suspended." });
    const canonicalUser = {
      ...adminUser,
      id: adminUser.id || adminId,
      permissions: normalizeAdminPermissions(adminUser.permissions)
    };
    const { password: _, ...userToReturn } = canonicalUser;
    return res.json({ success: true, user: userToReturn });
  } catch (error) {
    console.error("Failed to refresh admin session:", error);
    return res.status(500).json({ error: "Admin session could not be refreshed." });
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
      const adminUser = await cachedAdminUser(adminId);
      if (!adminUser) {
        return res.status(403).json({ error: "Access denied. Invalid admin user." });
      }
      if (adminUser.status === "suspended") {
        return res.status(403).json({ error: "Access denied. This admin account is suspended." });
      }
      const permissions = normalizeAdminPermissions(adminUser.permissions);
      if (permissions.includes("all") || permissions.includes(requiredPermission)) {
        const canonicalAdmin = { ...adminUser, permissions };
        req.adminUser = canonicalAdmin;
        req.adminPermissions = permissions;
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
  const admin = await cachedAdminUser(adminId);
  if (!admin) return res.status(403).json({ error: "Invalid admin user." });
  const permissions = normalizeAdminPermissions(admin.permissions);
  if (permissions.includes("all") || required.some((permission) => permissions.includes(permission))) {
    req.adminPermissions = permissions;
    req.adminUser = admin;
    return next();
  }
  return res.status(403).json({ error: "You do not have permission for this action." });
};
app.post("/api/admin/cashier/heartbeat", hasPermission("cashier"), async (req, res) => {
  const adminId = String(req.query.userId || "");
  const admin = req.adminUser;
  if (cashierCities(admin || {}).length === 0) return res.status(400).json({ error: "Cashier city is not configured." });
  const cashierOnlineAt = Date.now();
  if (isMySqlRuntimePrimary()) {
    await updateMySqlCashierHeartbeat(adminId, cashierOnlineAt);
  } else {
    if (!db) return res.status(500).json({ error: "Database not initialized" });
    await db.collection("adminUsers").doc(adminId).update({ cashierOnlineAt });
  }
  const updatedAdmin = { ...admin, cashierOnlineAt };
  adminUsersCache.set(adminId, updatedAdmin);
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
    if (isMySqlRuntimePrimary()) {
      if ([...adminUsersCache.values()].some((admin) => admin.username === username)) return res.status(409).json({ error: "An admin with this username already exists." });
      const newAdmin2 = { id: `admin_${Date.now()}`, username, password, permissions: normalizeAdminPermissions(permissions), status: "active" };
      await saveMySqlAdmin(newAdmin2);
      adminUsersCache.set(newAdmin2.id, newAdmin2);
      const { password: _2, ...userToReturn2 } = newAdmin2;
      return res.status(201).json({ success: true, user: userToReturn2 });
    }
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
    const admin = await cachedAdminUser(adminId);
    if (admin) {
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
    if (isMySqlRuntimePrimary()) {
      const roles2 = [...adminUsersCache.values()].map((admin) => {
        const { password, ...role } = admin;
        return { ...role, permissions: normalizeAdminPermissions(admin.permissions), status: admin.status === "suspended" ? "suspended" : "active" };
      });
      return res.json({ username: store.adminSettings?.username || process.env.ADMIN_USERNAME || "admin", passwordConfigured: Boolean(store.adminSettings?.password), roles: roles2, vipTiers: store.vipTiers, adSettings: store.adSettings, adCampaigns: store.adCampaigns || [], otpEnabled: isOtpEnabled(), phoneAuthEnabled: isPhoneAuthEnabled() });
    }
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
      adSettings: store.adSettings,
      adCampaigns: store.adCampaigns || [],
      otpEnabled: isOtpEnabled(),
      phoneAuthEnabled: isPhoneAuthEnabled()
    });
  } catch (error) {
    console.error("Failed to retrieve admin roles:", error);
    res.status(500).json({ error: "Failed to retrieve admin roles." });
  }
});
app.post("/api/admin/otp-settings", hasPermission("settings"), async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "OTP enabled status must be true or false." });
  store.adminSettings.otpEnabled = req.body.enabled;
  await saveStoreAndWait();
  res.json({ success: true, otpEnabled: isOtpEnabled(), message: isOtpEnabled() ? "Email OTP verification is enabled." : "Email OTP verification is disabled." });
});
app.post("/api/admin/phone-auth-settings", hasPermission("settings"), async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "Phone authentication status must be true or false." });
  store.adminSettings.phoneAuthEnabled = req.body.enabled;
  await saveStoreAndWait();
  res.json({ success: true, phoneAuthEnabled: isPhoneAuthEnabled(), message: isPhoneAuthEnabled() ? "Phone sign-in is enabled." : "Phone sign-in is disabled." });
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
    if (isMySqlRuntimePrimary()) {
      const adminUser2 = adminUsersCache.get(adminId);
      if (!adminUser2) return res.status(404).json({ error: "Admin user not found." });
      if (adminUser2.password !== currentPassword) return res.status(400).json({ error: "Current password is incorrect." });
      adminUser2.password = newPassword;
      await saveMySqlAdmin(adminUser2);
      adminUsersCache.set(adminId, adminUser2);
      return res.json({ success: true, message: "Password updated successfully." });
    }
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
    if (isMySqlRuntimePrimary()) {
      if ([...adminUsersCache.values()].some((admin) => admin.username.toLowerCase() === String(username).trim().toLowerCase())) return res.status(409).json({ error: "An admin with this username already exists." });
      const newAdmin2 = { id: `admin_${Date.now()}`, username: String(username).trim(), password, permissions: normalizedPermissions, name: String(name).trim(), status: "active", location: normalizedPermissions.includes("cashier") ? submittedCashierLocations[0] : "", cashierLocations: normalizedPermissions.includes("cashier") ? submittedCashierLocations : [], cashierMonthlySalary: normalizedPermissions.includes("cashier") ? Math.max(0, Number(cashierMonthlySalary || 0)) : 0, cashierMonthlyTarget: normalizedPermissions.includes("cashier") ? Math.max(0, Math.floor(Number(cashierMonthlyTarget || 0))) : 0, cashierTargetBonus: normalizedPermissions.includes("cashier") ? Math.max(0, Number(cashierTargetBonus || 0)) : 0, cashierNextSalaryDate: normalizedPermissions.includes("cashier") ? Date.now() + 30 * 24 * 60 * 60 * 1e3 : void 0 };
      await saveMySqlAdmin(newAdmin2);
      adminUsersCache.set(newAdmin2.id, newAdmin2);
      const { password: _2, ...userToReturn2 } = newAdmin2;
      return res.status(201).json({ success: true, user: userToReturn2 });
    }
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
    const adminRef = isMySqlRuntimePrimary() ? null : db.collection("adminUsers").doc(roleId);
    const doc = adminRef ? await adminRef.get() : null;
    const adminData = isMySqlRuntimePrimary() ? adminUsersCache.get(roleId) : doc?.data();
    if (!adminData) return res.status(404).json({ error: "Admin role not found." });
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
    const updatedAdmin = { ...adminData, ...updatedData };
    if (isMySqlRuntimePrimary()) {
      await saveMySqlAdmin(updatedAdmin);
      adminUsersCache.set(roleId, updatedAdmin);
    } else await adminRef.update(updatedData);
    const finalAdmin = isMySqlRuntimePrimary() ? updatedAdmin : (await adminRef.get()).data();
    const { password, ...returnData } = finalAdmin;
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
    const adminRef = isMySqlRuntimePrimary() ? null : db.collection("adminUsers").doc(roleId);
    const doc = adminRef ? await adminRef.get() : null;
    const adminData = isMySqlRuntimePrimary() ? adminUsersCache.get(roleId) : doc?.data();
    if (!adminData) return res.status(404).json({ error: "Admin user not found." });
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
    if (isMySqlRuntimePrimary()) {
      await deleteMySqlAdmin(roleId);
      adminUsersCache.delete(roleId);
    } else await adminRef.delete();
    res.json({ success: true, message: "Admin user deleted successfully." });
  } catch (error) {
    console.error("Failed to delete admin user:", error);
    res.status(500).json({ error: "Failed to delete admin user." });
  }
});
async function getAdminFinancialMetrics() {
  const empty = { totalAgents: 0, activeAgents: 0, pendingAgentRequests: 0, agentFloatIssued: 0, agentFloatCash: 0, agentCommissionDiscounts: 0, monthlyAgents: 0, monthlySalaryLiability: 0, cashierPayrollPaid: 0 };
  const agents = Object.values(store.agents);
  const value = { ...empty };
  value.totalAgents = agents.length;
  value.activeAgents = agents.filter((agent) => agent.status === "Active").length;
  value.monthlyAgents = agents.filter((agent) => agent.businessModel === "monthly").length;
  value.monthlySalaryLiability = agents.filter((agent) => agent.businessModel === "monthly" && agent.status === "Active").reduce((sum, agent) => sum + Number(agent.monthlySalary || 0), 0);
  value.pendingAgentRequests = [...agentRequestsCache.values()].filter((request) => request.status === "pending").length;
  agentTransactionsCache.forEach((transaction) => {
    if (transaction.type !== "FloatPurchase" || Number(transaction.amount || 0) <= 0) return;
    const amount = Number(transaction.amount || 0);
    const discount = Math.max(0, Number(transaction.discountAmount || 0));
    value.agentFloatIssued += amount;
    value.agentCommissionDiscounts += discount;
    value.agentFloatCash += Math.max(0, amount - discount);
  });
  value.cashierPayrollPaid = [...cashierPaymentsCache.values()].reduce((sum, payment) => sum + Number(payment.total || 0), 0);
  return value;
}
app.get("/api/admin/stats", hasPermission("stats"), async (req, res) => {
  const users = Object.values(store.users).filter((user) => !isBotPlayer(user.id));
  const rooms = Object.values(store.rooms);
  const tournaments = Object.values(store.tournaments);
  const manualTransactions = store.pendingManualTransactions || [];
  const monthBuckets = /* @__PURE__ */ new Map();
  const now2 = /* @__PURE__ */ new Date();
  const revenueBreakdown = {
    game_rake: 0,
    team_game_rake: 0,
    forfeit_rake: 0,
    bot_result: 0,
    betting_margin: 0,
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
    const date = new Date(now2.getFullYear(), now2.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthBuckets.set(key, { month: date.toLocaleString("en", { month: "short" }), deposits: 0, withdrawals: 0, transactions: 0 });
  }
  store.transactions.forEach((tx) => {
    const date = new Date(tx.timestamp);
    const bucket = monthBuckets.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (!bucket) return;
    bucket.transactions += 1;
    if (tx.type === "deposit") bucket.deposits += Number(tx.amount || 0);
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
      const metrics = await getAdminFinancialMetrics();
      ({ totalAgents, activeAgents, pendingAgentRequests, agentFloatIssued, agentFloatCash, agentCommissionDiscounts, monthlyAgents, monthlySalaryLiability, cashierPayrollPaid } = metrics);
    } catch (error) {
      console.error("Failed to include Firestore agent metrics in admin stats:", error);
    }
  }
  const recentActivity = [
    ...store.transactions.slice(0, 8).map((tx) => ({ id: tx.id, kind: "transaction", title: tx.description, amount: tx.amount, status: tx.status || "completed", timestamp: tx.timestamp })),
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
  res.json(Object.values(store.users).filter((user) => !isBotPlayer(user.id)));
});
app.get("/api/admin/rooms", hasPermission("rooms"), (req, res) => {
  res.json(Object.values(store.rooms).filter((room) => room.status !== "cancelled"));
});
app.get("/api/admin/transactions", hasPermission("transactions"), (req, res) => {
  res.json(store.transactions);
});
app.get("/api/admin/manual-transactions", hasAnyPermission("transactions", "cashier"), async (req, res) => {
  const permissions = req.adminPermissions || [];
  const cashierOnly = permissions.includes("cashier") && !permissions.includes("transactions") && !permissions.includes("all");
  const adminId = String(req.query.userId || "");
  if (cashierOnly) {
    const currentAdmin2 = req.adminUser;
    const cashierOnlineAt = Date.now();
    adminUsersCache.set(adminId, { ...currentAdmin2, cashierOnlineAt });
    if (isMySqlRuntimePrimary()) {
      await updateMySqlCashierHeartbeat(adminId, cashierOnlineAt);
    } else if (db) {
      await db.collection("adminUsers").doc(adminId).update({ cashierOnlineAt });
    }
  }
  if (isMySqlRuntimePrimary()) {
    const persistedRequests = await listMySqlManualRequests();
    const mergedRequests = new Map(store.pendingManualTransactions.map((request) => [request.id, request]));
    persistedRequests.forEach((request) => mergedRequests.set(request.id, request));
    store.pendingManualTransactions = [...mergedRequests.values()].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }
  await reassignExpiredCashierRequests();
  const agentNames = new Map(Object.values(store.agents).map((agent) => [agent.id, agent.username]));
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
  const currentAdmin = req.adminUser;
  res.json(cashierOnly ? transactions.filter((tx) => tx.managedBy !== "agent" && cashierCanServeRequest(currentAdmin, tx)) : transactions);
});
function cashierPeriod(now2 = /* @__PURE__ */ new Date()) {
  const year = now2.getUTCFullYear();
  const month = now2.getUTCMonth();
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { key, start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1) };
}
app.get("/api/admin/cashier-overview", hasPermission("cashier"), async (req, res) => {
  const cashier = req.adminUser;
  const now2 = Date.now();
  const period = cashierPeriod();
  if (isMySqlRuntimePrimary()) {
    const persistedRequests = await listMySqlManualRequests();
    const merged = new Map(store.pendingManualTransactions.map((request) => [request.id, request]));
    persistedRequests.forEach((request) => merged.set(request.id, request));
    store.pendingManualTransactions = [...merged.values()];
  }
  const cityRequests = store.pendingManualTransactions.filter((request) => request.managedBy !== "agent" && cashierCanServeRequest(cashier, request));
  const periodRequests = cityRequests.filter((request) => request.createdAt >= period.start && request.createdAt < period.end);
  const resolved = periodRequests.filter((request) => request.resolvedBy === cashier.id);
  const approved = resolved.filter((request) => request.status === "approved");
  const rejected = resolved.filter((request) => request.status === "rejected");
  const pending = cityRequests.filter((request) => request.status === "pending").length;
  const monthlyTarget = Math.max(0, Number(cashier.cashierMonthlyTarget || 0));
  const remainingTarget = Math.max(0, monthlyTarget - approved.length);
  const targetReached = monthlyTarget > 0 && remainingTarget === 0;
  const monthlySalary = Math.max(0, Number(cashier.cashierMonthlySalary || 0));
  const targetBonus = Math.max(0, Number(cashier.cashierTargetBonus || 0));
  const earnedBonus = targetReached ? targetBonus : 0;
  const payment = [...cashierPaymentsCache.values()].find((item) => item.cashierId === cashier.id && item.period === period.key);
  const peopleServed = new Set(resolved.map((request) => request.userId)).size;
  return res.json({
    period: period.key,
    name: cashier.name || cashier.username,
    username: cashier.username,
    locations: cashierCities(cashier),
    online: Number(cashier.cashierOnlineAt || 0) >= now2 - CASHIER_ONLINE_WINDOW_MS,
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
    salaryStatus: payment ? "paid" : Number(cashier.cashierNextSalaryDate || 0) <= now2 ? "due" : "pending",
    paidAt: payment?.paidAt
  });
});
app.get("/api/admin/cashiers", hasPermission("settings"), async (_req, res) => {
  const now2 = Date.now();
  const period = cashierPeriod();
  const payments = [...cashierPaymentsCache.values()];
  const paidByCashier = new Map(payments.filter((payment) => payment.period === period.key).map((payment) => [payment.cashierId, payment]));
  const periodRequests = store.pendingManualTransactions.filter((request) => request.createdAt >= period.start && request.createdAt < period.end && request.managedBy !== "agent");
  const cashiers = [...adminUsersCache.values()].filter((admin) => normalizeAdminPermissions(admin.permissions).includes("cashier")).map((cashier) => {
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
      online: cashier.status !== "suspended" && Number(cashier.cashierOnlineAt || 0) >= now2 - CASHIER_ONLINE_WINDOW_MS,
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
      salaryStatus: payment ? "paid" : Number(cashier.cashierNextSalaryDate || 0) <= now2 ? "due" : "pending",
      payableAmount: Number((salary + bonus).toFixed(2)),
      paidAt: payment?.paidAt
    };
  });
  const history = payments.sort((a, b) => Number(b.paidAt || 0) - Number(a.paidAt || 0));
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
    if (isMySqlRuntimePrimary()) {
      const cashier = adminUsersCache.get(cashierId);
      if (!cashier) throw new Error("Cashier not found.");
      if (!normalizeAdminPermissions(cashier.permissions).includes("cashier")) throw new Error("Selected account is not a cashier.");
      if ([...cashierPaymentsCache.values()].some((payment2) => payment2.cashierId === cashierId && payment2.period === period.key)) throw new Error("This cashier has already been paid for the current period.");
      const approved = store.pendingManualTransactions.filter((request) => request.managedBy !== "agent" && request.resolvedBy === cashierId && request.status === "approved" && request.createdAt >= period.start && request.createdAt < period.end).length;
      const target = Math.max(0, Number(cashier.cashierMonthlyTarget || 0));
      const salary = Math.max(0, Number(cashier.cashierMonthlySalary || 0));
      const bonus = target > 0 && approved >= target ? Math.max(0, Number(cashier.cashierTargetBonus || 0)) : 0;
      const payment = await saveMySqlCashierPayment({ cashierId, cashierName: cashier.name || cashier.username, period: period.key, salary, bonus, total: Number((salary + bonus).toFixed(2)), approvedCount: approved, paidAt: Date.now(), paidBy: adminId });
      cashier.cashierNextSalaryDate = period.end;
      await saveMySqlAdmin(cashier);
      adminUsersCache.set(cashierId, cashier);
      cashierPaymentsCache.set(payment.id, payment);
      return res.json({ success: true, payment });
    }
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
app.get("/api/ads/active", (_req, res) => res.json(store.adCampaigns || []));
app.get("/api/admin/ad-settings", hasPermission("settings"), (_req, res) => res.json(store.adCampaigns || []));
app.post("/api/admin/ad-settings", hasPermission("settings"), async (req, res) => {
  const submitted = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.campaigns) ? req.body.campaigns : [req.body || {}];
  const formats = ["banner", "ticker", "popup", "adsense"];
  const placements = ["all", "dashboard", "game"];
  const campaigns = [];
  for (const raw of submitted) {
    const value = raw || {};
    const durationSeconds = Math.max(1, Math.min(180, Math.round(Number(value.durationSeconds) || 3)));
    const intervalSeconds = Math.max(10, durationSeconds, Math.min(3600, Math.round(Number(value.intervalSeconds) || 60)));
    if (!formats.includes(value.format) || !placements.includes(value.placement)) return res.status(400).json({ error: "Invalid ad format or placement." });
    if (value.enabled && value.format !== "adsense" && !String(value.title || value.message || value.imageUrl || "").trim()) return res.status(400).json({ error: "Every enabled campaign needs ad text, an image or a video." });
    const startAt = Number(value.startAt) > 0 ? Number(value.startAt) : void 0;
    const endAt = Number(value.endAt) > 0 ? Number(value.endAt) : void 0;
    if (startAt && endAt && endAt <= startAt) return res.status(400).json({ error: "Campaign end time must be after its start time." });
    campaigns.push({ ...DEFAULT_AD_SETTINGS, ...value, id: String(value.id || import_crypto.default.randomUUID()), durationSeconds, intervalSeconds, startAt, endAt, updatedAt: Date.now() });
  }
  store.adCampaigns = campaigns;
  store.adSettings = campaigns[0] || { ...DEFAULT_AD_SETTINGS };
  await saveStoreAndWait();
  broadcastToAll("ad_settings_updated", store.adCampaigns);
  res.json({ success: true, adCampaigns: store.adCampaigns, adSettings: store.adSettings });
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
  if (cashierOnly && !cashierCanServeRequest(req.adminUser, tx)) {
    return res.status(403).json({ error: "This request belongs to a cashier serving another location." });
  }
  if (cashierOnly && (tx.assignedCashierId !== String(req.query.userId || "") || Number(tx.assignmentExpiresAt || 0) <= Date.now())) {
    tx.assignedCashierId = String(req.query.userId || "");
    tx.assignedCashierName = String(req.adminUser?.name || req.adminUser?.username || "Cashier");
    tx.assignedCashierAt = Date.now();
    tx.assignmentExpiresAt = Date.now() + CASHIER_ASSIGNMENT_MS;
    await saveManualRequestToFirestore(tx);
  }
  const user = store.users[tx.userId];
  if (!user) {
    return res.status(404).json({ error: "User associated with transaction not found." });
  }
  if (tx.managedBy === "agent" || user.linkedAgentId) {
    return res.status(403).json({ error: "This transaction is assigned to an agent and is read-only for administrators." });
  }
  if (isMySqlRuntimePrimary()) {
    if (tx.transactionType === "withdraw") {
      const eligibilityError = withdrawalEligibilityError(user, tx.amount, tx.id);
      if (eligibilityError) return res.status(400).json({ error: eligibilityError });
    }
    try {
      const result = await resolveMySqlManualRequest({ requestId: tx.id, admin: req.adminUser, approved: true });
      Object.assign(tx, result.request);
      if (result.user) {
        store.users[tx.userId] = { ...store.users[tx.userId], ...result.user };
        const description = tx.transactionType === "deposit" ? `Manual deposit approved by cashier/admin. Request ID: ${tx.id}` : `Manual withdrawal approved by cashier/admin. Request ID: ${tx.id}`;
        addTransaction(tx.userId, tx.transactionType === "deposit" ? "deposit" : "withdrawal", tx.amount, void 0, description);
        if (tx.transactionType === "withdraw") recordWithdrawalFee(tx.userId, Number(tx.fee || 0), tx.id);
        broadcastUserUpdate(tx.userId);
      }
      await saveStoreAndWait();
      return res.json({ success: true, transaction: tx });
    } catch (error) {
      const message = String(error?.message || "Request could not be approved.");
      return res.status(/already been processed/i.test(message) ? 409 : 400).json({ error: message });
    }
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
  if (cashierOnly && !cashierCanServeRequest(req.adminUser, tx)) {
    return res.status(403).json({ error: "This request belongs to a cashier serving another location." });
  }
  if (cashierOnly && (tx.assignedCashierId !== String(req.query.userId || "") || Number(tx.assignmentExpiresAt || 0) <= Date.now())) {
    tx.assignedCashierId = String(req.query.userId || "");
    tx.assignedCashierName = String(req.adminUser?.name || req.adminUser?.username || "Cashier");
    tx.assignedCashierAt = Date.now();
    tx.assignmentExpiresAt = Date.now() + CASHIER_ASSIGNMENT_MS;
    await saveManualRequestToFirestore(tx);
  }
  const user = store.users[tx.userId];
  if (tx.managedBy === "agent" || user?.linkedAgentId) {
    return res.status(403).json({ error: "This transaction is assigned to an agent and is read-only for administrators." });
  }
  if (isMySqlRuntimePrimary()) {
    try {
      const result = await resolveMySqlManualRequest({ requestId: tx.id, admin: req.adminUser, approved: false });
      Object.assign(tx, result.request);
      await saveStoreAndWait();
      if (user) sendEventToUser(user.id, "user_notification", { type: "info", message: `Your ${tx.transactionType} request for $${tx.amount} was rejected.` });
      return res.json({ success: true, transaction: tx });
    } catch (error) {
      const message = String(error?.message || "Request could not be rejected.");
      return res.status(/already been processed/i.test(message) ? 409 : 400).json({ error: message });
    }
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
  try {
    res.json(Object.values(store.agents));
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
    if (isMySqlRuntimePrimary()) {
      if (Object.values(store.agents).some((agent) => agent.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: "Agent with this username already exists." });
      if (Object.values(store.agents).some((agent) => normalizePromoCode(agent.promoCode) === normalizedPromoCode)) return res.status(400).json({ error: "Promo code is already in use." });
      const agentId2 = `agent_${Date.now()}`;
      const newAgent2 = { id: agentId2, username, password, phone, location, commissionRate: rate, promoCode: normalizedPromoCode, balance: 0, floatBalance: 0, status: "Active", createdAt: Date.now(), businessModel: businessModel === "monthly" ? "monthly" : "independent", monthlySalary: businessModel === "monthly" ? Math.max(0, Number(monthlySalary || 0)) : 0, monthlyTarget: businessModel === "monthly" ? Math.max(0, Number(monthlyTarget || 0)) : 0, dailyTransactionLimit: businessModel === "monthly" ? Math.max(0, Number(dailyTransactionLimit || 0)) : 0, salaryStatus: businessModel === "monthly" ? "current" : void 0, nextSalaryDate: businessModel === "monthly" ? Date.now() + 30 * 24 * 60 * 60 * 1e3 : void 0 };
      await saveMySqlAgent(newAgent2);
      store.agents[agentId2] = newAgent2;
      agentCache.set(agentId2, newAgent2);
      await saveStoreAndWait();
      return res.status(201).json(newAgent2);
    }
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
    const agentRef = isMySqlRuntimePrimary() ? null : db.collection("agents").doc(agentId);
    const agentDoc = agentRef ? await agentRef.get() : null;
    const agentData = isMySqlRuntimePrimary() ? store.agents[agentId] : agentDoc?.data();
    if (!agentData) return res.status(404).json({ error: "Agent not found." });
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
    const updatedAgent = { ...agentData, ...updateData };
    if (isMySqlRuntimePrimary()) {
      await saveMySqlAgent(updatedAgent);
      store.agents[agentId] = updatedAgent;
      agentCache.set(agentId, updatedAgent);
      await saveStoreAndWait();
    } else await agentRef.update(updateData);
    res.json({ success: true, agent: isMySqlRuntimePrimary() ? updatedAgent : (await agentRef.get()).data() });
  } catch (error) {
    console.error(`Failed to update agent ${agentId}:`, error);
    res.status(500).json({ error: "Failed to update agent in database." });
  }
});
app.delete("/api/admin/agents/:agentId/delete", hasPermission("agents"), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });
  const agentId = req.params.agentId;
  try {
    const agentRef = isMySqlRuntimePrimary() ? null : db.collection("agents").doc(agentId);
    const agentDoc = agentRef ? await agentRef.get() : null;
    const agentData = isMySqlRuntimePrimary() ? store.agents[agentId] : agentDoc?.data();
    if (!agentData) return res.status(404).json({ error: "Agent not found." });
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
    if (isMySqlRuntimePrimary()) {
      await deleteMySqlAgent(agentId);
      delete store.agents[agentId];
      agentCache.delete(agentId);
      await saveStoreAndWait();
    } else await agentRef.delete();
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
    if (isMySqlRuntimePrimary()) {
      const transactionData2 = {
        id: `agent_tx_${Date.now()}_${import_crypto.default.randomBytes(4).toString("hex")}`,
        agentId,
        type: "FloatPurchase",
        amount: creditAmount,
        discountAmount: safeDiscountAmount,
        timestamp: Date.now(),
        description: creditAmount > 0 ? `Admin added $${creditAmount.toFixed(2)} to agent float with a $${safeDiscountAmount.toFixed(2)} commission discount.` : `Admin deducted $${Math.abs(creditAmount).toFixed(2)} from agent float as a balance correction.`
      };
      const result = await adjustMySqlAgentFloat({ agentId, amount: creditAmount, transaction: transactionData2 });
      store.agents[agentId] = result.agent;
      agentCache.set(agentId, result.agent);
      agentTransactionsCache.set(transactionData2.id, transactionData2);
      await saveStoreAndWait();
      return res.json({ success: true, agent: result.agent, transaction: transactionData2 });
    }
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
  try {
    const requests = [...agentRequestsCache.values()].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
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
    if (isMySqlRuntimePrimary()) {
      const request = agentRequestsCache.get(requestId);
      if (!request) return res.status(404).json({ error: "Request not found." });
      const admin = adminUsersCache.get(adminId) || { id: adminId, username: "Unknown Admin" };
      const result = await resolveMySqlAgentRequest({ request, admin, approved: true });
      agentRequestsCache.set(requestId, result.request);
      if (result.agent) {
        store.agents[result.agent.id] = result.agent;
        agentCache.set(result.agent.id, result.agent);
      }
      if (result.transaction) agentTransactionsCache.set(result.transaction.id, result.transaction);
      await saveStoreAndWait();
      return res.json({ success: true, message: "Agent float request approved." });
    }
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
    if (isMySqlRuntimePrimary()) {
      const request2 = agentRequestsCache.get(reqId);
      if (!request2) return res.status(404).json({ error: "Request not found." });
      const admin = adminUsersCache.get(adminId) || { id: adminId, username: "Unknown Admin" };
      const result = await resolveMySqlAgentRequest({ request: request2, admin, approved: false });
      agentRequestsCache.set(reqId, result.request);
      return res.json({ success: true, message: "Agent float request rejected." });
    }
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
    if (isMySqlRuntimePrimary()) {
      const agent2 = [...agentCache.values()].find((item) => item.username === username) || Object.values(store.agents).find((item) => item.username === username);
      if (!agent2 || agent2.password !== password) return res.status(401).json({ error: "Invalid credentials." });
      if (agent2.status !== "Active") return res.status(403).json({ error: "This agent account is not active." });
      const { password: _2, ...safeAgent2 } = agent2;
      return res.json({ success: true, agent: safeAgent2 });
    }
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
    const agent = await cachedAgent(agentId);
    if (!agent) {
      return res.status(403).json({ error: "Access denied. Invalid agent ID." });
    }
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
    if (isMySqlRuntimePrimary()) {
      agent.location = location;
      await saveMySqlAgent(agent);
      store.agents[agent.id] = agent;
      agentCache.set(agent.id, agent);
      const { password: _2, ...safeAgent2 } = agent;
      return res.json({ success: true, agent: safeAgent2 });
    }
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
    if (isMySqlRuntimePrimary()) {
      if (username.toLowerCase() !== String(agent.username).toLowerCase() && [...agentCache.values()].some((item) => item.id !== agentId && item.username.toLowerCase() === username.toLowerCase())) {
        return res.status(409).json({ error: "That agent username is already in use." });
      }
      Object.assign(agent, { username, phone, location }, newPassword ? { password: newPassword } : {});
      await saveMySqlAgent(agent);
      store.agents[agent.id] = agent;
      agentCache.set(agent.id, agent);
      const { password: _2, ...safeAgent2 } = agent;
      return res.json({ success: true, agent: safeAgent2, message: "Profile updated successfully." });
    }
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
  const agent = req.agent;
  try {
    const transactions = [...agentTransactionsCache.values()].filter((transaction) => transaction.agentId === agent.id);
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
    if (isMySqlRuntimePrimary()) {
      const agentTx = { id: `agent_tx_${Date.now()}_${import_crypto.default.randomBytes(4).toString("hex")}`, agentId: agent.id, type: "PlayerDeposit", amount: depositAmount, playerId, timestamp: Date.now(), description: `Deposited ${depositAmount} into ${player.username}'s account.` };
      const result = await adjustMySqlAgentFloat({ agentId: agent.id, amount: -depositAmount, transaction: agentTx, player });
      Object.assign(agent, result.agent);
      Object.assign(player, result.player);
      store.agents[agent.id] = agent;
      agentCache.set(agent.id, agent);
      agentTransactionsCache.set(agentTx.id, agentTx);
      addTransaction(playerId, "deposit", depositAmount, void 0, `Deposit received from agent ${agent.id}.`);
      await saveStoreAndWait();
      broadcastUserUpdate(player.id);
      return res.json({ success: true, newAgentBalance: agent.floatBalance, newPlayerBalance: player.balance });
    }
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
    if (isMySqlRuntimePrimary()) {
      const newRequest2 = { id: `agent_req_${Date.now()}_${import_crypto.default.randomBytes(4).toString("hex")}`, agentId: agent.id, agentUsername: agent.username, amount: requestAmount, status: "pending", createdAt: Date.now() };
      await saveMySqlAgentRequest(newRequest2);
      agentRequestsCache.set(newRequest2.id, newRequest2);
      return res.status(201).json({ success: true, message: "Your float request has been submitted for review.", request: newRequest2 });
    }
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
  const agent = req.agent;
  try {
    const requests = [...agentRequestsCache.values()].filter((request) => request.agentId === agent.id);
    requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json(requests);
  } catch (error) {
    console.error(`Failed to get float requests for agent ${agent.id}:`, error);
    res.status(500).json({ error: "Failed to retrieve float requests." });
  }
});
app.get("/api/agent/player-requests", isAgent, async (req, res) => {
  const agent = req.agent;
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
    if (!db && !isMySqlRuntimePrimary()) {
      throw new Error("Database not initialized");
    }
    let approvedUserBalance = user.balance;
    if (isMySqlRuntimePrimary()) {
      if (tx.transactionType === "withdraw") {
        const eligibilityError = withdrawalEligibilityError(user, tx.amount, tx.id);
        if (eligibilityError) throw new Error(eligibilityError);
      }
      const agentTx = {
        id: `agent_tx_${Date.now()}_${import_crypto.default.randomBytes(4).toString("hex")}`,
        agentId: agent.id,
        type: tx.transactionType === "deposit" ? "PlayerDeposit" : "PlayerWithdrawal",
        amount: tx.amount,
        playerId: user.id,
        playerName: user.username,
        timestamp: Date.now(),
        description: `Approved ${tx.transactionType} of $${tx.amount} for player ${user.username}.`
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
app.get("/api/agent/my-players", isAgent, async (req, res) => {
  const agent = req.agent;
  try {
    const normalizedAgentPromo = normalizePromoCode(agent.promoCode);
    const linkedPlayers = isMySqlRuntimePrimary() ? await listMySqlUsersByAgent(agent.id, normalizedAgentPromo) : Object.values(store.users).filter((user) => user.linkedAgentId === agent.id || !user.linkedAgentId && normalizePromoCode(user.appliedPromoCode) === normalizedAgentPromo);
    await Promise.all(linkedPlayers.map(async (player) => {
      if (!player.linkedAgentId) {
        player.linkedAgentId = agent.id;
        player.appliedPromoCode = normalizedAgentPromo;
        await saveUserProfileToFirestore(player);
      }
    }));
    linkedPlayers.forEach((player) => {
      store.users[player.id] = player;
    });
    const sanitizedPlayers = linkedPlayers.map((p) => {
      const { password, ...playerData } = p;
      return playerData;
    });
    res.json(sanitizedPlayers);
  } catch (error) {
    console.error(`Failed to load linked players for agent ${agent.id}:`, error);
    res.status(500).json({ error: "Linked players could not be loaded." });
  }
});
app.get("/agent", (req, res) => {
  const distPath = getDistDirectory();
  const agentFile = import_fs.default.existsSync(import_path.default.join(distPath, "agent.html")) ? import_path.default.join(distPath, "agent.html") : import_path.default.join(process.cwd(), "agent.html");
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
  const indexFile = import_fs.default.existsSync(import_path.default.join(distPath, "index.html")) ? import_path.default.join(distPath, "index.html") : import_path.default.join(process.cwd(), "index.html");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(indexFile);
});
async function startServer() {
  let vite;
  if (process.env.NODE_ENV === "development") {
    vite = await (0, import_vite.createServer)({
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
  const migrationMode = firebaseMySqlMigrationMode;
  if (migrationMode) {
    console.log("MySQL connection check is delegated to the one-time migration.");
  } else if (isMySqlConfigured()) {
    void testMySqlConnection().then(() => console.log("MySQL connection verified successfully.")).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/access denied/i.test(message)) console.error("MySQL connection failed: check MYSQL_USER and MYSQL_PASSWORD.");
      else if (/unknown database/i.test(message)) console.error("MySQL connection failed: check MYSQL_DATABASE.");
      else if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message)) console.error("MySQL connection failed: check MYSQL_HOST, MYSQL_PORT and network access.");
      else console.error("MySQL connection failed.");
    });
  } else {
    console.warn("MySQL connection check skipped: configuration is incomplete.");
  }
  try {
    const runtimeStoreMode = mysqlRuntimeStoreMode();
    let loadedFromFirebase = false;
    let loadedFromMySql = false;
    if (runtimeStoreMode === "primary" && !migrationMode) {
      loadedFromMySql = await loadStoreFromMySql();
    }
    if (!loadedFromMySql) {
      loadedFromFirebase = await loadStoreFromFirestore();
    }
    purgeSimulatedUsers();
    if (!migrationMode && loadedFromFirebase && runtimeStoreMode !== "disabled") {
      await saveRuntimeStoreToMySql(JSON.parse(JSON.stringify(store)));
      console.log(`MySQL runtime store ${runtimeStoreMode === "shadow" ? "shadow" : "fallback"} snapshot verified.`);
    }
    if (!migrationMode && runtimeStoreMode === "primary" && loadedFromMySql) {
      console.log("MySQL runtime store primary mode active; central Firestore writes are disabled.");
    }
    if (!migrationMode) {
      await startFirestoreLiveCaches();
      await startMySqlPrimaryCaches();
      await startMySqlMatchmakingSync();
      await startMySqlCashierHeartbeatSync();
      console.log("Application state initialization completed.");
    } else {
      console.log("Migration mode active: Firestore live caches are paused to preserve quota.");
    }
  } catch (error) {
    console.error("Application state initialization failed; continuing with local fallback:", error);
  }
  if (migrationMode) {
    console.log("One-time Firebase to MySQL migration requested; starting in the background.");
    const runMigrationWithQuotaRetry = async () => {
      try {
        await migrateFirestoreToMySql({ requireExecuteFlag: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/RESOURCE_EXHAUSTED|quota exceeded/i.test(message)) {
          const retryMinutes = 15;
          console.warn(`Firebase quota is unavailable; migration will retry automatically in ${retryMinutes} minutes.`);
          const retryTimer = setTimeout(() => void runMigrationWithQuotaRetry(), retryMinutes * 6e4);
          retryTimer.unref?.();
          return;
        }
        console.error("One-time Firebase to MySQL migration failed:", message);
      }
    };
    void runMigrationWithQuotaRetry();
  }
  server.on("upgrade", (req, socket, head) => {
    if (vite && req.url?.includes("__vite_hmr")) {
      vite.ws.handleUpgrade(req, socket, head);
    }
  });
  process.on("SIGINT", () => {
    console.log("\nShutting down server...");
    firestoreLiveUnsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
    if (mysqlMatchmakingTimer) clearInterval(mysqlMatchmakingTimer);
    if (mysqlCashierHeartbeatTimer) clearInterval(mysqlCashierHeartbeatTimer);
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
//# sourceMappingURL=server.cjs.map
