import { getMySqlPool } from './mysql.ts';

function parseJson<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

export async function saveMySqlUserProfile(user: any) {
  const now = Date.now();
  await getMySqlPool().execute(
    `INSERT INTO app_users (id, firebase_uid, email, phone, username, avatar, balance, win_count, loss_count, linked_agent_id, applied_promo_code, email_verified, status, created_at, updated_at, profile_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE firebase_uid=VALUES(firebase_uid), email=VALUES(email), phone=VALUES(phone), username=VALUES(username), avatar=VALUES(avatar), balance=VALUES(balance), win_count=VALUES(win_count), loss_count=VALUES(loss_count), linked_agent_id=VALUES(linked_agent_id), applied_promo_code=VALUES(applied_promo_code), email_verified=VALUES(email_verified), status=VALUES(status), updated_at=VALUES(updated_at), profile_json=VALUES(profile_json), version=version+1`,
    [user.id, user.firebaseUid || null, user.email || null, user.phone || null, user.username, user.avatar || null, Number(user.balance || 0), Number(user.winCount || 0), Number(user.lossCount || 0), user.linkedAgentId || null, user.appliedPromoCode || null, Boolean(user.emailOtpVerifiedAt), user.status || 'active', Number(user.createdAt || now), now, JSON.stringify(user)],
  );
}

export async function saveMySqlManualRequest(request: any) {
  await getMySqlPool().execute(
    `INSERT INTO manual_transaction_requests (id, user_id, agent_id, managed_by, transaction_type, amount, status, assigned_cashier_id, created_at, resolved_at, request_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE agent_id=VALUES(agent_id), managed_by=VALUES(managed_by), transaction_type=VALUES(transaction_type), amount=VALUES(amount), status=VALUES(status), assigned_cashier_id=VALUES(assigned_cashier_id), resolved_at=VALUES(resolved_at), request_json=VALUES(request_json)`,
    [request.id, request.userId, request.agentId || null, request.managedBy || (request.agentId ? 'agent' : 'admin'), request.transactionType, Number(request.amount || 0), request.status || 'pending', request.assignedCashierId || null, Number(request.createdAt || Date.now()), request.resolvedAt || null, JSON.stringify(request)],
  );
}

export async function saveMySqlAgent(agent: any) {
  const now = Date.now();
  await getMySqlPool().execute(
    `INSERT INTO agents (id, username, password_hash, phone, location, promo_code, commission_rate, balance, float_balance, business_model, status, created_at, updated_at, agent_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE username=VALUES(username), password_hash=VALUES(password_hash), phone=VALUES(phone), location=VALUES(location), promo_code=VALUES(promo_code), commission_rate=VALUES(commission_rate), balance=VALUES(balance), float_balance=VALUES(float_balance), business_model=VALUES(business_model), status=VALUES(status), updated_at=VALUES(updated_at), agent_json=VALUES(agent_json)`,
    [agent.id, agent.username, agent.password || null, agent.phone || null, agent.location || null, agent.promoCode || null, Number(agent.commissionRate || 0), Number(agent.balance || 0), Number(agent.floatBalance || 0), agent.businessModel || 'independent', agent.status || 'Active', Number(agent.createdAt || now), now, JSON.stringify(agent)],
  );
}

export async function deleteMySqlAgent(agentId: string) {
  await getMySqlPool().execute('DELETE FROM agents WHERE id=?', [agentId]);
}

export async function saveMySqlAdmin(admin: any) {
  const now = Date.now();
  await getMySqlPool().execute(
    `INSERT INTO admin_users (id, username, password_hash, name, permissions_json, status, location, cashier_locations_json, cashier_online_at, admin_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE username=VALUES(username), password_hash=VALUES(password_hash), name=VALUES(name), permissions_json=VALUES(permissions_json), status=VALUES(status), location=VALUES(location), cashier_locations_json=VALUES(cashier_locations_json), cashier_online_at=VALUES(cashier_online_at), admin_json=VALUES(admin_json), updated_at=VALUES(updated_at)`,
    [admin.id, admin.username, admin.password || null, admin.name || null, JSON.stringify(admin.permissions || []), admin.status || 'active', admin.location || null, JSON.stringify(admin.cashierLocations || []), admin.cashierOnlineAt || null, JSON.stringify(admin), Number(admin.createdAt || now), now],
  );
}

export async function deleteMySqlAdmin(adminId: string) {
  await getMySqlPool().execute('DELETE FROM admin_users WHERE id=?', [adminId]);
}

