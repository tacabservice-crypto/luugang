import { getMySqlPool, isMySqlConfigured } from './mysql.ts';

export type MySqlRuntimeStoreMode = 'disabled' | 'shadow' | 'primary';

let gameRoomSchemaReady: Promise<void> | null = null;
let realtimeEventSchemaReady: Promise<void> | null = null;
let gameTimerLeaderConnection: any | null = null;
let gameTimerLeadershipAttempt: Promise<boolean> | null = null;

function ensureMySqlGameRoomSchema(): Promise<void> {
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ).then(() => undefined).catch(error => {
      gameRoomSchemaReady = null;
      throw error;
    });
  }
  return gameRoomSchemaReady;
}

function ensureMySqlRealtimeEventSchema(): Promise<void> {
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ).then(() => undefined).catch(error => {
      realtimeEventSchemaReady = null;
      throw error;
    });
  }
  return realtimeEventSchemaReady;
}

export interface MySqlRealtimeEvent {
  id: number;
  originId: string;
  scopeType: 'all' | 'room' | 'user';
  targetId: string | null;
  eventName: string;
  payload: any;
}

export async function publishMySqlRealtimeEvent(event: Omit<MySqlRealtimeEvent, 'id'>): Promise<void> {
  await ensureMySqlRealtimeEventSchema();
  await getMySqlPool().execute(
    `INSERT INTO realtime_events (origin_id, scope_type, target_id, event_name, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [event.originId, event.scopeType, event.targetId, event.eventName, JSON.stringify(event.payload), Date.now()],
  );
}

export async function latestMySqlRealtimeEventId(): Promise<number> {
  await ensureMySqlRealtimeEventSchema();
  const [rows] = await getMySqlPool().query<any[]>('SELECT COALESCE(MAX(id), 0) AS latest_id FROM realtime_events');
  return Number(rows[0]?.latest_id || 0);
}

export async function listMySqlRealtimeEvents(afterId: number): Promise<MySqlRealtimeEvent[]> {
  await ensureMySqlRealtimeEventSchema();
  const [rows] = await getMySqlPool().execute<any[]>(
    `SELECT id, origin_id, scope_type, target_id, event_name, payload_json
     FROM realtime_events WHERE id > ? ORDER BY id ASC LIMIT 500`,
    [afterId],
  );
  return rows.map(row => ({
    id: Number(row.id),
    originId: String(row.origin_id),
    scopeType: row.scope_type,
    targetId: row.target_id == null ? null : String(row.target_id),
    eventName: String(row.event_name),
    payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json,
  }));
}

export async function cleanupMySqlRealtimeEvents(olderThan: number): Promise<void> {
  await ensureMySqlRealtimeEventSchema();
  await getMySqlPool().execute('DELETE FROM realtime_events WHERE created_at < ?', [olderThan]);
}

export async function ensureMySqlGameTimerLeadership(): Promise<boolean> {
    if (gameTimerLeaderConnection) {
      try {
        await gameTimerLeaderConnection.ping();
        return true;
      } catch {
        try {
          gameTimerLeaderConnection.destroy();
        } catch {
          // The connection is already unusable; clearing it is sufficient.
        }
        gameTimerLeaderConnection = null;
      }
    }
  if (gameTimerLeadershipAttempt) return gameTimerLeadershipAttempt;
  gameTimerLeadershipAttempt = (async () => {
    const connection = await getMySqlPool().getConnection();
    try {
      const [rows] = await connection.query<any[]>("SELECT GET_LOCK('ludosom_game_timer_v1', 0) AS acquired");
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

export function mysqlRuntimeStoreMode(): MySqlRuntimeStoreMode {
  if (!isMySqlConfigured()) return 'disabled';
  const configured = String(process.env.MYSQL_RUNTIME_STORE_MODE || 'shadow').trim().toLowerCase();
  return configured === 'primary' ? 'primary' : configured === 'disabled' ? 'disabled' : 'shadow';
}

export async function loadRuntimeStoreFromMySql(): Promise<Record<string, any> | null> {
  const [rows] = await getMySqlPool().execute<any[]>(
    'SELECT setting_json FROM app_settings WHERE setting_key = ? LIMIT 1',
    ['runtime_store'],
  );
  if (!rows.length) return null;
  const value = rows[0].setting_json;
  if (typeof value === 'string') return JSON.parse(value);
  return value && typeof value === 'object' ? value : null;
}

export async function saveRuntimeStoreToMySql(snapshot: Record<string, any>): Promise<void> {
  await getMySqlPool().execute(
    `INSERT INTO app_settings (setting_key, setting_json, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
    ['runtime_store', JSON.stringify(snapshot), Date.now()],
  );
}

export async function loadMySqlGameRoom(roomId: string): Promise<any | null> {
  await ensureMySqlGameRoomSchema();
  const [rows] = await getMySqlPool().execute<any[]>(
    'SELECT room_json FROM game_rooms WHERE id = ? LIMIT 1',
    [roomId],
  );
  if (!rows.length) return null;
  const value = rows[0].room_json;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export async function saveMySqlGameRoom(room: any): Promise<void> {
  if (!room?.id) return;
  await ensureMySqlGameRoomSchema();
  const updatedAt = Date.now();
  await getMySqlPool().execute(
    `INSERT INTO game_rooms (id, status, bet_amount, created_at, updated_at, room_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status=VALUES(status), bet_amount=VALUES(bet_amount), updated_at=VALUES(updated_at), room_json=VALUES(room_json)`,
    [room.id, room.status || 'waiting', Number(room.betAmount || 0), Number(room.createdAt || updatedAt), updatedAt, JSON.stringify(room)],
  );
}

export async function listMySqlActiveGameRooms(): Promise<any[]> {
  await ensureMySqlGameRoomSchema();
  const [rows] = await getMySqlPool().execute<any[]>(
    `SELECT room_json FROM game_rooms
     WHERE status IN ('waiting', 'playing')
     ORDER BY updated_at DESC`,
  );
  return rows.map(row => typeof row.room_json === 'string' ? JSON.parse(row.room_json) : row.room_json);
}

export async function loadMySqlRuntimeUser(userId: string): Promise<any | null> {
  const [rows] = await getMySqlPool().execute<any[]>(
    'SELECT profile_json, balance, win_count, loss_count FROM app_users WHERE id = ? LIMIT 1',
    [userId],
  );
  if (!rows.length) return null;
  const profile = typeof rows[0].profile_json === 'string' ? JSON.parse(rows[0].profile_json) : rows[0].profile_json;
  return {
    ...profile,
    balance: Number(rows[0].balance || 0),
    winCount: Number(rows[0].win_count || 0),
    lossCount: Number(rows[0].loss_count || 0),
  };
}
