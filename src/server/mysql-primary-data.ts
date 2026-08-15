import { getMySqlPool } from './mysql.ts';

function parseJson<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
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

