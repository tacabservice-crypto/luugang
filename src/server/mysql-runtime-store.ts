import { getMySqlPool, isMySqlConfigured } from './mysql.ts';

export type MySqlRuntimeStoreMode = 'disabled' | 'shadow' | 'primary';

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
