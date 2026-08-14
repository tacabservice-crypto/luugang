import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMySqlPool, closeMySqlPool, isMySqlConfigured } from '../src/server/mysql.ts';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '.env.production') });

type JsonRecord = Record<string, any>;
const now = () => Date.now();
const json = (value: unknown) => JSON.stringify(value ?? {});
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0.00';
const timestamp = (value: unknown, fallback = now()) => Math.max(0, Number(value) || fallback);

function firebaseCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) return JSON.parse(inline);
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(process.cwd(), 'firebase-admin-key.json'),
    path.join(process.cwd(), 'service-account.json'),
    path.join(process.cwd(), 'firebase-key.json'),
  ].filter(Boolean) as string[];
  const found = candidates.find(file => fs.existsSync(file));
  if (!found) throw new Error('Firebase Admin credentials were not found.');
  return JSON.parse(fs.readFileSync(found, 'utf8'));
}

async function collectionMap(collectionName: string): Promise<Map<string, JsonRecord>> {
  const snapshot = await getFirestore().collection(collectionName).get();
  return new Map<string, JsonRecord>(snapshot.docs.map(document => [document.id, { id: document.id, ...document.data() }]));
}

async function loadSourceSnapshot() {
  const db = getFirestore();
  const mainDocument = await db.collection('ludo_store').doc('main').get();
  if (!mainDocument.exists || !mainDocument.data()?.data) throw new Error('Firestore ludo_store/main snapshot is missing.');
  const store = JSON.parse(String(mainDocument.data()!.data)) as JsonRecord;
  const [firestoreUsers, manualRequests, agents, adminUsers, agentRequests, agentTransactions, cashierPayments, emailOtps] = await Promise.all([
    collectionMap('users'),
    collectionMap('manualTransactionRequests'),
    collectionMap('agents'),
    collectionMap('adminUsers'),
    collectionMap('agentRequests'),
    collectionMap('agentTransactions'),
    collectionMap('cashierPayments'),
    collectionMap('emailOtps'),
  ]);

  const users = new Map<string, JsonRecord>();
  Object.values(store.users || {}).forEach((user: any) => { if (user?.id && !String(user.id).startsWith('bot_') && !String(user.id).startsWith('user_sim_')) users.set(String(user.id), user); });
  firestoreUsers.forEach(user => { if (user?.id) users.set(String(user.id), { ...(users.get(String(user.id)) || {}), ...user }); });
  const mergedAgents = new Map<string, JsonRecord>(Object.entries(store.agents || {}) as Array<[string, JsonRecord]>);
  agents.forEach((agent, id) => mergedAgents.set(id, { ...(mergedAgents.get(id) || {}), ...agent }));
  const mergedManual = new Map<string, JsonRecord>((store.pendingManualTransactions || []).map((request: any) => [String(request.id), request]));
  manualRequests.forEach((request, id) => mergedManual.set(id, { ...(mergedManual.get(id) || {}), ...request }));

  const ensureUser = (userId: unknown) => {
    const id = String(userId || '').trim();
    if (!id || id === 'house' || id === 'platform') return;
    if (!users.has(id)) users.set(id, { id, username: 'Migrated Account', balance: 0, winCount: 0, lossCount: 0, createdAt: now(), migrationPlaceholder: true });
  };
  (store.transactions || []).forEach((transaction: any) => ensureUser(transaction.userId));
  mergedManual.forEach(request => ensureUser(request.userId));

  return { store, users, manualRequests: mergedManual, agents: mergedAgents, adminUsers, agentRequests, agentTransactions, cashierPayments, emailOtps };
}