export async function saveMySqlCashierPayment(payment: any) {
  const id = `${payment.cashierId}_${payment.period}`;
  await getMySqlPool().execute(
    `INSERT INTO cashier_payments (id, cashier_id, period_key, salary, bonus, total, paid_at, paid_by, payment_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, payment.cashierId, payment.period, Number(payment.salary || 0), Number(payment.bonus || 0), Number(payment.total || 0), Number(payment.paidAt), payment.paidBy, JSON.stringify({ ...payment, id })],
  );
  return { ...payment, id };
}

export async function saveMySqlAgentRequest(request: any) {
  await getMySqlPool().execute(
    `INSERT INTO agent_requests (id, agent_id, amount, status, created_at, resolved_at, request_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE amount=VALUES(amount), status=VALUES(status), resolved_at=VALUES(resolved_at), request_json=VALUES(request_json)`,
    [request.id, request.agentId, Number(request.amount || 0), request.status || 'pending', Number(request.createdAt || Date.now()), request.resolvedAt || null, JSON.stringify(request)],
  );
}

export async function adjustMySqlAgentFloat(args: { agentId: string; amount: number; transaction: any; player?: any }) {
  const connection = await getMySqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>('SELECT agent_json, float_balance FROM agents WHERE id = ? FOR UPDATE', [args.agentId]);
    if (!rows.length) throw new Error('Agent not found.');
    const agent = parseJson<any>(rows[0].agent_json);
    const currentFloat = Number(rows[0].float_balance || 0);
    const nextFloat = currentFloat + Number(args.amount);
    if (nextFloat < 0) throw new Error(`Insufficient float balance. Current balance: $${currentFloat.toFixed(2)}.`);
    agent.floatBalance = nextFloat;
    agent.updatedAt = Date.now();
    await connection.execute('UPDATE agents SET float_balance=?, agent_json=?, updated_at=? WHERE id=?', [nextFloat, JSON.stringify(agent), agent.updatedAt, agent.id]);
    if (args.player) {
      const [userRows] = await connection.execute<any[]>('SELECT profile_json, balance FROM app_users WHERE id=? FOR UPDATE', [args.player.id]);
      if (!userRows.length) throw new Error('Player not found.');
      const player = { ...parseJson<any>(userRows[0].profile_json), ...args.player };
      player.balance = Number(userRows[0].balance || 0) + Math.abs(Number(args.amount));
      await connection.execute('UPDATE app_users SET balance=?, profile_json=?, updated_at=?, version=version+1 WHERE id=?', [player.balance, JSON.stringify(player), Date.now(), player.id]);
      args.player = player;
    }
    await connection.execute(
      `INSERT INTO agent_transactions (id, agent_id, player_id, transaction_type, amount, discount_amount, created_at, transaction_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [args.transaction.id, agent.id, args.transaction.playerId || null, args.transaction.type, Number(args.transaction.amount || 0), Number(args.transaction.discountAmount || 0), Number(args.transaction.timestamp || Date.now()), JSON.stringify(args.transaction)],
    );
    await connection.commit();
    return { agent, player: args.player };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

export async function resolveMySqlAgentRequest(args: { request: any; admin: any; approved: boolean }) {
  const connection = await getMySqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [requestRows] = await connection.execute<any[]>('SELECT request_json, status FROM agent_requests WHERE id=? FOR UPDATE', [args.request.id]);
    if (!requestRows.length) throw new Error('Request not found.');
    if (requestRows[0].status !== 'pending') throw new Error('This request has already been processed.');
    const request = { ...parseJson<any>(requestRows[0].request_json), ...args.request };
    request.status = args.approved ? 'approved' : 'rejected';
    request.resolvedAt = Date.now();
    request.resolvedBy = args.admin.id;
    request.resolverUsername = args.admin.username || 'Unknown Admin';
    let agent: any;
    let transaction: any;
    if (args.approved) {
      const [agentRows] = await connection.execute<any[]>('SELECT agent_json, float_balance FROM agents WHERE id=? FOR UPDATE', [request.agentId]);
      if (!agentRows.length) throw new Error('Agent associated with the request not found.');
      agent = parseJson<any>(agentRows[0].agent_json);
      agent.floatBalance = Number(agentRows[0].float_balance || 0) + Number(request.amount || 0);
      agent.updatedAt = Date.now();
      const discountAmount = Number((Number(request.amount || 0) * Math.max(0, Math.min(1, Number(agent.commissionRate || 0)))).toFixed(2));
      transaction = { id: `agent_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, agentId: agent.id, type: 'FloatPurchase', amount: Number(request.amount), discountAmount, timestamp: Date.now(), description: `Float request for $${Number(request.amount).toFixed(2)} approved; admin cash $${(Number(request.amount) - discountAmount).toFixed(2)}, agent commission $${discountAmount.toFixed(2)}. Request ID: ${request.id}` };
      await connection.execute('UPDATE agents SET float_balance=?, agent_json=?, updated_at=? WHERE id=?', [agent.floatBalance, JSON.stringify(agent), agent.updatedAt, agent.id]);
      await connection.execute(`INSERT INTO agent_transactions (id, agent_id, player_id, transaction_type, amount, discount_amount, created_at, transaction_json) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`, [transaction.id, agent.id, transaction.type, transaction.amount, discountAmount, transaction.timestamp, JSON.stringify(transaction)]);
    }
    await connection.execute('UPDATE agent_requests SET status=?, resolved_at=?, request_json=? WHERE id=?', [request.status, request.resolvedAt, JSON.stringify(request), request.id]);
    await connection.commit();
    return { request, agent, transaction };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

export async function loadMySqlPrimaryCaches() {
  const pool = getMySqlPool();
  const [admins, agents, requests, transactions, payments] = await Promise.all([
    pool.query<any[]>('SELECT admin_json AS value_json FROM admin_users'),
    pool.query<any[]>('SELECT agent_json AS value_json FROM agents'),
    pool.query<any[]>('SELECT request_json AS value_json FROM agent_requests'),
    pool.query<any[]>('SELECT transaction_json AS value_json FROM agent_transactions'),
    pool.query<any[]>('SELECT payment_json AS value_json FROM cashier_payments'),
  ]);
  const values = (result: any) => (result[0] as any[]).map(row => parseJson<any>(row.value_json));
  return {
    admins: values(admins),
    agents: values(agents),
    requests: values(requests),
    transactions: values(transactions),
    payments: values(payments),
  };
}

export async function approveMySqlAgentPlayerRequest(args: {
  agent: any;
  user: any;
  request: any;
  agentTransaction: any;
}) {
  const connection = await getMySqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [agentRows] = await connection.execute<any[]>('SELECT agent_json, float_balance FROM agents WHERE id = ? FOR UPDATE', [args.agent.id]);
    const [userRows] = await connection.execute<any[]>('SELECT profile_json, balance FROM app_users WHERE id = ? FOR UPDATE', [args.user.id]);
    const [requestRows] = await connection.execute<any[]>('SELECT request_json, status FROM manual_transaction_requests WHERE id = ? FOR UPDATE', [args.request.id]);
    if (!agentRows.length) throw new Error('Agent not found.');
    if (!userRows.length) throw new Error('User not found.');
    if (!requestRows.length || requestRows[0].status !== 'pending') throw new Error('Request was already processed.');

    const agent = { ...parseJson<any>(agentRows[0].agent_json), ...args.agent };
    const user = { ...parseJson<any>(userRows[0].profile_json), ...args.user };
    const request = { ...parseJson<any>(requestRows[0].request_json), ...args.request };
    const amount = Number(request.amount || 0);
    const currentFloat = Number(agentRows[0].float_balance || agent.floatBalance || 0);
    const currentBalance = Number(userRows[0].balance || user.balance || 0);

    if (agent.businessModel === 'monthly' && Number(agent.dailyTransactionLimit || 0) > 0) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [dailyRows] = await connection.execute<any[]>(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM agent_transactions
         WHERE agent_id = ? AND transaction_type IN ('PlayerDeposit', 'PlayerWithdrawal') AND created_at >= ?`,
        [agent.id, startOfDay.getTime()],
      );
      const remaining = Number(agent.dailyTransactionLimit) - Number(dailyRows[0]?.total || 0);
      if (amount > remaining) throw new Error(`Daily transaction limit exceeded. Remaining today: $${Math.max(0, remaining).toFixed(2)}.`);
    }

    let nextFloat: number;
    let nextBalance: number;
    if (request.transactionType === 'deposit') {
      if (currentFloat < amount) throw new Error('Insufficient float balance to approve this deposit.');
      nextFloat = currentFloat - amount;
      nextBalance = currentBalance + amount;
    } else {
      if (currentBalance < amount) throw new Error('Player has insufficient balance for this withdrawal.');
      const withdrawalNet = Number(request.netAmount ?? (amount - Number(request.fee || 0)));
      nextFloat = currentFloat + Math.max(0, withdrawalNet);
      nextBalance = currentBalance - amount;
    }

    agent.floatBalance = nextFloat;
    agent.updatedAt = Date.now();
    user.balance = nextBalance;
    request.status = 'approved';
    request.resolvedBy = agent.id;
    request.resolverUsername = agent.username;
    request.resolvedAt = Date.now();

    await connection.execute('UPDATE agents SET float_balance = ?, agent_json = ?, updated_at = ? WHERE id = ?', [nextFloat, JSON.stringify(agent), agent.updatedAt, agent.id]);
    await connection.execute('UPDATE app_users SET balance = ?, profile_json = ?, updated_at = ?, version = version + 1 WHERE id = ?', [nextBalance, JSON.stringify(user), Date.now(), user.id]);
    await connection.execute('UPDATE manual_transaction_requests SET status = ?, resolved_at = ?, request_json = ? WHERE id = ?', ['approved', request.resolvedAt, JSON.stringify(request), request.id]);
    await connection.execute(
      `INSERT INTO agent_transactions (id, agent_id, player_id, transaction_type, amount, discount_amount, created_at, transaction_json)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [args.agentTransaction.id, agent.id, user.id, args.agentTransaction.type, amount, args.agentTransaction.timestamp, JSON.stringify(args.agentTransaction)],
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
