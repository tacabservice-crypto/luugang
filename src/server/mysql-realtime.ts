import { getMySqlPool } from './mysql.ts';

let schemaReady: Promise<void> | null = null;

export function ensureMySqlRealtimeSchema(): Promise<void> {
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
        await getMySqlPool().query('ALTER TABLE user_presence ADD COLUMN profile_json JSON NULL');
      } catch (error: any) {
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    })().catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export async function touchMySqlUserPresence(users: Array<string | Record<string, any>>): Promise<void> {
  const entries: Array<[string, { id: string; profile: Record<string, any> | null }]> = users.map(value => {
    const profile = typeof value === 'string' ? null : value;
    const id = String(profile?.id || value || '');
    return [id, { id, profile }];
  });
  const records = [...new Map(entries.filter(([id]) => Boolean(id))).values()];
  if (!records.length) return;
  await ensureMySqlRealtimeSchema();
  const now = Date.now();
  await getMySqlPool().query(
    `INSERT INTO user_presence (user_id, last_seen_at, profile_json) VALUES ?
     ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at), profile_json=COALESCE(VALUES(profile_json), profile_json)`,
    [records.map(({ id, profile }) => [id, now, profile ? JSON.stringify(profile) : null])],
  );
}

export async function listMySqlOnlineUsers(windowMs = 45_000): Promise<Array<{ id: string; profile?: Record<string, any> }>> {
  await ensureMySqlRealtimeSchema();
  const cutoff = Date.now() - windowMs;
  const [rows] = await getMySqlPool().execute<any[]>('SELECT user_id, profile_json FROM user_presence WHERE last_seen_at >= ?', [cutoff]);
  return rows.map(row => {
    let profile: Record<string, any> | undefined;
    try {
      const value = Buffer.isBuffer(row.profile_json) ? row.profile_json.toString('utf8') : row.profile_json;
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      profile = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch (error) {
      console.error(`Invalid presence profile for ${String(row.user_id)}:`, error);
    }
    return { id: String(row.user_id), profile };
  });
}

export async function listMySqlOnlineUserIds(windowMs = 45_000): Promise<string[]> {
  return (await listMySqlOnlineUsers(windowMs)).map(user => user.id);
}

export async function upsertMySqlMatchmaking(record: Record<string, any>): Promise<void> {
  await ensureMySqlRealtimeSchema();
  const updatedAt = Number(record.timestamp || Date.now());
  await getMySqlPool().execute(
    `INSERT INTO matchmaking_queue (user_id, status, bet_amount, capacity, game_mode, updated_at, expires_at, record_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status=VALUES(status), bet_amount=VALUES(bet_amount), capacity=VALUES(capacity), game_mode=VALUES(game_mode), updated_at=VALUES(updated_at), expires_at=VALUES(expires_at), record_json=VALUES(record_json)`,
    [String(record.userId), record.status || 'WAITING_FOR_MATCH', Number(record.betAmount || 0).toFixed(2), Number(record.capacity || 2), record.gameMode || 'solo', updatedAt, updatedAt + 10 * 60_000, JSON.stringify(record)],
  );
}

export async function deleteMySqlMatchmaking(userIds: string[]): Promise<void> {
  const ids = [...new Set(userIds.map(String).filter(Boolean))];
  if (!ids.length) return;
  await ensureMySqlRealtimeSchema();
  await getMySqlPool().query('DELETE FROM matchmaking_queue WHERE user_id IN (?)', [ids]);
}

export async function listActiveMySqlMatchmaking(): Promise<Record<string, any>[]> {
  await ensureMySqlRealtimeSchema();
  const now = Date.now();
  await getMySqlPool().execute('DELETE FROM matchmaking_queue WHERE expires_at <= ?', [now]);
  const [rows] = await getMySqlPool().execute<any[]>('SELECT record_json FROM matchmaking_queue WHERE status = ? AND expires_at > ? ORDER BY updated_at ASC', ['WAITING_FOR_MATCH', now]);
  return rows.map(row => typeof row.record_json === 'string' ? JSON.parse(row.record_json) : row.record_json);
}

export async function updateMySqlCashierHeartbeat(adminId: string, cashierOnlineAt: number): Promise<void> {
  await getMySqlPool().execute('UPDATE admin_users SET cashier_online_at = ?, updated_at = ? WHERE id = ?', [cashierOnlineAt, Date.now(), adminId]);
}

export async function listMySqlCashierHeartbeats(): Promise<Array<{ id: string; cashierOnlineAt: number }>> {
  const [rows] = await getMySqlPool().query<any[]>('SELECT id, cashier_online_at FROM admin_users WHERE cashier_online_at IS NOT NULL');
  return rows.map(row => ({ id: String(row.id), cashierOnlineAt: Number(row.cashier_online_at || 0) }));
}
