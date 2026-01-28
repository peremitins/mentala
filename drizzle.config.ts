import { config } from 'dotenv';
import { resolve } from 'node:path';

// Загружаем env-файл только если он задан явно (DRIZZLE_ENV_FILE)
const envFile = process.env.DRIZZLE_ENV_FILE;
if (envFile) {
  config({ path: resolve(process.cwd(), envFile) });
}

const dbUrl = process.env.NUXT_PRIVATE_DB_URL;

if (!dbUrl) {
  throw new Error(
    '❌ NUXT_PRIVATE_DB_URL не найдена в переменных окружения. ' +
      'Убедитесь, что задан DRIZZLE_ENV_FILE или переменная NUXT_PRIVATE_DB_URL.'
  );
}

export default {
  schema: './server/infrastructure/db/schema.ts',
  out: './server/infrastructure/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
} as const;
