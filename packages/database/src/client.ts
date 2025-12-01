import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { databaseEnv } from '@unified/env';

const pool = new Pool({
  host: databaseEnv.host,
  port: databaseEnv.port,
  user: databaseEnv.user,
  password: databaseEnv.password,
  database: databaseEnv.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', {
      text: text.substring(0, 100),
      duration,
      rows: result.rowCount,
    });
  }

  return result;
}

export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
