import path from 'node:path';
import dotenv from 'dotenv';
import { migrateFirestoreToMySql } from './migrate-firestore-to-mysql.ts';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '.env.production') });

migrateFirestoreToMySql().catch(error => {
  console.error('Firebase to MySQL migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
