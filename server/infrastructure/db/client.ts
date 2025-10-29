import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const url = process.env.NUXT_PRIVATE_DB_URL;
if (!url) throw new Error('NUXT_PRIVATE_DB_URL is not set');

const sslMode = process.env.NUXT_DB_SSL;
const pool = new pg.Pool({
  connectionString: url,
  ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool);
