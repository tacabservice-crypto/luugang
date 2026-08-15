import { getMySqlPool } from './mysql.ts';

export interface StoredEmailOtp {
  email: string;
  provider?: string;
  otpHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
  verifiedAt: number | null;
}

export async function getMySqlEmailOtp(subjectId: string): Promise<StoredEmailOtp | null> {
  const [rows] = await getMySqlPool().execute<any[]>('SELECT * FROM email_otp_challenges WHERE subject_id = ? LIMIT 1', [subjectId]);
  if (!rows.length) return null;
  const row = rows[0];
  return { email: row.email, provider: undefined, otpHash: row.otp_hash || '', expiresAt: Number(row.expires_at || 0), sentAt: Number(row.resend_at || 0) - 60_000, attempts: Number(row.attempts || 0), verifiedAt: row.verified_at == null ? null : Number(row.verified_at) };
}

export async function saveMySqlEmailOtp(subjectId: string, record: StoredEmailOtp): Promise<void> {
  await getMySqlPool().execute(
    `INSERT INTO email_otp_challenges (subject_id, email, otp_hash, expires_at, resend_at, attempts, verified_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email=VALUES(email), otp_hash=VALUES(otp_hash), expires_at=VALUES(expires_at), resend_at=VALUES(resend_at), attempts=VALUES(attempts), verified_at=VALUES(verified_at), updated_at=VALUES(updated_at)`,
    [subjectId, record.email, record.otpHash, record.expiresAt, record.sentAt + 60_000, record.attempts, record.verifiedAt, Date.now()],
  );
}

export async function deleteMySqlEmailOtp(subjectId: string): Promise<void> {
  await getMySqlPool().execute('DELETE FROM email_otp_challenges WHERE subject_id = ?', [subjectId]);
}
