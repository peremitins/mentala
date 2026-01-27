import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const url = process.env.NUXT_PRIVATE_DB_URL;
if (!url) throw new Error('NUXT_PRIVATE_DB_URL is not set');

const sslMode = process.env.NUXT_DB_SSL;
const poolConfig: pg.PoolConfig = {
  connectionString: url,
  ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
  // Держим соединение живым и регулярно обновляем его, чтобы воркеры не "отваливались".
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  maxLifetimeSeconds: 60 * 55, // Обновляем соединения раз в ~55 минут.
};

let pool = createPool();
export let db = drizzle(pool);

let resetInFlight: Promise<void> | null = null;
let lastResetAt = 0;
const RESET_COOLDOWN_MS = 30_000;

function createPool() {
  const nextPool = new pg.Pool(poolConfig);
  nextPool.on('error', (error) => {
    console.error('[DB] Ошибка соединения в пуле:', error);
  });
  return nextPool;
}

export function isDbConnectionError(error: unknown): boolean {
  const root = (error as any)?.cause ?? error;
  const code = root?.code || (error as any)?.code;
  const message = String(root?.message || (error as any)?.message || '');

  if (
    code &&
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EPIPE',
      '57P01',
      '57P02',
      '57P03',
      '53300',
      '08003',
      '08006',
    ].includes(code)
  ) {
    return true;
  }

  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout|connection terminated|terminating connection/i.test(
    message
  );
}

export async function resetDbPool(reason?: string): Promise<void> {
  const now = Date.now();
  if (resetInFlight) {
    await resetInFlight;
    return;
  }
  if (now - lastResetAt < RESET_COOLDOWN_MS) return;

  lastResetAt = now;
  resetInFlight = (async () => {
    console.warn(
      `[DB] Пересоздание пула соединений${reason ? `: ${reason}` : ''}`
    );
    try {
      await pool.end();
    } catch (error) {
      console.error('[DB] Не удалось корректно закрыть пул:', error);
    }
    pool = createPool();
    db = drizzle(pool);
  })();

  try {
    await resetInFlight;
  } finally {
    resetInFlight = null;
  }
}
