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
    })().catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
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
