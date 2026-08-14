import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { mysqlConfig } from '../src/server/mysql.ts';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '.env.production') });

async function run() {
  const migrationDirectory = path.join(process.cwd(), 'database', 'migrations');
  const files = (await fs.readdir(migrationDirectory)).filter(file => /^\d+_.+\.sql$/.test(file)).sort();
  const connection = await mysql.createConnection({ ...mysqlConfig(), multipleStatements: true });
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(191) PRIMARY KEY,
      applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const [lockRows] = await connection.query<any[]>('SELECT GET_LOCK(?, 30) AS acquired', ['ludosom_mysql_migrations']);
    if (Number(lockRows[0]?.acquired) !== 1) throw new Error('Could not acquire the database migration lock.');
    try {
      for (const file of files) {
        const [existing] = await connection.query<any[]>('SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [file]);
        if (existing.length) { console.log(`Already applied: ${file}`); continue; }
        const sql = await fs.readFile(path.join(migrationDirectory, file), 'utf8');
        await connection.query(sql);
        await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
        console.log(`Applied: ${file}`);
      }
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', ['ludosom_mysql_migrations']);
    }
    console.log('MySQL schema is ready. No Firebase data was changed.');
  } finally {
    await connection.end();
  }
}

run().catch(error => {
  console.error('MySQL migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