async function migrate() {
  if (!process.argv.includes('--execute')) throw new Error('Safety stop: add --execute to run the one-way Firebase to MySQL copy.');
  if (!isMySqlConfigured()) throw new Error('MySQL environment variables are incomplete.');
  const serviceAccount = firebaseCredential();
  serviceAccount.private_key = String(serviceAccount.private_key || '').replace(/\\n/g, '\n');
  if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
  const source = await loadSourceSnapshot();
  const pool = getMySqlPool();
  const connection = await pool.getConnection();
  const migrationId = `firebase_${Date.now()}`;

  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS data_migration_runs (
      id VARCHAR(191) PRIMARY KEY,
      source_name VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      summary_json JSON NOT NULL,
      started_at BIGINT UNSIGNED NOT NULL,
      completed_at BIGINT UNSIGNED NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await connection.execute('INSERT INTO data_migration_runs (id, source_name, status, summary_json, started_at) VALUES (?, ?, ?, ?, ?)', [migrationId, 'firebase', 'running', json({}), now()]);
    await connection.beginTransaction();

    for (const user of source.users.values()) {
      const id = String(user.id);
      await connection.execute(`INSERT INTO app_users
        (id, firebase_uid, email, phone, username, avatar, balance, win_count, loss_count, linked_agent_id, applied_promo_code, email_verified, status, created_at, updated_at, profile_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE firebase_uid=VALUES(firebase_uid), email=VALUES(email), phone=VALUES(phone), username=VALUES(username), avatar=VALUES(avatar), balance=VALUES(balance), win_count=VALUES(win_count), loss_count=VALUES(loss_count), linked_agent_id=VALUES(linked_agent_id), applied_promo_code=VALUES(applied_promo_code), email_verified=VALUES(email_verified), status=VALUES(status), updated_at=VALUES(updated_at), profile_json=VALUES(profile_json), version=version+1`,
      [id, user.firebaseUid || null, user.email || null, user.phone || user.phoneNumber || null, user.username || 'Player', user.avatar || null, money(user.balance), Number(user.winCount || 0), Number(user.lossCount || 0), user.linkedAgentId || null, user.appliedPromoCode || user.promoCode || null, Boolean(user.emailVerified), user.status || 'active', timestamp(user.createdAt), now(), json(user)]);
    }

    for (const transaction of source.store.transactions || []) {
      const userId = String(transaction.userId || '');
      if (!source.users.has(userId)) continue;
      await connection.execute(`INSERT INTO wallet_transactions (id, user_id, transaction_type, amount, balance_after, status, reference_id, revenue_category, description, created_at, transaction_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), description=VALUES(description), transaction_json=VALUES(transaction_json)`,
      [String(transaction.id), userId, transaction.type || 'unknown', money(transaction.amount), transaction.balanceAfter === undefined ? null : money(transaction.balanceAfter), transaction.status || 'completed', transaction.referenceId || transaction.matchId || transaction.roomId || null, transaction.revenueCategory || null, transaction.description || null, timestamp(transaction.timestamp || transaction.createdAt), json(transaction)]);
    }

    for (const [id, agent] of source.agents) {
      await connection.execute(`INSERT INTO agents (id, username, password_hash, phone, location, promo_code, commission_rate, balance, float_balance, business_model, status, created_at, updated_at, agent_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE username=VALUES(username), password_hash=VALUES(password_hash), phone=VALUES(phone), location=VALUES(location), promo_code=VALUES(promo_code), commission_rate=VALUES(commission_rate), balance=VALUES(balance), float_balance=VALUES(float_balance), business_model=VALUES(business_model), status=VALUES(status), updated_at=VALUES(updated_at), agent_json=VALUES(agent_json)`,
      [id, agent.username || id, agent.password || agent.passwordHash || null, agent.phone || null, agent.location || null, agent.promoCode || null, Number(agent.commissionRate || 0), money(agent.balance), money(agent.floatBalance), agent.businessModel || 'independent', agent.status || 'Active', timestamp(agent.createdAt), now(), json(agent)]);
    }

    for (const [id, admin] of source.adminUsers) {
      await connection.execute(`INSERT INTO admin_users (id, username, password_hash, name, permissions_json, status, location, cashier_locations_json, cashier_online_at, admin_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE username=VALUES(username), password_hash=VALUES(password_hash), name=VALUES(name), permissions_json=VALUES(permissions_json), status=VALUES(status), location=VALUES(location), cashier_locations_json=VALUES(cashier_locations_json), cashier_online_at=VALUES(cashier_online_at), admin_json=VALUES(admin_json), updated_at=VALUES(updated_at)`,
      [id, admin.username || id, admin.password || admin.passwordHash || null, admin.name || null, json(admin.permissions || []), admin.status || 'active', admin.location || null, json(admin.cashierLocations || []), admin.cashierOnlineAt || null, json(admin), timestamp(admin.createdAt), now()]);
    }

    for (const [id, request] of source.manualRequests) {
      if (!source.users.has(String(request.userId || ''))) continue;
      await connection.execute(`INSERT INTO manual_transaction_requests (id, user_id, agent_id, managed_by, transaction_type, amount, status, assigned_cashier_id, created_at, resolved_at, request_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE agent_id=VALUES(agent_id), managed_by=VALUES(managed_by), status=VALUES(status), assigned_cashier_id=VALUES(assigned_cashier_id), resolved_at=VALUES(resolved_at), request_json=VALUES(request_json)`,
      [id, request.userId, request.agentId || null, request.managedBy || (request.agentId ? 'agent' : 'admin'), request.transactionType || request.type || 'deposit', money(request.amount), request.status || 'pending', request.assignedCashierId || null, timestamp(request.createdAt), request.resolvedAt || null, json(request)]);
    }

    for (const [id, request] of source.agentRequests) {
      await connection.execute(`INSERT INTO agent_requests (id, agent_id, amount, status, created_at, resolved_at, request_json) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount=VALUES(amount), status=VALUES(status), resolved_at=VALUES(resolved_at), request_json=VALUES(request_json)`,
      [id, request.agentId, money(request.amount), request.status || 'pending', timestamp(request.createdAt), request.resolvedAt || null, json(request)]);
    }

    for (const [id, transaction] of source.agentTransactions) {
      await connection.execute(`INSERT INTO agent_transactions (id, agent_id, player_id, transaction_type, amount, discount_amount, created_at, transaction_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE transaction_json=VALUES(transaction_json)`,
      [id, transaction.agentId, transaction.playerId || null, transaction.type || 'unknown', money(transaction.amount), money(transaction.discountAmount), timestamp(transaction.timestamp || transaction.createdAt), json(transaction)]);
    }

    for (const [id, room] of Object.entries(source.store.rooms || {}) as Array<[string, JsonRecord]>) {
      await connection.execute(`INSERT INTO game_rooms (id, status, bet_amount, created_at, updated_at, room_json) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), bet_amount=VALUES(bet_amount), updated_at=VALUES(updated_at), room_json=VALUES(room_json)`,
      [id, room.status || 'unknown', money(room.betAmount), timestamp(room.createdAt), now(), json(room)]);
    }

    for (const [id, tournament] of Object.entries(source.store.tournaments || {}) as Array<[string, JsonRecord]>) {
      await connection.execute(`INSERT INTO tournaments (id, name, status, entry_fee, prize_pool, start_at, end_at, tournament_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status), entry_fee=VALUES(entry_fee), prize_pool=VALUES(prize_pool), start_at=VALUES(start_at), end_at=VALUES(end_at), tournament_json=VALUES(tournament_json), updated_at=VALUES(updated_at)`,
      [id, tournament.name || id, tournament.status || 'unknown', money(tournament.entryFee), money(tournament.prizePool), timestamp(tournament.startDate), tournament.endDate || null, json(tournament), now()]);
    }

    for (const user of source.users.values()) {
      if (!user.vip?.tier || !Number(user.vip?.expires)) continue;
      const subscriptionId = `vip_${user.id}_${Number(user.vip.expires)}`;
      await connection.execute(`INSERT INTO vip_subscriptions (id, user_id, tier_key, amount, starts_at, expires_at, status, subscription_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE tier_key=VALUES(tier_key), expires_at=VALUES(expires_at), status=VALUES(status), subscription_json=VALUES(subscription_json)`,
      [subscriptionId, user.id, user.vip.tier, money(0), timestamp(user.vip.startedAt || user.createdAt), Number(user.vip.expires), Number(user.vip.expires) > now() ? 'active' : 'expired', json(user.vip)]);
    }

    for (const campaign of source.store.adCampaigns || []) {
      await connection.execute(`INSERT INTO ad_campaigns (id, enabled, format, placement, company_name, title, starts_at, ends_at, campaign_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), format=VALUES(format), placement=VALUES(placement), company_name=VALUES(company_name), title=VALUES(title), starts_at=VALUES(starts_at), ends_at=VALUES(ends_at), campaign_json=VALUES(campaign_json), updated_at=VALUES(updated_at)`,
      [String(campaign.id), Boolean(campaign.enabled), campaign.format || 'banner', campaign.placement || 'all', campaign.companyName || null, campaign.title || null, campaign.startAt || null, campaign.endAt || null, json(campaign), now()]);
    }

    const settings: Record<string, unknown> = { paymentProviders: source.store.paymentProviders || {}, agentFloatInstructions: source.store.agentFloatInstructions || '', vipTiers: source.store.vipTiers || {}, adminSettings: source.store.adminSettings || {}, adSettings: source.store.adSettings || {} };
    for (const [key, value] of Object.entries(settings)) await connection.execute('INSERT INTO app_settings (setting_key, setting_json, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_json=VALUES(setting_json), updated_at=VALUES(updated_at)', [key, json(value), now()]);

    for (const [id, payment] of source.cashierPayments) {
      await connection.execute(`INSERT INTO cashier_payments (id, cashier_id, period_key, salary, bonus, total, paid_at, paid_by, payment_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE payment_json=VALUES(payment_json)`,
      [id, payment.cashierId, payment.period || payment.periodKey || '', money(payment.salary), money(payment.bonus), money(payment.total), timestamp(payment.paidAt), payment.paidBy || 'unknown', json(payment)]);
    }

    for (const [id, otp] of source.emailOtps) {
      if (!otp.email || !otp.otpHash || !otp.expiresAt) continue;
      await connection.execute(`INSERT INTO email_otp_challenges (subject_id, email, otp_hash, expires_at, resend_at, attempts, verified_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE email=VALUES(email), otp_hash=VALUES(otp_hash), expires_at=VALUES(expires_at), resend_at=VALUES(resend_at), attempts=VALUES(attempts), verified_at=VALUES(verified_at), updated_at=VALUES(updated_at)`,
      [id, otp.email, otp.otpHash, timestamp(otp.expiresAt), otp.sentAt ? Number(otp.sentAt) + 60_000 : null, Number(otp.attempts || 0), otp.verifiedAt || null, now()]);
    }

    await connection.commit();

    const [userRows] = await connection.query<any[]>('SELECT id, balance FROM app_users');
    const mysqlUsers = new Map(userRows.map(row => [String(row.id), Number(row.balance)]));
    const balanceMismatches = [...source.users.values()].filter(user => Math.abs((mysqlUsers.get(String(user.id)) ?? Number.NaN) - Number(user.balance || 0)) > 0.009).map(user => user.id);
    const tableCounts: Record<string, number> = {};
    for (const table of ['app_users', 'wallet_transactions', 'agents', 'admin_users', 'manual_transaction_requests', 'agent_requests', 'agent_transactions', 'game_rooms', 'tournaments', 'ad_campaigns']) {
      const [rows] = await connection.query<any[]>(`SELECT COUNT(*) AS total FROM \`${table}\``);
      tableCounts[table] = Number(rows[0]?.total || 0);
    }
    const summary = { sourceUsers: source.users.size, mysqlUsers: tableCounts.app_users, balanceMismatches, tableCounts };
    if (balanceMismatches.length) throw new Error(`Balance verification failed for ${balanceMismatches.length} user(s).`);
    await connection.execute('UPDATE data_migration_runs SET status = ?, summary_json = ?, completed_at = ? WHERE id = ?', ['verified', json(summary), now(), migrationId]);
    console.log(JSON.stringify({ migrationId, status: 'verified', ...summary }, null, 2));
    console.log('Firebase was read only; no Firebase documents were changed or deleted.');
  } catch (error) {
    try { await connection.rollback(); } catch {}
    try { await connection.execute('UPDATE data_migration_runs SET status = ?, summary_json = ?, completed_at = ? WHERE id = ?', ['failed', json({ error: error instanceof Error ? error.message : String(error) }), now(), migrationId]); } catch {}
    throw error;
  } finally {
    connection.release();
    await closeMySqlPool();
  }
}

migrate().catch(error => {
  console.error('Firebase to MySQL migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
