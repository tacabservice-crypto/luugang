import mysql, { Pool, PoolOptions } from 'mysql2/promise';

let pool: Pool | null = null;

export function isMySqlConfigured() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

export function mysqlConfig(): PoolOptions {
  if (!isMySqlConfigured()) {
    throw new Error('MySQL is not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE.');
  }
  const useSsl = String(process.env.MYSQL_SSL || '').toLowerCase() === 'true';
  return {
    host: process.env.MYSQL_HOST,
    port: Math.max(1, Number(process.env.MYSQL_PORT) || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: Math.max(1, Math.min(20, Number(process.env.MYSQL_CONNECTION_LIMIT) || 5)),
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    ...(useSsl ? { ssl: { rejectUnauthorized: String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' } } : {}),
  };
}

export function getMySqlPool() {
  if (!pool) pool = mysql.createPool(mysqlConfig());
  return pool;
}

export async function testMySqlConnection() {
  const connection = await getMySqlPool().getConnection();
  try {
    const [rows] = await connection.query('SELECT DATABASE() AS databaseName, UTC_TIMESTAMP() AS serverTime');
    return rows;
  } finally {
    connection.release();
  }
}

export async function closeMySqlPool() {
  if (!pool) return;
  const activePool = pool;
  pool = null;
  await activePool.end();
}
